#!/usr/bin/env bash
# ============================================================
# Z FIND — AUDITORIA DE SINCRONIZAÇÃO (Sprints 1.1–1.7)
# ============================================================
# Corre isto DENTRO do teu repositório real (a raiz, onde está o
# package.json). Compara o teu estado atual contra o manifesto
# autoritativo (MANIFEST.sha256) gerado a partir do estado acumulado
# de todos os Sprints 1.1–1.7.
#
# Não altera nada — só reporta. Três categorias:
#   MISSING   — ficheiro não existe no teu repositório
#   DIFFERENT — existe, mas o conteúdo não bate certo (hash diferente)
#   OK        — existe e é byte-idêntico
#
# Uso:
#   1. Copia este script e o MANIFEST.sha256 para a raiz do teu repo
#   2. bash audit-sync.sh
# ============================================================

set -euo pipefail
MANIFEST="MANIFEST.sha256"

if [ ! -f "$MANIFEST" ]; then
  echo "ERRO: $MANIFEST não encontrado nesta pasta. Coloca-o na raiz do repositório antes de correr."
  exit 1
fi

missing=0
different=0
ok=0

echo "============================================================"
echo "AUDITORIA — a comparar contra $MANIFEST"
echo "============================================================"
echo

while IFS= read -r line; do
  expected_hash="${line%%  *}"
  filepath="${line#*  }"

  if [ ! -f "$filepath" ]; then
    echo "MISSING    $filepath"
    missing=$((missing+1))
    continue
  fi

  actual_hash=$(sha256sum "$filepath" | awk '{print $1}')
  if [ "$actual_hash" != "$expected_hash" ]; then
    echo "DIFFERENT  $filepath"
    different=$((different+1))
  else
    ok=$((ok+1))
  fi
done < "$MANIFEST"

echo
echo "============================================================"
echo "RESUMO: $ok OK | $different DIFFERENT | $missing MISSING"
echo "============================================================"

if [ "$missing" -gt 0 ] || [ "$different" -gt 0 ]; then
  echo
  echo "Para sincronizar: extrai sync-bundle.zip para a raiz do"
  echo "repositório (sobrepõe apenas os ficheiros que constam do"
  echo "manifesto — nada é apagado, nada fora desta lista é tocado)."
  echo "Depois corre 'git status --short' para veres exatamente o"
  echo "que mudou antes de fazeres commit."
fi
