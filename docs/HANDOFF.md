# HANDOFF – Dự án Coteccons SCORM Builder

> Cập nhật: 28/10/2026 · Chủ dự án: Alex (L&OD Team Lead, Coteccons)
> Bản này đi kèm repo. Spec Builder web: `docs/BUILDER_SPEC.md`. Hướng dẫn cho người phát triển: `docs/DEV.md`. Hướng dẫn cho Claude Code: `CLAUDE.md`.

**Ký hiệu trạng thái:** ✅ Đã chốt · 🟡 Đề xuất, chờ Alex chốt · ❓ Còn mở, cần hỏi Workday/IT

---

## 1. Bối cảnh

- Coteccons chuyển hệ thống e-learning sang **Workday Learning**. Workday không có tính năng e-learning nâng cao hay quản lý thi cử; nội dung học đưa lên dưới dạng **gói SCORM**.
- **~150 khóa** cần chuyển. Ở LMS cũ, mỗi khóa được chia thành **nhiều video ngắn theo từng mục**, tổng 30–120 phút/khóa. LMS cũ **xuất được video**.
- Một số khóa đã có sẵn **bộ câu hỏi cuối khóa**.
- Workday giới hạn **4GB/gói SCORM 1.2**.
- Học viên học trên **cả máy tính và điện thoại** (có nhân sự công trường dùng 4G).
- Team L&OD (4 trainer) **sẽ tự làm tiếp** sau khi có công cụ. Team đã có công cụ quay và cắt video.
- Hai kịch bản cần phục vụ: **(1) chuyển khóa cũ** sang Workday, **(2) tạo khóa mới**.

## 2. Tính năng LMS cũ cần giữ (yêu cầu gốc)

1. Không được tua tới video, chỉ tua lại
2. Mở tab khác thì video dừng
3. Câu hỏi pop-up giữa video (tính năng mong muốn)
4. Bài kiểm tra cuối khóa, đạt 80% thì qua
5. Làm lại tối đa 3 lần
6. Có giấy chứng nhận khi hoàn thành

## 3. Kiến thức nền đã thống nhất

**SCORM là gì:** một file .zip gồm trang web (HTML/CSS/JS, video, hình) + file mục lục `imsmanifest.xml` + vài lệnh JavaScript báo kết quả cho LMS. Tự xây được, gắn thương hiệu được như một website.

**Mô hình 3 tầng** để biết cái gì làm được ở đâu:

| Tầng | Câu hỏi | Ai quyết định |
|---|---|---|
| A. Bên trong gói | Học viên thấy và làm được gì | Gói SCORM: gần như mọi thứ web làm được |
| B. Gói gửi gì về | Dữ liệu nào được báo đi | Chuẩn SCORM: danh sách trường cố định |
| C. Workday lưu và hiển thị gì | Báo cáo, cấu hình lượt, chứng nhận | Workday: **phải kiểm tra** |

"SCORM làm được" không có nghĩa là "Workday nhận được".

**Cấu trúc khóa trên Workday:**
- **Vỏ khóa** cấu hình trên Workday: tên, mô tả, chủ đề (bắt buộc), mã khóa, thời lượng, ảnh bìa, ngôn ngữ, người liên hệ, Requires Enrollment, Expiry Period, chứng nhận.
- **Nội dung** là các lesson: Media, Packaged Content (SCORM/AICC), External Content, Survey…
- Packaged Content hỗ trợ SCORM 1.2 và SCORM 2004 (bản 2–4).
- Tùy chọn liên quan: **Enforce Lesson Order**, **Provide Course Grade**, **Completion Without Exit**.

**Chống gian lận có giới hạn:** chấm điểm diễn ra trên trình duyệt, người rành kỹ thuật có thể can thiệp. Bài thi rủi ro cao nên kết hợp thi trực tiếp hoặc giám sát.

## 4. Quyết định đã chốt

