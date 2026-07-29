#!/usr/bin/env python3
"""Purpose: the launchpad's slicing stage — cuts a family-sheet image into an N x M grid
of individual trimmed assets (family sheets guarantee same-style consistency).
Usage: python3 scripts/art/slice.py art/out/001-x/sheet.png 3 3 prefix
"""

import pathlib
import subprocess
import sys


def main() -> None:
    sheet = pathlib.Path(sys.argv[1])
    columns, rows = int(sys.argv[2]), int(sys.argv[3])
    prefix = sys.argv[4] if len(sys.argv) > 4 else sheet.stem
    out_dir = sheet.parent / f"{prefix}-slices"
    out_dir.mkdir(exist_ok=True)
    subprocess.run(
        [
            "convert",
            str(sheet),
            "-crop",
            f"{columns}x{rows}@",
            "+repage",
            "-fuzz",
            "6%",
            "-trim",
            "+repage",
            str(out_dir / f"{prefix}-%d.png"),
        ],
        check=True,
    )
    count = len(list(out_dir.glob("*.png")))
    print(f"sliced {count} assets into {out_dir}")


if __name__ == "__main__":
    main()
