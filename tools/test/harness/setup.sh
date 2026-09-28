#!/usr/bin/env bash
# 실제 엔트리 엔진(entryjs) 테스트 하네스 준비
#  1) npm 패키지: @entrylabs/entry(엔진), @entrylabs/tool, playwright-core 등
#  2) 엔트리가 필요로 하는 외부 라이브러리(jQuery, EaselJS, SoundJS …)는
#     엔트리 오프라인 저장소(entrylabs/entry-offline)의 vendor 폴더만 받아 온다.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
HERE="$ROOT/tools/test/harness"
cd "$ROOT"
[ -d node_modules/@entrylabs/entry ] || npm install --no-audit --no-fund
if [ ! -f "$HERE/vendor/easeljs-0.8.0.min.js" ]; then
  TMP="$(mktemp -d)"
  git clone --depth 1 --filter=blob:none --sparse https://github.com/entrylabs/entry-offline.git "$TMP/eo"
  (cd "$TMP/eo" && git sparse-checkout set src/renderer/resources/vendor)
  rm -rf "$HERE/vendor" && cp -r "$TMP/eo/src/renderer/resources/vendor" "$HERE/vendor"
  rm -rf "$TMP"
fi
echo "harness ready: $HERE"
