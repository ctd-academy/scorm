# Spec – Coteccons SCORM Builder (web) v1

> Cập nhật: 28/10/2026 · Chủ dự án: Alex (L&OD Team Lead)
> Đọc kèm `docs/DEV.md` và `docs/HANDOFF.md`.
>
> 28/10/2026: đã bỏ `tools/build_scorm.py` (bản Python). Builder và lệnh đóng gói `builder/scripts/build-scorm.mjs` dùng chung một code; gói của khóa demo được so với gói mẫu `builder/tests/golden/ATLD-DEMO.json` (lấy từ bản Python trước khi bỏ).

## 1. Mục tiêu

Một trainer **không biết code** tự biến "1 file Excel + 1 thư mục video" thành **1 file zip SCORM 1.2** sẵn sàng upload lên Workday, trong khoảng 10 phút, không cần hỏi ai.

**Thước đo thành công v1:** một trainer tự xuất một khóa thật từ đầu đến cuối mà không cần hỗ trợ, và gói đó chạy đúng trên SCORM Cloud.

## 2. Kiến trúc

```
Website tĩnh (HTML/CSS/JS) ── host trên GitHub Pages
        │  trình duyệt tải về 1 lần
        ▼
Trình duyệt của trainer (Chrome/Edge)
 ├─ Đọc Excel           builder/src/xlsx.js (fflate + đọc XML)
 ├─ Đọc thư mục video   <input webkitdirectory> hoặc showDirectoryPicker()
 ├─ Kiểm tra lỗi        builder/src/course.js (dùng chung với lệnh đóng gói)
 ├─ Xem thử             Player chạy trong iframe, video bằng Blob URL
 └─ Xuất zip            zip streaming (STORED cho video) → ghi thẳng xuống ổ cứng
```

- **Không backend, không database, không đăng nhập.** Không file nào của người dùng rời khỏi máy.
- Đề xuất công cụ: **Vite + JavaScript thuần** (không cần framework). Lý do: đơn giản, dễ bảo trì, build ra thư mục `dist/` tĩnh.
- Thư viện (đóng gói vào bundle, không gọi CDN lúc chạy):
  - Đọc Excel: **tự đọc bằng fflate** (`builder/src/xlsx.js`). Đã bỏ SheetJS: bản mới chỉ có ở cdn.sheetjs.com (không cài được trong môi trường build của Claude), bản npm 0.18.5 cũ và có lỗ hổng. File .xlsx là zip chứa XML, chỉ cần đọc giá trị ô.
  - Zip streaming: **tự ghi** trong `builder/src/zip.js` (video STORED, text DEFLATE bằng fflate). Không dùng client-zip hay zip streaming của fflate vì cả hai ghi "data descriptor" cho file STORED, `ZipInputStream` của Java không đọc được. Header ghi trước, đọc xong video thì quay lại điền CRC (ghi theo vị trí của FileSystemWritableFileStream).
- Player: copy nguyên `player/` vào `builder/public/player/` lúc build (`builder/scripts/copy-assets.mjs`), để Builder vừa nhúng vào zip vừa dùng cho xem thử. **Một nguồn duy nhất là `player/`**, không sửa bản copy.

## 3. Luồng sử dụng (màn hình)

**Bước 1 – Chọn thư mục khóa**
- Một nút "Chọn thư mục khóa" (chứa video và Excel). Chrome/Edge dùng `showDirectoryPicker()` để giữ quyền đọc thư mục: sửa Excel xong bấm **"Kiểm tra lại"** là đọc lại cả thư mục, không phải chọn lại. Trình duyệt khác dùng `<input webkitdirectory>`, nút đổi thành "Chọn lại thư mục".
- **Tự tìm file Excel** trong thư mục (bỏ qua `~$…`). Nhiều file Excel: lấy file sửa gần nhất, hiện danh sách để đổi; lần kiểm tra sau giữ file đã chọn. Không có Excel: vẫn cho đặt pop-up, kèm link Excel mẫu. Link "Chọn file Excel khác" cho Excel nằm ngoài thư mục (`showOpenFilePicker` để cũng đọc lại được).
- **Thanh trạng thái ở đầu bước 3 (Kiểm tra)**: tên file Excel · đọc lúc giờ:phút:giây · số lỗi · nút Kiểm tra lại. Cho trainer thấy Excel là bản nháp, sửa dần được.
- Tìm video ở **mọi thư mục con** theo tên file ghi trong Excel. Hai file trùng tên ở hai thư mục → báo lỗi, trainer ghi rõ thư mục, ví dụ `01. Tong quan/gioi-thieu.mp4`
- Tùy chọn: chọn file logo
- Có link tải **file Excel mẫu** (`templates/Mau_nhap_lieu_khoa_hoc.xlsx`)

