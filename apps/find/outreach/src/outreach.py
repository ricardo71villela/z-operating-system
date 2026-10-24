"""
ZOS — envio diário dos e-mails de prospeção (agências do Z Find).

Uma passagem (GitHub Action, dias úteis de manhã):
1. Lê a caixa de correio (IMAP, opcional): respostas → param as relances;
   devoluções (bounces) → o endereço não volta a receber; «STOP» →
   desinscrição (do_not_contact).
2. Calcula o limite do dia: aquecimento da caixa nova (10 no 1.º dia,
   +5 por dia útil) até OUTREACH_DAILY_LIMIT (40 por defeito).
3. Primeiro as relances devidas (relance 1 cinco dias úteis depois do
   1.º contacto, relance 2 sete dias úteis depois da relance 1), depois
   novos contactos.
4. Para cada e-mail: regista a linha em zos_outreach_sends (estado
   «queued», com o jeton de desinscrição), envia por SMTP, marca «sent»
   (ou «failed» / «bounced»). Pausa aleatória entre envios.

Nunca envia sem OUTREACH_ENABLED=true e sem a identidade do remetente
(nome e morada da empresa) e o SMTP configurados: caso contrário faz só uma
simulação (nada é escrito na base).

Uso: python src/outreach.py [--dry-run] [--limit 5]
"""

import argparse
import email.utils
import imaplib
import os
import random
import re
import smtplib
import ssl
import sys
import time
import urllib.parse
from datetime import date, datetime, timedelta, timezone
from email import message_from_bytes
from email.header import decode_header, make_header
from email.message import EmailMessage
from zoneinfo import ZoneInfo

import requests

import messages

PARIS = ZoneInfo("Europe/Paris")
SUPABASE_URL = os.environ.get("SUPABASE_URL", "https://dcdggqyazdddrfuzwavw.supabase.co").rstrip("/")
OPTOUT_BASE = os.environ.get("OUTREACH_OPTOUT_BASE", "https://zfind.online/api/prospection-optout")
CAMPAIGN = os.environ.get("OUTREACH_CAMPAIGN", "zfind-agences-v1")
TARGET_TABLE = "zfind_agencias"
WAIT_BUSINESS_DAYS = {2: 5, 3: 7}  # relance 1: +5 dias úteis; relance 2: +7 dias úteis depois da relance 1
WARMUP_START, WARMUP_STEP = 10, 5


# ------------------------------------------------------------------ helpers

def env(name, default=""):
    value = os.environ.get(name)
    return default if value is None or value.strip() == "" else value.strip()


def business_days_between(start, end):
    """Dias úteis (seg-sex) depois de `start` até `end` inclusive."""
    if end <= start:
        return 0
    days, d = 0, start
    while d < end:
        d += timedelta(days=1)
        if d.weekday() < 5:
            days += 1
    return days


def daily_limit(first_send_day, today, cap):
    """Aquecimento: 10 no primeiro dia de envios, +5 por dia útil, até `cap`."""
    if first_send_day is None:
        return min(cap, WARMUP_START)
    return min(cap, WARMUP_START + WARMUP_STEP * business_days_between(first_send_day, today))


def paris_date(iso):
    return datetime.fromisoformat(iso.replace("Z", "+00:00")).astimezone(PARIS).date()


def optout_url(token):
    return f"{OPTOUT_BASE}?t={token}"


# ------------------------------------------------------------------ selection

def due_followups(sends, today, blocked_emails):
    """
    sends: linhas desta campanha (target_id, email, step, status, sent_at, message_id).
    Devolve [(target_id, próxima etapa, linha do 1.º contacto)] devidos hoje.
    """
    by_target = {}
    for s in sends:
        by_target.setdefault(s["target_id"], []).append(s)
    due = []
    for target_id, rows in by_target.items():
        rows.sort(key=lambda r: r["step"])
        last = rows[-1]
        if last["step"] >= 3 or last["status"] != "sent" or not last.get("sent_at"):
            continue
        if any(r["status"] in ("replied", "bounced", "opted_out") for r in rows):
            continue
        if last["email"].lower() in blocked_emails:
            continue
        nxt = last["step"] + 1
        if business_days_between(paris_date(last["sent_at"]), today) >= WAIT_BUSINESS_DAYS[nxt]:
            first = rows[0] if rows[0]["step"] == 1 else None
            due.append((target_id, nxt, first, last["sent_at"]))
    due.sort(key=lambda x: x[3])
    return [(t, step, first) for t, step, first, _ in due]


