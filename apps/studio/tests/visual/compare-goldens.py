#!/usr/bin/env python3
"""
tests/visual/compare-goldens.py — compara os goldens gerados agora contra os
goldens de referência (goldens/), pixel a pixel.

Uso:
  1. node scripts/build.js                          (garante que app/my-studio.html está atualizado)
  2. python3 -m http.server 8791 --directory app     (servir a app numa aba)
  3. node tests/visual/generate-goldens.js           (gera para uma pasta temporária)
  4. python3 tests/visual/compare-goldens.py         (este script)

Devolve código de saída 1 se alguma imagem diferir — usar em CI para bloquear
merges que alterem o renderer sem intenção.
"""
import sys
import os
from pathlib import Path

try:
    from PIL import Image
except ImportError:
    print("Precisa de Pillow: pip install Pillow --break-system-packages")
    sys.exit(2)

ROOT = Path(__file__).resolve().parent.parent.parent
GOLDENS_DIR = ROOT / 'goldens'
CANDIDATE_DIR = ROOT / 'goldens-candidate'  # gerado por generate-goldens.js com MYSTUDIO_GOLDENS_OUT

def main():
    if not GOLDENS_DIR.exists():
        print(f"❌ Não existe {GOLDENS_DIR} — corre primeiro a geração de goldens de referência.")
        sys.exit(2)
    if not CANDIDATE_DIR.exists():
        print(f"❌ Não existe {CANDIDATE_DIR} — corre generate-goldens.js com MYSTUDIO_GOLDENS_OUT={CANDIDATE_DIR} primeiro.")
        sys.exit(2)

    golden_files = sorted(f.name for f in GOLDENS_DIR.glob('*.png'))
    candidate_files = sorted(f.name for f in CANDIDATE_DIR.glob('*.png'))

    missing = set(golden_files) - set(candidate_files)
    extra = set(candidate_files) - set(golden_files)
    if missing:
        print(f"⚠️  Faltam no candidato: {sorted(missing)}")
    if extra:
        print(f"ℹ️  Novos no candidato (sem golden de referência ainda): {sorted(extra)}")

    all_identical = True
    for fname in golden_files:
        if fname in missing:
            continue
        before = Image.open(GOLDENS_DIR / fname).convert('RGBA')
        after = Image.open(CANDIDATE_DIR / fname).convert('RGBA')
        if before.size != after.size:
            print(f"❌ {fname}: TAMANHOS DIFERENTES {before.size} vs {after.size}")
            all_identical = False
            continue
        if before.tobytes() == after.tobytes():
            print(f"✅ {fname}")
        else:
            b, a = before.tobytes(), after.tobytes()
            diffs = sum(1 for x, y in zip(b, a) if x != y)
            pct = 100 * diffs / len(b)
            print(f"❌ {fname}: {diffs} bytes diferentes ({pct:.4f}%) — possível regressão visual")
            all_identical = False

    print()
    if all_identical and not missing:
        print("✅ TODOS OS GOLDENS IDÊNTICOS — sem regressão visual detetada")
        sys.exit(0)
    else:
        print("❌ HÁ DIFERENÇAS — revê antes de fazer merge")
        sys.exit(1)

if __name__ == '__main__':
    main()
