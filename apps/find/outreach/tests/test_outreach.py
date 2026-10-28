"""
Testes da prospeção por e-mail (sem rede): textos e rodapé obrigatório,
aquecimento e limite do dia, relances, escolha dos novos contactos,
leitura das respostas / devoluções / STOP, cabeçalhos do e-mail.

Uso: python tests/test_outreach.py
"""

import os
import sys
from datetime import date

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))

import messages  # noqa: E402
import outreach as o  # noqa: E402

passed = 0


def check(label, cond):
    global passed
    assert cond, label
    passed += 1
    print("PASS:", label)


SENDER = {"legal_name": "ZOS SASU", "postal_address": "204 rue de la Plaine, 74500 Publier", "signature": "Ricardo de Vilela\nFondateur de Z Find"}
AGENCY = {"id": "a1", "email": "contact@agence-lac.fr", "email_source": "website", "display_name": "AGENCE DU LAC", "city": "THONON-LES-BAINS"}
TOKEN = "11111111-2222-4333-8444-555555555555"
URL = o.optout_url(TOKEN)

# ------------------------------------------------------------ texts
subject, text, html_doc = messages.render(1, AGENCY, SENDER, URL, date(2026, 11, 3))
check("1.º contacto: assunto com o nome da agência em letras normais", subject.startswith("Agence du Lac sur Z Find"))
check("nome e cidade no texto, sem MAIÚSCULAS", "Agence du Lac (Thonon-les-Bains)" in text)
check("preços da oferta validada e Z Desk/Z Studio incluídos", "99 € HT par mois" in text and "129 €" in text and "199 €" in text and "3 mois offerts" in text and "Z Desk inclus" in text and "Z Studio" in text)
check("antes do lançamento fala da abertura a 1 de dezembro", "ouvre au public le 1er décembre 2026" in text)
check("depois do lançamento muda a frase",
      "ouvert au public depuis le 1er décembre 2026" in messages.render(1, AGENCY, SENDER, URL, date(2026, 12, 2))[1])
check("rodapé CNIL: origem do endereço, remetente com morada, desinscrição",
      "publiée sur le site de votre agence" in text and "ZOS SASU, 204 rue de la Plaine, 74500 Publier" in text
      and URL in text and "STOP" in text)
check("origem OpenStreetMap", "publiée sur OpenStreetMap" in messages.render(1, dict(AGENCY, email_source="osm"), SENDER, URL, date(2026, 11, 3))[1])
check("assinatura em várias linhas", "Ricardo de Vilela\nFondateur de Z Find" in text)
check("versão HTML com o link de desinscrição clicável e texto escapado",
      f'href="{URL}"' in html_doc and "<script" not in messages.render(1, dict(AGENCY, display_name="<script>x</script>"), SENDER, URL, date(2026, 11, 3))[2])
s2, t2, _ = messages.render(2, AGENCY, SENDER, URL, date(2026, 11, 10), first_subject=subject)
check("relance 1 no mesmo fio (Re:) e curta", s2 == "Re: " + subject and "15 minutes" in t2 and URL in t2)
s3, t3, _ = messages.render(3, AGENCY, SENDER, URL, date(2026, 11, 19), first_subject=subject)
check("relance 2: última, pede o contacto certo", s3 == "Re: " + subject and "Dernier message" in t3)
check("nomes: siglas mantidas, de l'Adresse, palavras pequenas",
      messages.nice("SARL IMMOBILIERE DE L'ADRESSE") == "SARL Immobiliere de l'Adresse" and messages.nice("ERA ÉVIAN") == "ERA Évian"
      and messages.nice("Agence déjà écrite") == "Agence déjà écrite")

# ------------------------------------------------------------ warm-up and limits
check("dias úteis: sexta → segunda = 1", o.business_days_between(date(2026, 11, 6), date(2026, 11, 9)) == 1)
check("aquecimento: 10 no 1.º dia, +5 por dia útil, até ao máximo",
      o.daily_limit(None, date(2026, 11, 2), 40) == 10 and o.daily_limit(date(2026, 11, 2), date(2026, 11, 3), 40) == 15
      and o.daily_limit(date(2026, 11, 2), date(2026, 11, 20), 40) == 40)

# ------------------------------------------------------------ follow-ups
def send(target, step, status, day, email="x@a.fr"):
    return {"target_id": target, "email": email, "step": step, "status": status, "sent_at": f"{day}T08:00:00Z", "message_id": f"<{target}{step}@z>"}