| # | Quyết định | Trạng thái |
|---|---|---|
| 1 | Hướng công cụ: **tự xây Coteccons SCORM Builder** (Player dùng chung + Builder). iSpring/Workday Sana để dành cho khóa mới cần tương tác phức tạp, xem lại sau 6 tháng | ✅ |
| 2 | **1 khóa = 1 lesson SCORM** chứa toàn bộ video + pop-up + bài thi. Loại phương án "video dạng Media" vì trình phát Workday không chặn tua/pop-up được | ✅ |
| 3 | Chuẩn **SCORM 1.2** | ✅ (cần xác nhận tenant) |
| 4 | Học **tuần tự** theo thứ tự quy định | ✅ |
| 5 | Tốc độ phát **tối đa 2x** | ✅ |
| 6 | Pop-up **không tính điểm**, chỉ để đảm bảo học viên theo dõi | ✅ |
| 7 | Sai pop-up → **xem lại đoạn trước câu hỏi** (từ pop-up trước đó, hoặc từ đầu video) | ✅ |
| 8 | Bài thi **tùy chỉnh theo khóa**: ngân hàng đề, số câu mỗi lần, thời gian, hiện đáp án hay không, điểm đạt, số lượt | ✅ |
| 9 | Rớt hết lượt (mặc định 3) → khóa bài thi, **liên hệ L&OD**; L&OD đăng ký lại học viên trên Workday | ✅ (cần xác nhận cơ chế đăng ký lại) |
| 10 | **Chứng nhận dùng của Workday**, không tạo trong gói | ✅ |
| 11 | Survey đánh giá khóa dùng **Survey lesson của Workday** | 🟡 |
| 12 | Builder: **Excel là nơi nhập liệu chính**; Builder có chế độ "xem video, bấm đặt pop-up" để lấy mốc thời gian | ✅ |
| 13 | Builder là **website tĩnh, không backend**: mọi xử lý chạy trên máy người dùng, video và đề thi không rời máy (27/10) | ✅ |
| 14 | Ghi zip streaming thẳng xuống ổ cứng → team dùng **Chrome/Edge** bản mới | ✅ |
| 15 | Code ở **GitHub tài khoản team** (`ctd-academy/scorm`); host trên **GitHub Pages** | ✅ |
| 16 | **Không dùng Lovable** cho phần lõi; xây bằng Claude Code | ✅ |
| 17 | IT chưa thấy chặn gì (27/10) | ✅ |
| 18 | Logo mặc định trong Player: **logo Coteccons bản trắng** (`player/logo.png`); liên hệ khi hết lượt: **Mr. Minh (minhvt02@coteccons.vn) hoặc cta@coteccons.vn** (sửa ở `builder/src/defaults.json`) | ✅ |
| 19 | **Một động cơ đóng gói** dùng chung cho website và dòng lệnh (`builder/scripts/build-scorm.mjs`); bỏ bản Python `build_scorm.py`. GitHub tự chạy toàn bộ test (logic, Player, giao diện) mỗi lần đổi code (28/10) | ✅ |

## 5. Đã xây xong: Player v1

**Player** = "khung học" nằm trong mọi gói SCORM, viết một lần dùng cho cả 150 khóa. Nội dung từng khóa nằm ở `course.js`.

**Tính năng đã có:**
- Mục lục tuần tự có khóa; thanh % hoàn thành; mục lục thu gọn trên điện thoại
- Video: chỉ tua lại trong phần đã xem; giới hạn 2x (0.75–2x); tự dừng khi chuyển tab/khóa màn hình; học tiếp đúng giây đã dừng; tự thoát toàn màn hình khi hiện pop-up
- Pop-up theo mốc giây; sai → quay về đầu đoạn và hỏi lại khi tới mốc
- Bài thi chỉ mở khi xem hết video; rút ngẫu nhiên câu, xáo đáp án; đồng hồ đếm ngược và tự nộp khi hết giờ; hiện đáp án + giải thích nếu bật
- **Lượt thi được tính ngay khi bấm "Bắt đầu"** (chặn mở đề rồi thoát); học viên được báo trước
- Khóa không có câu hỏi cuối khóa → hoàn thành khi xem hết video
- Chế độ "Xem thử" khi mở ngoài LMS, có nút xóa tiến độ
- **Tài liệu PDF theo từng video** (không bắt buộc, thường là slide): nút "📄 Tài liệu" mở cột bên phải video, **video vẫn chạy** để xem song song; điện thoại thì nằm dưới video. Vẽ bằng PDF.js nên không có nút tải/in và chạy được trên iPhone. Ẩn khi làm bài thi. Không in tên học viên (Alex chốt). Chấp nhận rủi ro người rành máy tải được file PDF

