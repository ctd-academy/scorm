# CLAUDE.md – Coteccons SCORM Builder

Đọc file này trước khi làm bất cứ việc gì trong repo.

## Dự án là gì

Coteccons (tập đoàn xây dựng, ~4.000 nhân viên) chuyển ~150 khóa e-learning sang **Workday Learning**. Workday không có tính năng thi hay chặn tua video, nên mọi luật học nằm **bên trong gói SCORM 1.2**.

Repo này gồm 2 phần:

| Phần | Trạng thái | Vai trò |
|---|---|---|
| `player/` | ✅ Xong, 26/26 test đạt | "Khung học" nằm trong mọi gói SCORM. Viết một lần, dùng cho cả 150 khóa |
| `builder/` | 🟡 Đang xây: **M1 + M2 xong** (kiểm tra lỗi, xuất zip SCORM), tiếp theo M3 (xem thử + đặt pop-up) | Website tĩnh để trainer tự đóng gói khóa học thành zip SCORM, không cần chạy lệnh |

Chủ dự án: **Alex** (L&OD Team Lead). Người dùng Builder: 4 trainer L&OD, không phải lập trình viên.

## Cách làm việc với Alex

- Trao đổi bằng **tiếng Việt**, gọi là "Alex". Giải thích bằng ngôn ngữ đời thường, tránh thuật ngữ khi không cần.
- Phong cách Alex thích: **đơn giản, mạnh mẽ**. Ít tính năng nhưng chạy chắc.
- Giao diện Builder và Player: **tiếng Việt có dấu**.
- Alex dùng Excel bản cũ: công thức Excel trong hướng dẫn viết bằng dấu `;`.
- Trước khi làm việc lớn, nói ngắn gọn sẽ làm gì. Gặp quyết định có nhiều hướng, đưa 2–3 phương án và đề xuất một.

## Quyết định đã chốt (không đổi nếu Alex chưa đồng ý)

1. **Builder là website tĩnh, không có backend.** Đọc Excel, đọc video, kiểm tra lỗi, đóng zip đều chạy **trên trình duyệt của người dùng**. Video và đề thi **không bao giờ được upload** lên server.
2. **1 khóa = 1 gói SCORM 1.2** chứa toàn bộ video + pop-up + bài thi.
3. **Excel là nơi nhập liệu chính** (template chuẩn, trống: `templates/Mau_nhap_lieu_khoa_hoc.xlsx`; khóa demo: `demo-course/ATLD-DEMO.xlsx`; cả hai do `tools/make_template.py` tạo). Builder không thay Excel bằng form.
4. **Player là nguồn chuẩn.** Builder nhúng nguyên `player/` vào gói, không viết lại luật chơi. Sửa luật chơi = sửa `player/` + chạy lại test.
5. Luật chơi Player: học tuần tự · chỉ tua lại phần đã xem · tối đa 2x · chuyển tab thì dừng · pop-up không tính điểm, sai thì xem lại từ pop-up trước (hoặc đầu video) · bài thi tùy chỉnh theo khóa · hết lượt thì báo `failed`, khóa bài thi, hiện liên hệ L&OD · chứng nhận do Workday cấp.
6. **Host:** repo `ctd-academy/scorm` (tài khoản team) và host trên **GitHub Pages**.
7. **Không dùng Lovable** cho phần lõi (đóng gói, Player). Có thể dùng để phác giao diện.

## Cấu trúc repo

```
CLAUDE.md                  file này
README.md                  hướng dẫn nhanh cho người
docs/HANDOFF.md            toàn bộ bối cảnh, quyết định, câu hỏi còn mở
docs/BUILDER_SPEC.md       spec Builder web v1 ← đọc kỹ trước khi xây
player/                    Player v1 (index.html, player.js, player.css, scorm12.js, logo.png, fonts/)
brand/                     logo Coteccons gốc: bản trắng (nền tối) và bản màu (nền sáng)
tools/build_scorm.py       động cơ đóng gói bằng Python = BẢN THAM CHIẾU cho Builder
tools/make_template.py     tạo file Excel mẫu (kèm dữ liệu khóa demo)
tools/setup_assets.sh      tải font, tạo Excel mẫu, tạo 3 video demo
templates/                 template Excel chuẩn (trống)
demo-course/                khóa demo: ATLD-DEMO.xlsx + videos/ (3 video 55 giây có đồng hồ để thấy pop-up đúng giây)
tests/                     LMS giả lập + 26 test Player + test giao diện Builder (Playwright)
builder/                   Builder web (Vite + JS thuần)
  src/xlsx.js              đọc .xlsx bằng fflate (không dùng SheetJS)
  src/course.js            đọc khóa + kiểm tra lỗi, phải khớp read_excel() của build_scorm.py
  src/zip.js               ghi zip streaming (CRC + kích thước ghi thẳng vào header, không dùng data descriptor)
  src/package.js           đóng gói SCORM: course.js + imsmanifest.xml, phải khớp build() của build_scorm.py
  src/main.js              giao diện 5 bước
  tests/*.test.mjs         test logic bằng Node (npm test), có so sánh dữ liệu và gói zip với build_scorm.py
  scripts/copy-assets.mjs  chép player/, template, logo vào builder/public/ (thư mục sinh ra, không sửa tay)
.github/workflows/pages.yml  test + deploy Builder lên GitHub Pages khi main thay đổi
```

