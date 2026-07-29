#!/usr/bin/env bash
# Purpose: one-shot history fix — set every commit's author/committer to Kali-Leo's
# GitHub email and strip Co-Authored-By trailers, then force-push.
# Run manually: bash scripts/fix-authorship.sh
set -euo pipefail
cd "$(dirname "$0")/.."

FILTER_BRANCH_SQUELCH_WARNING=1 git filter-branch -f \
  --env-filter 'export GIT_AUTHOR_EMAIL="12211602@mail.sustech.edu.cn"
export GIT_COMMITTER_EMAIL="12211602@mail.sustech.edu.cn"
export GIT_AUTHOR_NAME="Kali-Leo"
export GIT_COMMITTER_NAME="Kali-Leo"' \
  --msg-filter 'grep -v "Co-Authored-By: Claude" || true' \
  -- --all

rm -rf .git/refs/original
git push --force origin main

echo
echo "✅ 完成。验证（应只看到你的邮箱、无 Co-Authored-By）："
git log --format="%h %an <%ae>" | head -5
git log --format=%B | grep -c "Co-Authored-By" || echo "Co-Authored-By 数量: 0"
