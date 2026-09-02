#!/usr/bin/env bash
# Purpose: full zoom sweep via dev keyboard presets (keys 1-5) — 5 frames min to max.
set -euo pipefail
# A fixed /tmp name can be pre-created as a symlink by anyone else on the machine, and these
# frames are screenshots of whatever is on screen. mktemp -d gives us a private directory we
# know we own; the path is printed at the end so the frames are still easy to find.
OUT=${1:-$(mktemp -d -t mapsweep-XXXXXX)}; mkdir -p "$OUT"
WIN=$(xdotool search --name "^Breadcrumb$" | tail -1)
xdotool windowactivate "$WIN"; sleep 1
xdotool key --window "$WIN" ctrl+r; sleep 7
xdotool mousemove --window "$WIN" 120 1006 click 1; sleep 6   # 打开地图
for i in 1 2 3 4 5; do
  xdotool key --window "$WIN" $i; sleep 2
  import -window "$WIN" "$OUT/z$i.png"
done
montage "$OUT"/z*.png -tile 5x1 -geometry 460x340+3+3 -background gray30 "$OUT/sweep.png"
echo "连拍完成: $OUT/sweep.png"
echo "输出目录: $OUT"
