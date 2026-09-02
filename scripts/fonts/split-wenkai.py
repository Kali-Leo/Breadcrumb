#!/usr/bin/env python3
"""Purpose: cut LXGW WenKai into unicode-range woff2 slices for the memory palace.

Shipped whole, the font is a 24.7 MB TrueType file that GitHub Pages hands over as 12.4 MB
of gzip — one request that has to finish before a single handwritten name appears. Sliced by
unicode-range, a browser fetches only the slices holding the characters actually on screen,
and caches them per slice. The real work is fontTools' pyftsubset (MIT) and its brotli woff2
encoder; this file only decides which codepoint goes in which slice and writes the stylesheet.

Slicing follows the Google Fonts CJK convention — ~100 small faces, one @font-face each,
font-display: swap — rather than cn-font-split's, because that convention needs no toolchain
beyond the fontTools we already require and the output is the same shape. Slices are ordered
by usage tier (Latin/punctuation, kana, GB2312 level 1, level 2, the rest of the CJK block,
Ext-A, Hangul, the remainder) so the ones a Chinese name needs sit at the front. Every
codepoint in the source font lands in exactly one slice: nothing is dropped.

Input is the original TTF, which is NOT in the repository — the slices are. Download it from
https://github.com/lxgw/LxgwWenKai/releases (LXGWWenKai-Regular.ttf) and pass the path:

    python3 scripts/fonts/split-wenkai.py ~/Downloads/LXGWWenKai-Regular.ttf

Re-running is safe: the output directory is rebuilt from scratch.
"""
from __future__ import annotations

import shutil
import subprocess
import sys
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

from fontTools.ttLib import TTFont

# Same directory as this script, which is sys.path[0] when it runs.
from wenkai_css import write_css

REPO_ROOT = Path(__file__).resolve().parents[2]
OUT_DIR = REPO_ROOT / "apps/desktop/src/assets/fonts/wenkai"
# One slice must stay small enough that a miss costs a moment, not a download.
MAX_SLICE_BYTES = 300_000
# Starting codepoints per slice; a slice that overshoots MAX_SLICE_BYTES is halved and retried.
CHARS_PER_SLICE = 500


def gb2312_tiers() -> tuple[set[int], set[int]]:
    """GB2312's two hanzi tiers, enumerated from the codec rather than a checked-in table.

    Rows (区) 16-55 are the 3,755 level-1 characters — the ones ordinary Chinese is written
    with; rows 56-87 are the 3,008 level-2 characters.
    """
    level1: set[int] = set()
    level2: set[int] = set()
    for row in range(16, 88):
        for cell in range(1, 95):
            try:
                char = bytes([row + 0xA0, cell + 0xA0]).decode("gb2312")
            except UnicodeDecodeError:
                continue
            (level1 if row <= 55 else level2).add(ord(char))
    return level1, level2


def in_ranges(cp: int, ranges: tuple[tuple[int, int], ...]) -> bool:
    return any(low <= cp <= high for low, high in ranges)


PUNCTUATION_AND_LATIN = ((0x0, 0x2E7F), (0x3000, 0x303F), (0xFE10, 0xFFEF))
KANA_AND_BOPOMOFO = ((0x3040, 0x312F), (0x3190, 0x31BF))
URO = ((0x4E00, 0x9FFF),)
EXT_A = ((0x3400, 0x4DBF),)
HANGUL = ((0x1100, 0x11FF), (0x3130, 0x318F), (0xA960, 0xA97F), (0xAC00, 0xD7FF))


def tier_of(cp: int, level1: set[int], level2: set[int]) -> int:
    """Lower tier = fetched by more pages, so it goes in an earlier slice."""
    if in_ranges(cp, PUNCTUATION_AND_LATIN):
        return 0
    if in_ranges(cp, KANA_AND_BOPOMOFO):
        return 1
    if cp in level1:
        return 2
    if cp in level2:
        return 3
    if in_ranges(cp, URO):
        return 4
    if in_ranges(cp, EXT_A):
        return 5
    if in_ranges(cp, HANGUL):
        return 6
    return 7


