#!/usr/bin/env python3
"""Purpose: the launchpad's keying stage — lifts ink off the white background.
Two modes (ink stays pure black; coloring is deliberately deferred):
  ink   — luminance -> alpha (lines float, hatching keeps its gradation)
  solid — corner flood-fill (outer background removed, inner whites kept to occlude)
Usage: python3 scripts/art/key.py <in.png> <out.png> --mode ink|solid [--prenorm]
"""

import pathlib
import subprocess
import sys


def image_size(path: str) -> tuple[int, int]:
    out = subprocess.run(
        ["identify", "-format", "%w %h", path], capture_output=True, text=True, check=True
    ).stdout.split()
    return int(out[0]), int(out[1])


def main() -> None:
    args = sys.argv[1:]
    source, target = args[0], args[1]
    mode = args[args.index("--mode") + 1]
    prenorm = "--prenorm" in args

    work = [str(source)]
    if prenorm:
        work += ["-level", "8%x92%"]

    if mode == "ink":
        command = [
            "convert", *work, "-colorspace", "Gray",
            "(", "+clone", "-negate", ")",
            "-alpha", "off", "-compose", "CopyOpacity", "-composite",
            "-fill", "black", "-colorize", "100",
            "-trim", "+repage", str(target),
        ]
    elif mode == "solid":
        width, height = image_size(source)
        command = [
            # White-threshold first so the background becomes one connected pure-white
            # region — otherwise faint speckles fence the flood and leave white halos.
            "convert", *work, "-white-threshold", "88%",
            "-alpha", "set", "-fuzz", "3%", "-fill", "none",
            # "matte" is the ImageMagick 6 name of the alpha floodfill primitive.
            "-draw", "matte 0,0 floodfill",
            "-draw", f"matte {width - 1},0 floodfill",
            "-draw", f"matte 0,{height - 1} floodfill",
            "-draw", f"matte {width - 1},{height - 1} floodfill",
            "-trim", "+repage", str(target),
        ]
    else:
        raise SystemExit(f"unknown mode: {mode}")

    subprocess.run(command, check=True)
    print(f"keyed [{mode}] {pathlib.Path(target).name}")


if __name__ == "__main__":
    main()
