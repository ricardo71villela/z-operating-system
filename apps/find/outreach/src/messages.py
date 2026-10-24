"""
ZOS — textos dos e-mails de prospeção (francês, «vous»).

Três etapas por agência: 1.º contacto, relance 1 (no mesmo fio), relance 2
(última). Cada mensagem leva sempre, no rodapé: quem envia (nome e morada
da empresa), de onde vem o endereço e como deixar de receber (link + «STOP»)
— exigências da CNIL para a prospeção B2B.

Os preços e as datas vêm da oferta validada (apps/find/apps/zfind-web/src/
services/pro-offer.js): 3 meses grátis, 99 € HT/mês até 25 anúncios para as
agências inscritas até 31/05/2027, preço garantido 1 ano.
"""

import html
import re
from datetime import date

LAUNCH_DATE = date(2026, 12, 1)
LAUNCH_RATE_UNTIL = "31 mai 2027"
SIGNUP_URL = "https://partner.zfind.online/#inscription"
OFFER_URL = "https://zfind.online/#/fr/pro"

_SMALL = {"de", "du", "des", "la", "le", "les", "et", "en", "sur", "sous", "aux", "au", "l", "d", "lès", "lez"}
_KEEP_UPPER = {"SARL", "SAS", "SASU", "EURL", "SA", "SCI", "SNC", "EI", "ERA", "BSK", "IAD", "RE/MAX", "3G", "CIMM"}


def nice(text):
    """«PRESTIGE HOME CONSEIL» → «Prestige Home Conseil»; mantém siglas e textos já em minúsculas."""
    text = (text or "").strip()
    if not text or not text.isupper():
        return text
    out = []
    for i, part in enumerate(re.split(r"([\s'\-’/])", text)):
        if part in _KEEP_UPPER or not part.isalpha():
            out.append(part)
            continue
        low = part.lower()
        out.append(low if i > 0 and low in _SMALL else low.capitalize())
    return "".join(out)


def origin_phrase(source):
    return {
        "website": "sur le site de votre agence",
        "osm": "sur OpenStreetMap",
        "kbo": "dans la Banque-Carrefour des Entreprises",
    }.get(source or "", "dans un annuaire professionnel public")


def _launch_line(today):
    if today < LAUNCH_DATE:
        return "Z Find ouvre au public le 1er décembre 2026."
    return "Z Find est ouvert au public depuis le 1er décembre 2026."


def subject_for(step, target, first_subject=None):
    if step == 1:
        return f"{nice(target.get('display_name')) or 'Votre agence'} sur Z Find, le portail réservé aux agences"
    base = first_subject or subject_for(1, target)
    return base if base.lower().startswith("re:") else f"Re: {base}"


def body_for(step, target, today):
    name = nice(target.get("display_name")) or "votre agence"
    city = nice(target.get("city"))
    where = f"{name} ({city})" if city else name
    if step == 1:
        return [
            "Bonjour,",
            f"Je me permets de vous écrire au sujet de {where}.",
            "Je lance Z Find (zfind.online), un portail d’annonces immobilières réservé aux professionnels, "
            "en France, en Belgique et au Luxembourg. Aucune annonce de particulier, et un classement neutre : "
            "les mises en avant payantes restent dans leurs emplacements et ne passent jamais devant vos annonces "
            "dans les résultats. " + _launch_line(today),
            "Pour les agences qui nous rejoignent maintenant :",
            f"- 3 mois offerts, puis 99 € HT par mois jusqu’à 25 annonces, prix garanti un an (inscription jusqu’au {LAUNCH_RATE_UNTIL}) ;",
            "- les demandes de visite des acheteurs arrivent directement dans votre agenda Z Desk, inclus ;",
            "- des leads vendeurs issus de notre outil d’estimation, chacun réservé à une seule agence.",
            f"L’inscription prend quelques minutes : {SIGNUP_URL}",
            f"L’offre en détail : {OFFER_URL}",
            "Si le sujet vous intéresse, répondez simplement à ce message : je vous appelle quand cela vous arrange.",
        ]
    if step == 2:
        return [
            "Bonjour,",
            f"Je reviens vers vous au sujet de Z Find pour {where}.",
            f"Les 3 mois offerts et le tarif de 99 € HT par mois, garanti un an, valent pour les agences inscrites "
            f"jusqu’au {LAUNCH_RATE_UNTIL}. Voulez-vous que je vous présente le portail en 15 minutes, "
            "par téléphone ou en visio ?",
            f"Inscription : {SIGNUP_URL}",
        ]
    return [
        "Bonjour,",
        "Dernier message de ma part sur Z Find : si ce n’est pas le bon moment, je ne vous relancerai plus.",
        "Si une autre personne de votre agence s’occupe des portails d’annonces, pouvez-vous me donner son adresse ? "
        "Je lui écrirai directement.",
        f"Pour mémoire, l’inscription : {SIGNUP_URL}",
    ]


def footer_lines(target, sender, optout_url):
    email = target.get("email", "")
    return [
        f"Vous recevez ce message parce que l’adresse {email} est publiée {origin_phrase(target.get('email_source'))}, "
        "pour votre activité d’agence immobilière.",
        f"Expéditeur : {sender['legal_name']}, {sender['postal_address']}.",
        f"Pour ne plus recevoir nos messages : {optout_url} (ou répondez « STOP »).",
    ]


def render(step, target, sender, optout_url, today, first_subject=None):
    """Devolve (assunto, texto, html). sender: legal_name, postal_address, signature."""
    paragraphs = body_for(step, target, today)
    signature = [line for line in (sender.get("signature") or "").splitlines()]
    footer = footer_lines(target, sender, optout_url)
    text = "\n\n".join(paragraphs) + "\n\nBien cordialement,\n" + "\n".join(signature) + "\n\n--\n" + "\n".join(footer) + "\n"

    def para(p):
        safe = html.escape(p)
        safe = re.sub(r"(https://[^\s<]+)", r'<a href="\1">\1</a>', safe)
        return f"<p style=\"margin:0 0 12px\">{safe}</p>"

    body_html = "".join(para(p) for p in paragraphs)
    sig_html = "<br>".join(html.escape(s) for s in signature)
    foot_html = "<br>".join(re.sub(r"(https://[^\s<]+)", r'<a href="\1" style="color:#7a7266">\1</a>', html.escape(f)) for f in footer)
    html_doc = (
        "<!doctype html><html lang=\"fr\"><body style=\"font-family:Arial,Helvetica,sans-serif;font-size:14px;"
        "line-height:1.5;color:#1d1a16\">"
        f"{body_html}<p style=\"margin:0 0 12px\">Bien cordialement,<br>{sig_html}</p>"
        f"<p style=\"margin-top:24px;font-size:12px;color:#7a7266\">{foot_html}</p></body></html>"
    )
    return subject_for(step, target, first_subject), text, html_doc
