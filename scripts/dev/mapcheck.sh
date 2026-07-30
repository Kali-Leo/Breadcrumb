#!/usr/bin/env bash
# Purpose: one-command answer to "did the map render?" — activates the app window,
# opens the map view, captures it, and measures the non-white pixel ratio.
set -euo pipefail
OUT=${1:-/tmp/mapcheck.png}
WIN=$(xdotool search --name "^Breadcrumb$" | tail -1)
[ -z "$WIN" ] && { echo "FAIL: 找不到 Breadcrumb 窗口（应用没在跑？）"; exit 1; }
xdotool windowactivate "$WIN"; sleep 1
xdotool key --window "$WIN" ctrl+r; sleep 7            # 干净加载
xdotool mousemove --window "$WIN" 120 1006 click 1; sleep 6  # 打开地图页
import -window "$WIN" "$OUT"
# 只测中央区域(避开侧栏)，非白像素占比
RATIO=$(convert "$OUT" -gravity Center -crop 60%x70%+120+0 +repage -colorspace Gray -threshold 97% -format "%[fx:1-mean]" info:)
echo "非白像素占比: $RATIO (截图: $OUT)"
python3 -c "import sys; r=float('$RATIO'); sys.exit(0 if r>0.03 else 2)" \
  && echo "PASS ✅ 地图有内容" || { echo "FAIL ❌ 画面近乎空白"; exit 2; }
