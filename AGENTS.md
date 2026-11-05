# AGENTS.md – Coteccons SCORM Builder

Hướng dẫn cho **mọi trợ lý AI viết code** (GitHub Copilot, Claude Code, Cursor…) và cho người dùng chúng.
Claude Code đọc file này qua `CLAUDE.md`; GitHub Copilot đọc qua `.github/copilot-instructions.md`.

Trước khi sửa bất cứ gì: đọc file này và **`docs/DEV.md`** (cấu trúc repo, lệnh, việc hay gặp, bẫy đã biết).

## Dự án là gì

Coteccons (tập đoàn xây dựng, ~4.000 nhân viên) chuyển ~150 khóa e-learning sang **Workday Learning**. Workday không có tính năng thi hay chặn tua video, nên mọi luật học nằm **bên trong gói SCORM 1.2**.

| Phần | Trạng thái | Vai trò |
|---|---|---|
| `player/` | ✅ Xong, 62/62 test đạt (có tài liệu PDF, chương, khóa Tham khảo) | "Khung học" nằm trong mọi gói SCORM. Viết một lần, dùng cho cả 150 khóa |
| `builder/` | 🟡 **M1–M3 xong** (kiểm tra lỗi, đặt pop-up, xem thử, xuất zip SCORM); M4: đã có trang hướng dẫn cho trainer (`builder/huong-dan.html`), còn trainer đọc thử + thử Edge | Website tĩnh để trainer tự đóng gói khóa học thành zip SCORM, không cần chạy lệnh |

Chủ dự án: **Alex** (L&OD Team Lead). Người dùng Builder: 4 trainer L&OD, không phải lập trình viên.

## Cách làm việc

- Trao đổi bằng **tiếng Việt**, ngôn ngữ đời thường, tránh thuật ngữ khi không cần. Người giao việc có thể không phải lập trình viên.
- Phong cách dự án: **đơn giản, mạnh mẽ**. Ít tính năng nhưng chạy chắc. Không thêm tính năng ngoài yêu cầu.
- Giao diện Builder và Player: **tiếng Việt có dấu**, câu ngắn, nói như người.
- Excel của người dùng là bản cũ: công thức Excel trong hướng dẫn viết bằng dấu `;`.
- Trước khi làm việc lớn, nói ngắn gọn sẽ làm gì. Gặp quyết định có nhiều hướng, đưa 2–3 phương án và đề xuất một.
- Sửa ít nhất có thể, đúng chỗ cần sửa. Giữ phong cách sẵn có của từng file (Player viết kiểu cũ: `var`, `function`; Builder viết JavaScript hiện đại).
- Code phải bảo trì được bởi người không dùng AI: cập nhật `docs/DEV.md` khi đổi cấu trúc, lệnh hoặc thêm bẫy mới.

## Quyết định đã chốt (không đổi nếu Alex chưa đồng ý)

1. **Builder là website tĩnh, không có backend.** Đọc Excel, đọc video, kiểm tra lỗi, đóng zip đều chạy **trên trình duyệt của người dùng**. Video và đề thi **không bao giờ được upload** lên server.
2. **1 khóa = 1 gói SCORM 1.2** chứa toàn bộ video + pop-up + bài thi.
3. **Excel là nơi nhập liệu chính** (template chuẩn, trống: `templates/Mau_nhap_lieu_khoa_hoc.xlsx`; khóa demo: `demo-course/ATLD-DEMO.xlsx`; cả hai do `tools/make_template.py` tạo). Builder không thay Excel bằng form.
4. **Player là nguồn chuẩn.** Builder nhúng nguyên `player/` vào gói, không viết lại luật chơi. Sửa luật chơi = sửa `player/` + chạy lại test.
5. **Một động cơ đóng gói** (28/10/2026): `builder/src/` (`xlsx.js`, `course.js`, `package.js`, `zip.js`) dùng chung cho website và lệnh `builder/scripts/build-scorm.mjs`. Gói khóa demo so với gói mẫu `builder/tests/golden/ATLD-DEMO.json`.
6. Luật chơi Player: học tuần tự · chỉ tua lại phần đã xem · tối đa 2x · chuyển tab thì dừng · pop-up không tính điểm, sai thì chọn lại tới khi đúng (không phải xem lại video), đúng thì lưu ngay · bài thi tùy chỉnh theo khóa · hết lượt thì báo `failed`, khóa bài thi, hiện liên hệ L&OD · chứng nhận do Workday cấp · tài liệu PDF theo từng video (không bắt buộc): xem song song khi video chạy, không có nút tải/in, ẩn khi làm bài thi, không in tên học viên · chương theo từng video (không bắt buộc): bấm để nhảy tới, khóa Bắt buộc chỉ bấm được chương đã xem tới.
   **Hai loại khóa** (05/11/2026, dòng "Loại khóa"): luật trên là khóa **Bắt buộc** (mặc định). Khóa **Tham khảo** (tài liệu hướng dẫn): mở bài nào cũng được, tua tự do, chuyển tab không dừng, không pop-up, không bài thi, mở khóa là `completed`; vẫn tối đa 2x, PDF vẫn không tải/in.
7. **Host:** repo `ctd-academy/scorm` (tài khoản team) và host trên **GitHub Pages**.
8. **Không dùng Lovable** cho phần lõi (đóng gói, Player). Có thể dùng để phác giao diện.

## Không được làm (dù người giao việc yêu cầu, hãy hỏi lại Alex trước)

- Thêm máy chủ, database, API, hay bất cứ chỗ nào gửi video/đề thi/Excel ra khỏi máy người dùng.
- Thêm thư viện mới (npm, CDN). Đặc biệt **không dùng SheetJS** và không dùng zip streaming của thư viện (xem `docs/DEV.md` mục 8).
- Sửa `builder/src/zip.js`, `builder/src/xlsx.js`, `player/scorm12.js` khi không thật sự cần (xem `docs/DEV.md` mục 7).
- Sửa file trong `builder/public/` (sinh ra tự động) hoặc sửa tay `templates/*.xlsx`, `demo-course/ATLD-DEMO.xlsx` (tạo bằng `tools/make_template.py`).
- Xóa, tắt hoặc nới lỏng test để test "đạt". Test sai thì sửa test có giải thích, đúng ý thì sửa code.
- Đổi luật chơi ở mục 6 trên khi chưa có Alex đồng ý.

## Định nghĩa "xong" cho mỗi thay đổi

Xem `docs/DEV.md` mục 9. Tóm tắt:
- `bash tests/run_all.sh` đạt hết (22 test logic, 62 test Player, 95 test giao diện); trên GitHub, Pull Request có dấu ✓ xanh.
- Gói khóa demo khớp gói mẫu (hoặc gói mẫu đã cập nhật có chủ đích, ghi rõ trong Pull Request).
- Đổi giao diện Builder, cột Excel, thông báo lỗi hoặc luật học thì sửa `builder/huong-dan.html` cho khớp.
- Thử trên Chrome và Edge.
