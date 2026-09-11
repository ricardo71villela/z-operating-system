#!/usr/bin/env python3
"""Gera private/fichas/ a partir de uma pasta com as fichas PDF já geradas
por fiche_pdf.py (por exemplo output/fiches/).

PORQUÊ (mesmo principio do scripts/split-dashboard.js): cada PDF fica
convertido em base64 e embutido num módulo JS (module.exports = [...]),
importado com require() diretamente no código das Vercel Functions — assim
faz parte do próprio bundle da função e a Vercel inclui-o sempre,
garantidamente (ao contrário de "includeFiles" no vercel.json, que já vimos
não funcionar neste monorepo). Cada ficha é servida individualmente por
api/ficha.js (uma resposta = um PDF, ~20-30 KB, bem abaixo do limite de
4,5 MB da Vercel), por isso os pedaços aqui agrupam várias fichas só para
não ficar com milhares de ficheiros soltos no repositório — não por limite
de tamanho de resposta.

Uso:
    python3 scripts/split-fichas.py <pasta_com_pdfs> [--out private/fichas]

Os PDFs devem chamar-se "fiche_<rang>_<slug>.pdf" (o formato que
fiche_pdf.py já produz) — o <rang> (1-based) decide a ordem, não o nome do
ficheiro. Depois de correr isto, é preciso atualizar a coluna "fichaIdx" em
private/dashboard.html (mapeamento morada -> índice 0-based nesta mesma
ordem) e regenerar private/chunks/ com "node scripts/split-dashboard.js"
antes do commit.
"""
import argparse
import base64
import json
import os
import re
import sys

SHARD_SIZE = 50


def rang_of(fname):
    m = re.match(r"fiche_(\d+)_", fname)
    if not m:
        raise SystemExit(f"nome de ficheiro inesperado (sem 'fiche_<n>_'): {fname}")
    return int(m.group(1))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("src_dir", help="pasta com os PDFs gerados por fiche_pdf.py")
    ap.add_argument("--out", default=None,
                     help="pasta de saída (default: private/fichas ao lado deste script)")
    args = ap.parse_args()

    script_dir = os.path.dirname(os.path.abspath(__file__))
    out_dir = args.out or os.path.join(script_dir, "..", "private", "fichas")
    os.makedirs(out_dir, exist_ok=True)
    for f in os.listdir(out_dir):
        os.remove(os.path.join(out_dir, f))

    files = [f for f in os.listdir(args.src_dir) if f.lower().endswith(".pdf")]
    if not files:
        raise SystemExit(f"nenhum PDF encontrado em {args.src_dir}")
    files.sort(key=rang_of)
    for i, f in enumerate(files):
        if rang_of(f) != i + 1:
            raise SystemExit(f"rang nao sequencial em {f} (esperava {i+1}) — "
                              "confirma que a pasta tem todas as fichas, sem falhas.")

    b64_list = []
    for f in files:
        with open(os.path.join(args.src_dir, f), "rb") as fh:
            b64_list.append(base64.b64encode(fh.read()).decode("ascii"))

    n_shards = (len(b64_list) + SHARD_SIZE - 1) // SHARD_SIZE
    for s in range(n_shards):
        part = b64_list[s * SHARD_SIZE:(s + 1) * SHARD_SIZE]
        js = "module.exports = " + json.dumps(part) + ";\n"
        with open(os.path.join(out_dir, f"shard-{s}.js"), "w") as fh:
            fh.write(js)

    requires = "\n".join(f"  ...require('./shard-{s}.js')," for s in range(n_shards))
    index_js = (
        "// Gerado por scripts/split-fichas.py — nao editar a mao.\n"
        "// Ordem: n=0 e a primeira ficha (rang 1), n=len-1 a ultima.\n"
        "module.exports = [\n" + requires + "\n];\n"
    )
    with open(os.path.join(out_dir, "index.js"), "w") as fh:
        fh.write(index_js)

    print(f"{len(b64_list)} fichas -> {n_shards} shard(s) em {out_dir}")


if __name__ == "__main__":
    main()
