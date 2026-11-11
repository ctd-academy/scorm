# Hướng dẫn cho người phát triển

Tài liệu này dành cho người tiếp quản code (không cần dùng Claude Code). Đọc theo thứ tự: mục 1–4 để chạy được trên máy, mục 5–6 khi cần sửa, mục 7 trước khi đụng phần khó.

Bối cảnh dự án và các quyết định đã chốt: `docs/HANDOFF.md`. Spec của Builder: `docs/BUILDER_SPEC.md`.

## 1. Dự án gồm gì

| Phần | Là gì | Ai dùng |
|---|---|---|
| `player/` | "Khung học" nằm trong mọi gói SCORM: phát video, chặn tua, pop-up, bài thi, báo kết quả cho Workday | Học viên (trong Workday) |
| `builder/` | Website tĩnh, chạy hoàn toàn trên trình duyệt: đọc Excel + thư mục video, kiểm tra lỗi, xuất file zip SCORM | 4 trainer L&OD |

Không có backend, không database. Website host trên GitHub Pages: https://ctd-academy.github.io/scorm/

## 2. Cài đặt máy (Windows hoặc Mac)

Cần cài: **Git**, **Node.js 20 trở lên**, **Python 3**, **ffmpeg** (có kèm `ffprobe`).

```bash
git clone https://github.com/ctd-academy/scorm.git
cd scorm
(cd builder && npm install)
pip install -r tests/requirements.txt
python3 -m playwright install chromium
```

Trên Windows nên chạy các lệnh trong **Git Bash** (cài cùng Git) để dùng được các file `.sh`.

## 3. Lệnh thường dùng

```bash
(cd builder && npm run dev)       # chạy Builder trên máy: http://localhost:5173
bash tests/run_all.sh             # chạy TOÀN BỘ test (giống GitHub), ~2 phút
(cd builder && npm test)          # chỉ test logic, vài giây
node builder/scripts/build-scorm.mjs demo-course/ATLD-DEMO.xlsx demo-course out   # đóng gói bằng dòng lệnh
bash tools/setup_assets.sh        # tạo lại font, PDF.js, Excel mẫu, video + PDF demo (hiếm khi cần)
```

## 4. Dữ liệu chạy qua code thế nào

```
Thư mục khóa (Excel + video + PDF)
   │
   ├─ builder/src/xlsx.js      đọc .xlsx → { tên sheet: rows[dòng][cột] } (dòng, cột tính từ 1 như Excel)
   ├─ builder/src/course.js    readCourse(): đọc 3 sheet (+ sheet Chương nếu có), tìm file, kiểm tra lỗi → { course, errors, warnings, files }
   ├─ builder/src/package.js   writePackage(): course.js + imsmanifest.xml + player/ + video/PDF/logo
   └─ builder/src/zip.js       ghi zip từng đoạn xuống ổ cứng (khóa 1,5 GB không giữ trong RAM)
   │
   ▼
SCORM_<Mã khóa>.zip ── Workday mở index.html ── player/player.js đọc window.COURSE (course.js)
                                                player/scorm12.js nói chuyện với Workday
```

Ba file `xlsx.js`, `course.js`, `package.js` dùng chung cho **cả** website (`builder/src/main.js`) **và** lệnh dòng lệnh (`builder/scripts/build-scorm.mjs`). Sửa một chỗ là cả hai cùng đổi.

Các file khác trong `builder/src/`:
- `main.js`: giao diện 5 bước (chọn thư mục → đặt pop-up → kiểm tra → xem thử → xuất)
- `builder/huong-dan.html` (+ `src/guide.js`, `src/guide.css`): trang hướng dẫn cho trainer, mở từ nút "📖 Hướng dẫn" ở đầu Builder. Là trang thứ 2 của Vite (khai báo trong `vite.config.js`). **Đổi giao diện Builder, cột Excel, thông báo lỗi hoặc luật học thì sửa trang này cho khớp.** Trang đi từ đơn giản tới chi tiết: 4 bước lớn → bấm từng bước xem việc cần làm → "Tra cứu khi cần" (đóng sẵn). Khi in, mọi mục tự mở ra
- `popups.js`: bước 2, phát video và bấm lấy mốc pop-up
- `preview.js`: bước 4, chạy Player thật trong khung
- `util.js`: hàm nhỏ dùng chung; `defaults.json`: nội dung mặc định (câu liên hệ khi hết lượt)
- `builder/scripts/copy-assets.mjs`: chép `player/`, Excel mẫu, logo vào `builder/public/` (thư mục sinh ra, **không sửa tay**)

