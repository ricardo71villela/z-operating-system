"""
Enriquecimento pelo site da própria agência: e-mail e telefone publicados
na página inicial e na página de contacto / mentions légales.

- Só para agências com site conhecido (registo BCE, OpenStreetMap) e sem e-mail.
- Respeita o robots.txt de cada site; no máximo 3 páginas por agência;
  identifica-se com um User-Agent com contacto.
- Guarda a origem (email_source = 'website') e a data; uma agência sem
  resultado só é tentada de novo ao fim de 90 dias.

Uso: python src/enrich_websites.py [--limit 3000] [--workers 8] [--dry-run]
"""

import argparse
import re
import urllib.robotparser
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timedelta, timezone
from urllib.parse import urljoin, urlparse

import requests

from common import USER_AGENT, Supabase, clean_email, clean_phone, now_iso, pick_email

CONTACT_HINT = re.compile(r"contact|mentions|legal|impressum|agence|nous-joindre|a-propos|about", re.I)
MAILTO = re.compile(r"mailto:([^\"'?>\s]+)", re.I)
TEL = re.compile(r"tel:([+\d][\d .\-()]{6,20})", re.I)
HREF = re.compile(r"href=[\"']([^\"'#]+)[\"']", re.I)
EMAIL_TEXT = re.compile(r"[A-Za-z0-9._%+-]+(?:@|\s?\[at\]\s?|\s?\(at\)\s?)[A-Za-z0-9.-]+\.[A-Za-z]{2,24}")


def deobfuscate(text):
    return re.sub(r"\s?[\[(]at[\])]\s?", "@", text, flags=re.I)


def allowed(url, cache):
    base = f"{urlparse(url).scheme}://{urlparse(url).netloc}"
    if base not in cache:
        rp = urllib.robotparser.RobotFileParser()
        try:
            r = requests.get(base + "/robots.txt", headers={"User-Agent": USER_AGENT}, timeout=8)
            rp.parse(r.text.splitlines() if r.status_code == 200 else [])
        except requests.RequestException:
            rp.parse([])
        cache[base] = rp
    return cache[base].can_fetch(USER_AGENT, url)


def fetch(url):
    r = requests.get(url, headers={"User-Agent": USER_AGENT, "Accept-Language": "fr,en;q=0.8"}, timeout=12, allow_redirects=True)
    if r.status_code != 200 or "text/html" not in r.headers.get("Content-Type", ""):
        return None, r.url
    return r.text[:600000], r.url


def scan(html):
    emails = [deobfuscate(m) for m in MAILTO.findall(html)] + [deobfuscate(m) for m in EMAIL_TEXT.findall(html)]
    phones = TEL.findall(html)
    return emails, phones


def enrich_one(row):
    url, country = row["website"], row["country"]
    robots = {}
    emails, phones, pages = [], [], 0
    try:
        if not allowed(url, robots):
            return row["id"], {"enrich_status": "robots"}
        html, final = fetch(url)
        pages += 1
        if not html:
            return row["id"], {"enrich_status": "unreachable"}
        e, p = scan(html)
        emails += e
        phones += p
        links = []
        for href in HREF.findall(html):
            full = urljoin(final, href)
            if urlparse(full).netloc == urlparse(final).netloc and CONTACT_HINT.search(href) and full not in links:
                links.append(full)
        for link in links[:2]:
            if emails:
                break
            if not allowed(link, robots):
                continue
            sub, _ = fetch(link)
            pages += 1
            if sub:
                e, p = scan(sub)
                emails += e
                phones += p
    except requests.RequestException:
        return row["id"], {"enrich_status": "unreachable"}
    values = {"enrich_status": "ok" if emails else "no_email"}
    email = pick_email(emails, url)
    if email:
        values.update(email=email, email_source="website")
    if not row.get("phone"):
        for raw in phones:
            phone = clean_phone(raw, country)
            if phone:
                values.update(phone=phone, phone_source="website")
                break
    return row["id"], values


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--limit", type=int, default=3000)
    ap.add_argument("--workers", type=int, default=8)
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()
    db = Supabase()
    retry_before = (datetime.now(timezone.utc) - timedelta(days=90)).strftime("%Y-%m-%dT%H:%M:%SZ")
    rows = db.select(
        "select=id,country,website,phone&active=eq.true&email=is.null&website=not.is.null"
        f"&or=(enriched_at.is.null,enriched_at.lt.{retry_before})&order=enriched_at.nullsfirst",
        max_rows=args.limit)
    print(f"Sites a visitar: {len(rows)}")
    found = 0
    with ThreadPoolExecutor(max_workers=args.workers) as pool:
        futures = [pool.submit(enrich_one, row) for row in rows]
        for fut in as_completed(futures):
            row_id, values = fut.result()
            found += bool(values.get("email"))
            if not args.dry_run:
                values.update(enriched_at=now_iso(), updated_at=now_iso())
                db.patch(f"id=eq.{row_id}", values)
    print(f"E-mails encontrados: {found} / {len(rows)}")


if __name__ == "__main__":
    main()