def pick_new(candidates, already_targets, used_emails, blocked_emails, limit):
    """Novos alvos: um só por endereço, nunca um endereço já contactado ou bloqueado."""
    picked, seen = [], set(used_emails) | set(blocked_emails)
    for c in candidates:
        if len(picked) >= limit:
            break
        e = (c.get("email") or "").lower()
        if not e or c["id"] in already_targets or e in seen:
            continue
        seen.add(e)
        picked.append(c)
    return picked


# ------------------------------------------------------------------ inbox

_BOUNCE_FROM = re.compile(r"^(mailer-daemon|postmaster|mail-daemon|bounce[s]?)@", re.I)
_BOUNCE_SUBJECT = re.compile(r"undeliver|delivery (status|failure)|returned mail|failure notice|non remis|échec de (la )?remise|mail delivery", re.I)
_AUTO_SUBJECT = re.compile(r"absence|out of (the )?office|automatic reply|réponse automatique|r[ée]ponse auto|auto[- ]?reply|vacances|cong[ée]s", re.I)
_STOP = re.compile(r"(^|\W)stop($|\W)|d[ée]sinscri|unsubscribe|ne plus recevoir|retirez[- ]moi|supprimez", re.I)
_EMAIL = re.compile(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,24}")


def classify_message(from_header, subject, body, auto_submitted, contacted):
    """Devolve [(tipo, email)] com tipo em replied / bounced / stop. `contacted`: e-mails em minúsculas."""
    addr = email.utils.parseaddr(from_header or "")[1].lower()
    subject = subject or ""
    body = body or ""
    if _BOUNCE_FROM.match(addr) or _BOUNCE_SUBJECT.search(subject):
        found = {e.lower() for e in _EMAIL.findall(body)} & contacted
        return [("bounced", e) for e in sorted(found)]
    if addr not in contacted:
        return []
    own = [l for l in body.strip().splitlines() if l.strip() and not l.lstrip().startswith(">")]
    first_lines = "\n".join(own[:5])
    if _STOP.search(subject) or _STOP.search(first_lines):
        return [("stop", addr)]
    if (auto_submitted or "no").lower() != "no" or _AUTO_SUBJECT.search(subject):
        return []
    return [("replied", addr)]


def _text_of(msg):
    if msg.is_multipart():
        for part in msg.walk():
            if part.get_content_type() in ("text/plain", "message/delivery-status", "text/rfc822-headers"):
                payload = part.get_payload(decode=True)
                if payload:
                    return payload.decode(part.get_content_charset() or "utf-8", "replace")
        return ""
    payload = msg.get_payload(decode=True) or b""
    return payload.decode(msg.get_content_charset() or "utf-8", "replace")


def read_inbox(cfg, contacted, days=14):
    events = []
    box = imaplib.IMAP4_SSL(cfg["imap_host"], int(cfg["imap_port"]))
    try:
        box.login(cfg["smtp_user"], cfg["smtp_password"])
        box.select("INBOX", readonly=True)
        since = (date.today() - timedelta(days=days)).strftime("%d-%b-%Y")
        _, data = box.search(None, "SINCE", since)
        for num in (data[0] or b"").split():
            _, parts = box.fetch(num, "(BODY.PEEK[])")
            if not parts or not parts[0]:
                continue
            raw = parts[0][1]
            msg = message_from_bytes(raw)
            subject = str(make_header(decode_header(msg.get("Subject", ""))))
            text = _text_of(msg)
            if _BOUNCE_FROM.match(email.utils.parseaddr(msg.get("From", ""))[1]) or _BOUNCE_SUBJECT.search(subject):
                text += "\n" + raw.decode("utf-8", "replace")  # o endereço devolvido está no relatório anexo
            events += classify_message(msg.get("From", ""), subject, text, msg.get("Auto-Submitted"), contacted)
    finally:
        try:
            box.logout()
        except Exception:
            pass
    return events


