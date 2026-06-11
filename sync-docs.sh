#!/usr/bin/env bash
#
# sync-docs.sh — rebuild the stack docs atlas and publish it to the deploy repo.
#
# The atlas build (build-atlas.mjs) scans EVERY repo across the monorepo, so it can
# only run here, where the whole stack is checked out. Cloudflare Pages clones the
# deploy repo alone and has no build step — so we build locally and commit the
# prebuilt dist/ into the deploy repo. CF Pages just serves dist/ verbatim.
#
# Deploy repo:  https://github.com/c-u-l8er/docs   (Pages output dir = dist, no build cmd)
# Serves:       https://docs.ampersandboxdesign.com
#
# Run from anywhere:  ./docs/sync-docs.sh   (paths are absolute; idempotent)

set -euo pipefail

DOCS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEPLOY_REMOTE="git@github.com:c-u-l8er/docs.git"
DEPLOY_BRANCH="main"

# 1. Rebuild the atlas from the live monorepo.
echo "[1/4] Building atlas (scans the whole stack)…"
( cd "$DOCS_DIR" && npm run build >/dev/null )
if [[ ! -f "$DOCS_DIR/dist/index.html" ]]; then
  echo "error: build produced no dist/index.html" >&2
  exit 1
fi
echo "      built $(find "$DOCS_DIR/dist" -type f | wc -l | tr -d ' ') files into dist/"

# 2. Clone the deploy repo into a temp dir (clean checkout every run).
CLONE="$(mktemp -d /tmp/docs-deploy.XXXXXX)"
trap 'rm -rf "$CLONE"' EXIT
echo "[2/4] Cloning $DEPLOY_REMOTE…"
git clone -q --depth 1 -b "$DEPLOY_BRANCH" "$DEPLOY_REMOTE" "$CLONE"

# 3. Mirror the freshly built dist/ into the deploy repo's dist/.
#    rm-then-copy so deleted/renamed docs don't linger as stale pages.
echo "[3/4] Syncing dist/ → deploy repo…"
rm -rf "$CLONE/dist"
cp -r "$DOCS_DIR/dist" "$CLONE/dist"
touch "$CLONE/dist/.nojekyll"   # build doesn't emit it; harmless for CF, needed for GH Pages

# 4. Commit + push only if something actually changed.
cd "$CLONE"
git add -A
if git diff --cached --quiet; then
  echo "[4/4] No changes — deploy repo already up to date."
  exit 0
fi

FILES=$(git diff --cached --name-only | wc -l | tr -d ' ')
git commit -q -m "$(cat <<EOF
Publish stack docs atlas ($(date -u +%Y-%m-%dT%H:%MZ))

Rebuilt from c-u-l8er/ProjectAmp2 via docs/build-atlas.mjs. $FILES file(s) changed.

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
EOF
)"
echo "[4/4] Pushing ($FILES file(s) changed)…"
git push -q origin "$DEPLOY_BRANCH"
echo "Done. Cloudflare Pages will redeploy from the new commit."
