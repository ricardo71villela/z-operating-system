"""
Testes do pipeline das agências (sem rede): classificação, contactos,
conversão SIRENE, leitura de um zip BCE sintético, correspondência OSM.

Uso: python tests/test_agencias.py
"""

import io
import os
import sys
import zipfile

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))

import common  # noqa: E402
import fetch_be_kbo  # noqa: E402
import fetch_fr_sirene  # noqa: E402
import fetch_osm  # noqa: E402
import enrich_websites  # noqa: E402

passed = 0


def check(label, cond):
    global passed
    assert cond, label
    passed += 1
    print("PASS:", label)


# ------------------------------------------------------------ classification
check("pessoa singular = independent, mesmo com rede no nome",
      common.classify("JEAN DUPONT", "IAD FRANCE", True, True) == ("independent", "iad"))
check("franquia Orpi = network_agency",
      common.classify("SARL AGENCE DU LAC", "ORPI AGENCE DU LAC", False, True, False) == ("network_agency", "orpi"))
check("sede de uma rede (nome legal, sede, grande) = network_hq",
      common.classify("I@D FRANCE", None, False, True, True) == ("network_hq", "iad") and
      common.classify("CAPIFRANCE", None, False, True, True) == ("network_hq", "capifrance"))
check("uma franquia com a marca no nome legal mas pequena continua network_agency",
      common.classify("CENTURY 21 IMMO LEMAN", None, False, True, False) == ("network_agency", "century-21"))
check("agência independente = agency", common.classify("IMMOBILIERE DU CHABLAIS", None, False, True) == ("agency", None))
check("acentos e pontuação: Laforêt, Stéphane Plaza, Engel & Völkers",
      common.detect_network("Laforêt Évian")[0] == "laforet" and common.detect_network("Stéphane Plaza Immobilier Thonon")[0] == "stephane-plaza"
      and common.detect_network("Engel & Völkers Luxembourg")[0] == "engel-volkers")
check("'era' não apanha palavras que contêm era", common.detect_network("GENERAL IMMOBILIER")[0] is None and common.detect_network("ERA Immobilier Annemasse")[0] == "era")

# ------------------------------------------------------------ contacts
check("e-mail: limpo, minúsculas, sem imagens nem noreply",
      common.clean_email(" Contact@Agence-Lac.FR ") == "contact@agence-lac.fr" and common.clean_email("logo@2x.png") is None
      and common.clean_email("noreply@agence.fr") is None)
check("telefone: formato internacional por país",
      common.clean_phone("04 50 75 00 00", "FR") == "+33450750000" and common.clean_phone("02 123 45 67", "BE") == "+3221234567"
      and common.clean_phone("26 12 34 56", "LU") == "+35226123456" and common.clean_phone("12", "FR") is None)
check("site: acrescenta https://", common.clean_website("www.agence.fr") == "https://www.agence.fr" and common.clean_website("n/a") is None)
check("escolhe o e-mail do domínio do site",
      common.pick_email(["webmaster@wix.com", "contact@agence-lac.fr", "jean@gmail.com"], "https://www.agence-lac.fr") == "contact@agence-lac.fr")
check("e-mail ofuscado [at] reconhecido",
      enrich_websites.deobfuscate("contact [at] agence.fr") == "contact@agence.fr")
check("timestamps sem '+' (seguros na query)", "+" not in common.now_iso() and common.now_iso().endswith("Z"))

# ------------------------------------------------------------ SIRENE
res = {
    "siren": "503698664", "nom_complet": "FONCIA TRANSACTION FRANCE", "nom_raison_sociale": "FONCIA TRANSACTION FRANCE",
    "nature_juridique": "5710", "categorie_entreprise": "GE", "nombre_etablissements_ouverts": 465,
    "complements": {"est_entrepreneur_individuel": False},
    "matching_etablissements": [
        {"siret": "50369866404153", "activite_principale": "68.31Z", "etat_administratif": "A", "adresse": "17 RUE DE LA GARE 74000 ANNECY",
         "code_postal": "74000", "libelle_commune": "ANNECY", "commune": "74010", "latitude": "45.900319791", "longitude": "6.1209529283",
         "est_siege": False, "date_creation": "2018-11-01", "nom_commercial": None, "liste_enseignes": ["FONCIA ANNECY"]},
        {"siret": "50369866409999", "activite_principale": "68.32A", "etat_administratif": "A"},
        {"siret": "50369866408888", "activite_principale": "68.31Z", "etat_administratif": "F"},
    ],
}
rows = fetch_fr_sirene.rows_from_result(res, "74", "2026-10-03T00:00:00Z")
check("SIRENE: só estabelecimentos ativos 68.31Z", len(rows) == 1 and rows[0]["source_id"] == "50369866404153")
r0 = rows[0]
check("SIRENE: morada, GPS, rede e tipo", r0["postcode"] == "74000" and abs(r0["latitude"] - 45.9003) < 1e-3 and r0["network"] == "foncia"
      and r0["type"] == "network_agency" and r0["trade_name"] == "FONCIA ANNECY" and r0["country"] == "FR" and not r0["is_natural_person"])
