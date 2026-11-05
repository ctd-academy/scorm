---
name: Yêu cầu sửa / thêm tính năng
about: Mô tả một việc cần làm. Có thể giao thẳng cho Copilot (Assignees → Copilot).
title: ""
labels: []
---

<!-- Viết bằng lời thường, càng cụ thể càng tốt. Mỗi issue chỉ nên là MỘT việc nhỏ. -->

## Hiện tại đang thế nào

<!-- Ví dụ: Ở bước 3, khi tên video sai, Builder chỉ báo "không tìm thấy video". -->

## Muốn đổi thành thế nào

<!-- Ví dụ: Báo thêm tên thư mục đang chứa video gần giống nhất. -->

## Phần nào bị ảnh hưởng (đánh dấu x)

- [ ] Builder (trang đóng gói cho trainer)
- [ ] Player (khung học viên thấy trên Workday) → **đổi luật học cần Alex đồng ý trước**
- [ ] File Excel mẫu (thêm/đổi cột, sheet)
- [ ] Trang hướng dẫn trainer

## Cách kiểm tra là xong

<!-- Ví dụ: Mở Builder, chọn demo-course, đổi tên video trong Excel thành sai → thấy thông báo mới. -->

---
Ghi chú cho Copilot: đọc `AGENTS.md` và `docs/DEV.md` trước; chạy `bash tests/run_all.sh` và chỉ mở Pull Request khi đạt hết.