**Bước 2 – Đặt pop-up (tùy chọn)**
- Đặt trước bước kiểm tra vì trainer cần xem video để biết đặt câu hỏi ở đâu; mở được cả khi Excel còn lỗi hoặc chưa có.
- Chọn video → phát → bấm **"Đặt pop-up tại đây"** → điền mốc mm:ss vào danh sách.
- Kết quả: bảng (Loại, Video số, Mốc thời gian) để **copy dán vào Excel**. Builder không sửa file Excel của người dùng.
- Excel chưa có danh sách video (hoặc chưa có Excel): xếp video theo thứ tự thư mục (so số tự nhiên: 2 trước 10) và có nút **"Copy danh sách video"** (STT, Tên bài, Tên file) để dán vào sheet Video ô A3.
- Mốc lưu theo file video, không theo số thứ tự: đổi thứ tự bài trong Excel rồi kiểm tra lại thì "Video số" tự đổi theo. Kiểm tra lại không làm mất mốc và giữ video, vị trí đang xem.

**Bước 3 – Kiểm tra**
- Tóm tắt: tên khóa, mã khóa, số video, tổng thời lượng, số pop-up, số câu ngân hàng đề, luật thi.
- Danh sách lỗi theo dạng **"Sheet Câu hỏi, dòng 7: đáp án đúng 'E' không hợp lệ"**. Có lỗi thì không cho xuất.
- Kiểm tra:
  - thiếu file video / tên file không khớp (gợi ý tên gần giống nếu có)
  - Video số ngoài phạm vi, mốc thời gian sai định dạng
  - **mốc pop-up vượt quá thời lượng video** (mới, đọc thời lượng bằng thẻ `<video>`)
  - đáp án không hợp lệ, phương án bỏ trống ở giữa
  - số câu mỗi lần thi > ngân hàng
  - mã khóa có dấu/khoảng trắng
  - cảnh báo (không chặn): tổng dung lượng > 3,5 GB (giới hạn Workday 4 GB), video không phải .mp4, 2 pop-up cách nhau < 60 giây

**Bước 4 – Xem thử**
- Mở Player trong iframe với dữ liệu khóa vừa đọc, video bằng Blob URL, chạy chế độ "Xem thử" (LMS giả lập có sẵn trong `scorm12.js`).
- Đã làm: `player/preview.html` được `scripts/copy-assets.mjs` tạo từ `player/index.html`, thay dòng nạp `course.js` bằng `window.COURSE = parent.__previewCourse` (đọc thẳng từ trang Builder, cùng nguồn gốc; không dùng `postMessage` để nút "Xóa tiến độ" tải lại khung vẫn chạy). Đường dẫn video và logo thay bằng Blob URL chỉ khi xem thử. File này không được đưa vào gói.

**Bước 5 – Xuất**
- Nút "Xuất gói SCORM" → hộp thoại lưu file (`showSaveFilePicker`) → ghi streaming → thanh tiến trình theo MB.
- Tên file: `SCORM_<Mã khóa>.zip`.
- Trình duyệt không có `showSaveFilePicker` (Firefox, Safari): tạo zip trong bộ nhớ và tải về, **chỉ cho khóa < 500 MB**, lớn hơn thì báo dùng Chrome/Edge.
- Sau khi xuất, hiện **"Thông tin để tạo khóa trên Workday"**: Tên khóa, Mã khóa, Mô tả ngắn, Tổng thời lượng (phút), có nút copy từng dòng.

## 4. Đầu ra

Cấu trúc zip:
```
index.html  player.css  player.js  scorm12.js     (từ player/)
fonts/*.woff2                                     (từ player/fonts/)
pdfjs/...                                         (từ player/pdfjs/, chỉ khi khóa có tài liệu)
course.js                                         window.COURSE = {...};
videos/<tên file gốc>
docs/<tên file PDF ghi trong Excel>               (nếu có)
assets/<logo>                                     (nếu có)
imsmanifest.xml
```

