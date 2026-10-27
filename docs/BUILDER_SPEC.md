# Spec – Coteccons SCORM Builder (web) v1

> Cập nhật: 27/10/2026 · Chủ dự án: Alex (L&OD Team Lead)
> Đọc kèm `CLAUDE.md` và `docs/HANDOFF.md`.

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
 ├─ Kiểm tra lỗi        logic giống tools/build_scorm.py
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

**Bước 1 – Chọn file**
- Nút "Chọn file Excel khóa học" (.xlsx)
- Nút "Chọn thư mục video": tìm video ở **mọi thư mục con** theo tên file ghi trong Excel (giống `find_file()` của `build_scorm.py`). Hai file trùng tên ở hai thư mục → báo lỗi, trainer ghi rõ thư mục, ví dụ `01. Tong quan/gioi-thieu.mp4`
- Tùy chọn: chọn file logo
- Có link tải **file Excel mẫu** (`templates/Mau_nhap_lieu_khoa_hoc.xlsx`)

**Bước 2 – Kiểm tra**
- Tóm tắt: tên khóa, mã khóa, số video, tổng thời lượng, số pop-up, số câu ngân hàng đề, luật thi.
- Danh sách lỗi theo dạng **"Sheet Câu hỏi, dòng 7: đáp án đúng 'E' không hợp lệ"**. Có lỗi thì không cho xuất.
- Kiểm tra (tối thiểu bằng `build_scorm.py`, cộng thêm):
  - thiếu file video / tên file không khớp (gợi ý tên gần giống nếu có)
  - Video số ngoài phạm vi, mốc thời gian sai định dạng
  - **mốc pop-up vượt quá thời lượng video** (mới, đọc thời lượng bằng thẻ `<video>`)
  - đáp án không hợp lệ, phương án bỏ trống ở giữa
  - số câu mỗi lần thi > ngân hàng
  - mã khóa có dấu/khoảng trắng
  - cảnh báo (không chặn): tổng dung lượng > 3,5 GB (giới hạn Workday 4 GB), video không phải .mp4, 2 pop-up cách nhau < 60 giây

**Bước 3 – Đặt pop-up (tùy chọn)**
- Chọn video → phát → bấm **"Đặt pop-up tại đây"** → điền mốc mm:ss vào danh sách.
- Kết quả: bảng (Video số, Mốc thời gian) để **copy dán vào Excel**. Builder không sửa file Excel của người dùng.

**Bước 4 – Xem thử**
- Mở Player trong iframe với dữ liệu khóa vừa đọc, video bằng Blob URL, chạy chế độ "Xem thử" (LMS giả lập có sẵn trong `scorm12.js`).
- Đã làm: `player/preview.html` được `scripts/copy-assets.mjs` tạo từ `player/index.html`, thay dòng nạp `course.js` bằng `window.COURSE = parent.__previewCourse` (đọc thẳng từ trang Builder, cùng nguồn gốc; không dùng `postMessage` để nút "Xóa tiến độ" tải lại khung vẫn chạy). Đường dẫn video và logo thay bằng Blob URL chỉ khi xem thử. File này không được đưa vào gói.

**Bước 5 – Xuất**
- Nút "Xuất gói SCORM" → hộp thoại lưu file (`showSaveFilePicker`) → ghi streaming → thanh tiến trình theo MB.
- Tên file: `SCORM_<Mã khóa>.zip`.
- Trình duyệt không có `showSaveFilePicker` (Firefox, Safari): tạo zip trong bộ nhớ và tải về, **chỉ cho khóa < 500 MB**, lớn hơn thì báo dùng Chrome/Edge.
- Sau khi xuất, hiện **"Thông tin để tạo khóa trên Workday"**: Tên khóa, Mã khóa, Mô tả ngắn, Tổng thời lượng (phút), có nút copy từng dòng.

## 4. Đầu ra phải tương đương `build_scorm.py`

Cấu trúc zip:
```
index.html  player.css  player.js  scorm12.js     (từ player/)
fonts/*.woff2                                     (từ player/fonts/)
course.js                                         window.COURSE = {...};
videos/<tên file gốc>
assets/<logo>                                     (nếu có)
imsmanifest.xml
```

Định dạng `course.js`:
```js
window.COURSE = {
  id, title, description, logo: null | "assets/<file>",
  settings: { passScore, maxAttempts, questionsPerAttempt, timeLimitMinutes,
              showAnswers, maxSpeed: 2, contact },
  videos: [{ title, src: "videos/<file>", duration /* giây, làm tròn */ }],
  popups: [{ video /* từ 0 */, time /* giây */, q, options: [...], answer /* từ 0 */, explain }],
  quiz:   [{ q, options: [...], answer, explain }]
};
```

`imsmanifest.xml`: giữ y hệt mẫu trong `build_scorm.py` (SCORM 1.2, 1 SCO, `href="index.html"`, liệt kê mọi file).

Quy tắc đọc Excel: xem `read_excel()` trong `tools/build_scorm.py`. Dòng ví dụ (cột STT bắt đầu bằng "(Ví dụ)" ở sheet Video, hoặc câu hỏi bắt đầu bằng "(Ví dụ)") bị bỏ qua.

**Test tương đương (bắt buộc):** script so sánh zip của Builder với zip của `build_scorm.py` cho khóa demo: cùng danh sách file, `course.js` parse ra cùng JSON (bỏ qua khác biệt duration ±1 giây), manifest parse được. Sau đó giải nén gói của Builder và chạy `tests/test_player.py` phải đạt 26/26.

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
- Hướng dẫn viết 1 trang cho trainer: chưa cần, làm sau khi cần (đã bỏ khỏi các mốc; phần deploy lên GitHub Pages đã làm ở M1)

## 7. Các mốc

| Mốc | Nội dung | Nghiệm thu |
|---|---|---|
| M1 ✅ | Khung Vite, copy Player, đọc Excel + thư mục video, màn hình kiểm tra lỗi | Khóa demo hiện đúng tóm tắt; cố tình làm sai 5 loại lỗi thì báo đúng dòng |
| M2 ✅ | Xuất zip streaming + thông tin Workday | Test tương đương với `build_scorm.py` đạt; 26/26 test Player đạt trên gói của Builder; xuất được khóa giả lập 1,5 GB không treo máy |
| M3 ✅ | Xem thử + đặt pop-up | Xem thử chạy đúng luật chơi; mốc đặt bằng nút khớp với giây trên video demo |

## 8. Việc Alex cần cung cấp

- ✅ Repo team: `ctd-academy/scorm` · Host: GitHub Pages
- ✅ Logo: `brand/coteccons-logo-white.png` (trên nền navy, Player dùng `player/logo.png`) và `brand/coteccons-logo-color.png` (trên nền sáng, dùng cho giao diện Builder)
- ✅ Liên hệ L&OD: Mr. Minh (minhvt02@coteccons.vn) hoặc cta@coteccons.vn
- Một khóa thật (thư mục video + bộ câu hỏi) để pilot: nằm trên máy Alex