ei = dict(res, nom_complet="MARIE MARTIN", nom_raison_sociale=None, nature_juridique="1000", categorie_entreprise="PME",
          nombre_etablissements_ouverts=1, complements={"est_entrepreneur_individuel": True})
ei["matching_etablissements"] = [dict(res["matching_etablissements"][0], siret="91234567800011", liste_enseignes=None, est_siege=True)]
r1 = fetch_fr_sirene.rows_from_result(ei, "74", "x")[0]
check("SIRENE: empresário em nome individual = independent", r1["type"] == "independent" and r1["is_natural_person"] and r1["name"] == "MARIE MARTIN")
check("SIRENE: todas as colunas do registo presentes", set(common.REGISTRY_COLUMNS) <= set(r0))
check("SIRENE: 101 departamentos, Córsega e DOM incluídos", len(fetch_fr_sirene.DEPARTMENTS) == 101 and "2A" in fetch_fr_sirene.DEPARTMENTS and "974" in fetch_fr_sirene.DEPARTMENTS and "20" not in fetch_fr_sirene.DEPARTMENTS)

# ------------------------------------------------------------ KBO
def kbo_zip():
    files = {
        "enterprise.csv": "EnterpriseNumber,Status,JuridicalSituation,TypeOfEnterprise,JuridicalForm,JuridicalFormCAC,StartDate\n"
                          "0123.456.789,AC,000,2,014,,01-02-2010\n0987.654.321,AC,000,1,,,15-06-2018\n0555.555.555,AC,000,2,014,,01-01-2000\n0444.444.444,ST,000,2,014,,01-01-2000\n",
        "establishment.csv": "EstablishmentNumber,StartDate,EnterpriseNumber\n2.111.111.111,01-02-2010,0123.456.789\n2.222.222.222,01-03-2015,0123.456.789\n2.333.333.333,01-01-2000,0555.555.555\n",
        "activity.csv": "EntityNumber,ActivityGroup,NaceVersion,NaceCode,Classification\n"
                        "2.111.111.111,001,2008,68311,MAIN\n0987.654.321,001,2025,68310,MAIN\n2.333.333.333,001,2008,47110,MAIN\n0444.444.444,001,2008,68311,MAIN\n2.222.222.222,001,2008,68311,SECO\n",
        "denomination.csv": "EntityNumber,Language,TypeOfDenomination,Denomination\n0123.456.789,2,001,Immo Lambert BV\n0123.456.789,1,001,Immo Lambert SRL\n2.111.111.111,1,003,Century 21 Lambert Namur\n",
        "address.csv": "EntityNumber,TypeOfAddress,CountryNL,CountryFR,Zipcode,MunicipalityNL,MunicipalityFR,StreetNL,StreetFR,HouseNumber,Box,ExtraAddressInfo,DateStrikingOff\n"
                       "2.111.111.111,BAET,,,5000,Namen,Namur,,Rue de Fer,12,A,,\n0987.654.321,REGO,,,4000,Luik,Liège,,Rue Neuve,3,,,\n",
        "contact.csv": "EntityNumber,EntityContact,ContactType,Value\n2.111.111.111,EST,EMAIL,Namur@Century21.be\n0123.456.789,ENT,TEL,081 22 33 44\n0123.456.789,ENT,WEB,www.lambert.be\n",
    }
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as zf:
        for name, content in files.items():
            zf.writestr(name, content)
    buf.seek(0)
    return zipfile.ZipFile(buf)


