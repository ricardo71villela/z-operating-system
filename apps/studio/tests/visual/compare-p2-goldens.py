#!/usr/bin/env python3

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

        before_bytes = (
            before.tobytes()
        )

        after_bytes = (
            after.tobytes()
        )

        if before_bytes != after_bytes:
            changed_pixels = sum(
                1
                for offset in range(
                    0,
                    len(before_bytes),
                    4,
                )
                if before_bytes[
                    offset:offset + 4
                ]
                != after_bytes[
                    offset:offset + 4
                ]
            )

            total_pixels = (
                before.size[0]
                * before.size[1]
            )

            pct = (
                100
                * changed_pixels
                / total_pixels
                if total_pixels
                else 0
            )

            fail(
                fname
                + ": "
                + str(changed_pixels)
                + " pixels differ "
                + f"({pct:.6f}%)"
            )

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
