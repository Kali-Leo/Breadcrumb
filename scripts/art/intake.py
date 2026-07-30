#!/usr/bin/env python3
"""Purpose: one-command asset intake — Leo's (or any AI's) self-service door into the
texture library. Checks the white-background contract, keys the image, shows a
white+gray preview, and on confirmation copies it into the app assets and registry.
Usage:
  python3 scripts/art/intake.py <image.png> --name my-castle --level 村落层 \
      --scale 城镇 --mode solid [--prenorm] [--yes]
Modes: solid = 实体元素(建筑等,内部白色保留用于遮挡)  ink = 纯线条元素(线条间透背景)
"""

import json
import pathlib
import subprocess
import sys

ROOT = pathlib.Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "scripts" / "art"))
from generate import border_whiteness, check_line_purity  # noqa: E402

ASSETS = ROOT / "apps" / "desktop" / "src" / "assets" / "map"
REGISTRY = ROOT / "art" / "registry.json"


def argument(flag: str, default: str | None = None) -> str | None:
    return sys.argv[sys.argv.index(flag) + 1] if flag in sys.argv else default


def main() -> None:
    source = pathlib.Path(sys.argv[1])
    name = argument("--name", source.stem)
    level = argument("--level", "未分级")
    scale = argument("--scale", "")
    mode = argument("--mode", "solid")

    whiteness = border_whiteness(source)
    if whiteness < 0.97:
        print(f"⚠ 白底合同不达标（边框亮度 {whiteness:.2f} < 0.97）。")
        print("  请先获得纯白底图片（可用 Recraft removeBackground 或重新生成）。")
        sys.exit(1)
    purity_warning = check_line_purity(source)
    if purity_warning:
        print(f"⚠ 注意:{purity_warning}（可继续，但建议换纯线稿图）")

    keyed = source.parent / f"{name}.keyed.png"
    key_command = [sys.executable, str(ROOT / "scripts/art/key.py"), str(source), str(keyed),
                   "--mode", mode]
    if "--prenorm" in sys.argv:
        key_command.append("--prenorm")
    subprocess.run(key_command, check=True)

    preview = source.parent / f"{name}.preview.png"
    subprocess.run(
        ["montage", str(keyed), str(keyed), "-tile", "2x1", "-geometry", "400x400+8+8",
         "-background", "white", str(preview)], check=True)
    subprocess.run(
        ["convert", str(preview), "-region", "416x416+416+0", "-background", "gray50",
         str(preview)], check=False)
    subprocess.run(["xdg-open", str(preview)], check=False)

    if "--yes" not in sys.argv:
        answer = input("预览已打开（左白底/右灰底）。确认入库？[y/N] ").strip().lower()
        if answer != "y":
            print("已取消，未入库。")
            sys.exit(0)

    target_dir = ASSETS / level
    target_dir.mkdir(parents=True, exist_ok=True)
    target = target_dir / f"{name}.png"
    subprocess.run(["cp", str(keyed), str(target)], check=True)

    entries = json.loads(REGISTRY.read_text()) if REGISTRY.exists() else []
    entries.append({
        "name": name, "file": str(target.relative_to(ROOT / "apps" / "desktop" / "src")),
        "level": level, "scale": scale, "keying": mode,
        "status": "approved", "source": str(source.name),
    })
    REGISTRY.write_text(json.dumps(entries, ensure_ascii=False, indent=1))
    print(f"✅ 已入库：{target}（registry 已登记，status=approved）")


if __name__ == "__main__":
    main()