be = fetch_be_kbo.parse(kbo_zip(), "2026-10-03T00:00:00Z")
by_id = {r["source_id"]: r for r in be}
check("BCE: só atividade principal 68.311 (2008) / 6831x (2025) de entidades ativas", set(by_id) == {"2.111.111.111", "0987.654.321"})
est = by_id["2.111.111.111"]
check("BCE: estabelecimento com nome legal FR, denominação comercial, morada e rede",
      est["name"] == "Immo Lambert SRL" and est["trade_name"] == "Century 21 Lambert Namur" and est["network"] == "century-21"
      and est["type"] == "network_agency" and est["address"] == "Rue de Fer 12 bte A 5000 Namur" and est["registry_created"] == "2010-02-01")
check("BCE: contactos do estabelecimento e da empresa (normalizados)",
      est["email"] == "namur@century21.be" and est["phone"] == "+3281223344" and est["website"] == "https://www.lambert.be" and est["email_source"] == "kbo")
ind = by_id["0987.654.321"]
check("BCE: pessoa singular sem nome publicado = independent, identificada pelo n.º BCE",
      ind["type"] == "independent" and ind["is_natural_person"] and ind["name"] == "BCE 0987.654.321" and ind["postcode"] == "4000")

# ------------------------------------------------------------ OSM
el = {"type": "node", "id": 42, "lat": 46.4, "lon": 6.59, "tags": {"office": "estate_agent", "name": "Orpi Agence du Lac", "brand": "Orpi",
      "addr:postcode": "74500", "addr:city": "Évian-les-Bains", "phone": "04 50 00 00 00", "email": "lac@orpi.com", "website": "orpi.com/lac"}}
rec = fetch_osm.element_record(el, "FR")
check("OSM: contactos normalizados", rec["phone"] == "+33450000000" and rec["email"] == "lac@orpi.com" and rec["website"] == "https://orpi.com/lac")
near = {"id": 1, "name": "SARL LAC IMMO", "trade_name": "ORPI AGENCE DU LAC", "latitude": 46.4005, "longitude": 6.5902, "postcode": "74500"}
far = dict(near, id=2, latitude=46.45)
other = dict(near, id=3, trade_name="IMMOBILIERE DU CHABLAIS", name="IMMOBILIERE DU CHABLAIS")
check("OSM FR: mesma agência a menos de 150 m e nome parecido", fetch_osm.match(rec, [far, other, near], "FR")["id"] == 1)
check("OSM FR: longe demais ou nome diferente não corresponde", fetch_osm.match(rec, [far, other], "FR") is None)
check("OSM BE: correspondência por código postal", fetch_osm.match(dict(rec, postcode="5000", lat=None), [dict(near, postcode="5000", latitude=None)], "BE")["id"] == 1)
lu = fetch_osm.lu_rows([fetch_osm.element_record(dict(el, tags=dict(el["tags"], name="Engel & Völkers Luxembourg", brand="Engel & Völkers")), "LU")], "x")
check("OSM LU: linha própria (fonte principal) com rede e contactos", lu[0]["country"] == "LU" and lu[0]["source"] == "osm"
      and lu[0]["network"] == "engel-volkers" and lu[0]["email_source"] == "osm")

# ------------------------------------------------------------ outreach rule (mirrors the generated column)
def outreach(country, natural, email=True, dnc=False, active=True):
    return email and not dnc and active and (country == "FR" or not natural)


sql = open(os.path.join(os.path.dirname(__file__), "..", "..", "..", "..", "..", "infrastructure", "supabase", "migrations",
                        "20261003180000_z_find_agencias_prospection_v1.sql"), encoding="utf-8").read()
check("migração: regra de prospeção FR todos / BE-LU só pessoas coletivas / nunca após desinscrição",
      "(country = 'FR' or not is_natural_person)" in sql and "not do_not_contact" in sql
      and outreach("FR", True) and not outreach("BE", True) and outreach("LU", False) and not outreach("FR", False, dnc=True))
check("migração: sem leitura pública (RLS, revoke anon/authenticated)", "enable row level security" in sql and "revoke all on table public.zfind_agencias from anon, authenticated" in sql)

print(f"\nAGENCIAS: {passed}/{passed} PASSED")
