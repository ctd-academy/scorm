# builder/

Website Builder: trainer chọn thư mục khóa (video + Excel), Builder tự tìm Excel, cho đặt pop-up, kiểm tra lỗi và xuất gói SCORM. Spec: `docs/BUILDER_SPEC.md`.

```bash
npm install
npm run dev      # chạy trên máy: http://localhost:5173
npm test         # test logic đọc Excel, kiểm tra lỗi, đóng gói (cần python3, ffprobe)
node scripts/build-scorm.mjs <file_excel> <thư_mục_khóa> <thư_mục_xuất>   # đóng gói bằng dòng lệnh, cùng code với web
npm run build    # tạo website tĩnh trong dist/
```

`public/` do `scripts/copy-assets.mjs` sinh ra từ `player/`, `templates/`, `brand/` ở gốc repo. Không sửa tay.
