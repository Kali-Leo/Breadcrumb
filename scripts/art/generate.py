#!/usr/bin/env python3
"""Purpose: the launchpad's generation stage — reads a batch JSON, calls the Recraft API,
downloads results, and normalizes formats (webp/svg -> png) into art/out/<batch>/.
Usage: python3 scripts/art/generate.py art/batches/001-xxx.json
"""

import json
import pathlib
import subprocess
import sys
import urllib.request

ROOT = pathlib.Path(__file__).resolve().parents[2]
API = "https://external.api.recraft.ai/v1/images/generations"


def read_api_key() -> str:
    for line in (ROOT / ".env").read_text().splitlines():
        if line.startswith("RECRAFT_API_KEY="):
            return line.split("=", 1)[1].strip()
    raise SystemExit("RECRAFT_API_KEY not found in .env")


def generate_one(key: str, item: dict, batch: dict, out_dir: pathlib.Path) -> None:
    body = {"prompt": item["prompt"], "model": "recraftv3", "size": item.get("size", "1024x1024")}
    for field in ("style_id", "style", "substyle"):
        if field in item:
            body[field] = item[field]
        elif field in batch:
            body[field] = batch[field]
    headers = {
        "Authorization": f"Bearer {key}",
        "Content-Type": "application/json",
        "User-Agent": "breadcrumb-art-pipeline/1.0",
    }
    request = urllib.request.Request(API, data=json.dumps(body).encode(), headers=headers)
    with urllib.request.urlopen(request, timeout=180) as response:
        payload = json.load(response)
    url = payload["data"][0]["url"]
    raw_path = out_dir / f"{item['name']}.bin"
    image_request = urllib.request.Request(url, headers={"User-Agent": headers["User-Agent"]})
    with urllib.request.urlopen(image_request, timeout=180) as image, open(raw_path, "wb") as file:
        file.write(image.read())

    kind = subprocess.run(["file", "-b", raw_path], capture_output=True, text=True).stdout
    png_path = out_dir / f"{item['name']}.png"
    if "SVG" in kind:
        raw_path.rename(out_dir / f"{item['name']}.svg")
        subprocess.run(
            ["convert", "-background", "white", out_dir / f"{item['name']}.svg", png_path],
            check=True,
        )
    else:
        subprocess.run(["convert", str(raw_path), str(png_path)], check=True)
        raw_path.unlink()

    verdict = enforce_white_background(key, png_path)
    verdict += check_line_purity(png_path)
    print(f"  ✓ {item['name']}{verdict}")


def fraction_below(png_path: pathlib.Path, threshold_percent: int) -> float:
    """Fraction of pixels darker than the given luminance threshold."""
    result = subprocess.run(
        ["convert", str(png_path), "-colorspace", "Gray",
         "-threshold", f"{threshold_percent}%", "-format", "%[fx:1-mean]", "info:"],
        capture_output=True, text=True, check=True,
    )
    return float(result.stdout.split()[0])


def check_line_purity(png_path: pathlib.Path) -> str:
    """Pure-line contract: too many midtone pixels means gray wash — flag for re-roll."""
    midtone_fraction = fraction_below(png_path, 75) - fraction_below(png_path, 25)
    if midtone_fraction > 0.15:
        return f"  ⚠ 灰晕染(中间调{midtone_fraction:.0%})，违反纯线稿合同，标记 re-roll"
    return ""


def border_whiteness(png_path: pathlib.Path) -> float:
    """Mean luminance (0..1) of the four 6%-thick edge strips."""
    strips = ["100%x6%+0+0", "100%x6%+0+94%", "6%x100%+0+0", "6%x100%+94%+0"]
    values = []
    for strip in strips:
        result = subprocess.run(
            ["convert", str(png_path), "-crop", strip, "+repage", "-colorspace", "Gray",
             "-format", "%[fx:mean]", "info:"],
            capture_output=True, text=True, check=True,
        )
        values.append(float(result.stdout.split()[0]))
    return sum(values) / len(values)


def enforce_white_background(key: str, png_path: pathlib.Path) -> str:
    """The white-background contract: dirty borders get auto-cleaned, failures flagged."""
    whiteness = border_whiteness(png_path)
    if whiteness >= 0.97:
        return ""
    subprocess.run(
        ["curl", "-s", "-X", "POST",
         "https://external.api.recraft.ai/v1/images/removeBackground",
         "-H", f"Authorization: Bearer {key}", "-F", f"file=@{png_path}",
         "-o", f"{png_path}.rb.json"],
        check=True,
    )
    info = json.loads(pathlib.Path(f"{png_path}.rb.json").read_text())
    pathlib.Path(f"{png_path}.rb.json").unlink()
    url = info.get("image", {}).get("url")
    if not url:
        return f"  ⚠ 脏底(亮度{whiteness:.2f})且清洗失败，标记 re-roll"
    subprocess.run(["curl", "-s", url, "-o", f"{png_path}.rb"], check=True)
    subprocess.run(
        ["convert", f"{png_path}.rb", "-background", "white", "-flatten", str(png_path)],
        check=True,
    )
    pathlib.Path(f"{png_path}.rb").unlink()
    cleaned = border_whiteness(png_path)
    if cleaned >= 0.97:
        return f"  🧼 脏底(亮度{whiteness:.2f})已自动清洗"
    return f"  ⚠ 清洗后仍不达标(亮度{cleaned:.2f})，标记 re-roll"


def main() -> None:
    batch_path = pathlib.Path(sys.argv[1])
    batch = json.loads(batch_path.read_text())
    out_dir = ROOT / "art" / "out" / batch_path.stem
    out_dir.mkdir(parents=True, exist_ok=True)
    key = read_api_key()
    print(f"batch {batch_path.stem}: {len(batch['items'])} items")
    for item in batch["items"]:
        try:
            generate_one(key, item, batch, out_dir)
        except Exception as error:  # noqa: BLE001 — surface and continue the batch
            print(f"  ✗ {item['name']}: {error}")


if __name__ == "__main__":
    main()