def plan_slices(codepoints: list[int], level1: set[int], level2: set[int]) -> list[list[int]]:
    """Group by tier, then cut each tier into fixed-size runs. Tiers never share a slice, so
    a page that only needs Latin never pays for the hanzi sitting next to it."""
    by_tier: dict[int, list[int]] = {}
    for cp in codepoints:
        by_tier.setdefault(tier_of(cp, level1, level2), []).append(cp)
    slices: list[list[int]] = []
    for tier in sorted(by_tier):
        members = sorted(by_tier[tier])
        for start in range(0, len(members), CHARS_PER_SLICE):
            slices.append(members[start : start + CHARS_PER_SLICE])
    return slices


def subset(source: Path, out: Path, codepoints: list[int]) -> None:
    """pyftsubset does the cutting and the brotli/woff2 encoding. name-IDs are kept in full so
    every slice still carries the font's own copyright, licence and licence URL — OFL 1.1
    requires the notice to travel with each redistributed copy, slices included."""
    subprocess.run(
        [
            sys.executable, "-m", "fontTools.subset", str(source),
            f"--unicodes={','.join(f'{cp:X}' for cp in codepoints)}",
            "--flavor=woff2", "--layout-features=*", "--name-IDs=*", "--notdef-outline",
            "--ignore-missing-unicodes", f"--output-file={out}",
        ],
        check=True,
        capture_output=True,
    )


def build_slice(source: Path, index: int, codepoints: list[int]) -> tuple[Path, list[int]]:
    """Write one slice, splitting it further if the encoded file overshoots the ceiling."""
    out = OUT_DIR / f"wenkai-{index:03d}.woff2"
    subset(source, out, codepoints)
    while out.stat().st_size > MAX_SLICE_BYTES and len(codepoints) > 1:
        codepoints = codepoints[: len(codepoints) // 2]
        subset(source, out, codepoints)
    return out, codepoints


def main() -> int:
    if len(sys.argv) < 2:
        print(__doc__)
        return 1
    source = Path(sys.argv[1]).expanduser().resolve()
    font = TTFont(source, lazy=True)
    codepoints = sorted(font.getBestCmap())
    print(f"{source.name}: {len(codepoints)} codepoints, {font['maxp'].numGlyphs} glyphs")

    level1, level2 = gb2312_tiers()
    planned = plan_slices(codepoints, level1, level2)

    if OUT_DIR.exists():
        shutil.rmtree(OUT_DIR)
    OUT_DIR.mkdir(parents=True)

    # A slice that had to be halved leaves a remainder, so the queue is worked through rather
    # than mapped over: the leftovers go back on the end and every codepoint still ships.
    written: list[tuple[Path, list[int]]] = []
    queue = list(planned)
    while queue:
        batch, queue = queue[:8], queue[8:]
        with ThreadPoolExecutor(max_workers=8) as pool:
            results = list(
                pool.map(lambda pair: build_slice(source, pair[0], pair[1]),
                         [(len(written) + i, chunk) for i, chunk in enumerate(batch)])
            )
        for (out, used), asked in zip(results, batch):
            written.append((out, used))
            if len(used) < len(asked):
                queue.insert(0, asked[len(used):])
        print(f"  {len(written)} slices written, {len(queue)} planned", end="\r")

    covered = sorted(cp for _, used in written for cp in used)
    assert covered == codepoints, "a codepoint went missing between the font and the slices"
    write_css(OUT_DIR, written)
    total = sum(out.stat().st_size for out, _ in written)
    print(f"\n{len(written)} slices, {total / 1e6:.1f} MB total, "
          f"largest {max(out.stat().st_size for out, _ in written) / 1e3:.0f} KB")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
