"""
Bélgica — agências imobiliárias a partir dos dados abertos da BCE / KBO
(Banque-Carrefour des Entreprises, SPF Économie), ficheiro mensal «Full».

O descarregamento exige uma conta gratuita (https://kbopub.economie.fgov.be/kbo-open-data):
  - à mão: descarregar KboOpenData_XXXX_AAAA_MM_DD_Full.zip e correr
        python src/fetch_be_kbo.py --zip ~/Downloads/KboOpenData_..._Full.zip
  - no GitHub Action: segredo KBO_ZIP_URL com um endereço direto do zip
    (ou, mais tarde, o acesso SFTP que o SPF Économie concede a pedido).

Atividade: NACE-BEL 68.311 (intermediação em compra, venda e arrendamento de
bens imobiliários), versões 2008 e 2025, atividade principal. Só entidades
ativas. Uma linha por unidade de estabelecimento (ou pela empresa quando não
declara nenhuma). Contactos (telefone, e-mail, site) quando a empresa os
declarou à BCE. Pessoas singulares: type = 'independent' (o nome não é
publicado nos dados abertos; fica a denominação comercial ou o número BCE).

Uso: python src/fetch_be_kbo.py (--zip FICHEIRO | --url URL) [--dry-run]
"""

import argparse
import csv
import io
import os
import sys
import tempfile
import zipfile

from common import Supabase, REGISTRY_COLUMNS, classify, clean_email, clean_phone, clean_website, http_get, now_iso

NACE_2008 = {"68311"}
NACE_2025_PREFIX = "6831"
LANG_PREF = {"1": 0, "2": 1, "3": 2, "4": 3, "0": 4}  # FR, NL, DE, EN, desconhecida


def norm_nace(code):
    return (code or "").replace(".", "").strip()


def is_agency_activity(row):
    if row.get("Classification") != "MAIN":
        return False
    code, version = norm_nace(row.get("NaceCode")), row.get("NaceVersion")
    if version == "2008":
        return code in NACE_2008
    if version == "2025":
        return code.startswith(NACE_2025_PREFIX) and code != "68312"
    return False


def iso_date(value):
    """dd-mm-aaaa -> aaaa-mm-dd"""
    try:
        d, m, y = (value or "").split("-")
        return f"{y}-{m}-{d}"
    except ValueError:
        return None


def read_csv(zf, name):
    with zf.open(name) as fh:
        yield from csv.DictReader(io.TextIOWrapper(fh, encoding="utf-8-sig", newline=""))


