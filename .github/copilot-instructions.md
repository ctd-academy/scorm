# Hướng dẫn cho GitHub Copilot – Coteccons SCORM Builder

**Luôn đọc `AGENTS.md` và `docs/DEV.md` trước khi sửa code.** Hai file đó là luật đầy đủ; dưới đây là phần tóm tắt bắt buộc nhớ.

- Trả lời bằng **tiếng Việt**, dễ hiểu với người không phải lập trình viên. Giao diện Builder và Player viết tiếng Việt có dấu.
- Dự án: `player/` = khung học nằm trong mọi gói SCORM 1.2 (luật học: tuần tự, chỉ tua lại, tối đa 2x, pop-up, bài thi). `builder/` = website tĩnh (Vite) để trainer đóng gói khóa học từ Excel + video.
- **Không có backend.** Mọi xử lý chạy trên trình duyệt; video và đề thi không bao giờ được gửi lên mạng.
- **Không thêm thư viện mới.** Không dùng SheetJS. Không đổi luật học trong `player/player.js` khi chưa có Alex đồng ý.
- File khó, chỉ sửa khi thật cần: `builder/src/zip.js`, `builder/src/xlsx.js`, `player/scorm12.js`.
- Không sửa `builder/public/` (sinh tự động) và không sửa tay file Excel trong `templates/`, `demo-course/` (tạo bằng `tools/make_template.py`).
- Đọc Excel và kiểm tra lỗi nằm ở `builder/src/course.js` (mỗi sheet một hàm). Thông báo lỗi phải ghi rõ sheet, dòng và cách sửa.
- Sửa ít nhất có thể, giữ phong cách sẵn có của file. Player viết kiểu cũ (`var`, `function`).
- Xong việc: chạy `bash tests/run_all.sh` (phải đạt hết, không được xóa/tắt test); cập nhật `docs/DEV.md` nếu đổi cấu trúc hay thêm bẫy; cập nhật `builder/huong-dan.html` nếu đổi giao diện, cột Excel, thông báo lỗi hoặc luật học.