Cấu trúc repo còn lại:

```
docs/                      HANDOFF (bối cảnh, quyết định), BUILDER_SPEC, file này
player/                    Player: index.html, player.js, player.css, scorm12.js, logo.png, fonts/, pdfjs/
brand/                     logo Coteccons gốc (trắng cho nền tối, màu cho nền sáng)
templates/                 Excel mẫu trống cho trainer
demo-course/               khóa demo: ATLD-DEMO.xlsx + videos/ (3 video 55 giây có đồng hồ) + docs/ (3 PDF)
tools/make_template.py     tạo Excel mẫu + Excel khóa demo
tools/make_demo_docs.py    tạo 3 PDF slide demo
tools/setup_assets.sh      tạo lại toàn bộ file trên
tests/                     test Player, test giao diện Builder (Python + Playwright), LMS giả lập (lms.html)
builder/tests/             test logic (Node), golden/ATLD-DEMO.json = gói mẫu của khóa demo
.github/workflows/pages.yml  chạy toàn bộ test và đưa Builder lên GitHub Pages khi main thay đổi
```

## 5. Quy trình sửa code

1. Tạo nhánh mới, sửa code.
2. Chạy `bash tests/run_all.sh`. Phải đạt hết.
3. Thử bằng tay trên **Chrome và Edge**: chọn thư mục `demo-course/`, xem thử, xuất gói.
4. Mở Pull Request vào `main`. GitHub tự chạy lại toàn bộ test. Merge xong thì website tự cập nhật sau ~2 phút.

**Quay lại bản cũ khi website lỗi:** trên GitHub, vào Pull Request vừa merge, bấm **Revert**, rồi merge PR revert đó.

## 6. Việc hay gặp

**Đổi câu liên hệ khi hết lượt** (ví dụ người phụ trách L&OD thay đổi)
- Sửa `builder/src/defaults.json`.
- Chạy `python3 tools/make_template.py` để Excel mẫu và Excel demo dùng câu mới.
- Câu này chỉ là mặc định: khóa nào ghi riêng ở sheet "Thông tin khóa" thì dùng câu của khóa đó. Gói đã xuất trước đây không tự đổi, phải xuất lại.

**Đổi một luật học trong Player** (tua, tốc độ, pop-up, bài thi, chương, khóa Tham khảo)
- Sửa `player/player.js`. Luật nằm ở đầu file và theo từng phần (video, tài liệu PDF, bài kiểm tra).
- Thêm hoặc sửa test trong `tests/test_player.py`.
- Đừng thêm dữ liệu lớn vào `cmi.suspend_data` (SCORM 1.2 giới hạn 4.096 ký tự).

**Thêm hoặc đổi một cột trong Excel**
1. `tools/make_template.py`: thêm cột vào mẫu, chạy lại để tạo 2 file Excel.
2. `builder/src/course.js`: đọc cột mới trong `readCourse()`, thêm kiểm tra lỗi nếu cần.
3. Nếu Player cần dùng: thêm trường vào `course` và xử lý trong `player/player.js`.
4. Cập nhật gói mẫu (mục dưới) và test.
5. Luôn chấp nhận file Excel cũ: trainer có thể còn dùng mẫu trước đó (xem cách cột "Tài liệu PDF" kiểm tra tiêu đề cột trước khi đọc).

**Cập nhật gói mẫu** `builder/tests/golden/ATLD-DEMO.json`
Khi cố ý đổi cách đọc Excel hoặc đổi Excel demo, test "khớp gói mẫu" sẽ báo khác. Xem kỹ chỗ khác có đúng ý không, rồi sửa phần `course` (và `files` nếu đổi danh sách file) trong file JSON cho khớp.

**Nâng cấp PDF.js**
Đổi `PDFJS_VERSION` trong `tools/setup_assets.sh`, chạy lại script đó, rồi chạy `bash tests/run_all.sh`. Nên thử thêm trên SCORM Cloud trước khi dùng thật.

**Nâng cấp thư viện của Builder** (`fflate`, `vite`, `http-server`)
Trong `builder/`: `npm outdated` để xem bản mới, `npm install <tên>@<phiên bản> --save-exact`, rồi chạy toàn bộ test. Nên làm khoảng 6 tháng một lần.