**Dữ liệu gửi về Workday (SCORM 1.2):**

| Trường | Giá trị |
|---|---|
| `cmi.core.lesson_status` | incomplete khi đang học hoặc rớt nhưng còn lượt · passed · failed (hết lượt) · completed (khóa không thi) |
| `cmi.core.score.raw` (min 0, max 100) | điểm cao nhất |
| `cmi.core.lesson_location` | số thứ tự video hoặc "quiz" |
| `cmi.suspend_data` | JSON gọn: `{v:[[đã xem xa nhất, vị trí, xong]], p:[id pop-up đã đúng], a:số lượt, s:điểm cao nhất, q:0/1/2}` (giới hạn 4.096 ký tự) |
| `cmi.core.session_time`, `cmi.core.exit` | exit = "suspend" khi chưa xong, rỗng khi đạt/hết lượt |

**Đã kiểm tra:** 43/43 tình huống tự động (26 luật học + 17 tài liệu PDF) trên Chrome (Playwright) qua LMS giả lập. Alex đã chạy thử gói demo trên **SCORM Cloud**: ổn.

**Phát hiện khi test:** tua lại video chỉ đúng khi máy chủ hỗ trợ tải từng phần (HTTP Range). Workday và SCORM Cloud thuộc loại này.

## 6. File Excel nhập liệu

Mỗi khóa = 1 file Excel chép từ **template chuẩn, trống** `templates/Mau_nhap_lieu_khoa_hoc.xlsx` (Builder có link tải). Ô nền vàng là ô cần điền; dòng 2 mỗi sheet là ví dụ (bị bỏ qua khi xuất). Sheet "Hướng dẫn" có gợi ý cài đặt bài kiểm tra và cách viết câu hỏi pop-up. Khóa demo điền sẵn: `demo-course/ATLD-DEMO.xlsx`.

| Sheet | Nội dung |
|---|---|
| Hướng dẫn | Cách dùng, luật chơi cố định, quy ước nhập câu hỏi |
| Thông tin khóa | Mã khóa, Tên khóa, Mô tả ngắn, Điểm đạt (%), Số lượt làm bài, Số câu mỗi lần thi (0 = tất cả), Thời gian làm bài (phút, 0 = không giới hạn), Hiện đáp án (Có/Không), Nội dung liên hệ khi hết lượt, File logo. Có ô tự đếm và cảnh báo |
| Video | STT · Tên bài · Tên file video · Tài liệu PDF (tùy chọn, nhiều file cách nhau `;`) |
| Câu hỏi | Loại (POPUP / CUOI KHOA) · Video số · Mốc thời gian (mm:ss, Text) · Câu hỏi · A · B · C · D · Đáp án đúng · Giải thích |

## 7. Builder web v1

Xem `docs/BUILDER_SPEC.md`. Tóm tắt: website tĩnh 5 bước (chọn thư mục khóa → đặt pop-up → kiểm tra → xem thử → xuất), xử lý hoàn toàn trên trình duyệt. Cùng code đóng gói với lệnh `builder/scripts/build-scorm.mjs`.

**Tiến độ:** M1 ✅ (chọn file, đọc Excel + thư mục video, màn hình kiểm tra lỗi) · M2 ✅ (xuất zip SCORM streaming, thông tin Workday; khóa 1,5 GB xuất trong ~30 giây, RAM tăng ~150 MB) · M3 ✅ (đặt pop-up bằng nút bấm, xem thử bằng Player thật; sau đó đổi luồng: chọn thư mục 1 lần, tự tìm Excel, nút Kiểm tra lại, đặt pop-up trước bước kiểm tra) · M4 hướng dẫn trainer. Deploy tự động lên GitHub Pages khi `main` thay đổi.