# ------------------------------------------------------------------ database

class Db:
    def __init__(self, key):
        self.s = requests.Session()
        headers = {"apikey": key, "Content-Type": "application/json"}
        if key.startswith("eyJ"):
            headers["Authorization"] = f"Bearer {key}"
        self.s.headers.update(headers)

    def req(self, method, path, **kw):
        for attempt in range(4):
            r = self.s.request(method, f"{SUPABASE_URL}/rest/v1/{path}", timeout=60, **kw)
            if r.status_code in (429, 500, 502, 503, 504):
                time.sleep(2 * (attempt + 1))
                continue
            if r.status_code >= 400:
                raise RuntimeError(f"Supabase {method} {path[:90]} -> {r.status_code}: {r.text[:300]}")
            return r.json() if r.text else None
        raise RuntimeError(f"Supabase {method} {path[:90]}: demasiadas tentativas")

    def all(self, path, page=1000):
        out, offset = [], 0
        while True:
            rows = self.req("GET", f"{path}&limit={page}&offset={offset}")
            out += rows
            if len(rows) < page:
                return out
            offset += page


# ------------------------------------------------------------------ sending

def build_email(cfg, target, step, token, today, first=None):
    sender = {"legal_name": cfg["legal_name"], "postal_address": cfg["postal_address"], "signature": cfg["signature"]}
    subject, text, html_doc = messages.render(step, target, sender, optout_url(token), today,
                                              first_subject=(first or {}).get("subject"))
    msg = EmailMessage()
    msg["From"] = email.utils.formataddr((cfg["from_name"], cfg["from_email"]))
    msg["To"] = target["email"]
    msg["Subject"] = subject
    msg["Date"] = email.utils.formatdate(localtime=True)
    domain = cfg["from_email"].split("@")[-1]
    msg["Message-ID"] = email.utils.make_msgid(domain=domain)
    if cfg.get("reply_to"):
        msg["Reply-To"] = cfg["reply_to"]
    msg["List-Unsubscribe"] = f"<{optout_url(token)}>, <mailto:{cfg['reply_to'] or cfg['from_email']}?subject=STOP>"
    msg["List-Unsubscribe-Post"] = "List-Unsubscribe=One-Click"
    if first and first.get("message_id"):
        msg["In-Reply-To"] = first["message_id"]
        msg["References"] = first["message_id"]
    msg.set_content(text)
    msg.add_alternative(html_doc, subtype="html")
    return msg


def smtp_connect(cfg):
    port = int(cfg["smtp_port"])
    context = ssl.create_default_context()
    if port == 465:
        server = smtplib.SMTP_SSL(cfg["smtp_host"], port, context=context, timeout=60)
    else:
        server = smtplib.SMTP(cfg["smtp_host"], port, timeout=60)
        server.starttls(context=context)
    server.login(cfg["smtp_user"], cfg["smtp_password"])
    return server


def load_config():
    cfg = {
        "enabled": env("OUTREACH_ENABLED").lower() == "true",
        "daily_cap": int(env("OUTREACH_DAILY_LIMIT", "40")),
        "service_key": env("ZFIND_SUPABASE_SERVICE_KEY"),
        "smtp_host": env("OUTREACH_SMTP_HOST"), "smtp_port": env("OUTREACH_SMTP_PORT", "465"),
        "smtp_user": env("OUTREACH_SMTP_USER"), "smtp_password": env("OUTREACH_SMTP_PASSWORD"),
        "imap_host": env("OUTREACH_IMAP_HOST"), "imap_port": env("OUTREACH_IMAP_PORT", "993"),
        "from_email": env("OUTREACH_FROM_EMAIL"), "from_name": env("OUTREACH_FROM_NAME", "Z Find"),
        "reply_to": env("OUTREACH_REPLY_TO"),
        "signature": env("OUTREACH_SIGNATURE", "L’équipe Z Find").replace("\\n", "\n"),
        "legal_name": env("OUTREACH_LEGAL_NAME"), "postal_address": env("OUTREACH_POSTAL_ADDRESS"),
        "pause_min": float(env("OUTREACH_PAUSE_MIN", "30")), "pause_max": float(env("OUTREACH_PAUSE_MAX", "90")),
    }
    missing = [k for k in ("smtp_host", "smtp_user", "smtp_password", "from_email", "legal_name", "postal_address", "service_key") if not cfg[k]]
    cfg["missing"] = missing
    return cfg


