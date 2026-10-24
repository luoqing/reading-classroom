#!/usr/bin/env bash
set -euo pipefail

rm -rf dist/client
NODE_ENV=production STANDALONE_CONTENT=true vite build --config vite.config.ts

if [[ -f dist/client/client/index.html ]]; then
  mv dist/client/client/index.html dist/client/index.html
  rmdir dist/client/client
fi

node scripts/finalize-standalone-html.mjs