## 7. Phần khó: cẩn thận khi sửa

| File | Vì sao khó | Khi nào phải sửa |
|---|---|---|
| `builder/src/zip.js` | Tự ghi định dạng zip ở mức byte. Sai một byte là LMS không mở được gói | Gần như không bao giờ |
| `builder/src/xlsx.js` | Tự đọc file .xlsx (không dùng thư viện SheetJS) | Khi gặp file Excel lưu từ phần mềm lạ không đọc được |
| `player/scorm12.js` | Giao tiếp chuẩn SCORM 1.2 với Workday | Khi Workday báo sai trạng thái/điểm |

Với 3 file này: sửa ít nhất có thể, thêm test cho đúng trường hợp lỗi, và thử gói trên SCORM Cloud.

## 8. Bẫy đã biết

- **Tua video cần máy chủ hỗ trợ HTTP Range.** `python -m http.server` KHÔNG hỗ trợ, nên test tua sẽ sai. Dùng `http-server` (đã có trong `builder/node_modules`, `tests/run_all.sh` tự dùng). Workday và SCORM Cloud đều hỗ trợ Range.
- **Không dùng SheetJS:** bản mới chỉ có ở cdn.sheetjs.com, bản trên npm (0.18.5) cũ và có lỗ hổng. Vì vậy mới có `xlsx.js` tự viết. Tên sheet so khớp không phân biệt hoa thường/khoảng trắng; `xlsx.js` bỏ tiền tố namespace (`<x:sheet>`) và tìm workbook qua `_rels/.rels`.
- **Không dùng zip streaming của fflate** (hay client-zip): chúng luôn ghi "data descriptor", kể cả với file không nén, mà LMS chạy Java (`java.util.zip.ZipInputStream`) không đọc được. `zip.js` ghi header trước rồi quay lại điền CRC. Video, font, ảnh, PDF lưu không nén (STORED); file chữ nén DEFLATE.
- **Khóa dài 120 phút ≈ 1–1,5 GB.** Không giữ cả zip trong RAM: ghi thẳng xuống ổ cứng bằng `showSaveFilePicker` (chỉ Chrome/Edge). Trình duyệt khác tạo zip trong bộ nhớ, chỉ cho khóa < 500 MB. Workday giới hạn 4 GB mỗi gói.
- **Chrome không đọc lại được file đã sửa nếu lấy từ `<input type=file>`.** Vì vậy Builder dùng `showDirectoryPicker()` (Chrome/Edge): nút "Kiểm tra lại" đọc lại thư mục. Trình duyệt khác phải chọn lại thư mục. Test giả lập thư mục bằng `FAKE_DIR` trong `tests/test_builder.py`.
- **Excel tự đổi "01:30" thành giờ 01:30.** `parseTime` trong `course.js` hiểu lại thành phút:giây.
- **Video trong thư mục con:** trainer để video trong các thư mục chủ đề (`01. Tong quan/…`). Builder tìm video theo tên ở mọi thư mục con; trùng tên thì bắt ghi rõ thư mục.
- **Tài liệu PDF:** cột D sheet Video, chỉ đọc khi tiêu đề cột bắt đầu bằng "Tài liệu" (Excel mẫu cũ ghi "Ghi chú" thì bỏ qua). Nhiều file cách nhau `;`. Đóng vào `docs/<tên ghi trong Excel>`; cùng file cho nhiều video chỉ đóng 1 lần.
- **Windows ẩn đuôi file:** trainer hay ghi "Slide bai 1" thay vì "Slide bai 1.pdf", "P1.2" thay vì "P1.2.mp4". Không tìm thấy đúng tên thì `course.js` thử thêm `.pdf` (tài liệu) hoặc các đuôi video; gói dùng tên đầy đủ có đuôi. Khi kiểm tra, Builder đọc 5 byte đầu mỗi tài liệu: không đọc được (file OneDrive "chỉ trên mạng") hoặc không bắt đầu bằng `%PDF-` thì báo lỗi. `pdfjs/` chỉ đưa vào gói khi khóa có tài liệu.
- **PDF.js trong Player:** đổi đuôi `.mjs` → `.js` (máy chủ LMS có thể trả `.mjs` sai kiểu). Chỉ nạp khi học viên bấm "Tài liệu". Vẽ lên canvas, chỉ vẽ trang gần màn hình.
- **Xem thử trong Builder:** video dùng Blob URL (tua bình thường). `player/preview.html` do `copy-assets.mjs` tạo từ `player/index.html`, đọc dữ liệu khóa từ trang Builder.
- **Test xuất khóa lớn** (`LARGE=1 bash tests/run_all.sh`) cần ~5 GB ổ trống và dùng hồ sơ trình duyệt lưu trên đĩa (hồ sơ mặc định của Playwright nằm trong RAM).
- **Sự kiện của video cũ:** khi rời bài, video cũ vẫn bắn `pause`/`ratechange` sau khi biến `vid` đã đổi sang video mới (hoặc `null` khi vào bài thi). Trong `renderVideo` của `player.js`, gắn sự kiện video bằng hàm `on(...)` (chỉ chạy khi đúng video đang hiện), không dùng thẳng `vid.addEventListener`.
- **Hai loại khóa (từ 05/11/2026):** dòng "Loại khóa" ở **dòng 12** sheet Thông tin khóa (để ở cuối cho khỏi dời các dòng cũ). `readCourse()` chỉ đọc dòng 2–12: thêm dòng mới ở sheet này thì phải nới vòng lặp. Để trống = Bắt buộc, để Excel mẫu cũ chạy như trước. Khóa Tham khảo → `settings.reference = true`: `course.js` **không đọc** sheet Câu hỏi (nên không báo lỗi ở đó, chỉ cảnh báo số câu bị bỏ qua) và xuất `popups: []`, `quiz: []`. Player cũng tự bỏ pop-up/bài thi khi `reference` bật, phòng gói sửa tay.
- **Khóa Tham khảo trong Player:** báo `completed` ngay khi mở (`pushStatus`); `cmi.core.exit` luôn là `suspend` (khác khóa Bắt buộc) để lần sau mở lại đúng bài, đúng chỗ. Ẩn % hoàn thành bằng class `ref` trên `<body>`.
- **Chương (từ 05/11/2026):** sheet "Chương" **không bắt buộc** (thiếu sheet = khóa không có chương, không báo lỗi). Builder tự xếp theo thời gian; trùng mốc thì giữ dòng đầu và cảnh báo. Trong gói: `videos[i].chapters = [{ time, title }]`, chỉ có khi video có chương. Player: khóa Bắt buộc dùng **cùng mốc "đã xem tới"** (`maxW`) với luật chặn tua để làm mờ chương chưa xem; sửa luật tua thì sửa cả `chapterLocked()`.
- **Khóa chỉ có video / chỉ có bài kiểm tra (từ 11/11/2026):** sheet Câu hỏi trống = không pop-up, không bài thi, xem hết video là `completed`. Sheet Video trống được phép khi khóa Bắt buộc có ít nhất 1 câu `CUOI KHOA` (khóa chỉ có bài thi): `course.js` cảnh báo "Sheet Video trống", báo lỗi nếu còn dòng POPUP hoặc dòng Chương; không video và không câu CUOI KHOA (hoặc khóa Tham khảo không video) thì báo lỗi. Player: không video → `firstOpen()` trả về `"quiz"`, mở thẳng bài thi, không có nút "Xem lại video".
- **Test khóa Tham khảo:** `tests/test_player.py` chép gói demo sang `out/test/course-ref/`, bật `reference` trong `course.js` rồi mở `lms.html?course=course-ref`. Khóa chỉ có video (`course-video-only`) và chỉ có bài thi (`course-quiz-only`) test cùng cách, qua hàm `variant()`.
- **Pop-up (từ 03/11/2026):** sai thì chọn lại tới khi đúng, không lùi video. Đúng thì lưu ngay vào `suspend_data`; câu có giải thích chờ học viên bấm "Tiếp tục xem", câu không có thì video tự chạy sau 1,5 giây.
- **Excel bản cũ của Alex:** công thức trong hướng dẫn viết bằng dấu `;`.

## 9. Định nghĩa "xong" cho mỗi thay đổi

- `bash tests/run_all.sh` đạt hết (trên GitHub cũng xanh).
- Gói khóa demo vẫn khớp gói mẫu, hoặc gói mẫu đã được cập nhật có chủ đích.
- Thử trên Chrome và Edge; Builder chạy được trên máy Windows và Mac.
- Đổi luật học hoặc cách đóng gói thì thử thêm một gói trên SCORM Cloud.