TARGET_COLUMNS = "id,email,email_source,name,trade_name,city,postcode,country,type,phone"


def target_view(row):
    return dict(row, display_name=row.get("trade_name") or row.get("name"))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true", help="simulação: nada é enviado nem escrito")
    ap.add_argument("--limit", type=int, help="máximo de e-mails nesta passagem (abaixo do limite do dia)")
    args = ap.parse_args()

    cfg = load_config()
    today = datetime.now(PARIS).date()
    live = cfg["enabled"] and not cfg["missing"] and not args.dry_run
    if not live:
        reasons = []
        if not cfg["enabled"]:
            reasons.append("OUTREACH_ENABLED não está a true")
        if cfg["missing"]:
            reasons.append("em falta: " + ", ".join(cfg["missing"]))
        if args.dry_run:
            reasons.append("--dry-run")
        print("SIMULAÇÃO (nada é enviado nem escrito): " + "; ".join(reasons))
    if today.weekday() >= 5:
        print("Fim de semana: nenhum envio.")
        return
    if not cfg["service_key"]:
        print("ZFIND_SUPABASE_SERVICE_KEY em falta: não consigo ler a base.")
        sys.exit(1 if cfg["enabled"] else 0)

    db = Db(cfg["service_key"])
    sends = db.all(f"zos_outreach_sends?campaign=eq.{CAMPAIGN}&select=id,target_id,email,step,status,sent_at,message_id,token&order=created_at.asc")
    every = db.all("zos_outreach_sends?select=email,status")
    contacted = {s["email"].lower() for s in every}
    blocked = {s["email"].lower() for s in every if s["status"] in ("bounced", "opted_out", "replied")}

    # 1. Caixa de correio
    if live and cfg["imap_host"] and contacted:
        try:
            events = read_inbox(cfg, contacted)
        except Exception as e:  # a caixa não impede os envios
            print(f"IMAP: leitura falhou ({e}); continuo sem ela.")
            events = []
        for kind, addr in events:
            if kind == "stop":
                rows = db.req("GET", f"zos_outreach_sends?email=eq.{urllib.parse.quote(addr)}&select=token&limit=1")
                if rows:
                    db.req("POST", "rpc/zos_outreach_opt_out", json={"p_token": rows[0]["token"]})
            else:
                db.req("PATCH", f"zos_outreach_sends?email=eq.{urllib.parse.quote(addr)}&status=eq.sent", json={"status": kind, "updated_at": datetime.now(timezone.utc).isoformat()})
            blocked.add(addr)
        if events:
            print("Caixa: " + ", ".join(f"{k} {a}" for k, a in events))

    # 2. Limite do dia
    sent_rows = [s for s in sends if s.get("sent_at")]
    first_day = min((paris_date(s["sent_at"]) for s in sent_rows), default=None)
    sent_today = sum(1 for s in sent_rows if paris_date(s["sent_at"]) == today)
    limit = max(0, daily_limit(first_day, today, cfg["daily_cap"]) - sent_today)
    if args.limit is not None:
        limit = min(limit, args.limit)
    print(f"Campanha {CAMPAIGN}: {len(sends)} envios registados; limite hoje {limit} (já enviados hoje: {sent_today}).")
    if limit <= 0:
        return

    # 3. Relances, depois novos contactos
    queue = []
    for target_id, step, first in due_followups(sends, today, blocked)[:limit]:
        queue.append((target_id, step, first))
    targets = {}
    if queue:
        ids = ",".join(t for t, _, _ in queue)
        for row in db.req("GET", f"{TARGET_TABLE}?id=in.({ids})&select={TARGET_COLUMNS},email_outreach_allowed"):
            if row.get("email_outreach_allowed"):
                targets[row["id"]] = target_view(row)
        queue = [q for q in queue if q[0] in targets]
    room = limit - len(queue)
    if room > 0:
        already = {s["target_id"] for s in sends}
        candidates = db.all(
            f"{TARGET_TABLE}?email_outreach_allowed=is.true&active=is.true&type=in.(agency,network_agency)"
            f"&select={TARGET_COLUMNS}&order=phone.asc.nullslast,country.asc,postcode.asc,id.asc", page=1000)
        for row in pick_new(candidates, already, contacted, blocked, room):
            targets[row["id"]] = target_view(row)
            queue.append((row["id"], 1, None))

    # 4. Envio
    first_subjects = {}
    for s in sends:
        if s["step"] == 1:
            first_subjects[s["target_id"]] = s
    done = {"sent": 0, "failed": 0, "bounced": 0}
    server = smtp_connect(cfg) if live and queue else None
    try:
        for i, (target_id, step, first) in enumerate(queue):
            target = targets[target_id]
            first_row = first_subjects.get(target_id)
            first_info = None
            if step > 1 and first_row:
                first_info = {"message_id": first_row.get("message_id"),
                              "subject": messages.subject_for(1, target)}
            if not live:
                token = "00000000-0000-4000-8000-000000000000"
                msg = build_email(dict(cfg, legal_name=cfg["legal_name"] or "[NOME DA EMPRESA]",
                                       postal_address=cfg["postal_address"] or "[MORADA]",
                                       from_email=cfg["from_email"] or "prospection@exemple.fr"),
                                  target, step, token, today, first_info)
                if i < 3:
                    print(f"\n--- {msg['To']} (etapa {step}) ---\nAssunto: {msg['Subject']}\n{msg.get_body(('plain',)).get_content()}")
                continue
            row = db.req("POST", "zos_outreach_sends?on_conflict=campaign,target_table,target_id,step", json={
                "campaign": CAMPAIGN, "target_table": TARGET_TABLE, "target_id": target_id,
                "email": target["email"].lower(), "step": step, "status": "queued"},
                headers={"Prefer": "return=representation,resolution=ignore-duplicates"})
            if not row:
                continue  # já existia (outra passagem): nunca enviar duas vezes a mesma etapa
            row = row[0]
            msg = build_email(cfg, target, step, row["token"], today, first_info)
            now = datetime.now(timezone.utc).isoformat()
            try:
                server.send_message(msg)
                db.req("PATCH", f"zos_outreach_sends?id=eq.{row['id']}", json={
                    "status": "sent", "sent_at": now, "message_id": msg["Message-ID"], "updated_at": now})
                done["sent"] += 1
            except smtplib.SMTPRecipientsRefused as e:
                db.req("PATCH", f"zos_outreach_sends?id=eq.{row['id']}", json={"status": "bounced", "error": str(e)[:300], "updated_at": now})
                done["bounced"] += 1
            except smtplib.SMTPException as e:
                db.req("PATCH", f"zos_outreach_sends?id=eq.{row['id']}", json={"status": "failed", "error": str(e)[:300], "updated_at": now})
                done["failed"] += 1
                if isinstance(e, smtplib.SMTPServerDisconnected):
                    server = smtp_connect(cfg)
            if i < len(queue) - 1:
                time.sleep(random.uniform(cfg["pause_min"], cfg["pause_max"]))
    finally:
        if server:
            try:
                server.quit()
            except Exception:
                pass
    follow = sum(1 for _, s, _ in queue if s > 1)
    print(f"\nPassagem: {len(queue)} e-mails ({follow} relances, {len(queue) - follow} novos contactos)"
          + (f"; enviados {done['sent']}, falhados {done['failed']}, devolvidos {done['bounced']}." if live else " — simulação."))


if __name__ == "__main__":
    main()
