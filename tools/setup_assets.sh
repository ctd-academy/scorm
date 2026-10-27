#!/usr/bin/env bash
# Tái tạo các file không lưu trong git: font Lexend Deca, file Excel mẫu, 3 video demo.
# Cần: node/npm, python3 + openpyxl, ffmpeg.
# Chạy từ thư mục gốc repo:  bash tools/setup_assets.sh
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "1/3 Font Lexend Deca -> player/fonts/"
mkdir -p player/fonts
TMP="$(mktemp -d)"
( cd "$TMP" && npm pack @fontsource/lexend-deca@5 --silent >/dev/null && tar xzf fontsource-lexend-deca-*.tgz )
for w in 400 600 700; do for s in latin latin-ext vietnamese; do
  cp "$TMP/package/files/lexend-deca-$s-$w-normal.woff2" player/fonts/
done; done
rm -rf "$TMP"

echo "2/3 File Excel mẫu -> templates/Mau_nhap_lieu_khoa_hoc.xlsx"
python3 tools/make_template.py

echo "3/3 Video demo -> demo-course/videos/"
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

echo "Xong. Thử đóng gói: python3 tools/build_scorm.py templates/Mau_nhap_lieu_khoa_hoc.xlsx demo-course out"