sends = [
    send("t1", 1, "sent", "2026-11-02", "a@a.fr"),                                    # +5 dias úteis em 9/11 → relance 1
    send("t2", 1, "sent", "2026-11-05", "b@b.fr"),                                    # só 2 dias úteis
    send("t3", 1, "sent", "2026-10-20", "c@c.fr"), send("t3", 2, "sent", "2026-10-27", "c@c.fr"),  # relance 2 devida
    send("t4", 1, "replied", "2026-10-20", "d@d.fr"),                                 # respondeu
    send("t5", 1, "sent", "2026-10-20", "e@e.fr"), send("t5", 2, "sent", "2026-10-27", "e@e.fr"), send("t5", 3, "sent", "2026-11-05", "e@e.fr"),
    send("t6", 1, "sent", "2026-10-20", "f@f.fr"),                                    # endereço bloqueado (STOP noutra campanha)
]
due = o.due_followups(sends, date(2026, 11, 9), {"f@f.fr"})
check("relances devidas: t3 (relance 2) e t1 (relance 1), as mais antigas primeiro",
      [(t, s) for t, s, _ in due] == [("t3", 3), ("t1", 2)])
check("a relance leva a linha do 1.º contacto (para o mesmo fio)", due[1][2]["message_id"] == "<t11@z>")

# ------------------------------------------------------------ new contacts
cands = [{"id": "n1", "email": "Contact@X.fr"}, {"id": "n2", "email": "contact@x.fr"}, {"id": "n3", "email": "a@a.fr"},
         {"id": "t1", "email": "z@z.fr"}, {"id": "n4", "email": "stop@s.fr"}, {"id": "n5", "email": ""}, {"id": "n6", "email": "ok@ok.fr"}]
picked = o.pick_new(cands, {"t1"}, {"a@a.fr"}, {"stop@s.fr"}, 5)
check("novos: um por endereço, nunca já contactado, bloqueado ou sem e-mail", [c["id"] for c in picked] == ["n1", "n6"])
check("novos: respeita o limite", len(o.pick_new(cands, set(), set(), set(), 1)) == 1)

# ------------------------------------------------------------ inbox
contacted = {"contact@agence-lac.fr", "info@b.fr"}
check("resposta normal → replied",
      o.classify_message("Agence <contact@agence-lac.fr>", "Re: Agence du Lac sur Z Find", "Bonjour, appelez-moi demain.", None, contacted) == [("replied", "contact@agence-lac.fr")])
check("STOP → desinscrição",
      o.classify_message("contact@agence-lac.fr", "Re: Z Find", "STOP\n> merci", None, contacted) == [("stop", "contact@agence-lac.fr")])
check("o «STOP» do nosso rodapé citado não conta como pedido",
      o.classify_message("contact@agence-lac.fr", "Re: Z Find", "Intéressé, rappelez-moi.\n> Pour ne plus recevoir nos messages ... répondez « STOP »", None, contacted)
      == [("replied", "contact@agence-lac.fr")])
check("resposta automática (ausência) é ignorada",
      o.classify_message("contact@agence-lac.fr", "Réponse automatique : absence", "Je suis absent.", "auto-replied", contacted) == [])
check("devolução: endereço encontrado no relatório → bounced",
      o.classify_message("Mail Delivery Subsystem <mailer-daemon@googlemail.com>", "Delivery Status Notification (Failure)",
                         "Your message wasn't delivered to info@b.fr because the address couldn't be found.", None, contacted) == [("bounced", "info@b.fr")])
check("e-mail de um desconhecido é ignorado", o.classify_message("spam@x.com", "Offre", "...", None, contacted) == [])

# ------------------------------------------------------------ e-mail headers
cfg = {"from_name": "Ricardo de Vilela", "from_email": "ricardo@zfind-pro.fr", "reply_to": "", "signature": SENDER["signature"],
       "legal_name": SENDER["legal_name"], "postal_address": SENDER["postal_address"]}
msg = o.build_email(cfg, AGENCY, 1, TOKEN, date(2026, 11, 3))
check("List-Unsubscribe com link e mailto, e one-click (RFC 8058)",
      msg["List-Unsubscribe"] == f"<{URL}>, <mailto:ricardo@zfind-pro.fr?subject=STOP>" and msg["List-Unsubscribe-Post"] == "List-Unsubscribe=One-Click")
check("Message-ID do domínio do remetente; texto + HTML", msg["Message-ID"].endswith("@zfind-pro.fr>") and msg.get_body(("plain",)) and msg.get_body(("html",)))
reply = o.build_email(cfg, AGENCY, 2, TOKEN, date(2026, 11, 10), {"message_id": "<first@zfind-pro.fr>", "subject": subject})
check("relance responde ao 1.º e-mail (In-Reply-To / References)", reply["In-Reply-To"] == "<first@zfind-pro.fr>" and reply["Subject"] == "Re: " + subject)

# ------------------------------------------------------------ safety
os.environ.pop("OUTREACH_ENABLED", None)
cfg = o.load_config()
check("sem OUTREACH_ENABLED, sem SMTP nem identidade da empresa: nunca envia", not cfg["enabled"] and {"smtp_host", "legal_name", "postal_address"} <= set(cfg["missing"]))

print(f"\nOUTREACH: {passed}/{passed} PASSED")
