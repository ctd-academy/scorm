# CLAUDE.md – Coteccons SCORM Builder

Đọc file này và **`docs/DEV.md`** (cấu trúc repo, lệnh, việc hay gặp, bẫy đã biết) trước khi làm bất cứ việc gì trong repo.

## Dự án là gì

Coteccons (tập đoàn xây dựng, ~4.000 nhân viên) chuyển ~150 khóa e-learning sang **Workday Learning**. Workday không có tính năng thi hay chặn tua video, nên mọi luật học nằm **bên trong gói SCORM 1.2**.

| Phần | Trạng thái | Vai trò |
|---|---|---|
| `player/` | ✅ Xong, 99/99 test đạt (có tài liệu PDF, chương, khóa Tham khảo, khóa chỉ video, khóa chỉ bài thi) | "Khung học" nằm trong mọi gói SCORM. Viết một lần, dùng cho cả 150 khóa |
| `builder/` | ✅ **M1–M3.3 xong, đang chạy trên web** (kiểm tra lỗi, đặt pop-up và chương, xem thử, xuất zip SCORM). 🟡 M4: trang hướng dẫn trainer đã lên web (`builder/huong-dan.html`), còn trainer đọc thử + thử Edge | Website tĩnh để trainer tự đóng gói khóa học thành zip SCORM, không cần chạy lệnh |

**Tình trạng (05/11/2026):** chưa dùng thật. Việc đang chờ: thử Edge · thử khóa Tham khảo trên SCORM Cloud/Workday sandbox · trainer đọc thử hướng dẫn · pilot 3 khóa trên Workday sandbox rồi bổ sung các bước Workday vào hướng dẫn. Chi tiết: `docs/HANDOFF.md` mục 11.

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
6. Luật chơi Player: học tuần tự · chỉ tua lại phần đã xem · tối đa 2x · chuyển tab thì dừng · pop-up không tính điểm, sai thì chọn lại tới khi đúng (không phải xem lại video), đúng thì lưu ngay · bài thi tùy chỉnh theo khóa, làm từng câu, chỉ nộp khi đã trả lời hết, lưu bài làm dở (đóng cửa sổ thì mở lại làm tiếp lượt đó; rời sang video thì mất lượt) · hết lượt thì báo `failed`, khóa bài thi, hiện liên hệ L&OD · chứng nhận do Workday cấp · tài liệu PDF theo từng video (không bắt buộc): xem song song khi video chạy, không có nút tải/in, ẩn khi làm bài thi, không in tên học viên · chương theo từng video (không bắt buộc): bấm để nhảy tới, khóa Bắt buộc chỉ bấm được chương đã xem tới.
   **Hai loại khóa** (05/11/2026, dòng "Loại khóa"): luật trên là khóa **Bắt buộc** (mặc định). Khóa **Tham khảo** (tài liệu hướng dẫn): mở bài nào cũng được, tua tự do, chuyển tab không dừng, không pop-up, không bài thi, mở khóa là `completed`; vẫn tối đa 2x, PDF vẫn không tải/in.
7. **Host:** repo `ctd-academy/scorm` (tài khoản team) và host trên **GitHub Pages** (https://ctd-academy.github.io/scorm/).
8. **Không dùng Lovable** cho phần lõi (đóng gói, Player). Có thể dùng để phác giao diện.
9. **Hướng dẫn cho trainer là trang web trong Builder** (`builder/huong-dan.html`, nút "📖 Hướng dẫn"), đi từ đơn giản tới chi tiết. Đổi giao diện Builder, cột Excel, thông báo lỗi hoặc luật học thì **sửa trang này cho khớp**.

## Ghi chú riêng cho Claude Code

- Môi trường cloud của Claude: Chromium có sẵn ở `/opt/pw-browsers/chromium`; Playwright Python có thể đòi bản khác và không tải được → chạy test với `CHROME_PATH=/opt/pw-browsers/chromium bash tests/run_all.sh`.
- Không cài được gì từ cdn.sheetjs.com hay cdn.playwright.dev.
- Môi trường mới: `(cd builder && npm install)` và `pip install -r tests/requirements.txt` trước khi chạy test.
- Alex hay merge PR ngay khi test xanh. Làm tiếp trên nhánh có PR đã merge: tạo lại nhánh từ `origin/main`; nếu nhánh đã có commit mới thì gộp `main` vào bằng merge commit (không force-push được).

## Định nghĩa "xong" cho mỗi thay đổi

Xem `docs/DEV.md` mục 9. Tóm tắt: `bash tests/run_all.sh` đạt hết (25 test logic, 99 test Player, 99 test giao diện); gói khóa demo khớp gói mẫu; thử trên Chrome và Edge.
