#!/usr/bin/env bash
# Tái tạo font Lexend Deca, PDF.js, file Excel mẫu, 3 video demo, 3 PDF demo (đều đã có trong git; chạy lại khi cần sửa).
# Nâng PDF.js: đổi PDFJS_VERSION dưới đây, chạy lại, rồi chạy bash tests/run_all.sh.
# Cần: node/npm, python3 + openpyxl, ffmpeg.
# Chạy từ thư mục gốc repo:  bash tools/setup_assets.sh
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

PDFJS_VERSION=6.3.289

echo "1/5 Font Lexend Deca -> player/fonts/"
mkdir -p player/fonts
TMP="$(mktemp -d)"
( cd "$TMP" && npm pack @fontsource/lexend-deca@5 --silent >/dev/null && tar xzf fontsource-lexend-deca-*.tgz )
for w in 400 600 700; do for s in latin latin-ext vietnamese; do
  cp "$TMP/package/files/lexend-deca-$s-$w-normal.woff2" player/fonts/
done; done
rm -rf "$TMP"

echo "2/5 PDF.js $PDFJS_VERSION (bản legacy) -> player/pdfjs/"
# Đổi đuôi .mjs -> .js: máy chủ LMS có thể trả .mjs sai kiểu, trình duyệt từ chối nạp. wasm/ chỉ lấy .wasm + giấy phép.
TMP="$(mktemp -d)"
( cd "$TMP" && npm pack "pdfjs-dist@$PDFJS_VERSION" --silent >/dev/null && tar xzf pdfjs-dist-*.tgz )
rm -rf player/pdfjs && mkdir -p player/pdfjs/wasm
cp "$TMP/package/LICENSE" player/pdfjs/
cp "$TMP/package/legacy/build/pdf.min.mjs" player/pdfjs/pdf.min.js
cp "$TMP/package/legacy/build/pdf.worker.min.mjs" player/pdfjs/pdf.worker.min.js
cp -r "$TMP/package/standard_fonts" player/pdfjs/
cp "$TMP"/package/wasm/*.wasm "$TMP"/package/wasm/LICENSE_* player/pdfjs/wasm/
rm -rf "$TMP"

echo "3/5 Template Excel -> templates/Mau_nhap_lieu_khoa_hoc.xlsx (trống) + demo-course/ATLD-DEMO.xlsx (khóa demo)"
python3 tools/make_template.py

echo "4/5 Video demo -> demo-course/videos/"
mkdir -p demo-course/videos
FONT="$(fc-list : file | grep -i 'DejaVuSans-Bold.ttf' | head -1 | tr -d ': ')"
make_video () { # $1 = tên file, $2 = tiêu đề
  ffmpeg -loglevel error -y \
    -f lavfi -i "color=c=0x16315e:s=1280x720:d=55:r=25" \
    -f lavfi -i "sine=frequency=330:duration=55" \
    -vf "drawtext=fontfile=$FONT:text='$2':fontcolor=0x5fd1c1:fontsize=46:x=(w-tw)/2:y=h/2-90,drawtext=fontfile=$FONT:text='VIDEO DEMO':fontcolor=white@0.6:fontsize=24:x=(w-tw)/2:y=h/2-160,drawtext=fontfile=$FONT:text='%{pts\:hms}':fontcolor=white:fontsize=64:x=(w-tw)/2:y=h/2+10" \
    -c:v libx264 -preset veryfast -b:v 300k -pix_fmt yuv420p -c:a aac -b:a 32k -af volume=0.05 \
    -movflags +faststart "demo-course/videos/$1"
}
make_video 01_vi-sao-an-toan.mp4     "Bài 1 - Vì sao an toàn là trên hết"
make_video 02_bao-ho-ca-nhan.mp4     "Bài 2 - Trang bị bảo hộ cá nhân"
make_video 03_nhan-dien-moi-nguy.mp4 "Bài 3 - Nhận diện mối nguy"

echo "5/5 PDF demo -> demo-course/docs/ (cần playwright)"
python3 tools/make_demo_docs.py

echo "Xong. Thử đóng gói: node builder/scripts/build-scorm.mjs demo-course/ATLD-DEMO.xlsx demo-course out"
