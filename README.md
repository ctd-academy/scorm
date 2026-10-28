# Coteccons SCORM Builder

Công cụ của L&OD Coteccons để đóng gói khóa e-learning (video + câu hỏi pop-up + bài thi cuối khóa) thành gói **SCORM 1.2** đưa lên **Workday Learning**.

## Dành cho trainer

1. Mở **https://ctd-academy.github.io/scorm/** bằng Chrome hoặc Edge.
2. Bấm **"Tải file Excel mẫu"** trên trang, lưu vào thư mục khóa (cùng chỗ với video). Chưa cần điền xong.
3. Bấm **"Chọn thư mục khóa"**. Builder tự tìm file Excel trong thư mục.
4. Ở bước **"Đặt pop-up"**: phát video, bấm **"Đặt pop-up tại đây"**, rồi **"Copy bảng"** dán vào sheet Câu hỏi. Excel chưa có danh sách video thì bấm **"Copy danh sách video"** dán vào sheet Video trước.
5. Có slide/tài liệu PDF cho bài nào thì để file vào thư mục khóa và ghi tên file ở cột **"Tài liệu PDF"** của sheet Video. Học viên xem song song khi nghe video.
6. Điền câu hỏi, lưu Excel, bấm **"Kiểm tra lại"** ở bước 3 để xem lỗi. Sửa và kiểm tra lại đến khi hết lỗi; bấm **"Mở xem thử"** để học thử đúng như học viên.
7. Hết lỗi thì bấm **"Xuất gói SCORM"**, lưu file `SCORM_<Mã khóa>.zip` rồi đưa lên Workday. Builder hiện sẵn tên, mã, mô tả, thời lượng để copy sang Workday.

Không cần cài đặt hay chạy lệnh gì. Video và đề thi không rời khỏi máy bạn.

---

## Dành cho người phát triển

- `player/` – khung học dùng chung trong mọi gói (đã xong)
- `builder/` – website để trainer tự đóng gói (đang xây theo `docs/BUILDER_SPEC.md`; xong M1–M3: kiểm tra lỗi, đặt pop-up, xem thử, xuất gói SCORM)
- `templates/Mau_nhap_lieu_khoa_hoc.xlsx` – **template chuẩn, trống**: mỗi khóa học chép ra 1 bản để nhập
- `demo-course/` – khóa demo (Excel `ATLD-DEMO.xlsx` + 3 video) dùng để thử và test

## Bắt đầu với Claude Code

1. Giải nén thư mục này, mở terminal tại đây, chạy `claude`.
2. Dán câu sau:

   > Đọc CLAUDE.md, docs/BUILDER_SPEC.md và docs/HANDOFF.md. Chạy tools/setup_assets.sh, đóng gói khóa demo và chạy test Player để chắc môi trường ổn. Sau đó đề xuất kế hoạch cho mốc M1 của Builder rồi chờ mình duyệt.

## Lệnh nhanh

```bash
bash tools/setup_assets.sh        # font + Excel mẫu + video demo
python3 tools/build_scorm.py demo-course/ATLD-DEMO.xlsx demo-course out
(cd builder && npm install && npm run dev)   # chạy Builder trên máy: http://localhost:5173
```

Cần: Python 3 (`pip install openpyxl playwright && playwright install chromium`), Node 18+, ffmpeg.