## 8. Việc còn mở cần hỏi Workday / IT ❓

| # | Câu hỏi | Vì sao quan trọng |
|---|---|---|
| 1 | Có chặn được đăng ký lại sau khi rớt 3 lần không? | Gói chỉ đếm lượt trong một lượt đăng ký |
| 2 | Đăng ký lại có reset dữ liệu SCORM (lượt, tiến độ) không? | Quy trình L&OD mở lại cho học viên dựa vào điều này |
| 3 | Tenant hỗ trợ SCORM phiên bản nào? Giới hạn upload thực tế? | Xác nhận SCORM 1.2 |
| 4 | Nhập khóa hàng loạt bằng EIB được không? | Tiết kiệm công tạo 150 vỏ khóa |
| 5 | App Workday trên điện thoại có chạy SCORM không? | Học viên dùng cả điện thoại |
| 6 | Mẫu chứng nhận, Provide Course Grade, Completion Without Exit cấu hình thế nào? | Điểm và hoàn thành hiển thị đúng |
| 7 | Nhập lịch sử học từ LMS cũ vào Workday? | Người đã hoàn thành không phải học lại |
| 8 | Công ty có license Workday Sana không? | Lựa chọn cho khóa mới sau này |
| 9 | IT: mạng công trường xem video được không; có cho dùng SCORM Cloud để test nội dung nội bộ không? | Trải nghiệm học và bảo mật |

## 9. Lộ trình và ước tính

**Xây công cụ (~6 tuần):** Thiết kế (xong) → Player v1 (xong) → Builder web v1 (~1 tuần) → Pilot 3 khóa trên Workday sandbox (2 tuần: 1 khóa ngắn, 1 khóa dài nhất ~120 phút, 1 khóa nhiều câu hỏi) → Chốt v1, hướng dẫn 1 trang, đào tạo team (1 tuần).

**Kịch bản 1 – chuyển 150 khóa:** kiểm kê và sàng lọc → pilot → chuyển hàng loạt ~1,5–2,5 giờ/khóa (≈225–375 giờ công; 4 trainer × ~10 giờ/tuần → 6–9 tuần) → nhập lịch sử học. Tổng khoảng 3 tháng. Ưu tiên khóa bắt buộc/an toàn.

**Kịch bản 2 – tạo khóa mới:** ~1–1,5 tuần công cho mỗi 30 phút nội dung.

**Chi phí:** Builder tự xây ~0đ license. Đối chiếu iSpring Suite 4 người ≈ ~100 triệu đồng/năm.

**Video:** nén 720p, ~400–700MB/giờ (khóa 120 phút ≈ 1–1,5GB).

## 10. Rủi ro đang theo dõi

- Workday không chặn được lần làm thứ 4 (rủi ro lớn nhất)
- Xuất file lớn trên trình duyệt
- App Workday mobile với SCORM
- Trình xem PDF nạp bằng `import()` + Web Worker: cần thử trên SCORM Cloud / Workday sandbox (chính sách bảo mật CSP của LMS có thể chặn)
- Phụ thuộc người giữ công cụ → repo và host thuộc tài khoản team, có hướng dẫn cho người phát triển (`docs/DEV.md`), test tự động trên GitHub, giao 1 trainer làm đầu mối

## 11. Bước tiếp theo

1. Xây Builder web v1 theo `docs/BUILDER_SPEC.md` (Claude Code), deploy lên GitHub Pages
2. ~~Alex thử gói demo trên SCORM Cloud~~ ✅ · ~~logo + liên hệ L&OD~~ ✅
3. Alex dùng khóa thật để pilot (khóa nằm trên máy Alex, đóng gói bằng Builder ngay trên máy)
4. Hỏi Workday các câu ở mục 8
5. Pilot 3 khóa thật trên Workday sandbox
