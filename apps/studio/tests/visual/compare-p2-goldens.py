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

# Electron/Chromium can vary the final anti-aliased edge pixels of the
# mobile element screenshots by one or two channel levels between otherwise
# identical Linux runners. Three independent approved-flow runs established
# that this noise is confined to the bottom eight rows and remains below
# 32 pixels / 0.06% with a maximum channel delta of 2. Renderer canvases and
# the desktop UI golden remain byte-exact; this exception is deliberately
# limited to the two mobile UI crops.
MOBILE_RASTER_TOLERANCE = {
    "p2-ui-finance-fr-mobile.png",
    "p2-ui-gastronomia-mobile.png",
}
MAX_MOBILE_CHANGED_PIXELS = 32
MAX_MOBILE_CHANGED_PCT = 0.06
MAX_MOBILE_CHANNEL_DELTA = 2
MOBILE_EDGE_ROWS = 8


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


def changed_pixel_metrics(before, after):
    before_pixels = list(before.getdata())
    after_pixels = list(after.getdata())
    width, height = before.size

    changed = []
    max_channel_delta = 0

    for index, (left, right) in enumerate(
        zip(before_pixels, after_pixels)
    ):
        if left == right:
            continue

        x = index % width
        y = index // width
        channel_delta = max(
            abs(int(a) - int(b))
            for a, b in zip(left, right)
        )
        max_channel_delta = max(
            max_channel_delta,
            channel_delta,
        )
        changed.append((x, y))

    total_pixels = width * height
    changed_pixels = len(changed)
    pct = (
        100 * changed_pixels / total_pixels
        if total_pixels
        else 0
    )

    return {
        "changed": changed,
        "changed_pixels": changed_pixels,
        "pct": pct,
        "max_channel_delta": max_channel_delta,
        "height": height,
    }


def accept_mobile_raster_noise(fname, metrics):
    if fname not in MOBILE_RASTER_TOLERANCE:
        return False

    if metrics["changed_pixels"] > MAX_MOBILE_CHANGED_PIXELS:
        return False

    if metrics["pct"] > MAX_MOBILE_CHANGED_PCT:
        return False

    if metrics["max_channel_delta"] > MAX_MOBILE_CHANNEL_DELTA:
        return False

    first_allowed_row = max(
        0,
        metrics["height"] - MOBILE_EDGE_ROWS,
    )

    return all(
        y >= first_allowed_row
        for _, y in metrics["changed"]
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
            metrics = changed_pixel_metrics(
                before,
                after,
            )

            if accept_mobile_raster_noise(
                fname,
                metrics,
            ):
                print(
                    "✅ "
                    + fname
                    + ": bounded mobile raster noise "
                    + str(metrics["changed_pixels"])
                    + " pixels / "
                    + f"{metrics['pct']:.6f}% / max Δ"
                    + str(metrics["max_channel_delta"])
                )
                passed += 1
                continue

            fail(
                fname
                + ": "
                + str(metrics["changed_pixels"])
                + " pixels differ "
                + f"({metrics['pct']:.6f}%), max channel Δ"
                + str(metrics["max_channel_delta"])
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