def parse(zf, seen_at):
    # 1. Entidades com atividade de agência imobiliária.
    agency_entities = {r["EntityNumber"] for r in read_csv(zf, "activity.csv") if is_agency_activity(r)}
    # 2. Empresas ativas.
    enterprises = {}
    for r in read_csv(zf, "enterprise.csv"):
        if r.get("Status") == "AC":
            enterprises[r["EnterpriseNumber"]] = r
    # 3. Estabelecimentos.
    est_by_ent = {}
    est_info = {}
    for r in read_csv(zf, "establishment.csv"):
        est_by_ent.setdefault(r["EnterpriseNumber"], []).append(r["EstablishmentNumber"])
        est_info[r["EstablishmentNumber"]] = r
    units = []  # (source_id, enterprise_number, establishment_number or None)
    for ent in enterprises:
        ests = est_by_ent.get(ent, [])
        own = [e for e in ests if e in agency_entities]
        if own:
            units.extend((e, ent, e) for e in own)
        elif ent in agency_entities:
            if ests:
                units.extend((e, ent, e) for e in ests)
            else:
                units.append((ent, ent, None))
    wanted = {u[1] for u in units} | {u[2] for u in units if u[2]}
    # 4. Denominações, moradas, contactos das entidades pretendidas.
    names = {}
    for r in read_csv(zf, "denomination.csv"):
        num = r["EntityNumber"]
        if num not in wanted:
            continue
        key = (r.get("TypeOfDenomination"), LANG_PREF.get(r.get("Language"), 9))
        names.setdefault(num, []).append((key, r.get("Denomination")))
    addresses = {}
    for r in read_csv(zf, "address.csv"):
        num = r["EntityNumber"]
        if num in wanted and r.get("TypeOfAddress") in ("REGO", "BAET"):
            addresses[num] = r
    contacts = {}
    for r in read_csv(zf, "contact.csv"):
        num = r["EntityNumber"]
        if num in wanted:
            contacts.setdefault(num, {}).setdefault(r.get("ContactType"), r.get("Value"))

    def best_name(num, types):
        cands = sorted((k, v) for k, v in names.get(num, []) if k[0] in types and v)
        return cands[0][1] if cands else None

    rows = []
    for source_id, ent, est in units:
        e = enterprises[ent]
        natural = e.get("TypeOfEnterprise") == "1"
        legal = best_name(ent, ("001",))
        trade = (best_name(est, ("003", "001")) if est else None) or best_name(ent, ("003", "002"))
        name = legal or trade or f"BCE {ent}"
        addr = addresses.get(est) or addresses.get(ent) or {}
        street = " ".join(x for x in [addr.get("StreetFR") or addr.get("StreetNL"), addr.get("HouseNumber"), (f"bte {addr['Box']}" if addr.get("Box") else None)] if x)
        city = addr.get("MunicipalityFR") or addr.get("MunicipalityNL")
        kind, network = classify(name, trade, natural, est is None or source_id == ent, False)
        c = {**contacts.get(ent, {}), **contacts.get(est, {})} if est else contacts.get(ent, {})
        row = {
            "country": "BE", "source": "kbo", "source_id": source_id, "company_id": ent,
            "name": name, "trade_name": trade if trade != name else None, "type": kind, "network": network,
            "is_natural_person": natural, "legal_form": e.get("JuridicalForm") or None, "activity_code": "68.311",
            "is_head_office": est is None, "address": " ".join(x for x in [street, addr.get("Zipcode"), city] if x) or None,
            "postcode": addr.get("Zipcode") or None, "city": city, "commune_code": None, "latitude": None, "longitude": None,
            "registry_created": iso_date((est_info.get(est) or {}).get("StartDate") if est else e.get("StartDate")),
            "last_seen_at": seen_at, "active": True, "updated_at": seen_at,
        }
        phone, email, web = clean_phone(c.get("TEL"), "BE"), clean_email(c.get("EMAIL")), clean_website(c.get("WEB"))
        if phone:
            row.update(phone=phone, phone_source="kbo")
        if email:
            row.update(email=email, email_source="kbo")
        if web:
            row.update(website=web, website_source="kbo")
        rows.append(row)
    return rows


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--zip")
    ap.add_argument("--url", default=os.environ.get("KBO_ZIP_URL"))
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()
    path = args.zip
    if not path:
        if not args.url:
            print("Bélgica: sem ficheiro BCE (--zip) nem KBO_ZIP_URL — passo ignorado.")
            return
        tmp = tempfile.NamedTemporaryFile(suffix=".zip", delete=False)
        with http_get(args.url, stream=True, timeout=600) as r:
            r.raise_for_status()
            for chunk in r.iter_content(1 << 20):
                tmp.write(chunk)
        tmp.close()
        path = tmp.name
    seen_at = now_iso()
    with zipfile.ZipFile(path) as zf:
        rows = parse(zf, seen_at)
    by_type = {}
    for r in rows:
        by_type[r["type"]] = by_type.get(r["type"], 0) + 1
    print(f"Bélgica: {len(rows)} unidades — {by_type}; com e-mail: {sum(1 for r in rows if r.get('email'))}")
    if args.dry_run:
        return
    db = Supabase()
    db.upsert(rows, REGISTRY_COLUMNS)
    db.upsert_contacts(rows)
    db.patch(f"country=eq.BE&source=eq.kbo&active=eq.true&last_seen_at=lt.{seen_at}", {"active": False, "updated_at": now_iso()})


if __name__ == "__main__":
    sys.exit(main())
