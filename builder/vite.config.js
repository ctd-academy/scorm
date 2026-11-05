import { defineConfig } from "vite";

// base "./" để chạy được ở bất kỳ đường dẫn nào (GitHub Pages: /scorm/)
// 2 trang: Builder (index.html) và hướng dẫn cho trainer (huong-dan.html)
export default defineConfig({
  base: "./",
  build: { rollupOptions: { input: { main: "index.html", guide: "huong-dan.html" } } },
});
