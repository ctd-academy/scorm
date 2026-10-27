# Coteccons SCORM Builder

Công cụ của L&OD Coteccons để đóng gói khóa e-learning (video + câu hỏi pop-up + bài thi cuối khóa) thành gói **SCORM 1.2** đưa lên **Workday Learning**.

- `player/` – khung học dùng chung trong mọi gói (đã xong)
- `builder/` – website để trainer tự đóng gói (đang xây, xem `docs/BUILDER_SPEC.md`)

## Bắt đầu với Claude Code

1. Giải nén thư mục này, mở terminal tại đây, chạy `claude`.
2. Dán câu sau:

   > Đọc CLAUDE.md, docs/BUILDER_SPEC.md và docs/HANDOFF.md. Chạy tools/setup_assets.sh, đóng gói khóa demo và chạy test Player để chắc môi trường ổn. Sau đó đề xuất kế hoạch cho mốc M1 của Builder rồi chờ mình duyệt.

## Lệnh nhanh

```bash
bash tools/setup_assets.sh        # font + Excel mẫu + video demo
python3 tools/build_scorm.py templates/Mau_nhap_lieu_khoa_hoc.xlsx demo-course out
```

Cần: Python 3 (`pip install openpyxl playwright && playwright install chromium`), Node 18+, ffmpeg.