Định dạng `course.js`:
```js
window.COURSE = {
  id, title, description, logo: null | "assets/<file>",
  settings: { passScore, maxAttempts, questionsPerAttempt, timeLimitMinutes,
              showAnswers, maxSpeed: 2, contact },
  videos: [{ title, src: "videos/<file>", duration /* giây, làm tròn */,
             docs /* chỉ có khi video có tài liệu */: [{ title /* tên file bỏ .pdf */, src: "docs/<file>" }] }],
  popups: [{ video /* từ 0 */, time /* giây */, q, options: [...], answer /* từ 0 */, explain }],
  quiz:   [{ q, options: [...], answer, explain }]
};
```

`imsmanifest.xml`: xem `manifest()` trong `builder/src/package.js` (SCORM 1.2, 1 SCO, `href="index.html"`, liệt kê mọi file).

Quy tắc đọc Excel: xem `readCourse()` trong `builder/src/course.js`. Dòng ví dụ (cột STT bắt đầu bằng "(Ví dụ)" ở sheet Video, hoặc câu hỏi bắt đầu bằng "(Ví dụ)") bị bỏ qua.

**Test tương đương (bắt buộc):** gói khóa demo phải khớp gói mẫu `builder/tests/golden/ATLD-DEMO.json` (cùng danh sách file, `course.js` cùng JSON, manifest hợp lệ); gói Builder web xuất ra phải giống gói của lệnh đóng gói; chạy `tests/test_player.py` trên gói phải đạt hết (43/43). Cả ba nằm trong `bash tests/run_all.sh`.

## 5. Giao diện

- Thương hiệu Coteccons như Player: Navy `#16315e`, Teal `#5fd1c1`, font Lexend Deca (dùng lại `player/fonts/`).
- Tiếng Việt có dấu, câu ngắn, nói như người. Ví dụ lỗi: "Không tìm thấy video '02_ppe.mp4' trong thư mục bạn chọn."
- Một trang, 5 bước rõ ràng, bước sau mở khi bước trước xong.
- Chạy tốt trên màn hình laptop 1366×768. Không cần tối ưu điện thoại cho Builder (Player mới cần).

## 6. Ngoài phạm vi v1

- Lưu khóa học trên cloud, tài khoản, lịch sử xuất
- Soạn câu hỏi trong Builder (vẫn dùng Excel; Copilot soạn nháp trong Excel)
- Xuất file nhập hàng loạt Workday (EIB): chờ Workday trả lời có hỗ trợ không
- SCORM 2004, xAPI

## 7. Các mốc

| Mốc | Nội dung | Nghiệm thu |
|---|---|---|
| M1 ✅ | Khung Vite, copy Player, đọc Excel + thư mục video, màn hình kiểm tra lỗi | Khóa demo hiện đúng tóm tắt; cố tình làm sai 5 loại lỗi thì báo đúng dòng |
| M2 ✅ | Xuất zip streaming + thông tin Workday | Test tương đương với `build_scorm.py` đạt; toàn bộ test Player đạt trên gói của Builder; xuất được khóa giả lập 1,5 GB không treo máy |
| M3 ✅ | Xem thử + đặt pop-up | Xem thử chạy đúng luật chơi; mốc đặt bằng nút khớp với giây trên video demo |
| M3.1 ✅ | Luồng mới: chọn thư mục 1 lần, tự tìm Excel, Kiểm tra lại; đặt pop-up trước kiểm tra | Đặt pop-up được khi chưa có Excel; sửa Excel rồi Kiểm tra lại đọc bản mới mà không chọn lại |
| M3.2 ✅ | Tài liệu PDF theo từng video (cột D sheet Video), xem song song với video bằng PDF.js | Kiểm tra báo sai tên/không phải PDF; xem thử mở được PDF; gói tương đương `build_scorm.py`; 43/43 test Player |
| M4 | Deploy + hướng dẫn 1 trang | Link chạy trên Chrome/Edge (Windows và Mac); `docs/HUONG_DAN_TRAINER.md` ≤ 1 trang |

## 8. Việc Alex cần cung cấp

- ✅ Repo team: `ctd-academy/scorm` · Host: GitHub Pages
- ✅ Logo: `brand/coteccons-logo-white.png` (trên nền navy, Player dùng `player/logo.png`) và `brand/coteccons-logo-color.png` (trên nền sáng, dùng cho giao diện Builder)
- ✅ Liên hệ L&OD: Mr. Minh (minhvt02@coteccons.vn) hoặc cta@coteccons.vn
- Một khóa thật (thư mục video + bộ câu hỏi) để pilot: nằm trên máy Alex