## Lệnh thường dùng

```bash
bash tools/setup_assets.sh                     # lần đầu: font + Excel mẫu + video demo
python3 tools/build_scorm.py demo-course/ATLD-DEMO.xlsx demo-course out
# test Player (xem docstring trong tests/test_player.py để chuẩn bị thư mục out/test)
npx http-server out/test -p 8765 -s -c-1 &
python3 tests/test_player.py
# Builder
(cd builder && npm install && npm test)        # test logic (cần python3 + openpyxl, ffprobe)
(cd builder && npm run dev)                    # chạy thử trên máy
(cd builder && npm run build) && npx http-server builder/dist -p 8766 -s -c-1 &
python3 tests/test_builder.py                  # test giao diện Builder + xuất gói (thêm LARGE=1: khóa 1,5 GB)
# gói Builder xuất ra nằm ở out/test-builder/SCORM_ATLD-DEMO.zip: giải nén vào out/test/course rồi chạy test_player.py
```

Cần: Python 3 + `openpyxl` + `playwright`, Node 18+, `ffmpeg`/`ffprobe`.

## Bẫy đã biết

- **Tua video cần máy chủ hỗ trợ HTTP Range.** `python -m http.server` KHÔNG hỗ trợ → test tua sai. Dùng `npx http-server`. Workday và SCORM Cloud đều hỗ trợ Range.
- **Video trong Builder (xem thử) nên dùng Blob URL / File object**, chúng tua được bình thường.
- `cmi.suspend_data` của SCORM 1.2 giới hạn **4.096 ký tự**. Player đã lưu dạng JSON gọn; đừng thêm dữ liệu lớn vào đó.
- Excel có thể tự đổi "01:30" thành giờ 01:30. `build_scorm.py` hiểu lại thành phút:giây; Builder làm giống vậy (`parseTime` trong `builder/src/course.js`).
- **Không dùng SheetJS:** bản mới chỉ có ở cdn.sheetjs.com (không cài được trong môi trường của Claude), bản trên npm (0.18.5) cũ và có lỗ hổng. Builder tự đọc .xlsx trong `builder/src/xlsx.js`.
- Chrome không đọc lại được file Excel đã sửa sau khi chọn: người dùng phải bấm chọn lại file.
- Gói zip: video và font lưu **STORED** (không nén lại), file text nén DEFLATE.
- Khóa dài 120 phút ≈ 1–1,5 GB. Không được giữ cả zip trong RAM: phải **ghi streaming xuống ổ cứng** (`showSaveFilePicker`, chỉ Chrome/Edge). Trình duyệt khác tạo zip trong bộ nhớ, chỉ cho khóa < 500 MB.
- **Không dùng zip streaming của fflate:** nó luôn ghi "data descriptor", kể cả với file STORED, mà `java.util.zip.ZipInputStream` (LMS chạy Java) không đọc được kiểu này. `src/zip.js` ghi header trước rồi quay lại điền CRC.
- Test xuất khóa lớn trong Playwright phải dùng hồ sơ trình duyệt lưu trên đĩa (`launch_persistent_context`): hồ sơ mặc định nằm trong RAM, OPFS bị giới hạn dung lượng.

## Định nghĩa "xong" cho mỗi thay đổi

- 26/26 test Player vẫn đạt (nếu có đụng `player/`).
- Gói do Builder xuất ra cho khóa demo **tương đương** gói do `build_scorm.py` xuất ra (cùng danh sách file, `course.js` cùng nội dung JSON, manifest hợp lệ), và chạy qua test Player.
- Thử trên Chrome và Edge; Builder chạy được trên máy Windows và Mac.
