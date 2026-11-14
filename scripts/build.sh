#!/bin/sh
# Copies app/ to dist/ and stamps the build sha (R6). Usage: scripts/build.sh [sha]
set -eu
cd "$(dirname "$0")/.."
SHA="${1:-$(git rev-parse HEAD)}"
rm -rf dist && cp -R app dist
sed -i.bak "s/__BUILD_SHA__/$SHA/g" dist/index.html && rm dist/index.html.bak
echo "built dist/ at $SHA"
