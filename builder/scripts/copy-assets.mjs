// Chép Player, file Excel mẫu và logo vào builder/public/ trước khi chạy/đóng gói.
// Nguồn duy nhất là player/, templates/, brand/ ở gốc repo: không sửa bản chép trong public/.
import { rmSync, mkdirSync, cpSync, readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { listPlayerFiles } from "./player-files.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..", "..");
const PUB = join(HERE, "..", "public");

rmSync(PUB, { recursive: true, force: true });
mkdirSync(join(PUB, "assets"), { recursive: true });
cpSync(join(ROOT, "player"), join(PUB, "player"), { recursive: true, filter: (src) => !src.endsWith("course.js") });
cpSync(join(ROOT, "templates", "Mau_nhap_lieu_khoa_hoc.xlsx"), join(PUB, "assets", "Mau_nhap_lieu_khoa_hoc.xlsx"));
for (const f of ["coteccons-logo-white.png", "coteccons-logo-color.png"]) cpSync(join(ROOT, "brand", f), join(PUB, "assets", f));

// Danh sách file Player để Builder tải về và đưa vào gói (trang web tĩnh không tự liệt kê được thư mục)
writeFileSync(join(PUB, "player-files.json"), JSON.stringify(listPlayerFiles(join(PUB, "player"))));

// Trang xem thử = player/index.html, nhưng lấy dữ liệu khóa từ trang Builder thay vì course.js.
// Tạo sau khi lập danh sách ở trên nên không bị đưa vào gói SCORM.
const index = readFileSync(join(ROOT, "player", "index.html"), "utf8");
const tag = '<script src="course.js"></script>';
if (!index.includes(tag)) throw new Error("player/index.html không còn nạp course.js: cần sửa scripts/copy-assets.mjs");
writeFileSync(join(PUB, "player", "preview.html"), index.replace(tag, "<script>window.COURSE = parent.__previewCourse;</script>"));
console.log("Đã chép player/, file Excel mẫu và logo vào builder/public/");
