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
    print(f"  ✓ {item['name']}")


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
