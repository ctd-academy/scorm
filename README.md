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

Đọc **[`docs/DEV.md`](docs/DEV.md)**: cài đặt máy, cấu trúc code, cách chạy test, các việc hay gặp (đổi câu liên hệ, thêm cột Excel, nâng PDF.js…) và các bẫy đã biết. Bối cảnh dự án: [`docs/HANDOFF.md`](docs/HANDOFF.md).

```bash
(cd builder && npm install && npm run dev)   # chạy Builder trên máy: http://localhost:5173
bash tests/run_all.sh                        # chạy toàn bộ test
node builder/scripts/build-scorm.mjs demo-course/ATLD-DEMO.xlsx demo-course out   # đóng gói bằng dòng lệnh
```

Cần: Node 20+, Python 3 (`pip install -r tests/requirements.txt`), ffmpeg.

Dùng Claude Code: mở terminal ở thư mục repo, chạy `claude`. Claude tự đọc `CLAUDE.md`.
