#!/usr/bin/env python3

import math
import os
import sys
from pathlib import Path

try:
    from PIL import Image
except ImportError:
    print(
        "P2 visual comparison requires Pillow"
    )
    sys.exit(2)

ROOT = (
    Path(__file__)
    .resolve()
    .parent
    .parent
    .parent
)

BASELINE_DIR = Path(
    os.environ.get(
        "ZSTUDIO_P2_BASELINE_DIR",
        ROOT / "goldens-p2",
    )
)

CANDIDATE_DIR = Path(
    os.environ.get(
        "ZSTUDIO_P2_CANDIDATE_DIR",
        ROOT / "goldens-p2-candidate",
    )
)

EXPECTED = [
    "p2-metadata-classico-story-long.png",
    "p2-metadata-editorial-story-long.png",
    "p2-minimalista-story.png",
    "p2-ui-finance-en-desktop.png",
    "p2-ui-finance-fr-mobile.png",
    "p2-ui-gastronomia-mobile.png",
]

# Renderer canvases are deterministic and remain byte-exact. The three DOM
# element crops are also required to keep their exact dimensions, while their
# anti-aliased text/borders may rasterize differently across GitHub-hosted
# Linux runners/regions. A visually indistinguishable Finance EN pair from
# independent approved-flow runs measured 2.181 mean / 3.716 RMS / 15 max on
# a 16x16 RGB perceptual thumbnail. The limits below retain narrow headroom
# around that observed envelope. Structural hierarchy, labels, spacing and
# touch-target geometry are independently enforced by the P2 functional
# hierarchy contract, so a DOM visual crop must satisfy both authorities.
DOM_UI_CROPS = {
    "p2-ui-finance-en-desktop.png",
    "p2-ui-finance-fr-mobile.png",
    "p2-ui-gastronomia-mobile.png",
}
PERCEPTUAL_SIZE = (16, 16)
MAX_DOM_THUMBNAIL_MAE = 3.0
MAX_DOM_THUMBNAIL_RMSE = 5.0
MAX_DOM_THUMBNAIL_CHANNEL_DELTA = 24


def fail(message, code=1):
    print(
        "❌ "
        + message
    )
    raise SystemExit(code)


def png_names(directory):
    return sorted(
        path.name
        for path in directory.glob(
            "*.png"
        )
    )


def classify_matrix(
    label,
    actual,
):
    expected = EXPECTED

    if actual == expected:
        print(
            "✅ "
            + label
            + " matrix = exact 6"
        )
        return

    missing = sorted(
        set(expected)
        - set(actual)
    )

    extra = sorted(
        set(actual)
        - set(expected)
    )

    print(
        "❌ "
        + label
        + " matrix mismatch"
    )

    if missing:
        print(
            "   missing="
            + repr(missing)
        )

    if extra:
        print(
            "   extra="
            + repr(extra)
        )

    fail(
        label
        + " must contain exactly the approved six PNG files"
    )


def perceptual_metrics(before, after):
    left = (
        before.convert("RGB")
        .resize(
            PERCEPTUAL_SIZE,
            Image.Resampling.LANCZOS,
        )
        .tobytes()
    )
    right = (
        after.convert("RGB")
        .resize(
            PERCEPTUAL_SIZE,
            Image.Resampling.LANCZOS,
        )
        .tobytes()
    )

    differences = [
        abs(a - b)
        for a, b in zip(left, right)
    ]

    count = len(differences)
    mae = (
        sum(differences) / count
        if count
        else 0.0
    )
    rmse = (
        math.sqrt(
            sum(
                value * value
                for value in differences
            ) / count
        )
        if count
        else 0.0
    )
    max_delta = max(
        differences,
        default=0,
    )

    return {
        "mae": mae,
        "rmse": rmse,
        "max_delta": max_delta,
    }


def accept_dom_perceptual_match(fname, metrics):
    if fname not in DOM_UI_CROPS:
        return False

    return (
        metrics["mae"]
        <= MAX_DOM_THUMBNAIL_MAE
        and metrics["rmse"]
        <= MAX_DOM_THUMBNAIL_RMSE
        and metrics["max_delta"]
        <= MAX_DOM_THUMBNAIL_CHANNEL_DELTA
    )


def main():
    if not BASELINE_DIR.is_dir():
        fail(
            "P2 baseline directory missing: "
            + str(BASELINE_DIR),
            2,
        )

    if not CANDIDATE_DIR.is_dir():
        fail(
            "P2 candidate directory missing: "
            + str(CANDIDATE_DIR),
            2,
        )

    baseline_files = png_names(
        BASELINE_DIR
    )

    candidate_files = png_names(
        CANDIDATE_DIR
    )

    classify_matrix(
        "P2 baseline",
        baseline_files,
    )

    classify_matrix(
        "P2 candidate",
        candidate_files,
    )

    passed = 0

    for fname in EXPECTED:
        baseline_path = (
            BASELINE_DIR
            / fname
        )

        candidate_path = (
            CANDIDATE_DIR
            / fname
        )

        try:
            with Image.open(
                baseline_path
            ) as image:
                before = image.convert(
                    "RGBA"
                )

            with Image.open(
                candidate_path
            ) as image:
                after = image.convert(
                    "RGBA"
                )

        except Exception as exc:
            fail(
                fname
                + ": PNG decode failure: "
                + str(exc)
            )

        if before.size != after.size:
            fail(
                fname
                + ": dimensions differ "
                + str(before.size)
                + " vs "
                + str(after.size)
            )

        before_bytes = before.tobytes()
        after_bytes = after.tobytes()

        if before_bytes != after_bytes:
            if fname not in DOM_UI_CROPS:
                fail(
                    fname
                    + ": deterministic renderer bytes differ"
                )

            metrics = perceptual_metrics(
                before,
                after,
            )

            if not accept_dom_perceptual_match(
                fname,
                metrics,
            ):
                fail(
                    fname
                    + ": DOM perceptual mismatch "
                    + f"MAE={metrics['mae']:.3f}, "
                    + f"RMSE={metrics['rmse']:.3f}, "
                    + "max Δ"
                    + str(metrics["max_delta"])
                )

            print(
                "✅ "
                + fname
                + ": bounded DOM perceptual match "
                + f"MAE={metrics['mae']:.3f}, "
                + f"RMSE={metrics['rmse']:.3f}, "
                + "max Δ"
                + str(metrics["max_delta"])
            )
            passed += 1
            continue

        passed += 1

        print(
            "✅ "
            + fname
        )

    if passed != 6:
        fail(
            "internal P2 comparison count differs"
        )

    print()
    print(
        "P2_VISUAL_COMPARE=6_OF_6_PASS"
    )
    print(
        "TOTAL_P2_VISUAL_AUTHORITY=6"
    )


if __name__ == "__main__":
    main()
