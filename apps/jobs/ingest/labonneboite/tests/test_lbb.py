"""
Testes da recolha La Bonne Boîte (sem rede).

Uso: python tests/test_lbb.py
"""

import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))

import fetch_lbb as f  # noqa: E402

passed = 0


def check(label, cond):
    global passed
    assert cond, label
    passed += 1
    print("PASS:", label)


SEEN = "2026-10-24T12:00:00Z"


def item(siret="31073855400024", rome="D1106", potential=91.8, high=True, **kw):
    base = {"rome": rome, "siret": siret, "email": "yes", "company_name": "LYON DIS", "office_name": "",
            "headcount_min": 100, "headcount_max": 199, "naf": "4711D", "naf_label": "Supermarchés",
            "city": "Lyon", "citycode": "69389", "postcode": "69009", "department_number": "69",
            "hiring_potential": potential, "is_high_potential": high}
    base.update(kw)
    return base


rows = {}
check("estabelecimento com forte potencial é guardado", f.merge_item(rows, item(), "D", SEEN) and "31073855400024" in rows)
r = rows["31073855400024"]
check("SIREN, departamento, potencial arredondado, sem nome vazio",
      r["siren"] == "310738554" and r["department"] == "69" and r["hiring_potential"] == 91.8 and r["office_name"] is None)
check("«email: yes» só diz que aceita candidaturas por e-mail", r["accepts_email_applications"] is True and "email" not in r)
f.merge_item(rows, item(rome="N1103", potential=95.123), "N", SEEN)
check("mesmo SIRET noutro domínio: junta profissões e domínios, guarda o maior potencial",
      r["roms"] == ["D1106", "N1103"] and r["domains"] == ["D", "N"] and r["hiring_potential"] == 95.12)
check("potencial fraco não é guardado", not f.merge_item(rows, item(siret="11111111111111", high=False), "D", SEEN) and len(rows) == 1)
check("SIRET inválido é ignorado", not f.merge_item(rows, item(siret="123"), "D", SEEN))
check("só colunas da tabela", set(f.COLUMNS) == set(r))

check("paginação continua com forte potencial e mais resultados", f.keep_paging([item()], 1, 5190))
check("pára quando a página já não tem forte potencial", not f.keep_paging([item(high=False)], 1, 5190))
check("pára no fim dos resultados", not f.keep_paging([item()], 3, 300))
check("pára no limite de 10 000 da API", not f.keep_paging([item()], 100, 50000))
check("pára numa página vazia", not f.keep_paging([], 1, 100))


class FakeFT:
    def __init__(self):
        self.calls = []

    def search(self, params):
        self.calls.append(params)
        page = params["page"]
        if params["granddomain"] == "D":
            items = [item(siret=f"3107385540{page:02d}{i:02d}", high=(page < 3)) for i in range(100)]
            return {"hits": 5190, "items": items}
        return {"hits": 0, "items": []}


ft = FakeFT()
rows = f.fetch_department(ft, "69", ["D", "F"], SEEN)
check("percorre as páginas até deixar de haver forte potencial (3 páginas em D, 1 em F)",
      [c["page"] for c in ft.calls if c["granddomain"] == "D"] == [1, 2, 3] and len([c for c in ft.calls if c["granddomain"] == "F"]) == 1)
check("pesquisa pelo centro do departamento, raio 50 km, 100 por página",
      ft.calls[0]["latitude"] == 45.761 and ft.calls[0]["distance"] == 50 and ft.calls[0]["page_size"] == 100)
check("guarda só os de forte potencial (páginas 1 e 2)", len(rows) == 200)
check("101 departamentos e 14 grandes domínios", len(f.CENTERS) == 101 and f.DOMAINS == list("ABCDEFGHIJKLMN"))

print(f"\nLA BONNE BOITE: {passed}/{passed} PASSED")
