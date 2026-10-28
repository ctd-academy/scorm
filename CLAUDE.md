# CLAUDE.md – Coteccons SCORM Builder

Đọc file này và **`docs/DEV.md`** (cấu trúc repo, lệnh, việc hay gặp, bẫy đã biết) trước khi làm bất cứ việc gì trong repo.

## Dự án là gì

Coteccons (tập đoàn xây dựng, ~4.000 nhân viên) chuyển ~150 khóa e-learning sang **Workday Learning**. Workday không có tính năng thi hay chặn tua video, nên mọi luật học nằm **bên trong gói SCORM 1.2**.

| Phần | Trạng thái | Vai trò |
|---|---|---|
| `player/` | ✅ Xong, 43/43 test đạt (có tài liệu PDF) | "Khung học" nằm trong mọi gói SCORM. Viết một lần, dùng cho cả 150 khóa |
| `builder/` | 🟡 **M1–M3 xong** (kiểm tra lỗi, đặt pop-up, xem thử, xuất zip SCORM), còn M4 (hướng dẫn 1 trang cho trainer) | Website tĩnh để trainer tự đóng gói khóa học thành zip SCORM, không cần chạy lệnh |

Chủ dự án: **Alex** (L&OD Team Lead). Người dùng Builder: 4 trainer L&OD, không phải lập trình viên.

## Cách làm việc với Alex

- Trao đổi bằng **tiếng Việt**, gọi là "Alex". Giải thích bằng ngôn ngữ đời thường, tránh thuật ngữ khi không cần.
- Phong cách Alex thích: **đơn giản, mạnh mẽ**. Ít tính năng nhưng chạy chắc.
- Giao diện Builder và Player: **tiếng Việt có dấu**.
- Alex dùng Excel bản cũ: công thức Excel trong hướng dẫn viết bằng dấu `;`.
- Trước khi làm việc lớn, nói ngắn gọn sẽ làm gì. Gặp quyết định có nhiều hướng, đưa 2–3 phương án và đề xuất một.
- Code phải bảo trì được bởi người **không dùng Claude Code**: cập nhật `docs/DEV.md` khi đổi cấu trúc, lệnh hoặc thêm bẫy mới.

## Quyết định đã chốt (không đổi nếu Alex chưa đồng ý)

1. **Builder là website tĩnh, không có backend.** Đọc Excel, đọc video, kiểm tra lỗi, đóng zip đều chạy **trên trình duyệt của người dùng**. Video và đề thi **không bao giờ được upload** lên server.
2. **1 khóa = 1 gói SCORM 1.2** chứa toàn bộ video + pop-up + bài thi.
3. **Excel là nơi nhập liệu chính** (template chuẩn, trống: `templates/Mau_nhap_lieu_khoa_hoc.xlsx`; khóa demo: `demo-course/ATLD-DEMO.xlsx`; cả hai do `tools/make_template.py` tạo). Builder không thay Excel bằng form.
4. **Player là nguồn chuẩn.** Builder nhúng nguyên `player/` vào gói, không viết lại luật chơi. Sửa luật chơi = sửa `player/` + chạy lại test.
5. **Một động cơ đóng gói** (28/10/2026): `builder/src/` (`xlsx.js`, `course.js`, `package.js`, `zip.js`) dùng chung cho website và lệnh `builder/scripts/build-scorm.mjs`. Đã bỏ bản Python `tools/build_scorm.py`; gói khóa demo so với gói mẫu `builder/tests/golden/ATLD-DEMO.json`.
6. Luật chơi Player: học tuần tự · chỉ tua lại phần đã xem · tối đa 2x · chuyển tab thì dừng · pop-up không tính điểm, sai thì xem lại từ pop-up trước (hoặc đầu video) · bài thi tùy chỉnh theo khóa · hết lượt thì báo `failed`, khóa bài thi, hiện liên hệ L&OD · chứng nhận do Workday cấp · tài liệu PDF theo từng video (không bắt buộc): xem song song khi video chạy, không có nút tải/in, ẩn khi làm bài thi, không in tên học viên.
7. **Host:** repo `ctd-academy/scorm` (tài khoản team) và host trên **GitHub Pages**.
8. **Không dùng Lovable** cho phần lõi (đóng gói, Player). Có thể dùng để phác giao diện.

## Ghi chú riêng cho Claude Code

- Môi trường cloud của Claude: Chromium có sẵn ở `/opt/pw-browsers/chromium`; Playwright Python có thể đòi bản khác và không tải được → chạy test với `CHROME_PATH=/opt/pw-browsers/chromium bash tests/run_all.sh`.
- Không cài được gì từ cdn.sheetjs.com hay cdn.playwright.dev.

## Định nghĩa "xong" cho mỗi thay đổi

Xem `docs/DEV.md` mục 9. Tóm tắt: `bash tests/run_all.sh` đạt hết (19 test logic, 43 test Player, 80 test giao diện); gói khóa demo khớp gói mẫu; thử trên Chrome và Edge.
