#!/usr/bin/env bash
# Chạy toàn bộ test, theo đúng thứ tự trên GitHub (.github/workflows/pages.yml):
#   1. test logic Builder (npm test)
#   2. đóng gói khóa demo bằng lệnh Node, chạy 43 test Player trên gói đó
#   3. dựng website Builder, chạy test giao diện Builder
# Cần: Node 20+, python3 + thư viện trong tests/requirements.txt, ffmpeg/ffprobe.
# Chạy từ thư mục gốc repo:  bash tests/run_all.sh        (thêm LARGE=1 để thử khóa 1,5 GB)
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
SERVE="$ROOT/builder/node_modules/.bin/http-server"
PY="$(command -v python3 || command -v python)"   # Windows thường chỉ có "python"
PIDS=()
trap 'kill ${PIDS[@]+"${PIDS[@]}"} 2>/dev/null || true' EXIT

# Máy chủ tĩnh hỗ trợ HTTP Range (bắt buộc để test tua video), chờ tới khi trả lời được
serve () { # $1 = thư mục, $2 = cổng
  "$SERVE" "$1" -p "$2" -s -c-1 & PIDS+=($!)
  for _ in $(seq 50); do curl -sf "http://localhost:$2/" >/dev/null && return; sleep 0.2; done
  echo "Không mở được máy chủ ở cổng $2"; exit 1
}

echo "== 1/3 Test logic Builder"
(cd builder && npm test)

echo "== 2/3 Test Player trên gói khóa demo"
rm -rf out/test && mkdir -p out/test/course
node builder/scripts/build-scorm.mjs demo-course/ATLD-DEMO.xlsx demo-course out
cp tests/lms.html out/test/
"$PY" -m zipfile -e out/SCORM_ATLD-DEMO.zip out/test/course
serve out/test 8765
"$PY" tests/test_player.py

echo "== 3/3 Test giao diện Builder"
(cd builder && npm run build)
serve builder/dist 8766
"$PY" tests/test_builder.py

echo "Tất cả test đều đạt."
