# builder/

Website Builder: trainer chọn file Excel + thư mục video, Builder kiểm tra lỗi và (từ M2) xuất gói SCORM. Spec: `docs/BUILDER_SPEC.md`.

```bash
npm install
npm run dev      # chạy trên máy: http://localhost:5173
npm test         # test logic đọc Excel + kiểm tra lỗi (cần python3 + openpyxl, ffprobe)
npm run build    # tạo website tĩnh trong dist/
```

`public/` do `scripts/copy-assets.mjs` sinh ra từ `player/`, `templates/`, `brand/` ở gốc repo. Không sửa tay.
