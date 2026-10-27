// Chép Player, file Excel mẫu và logo vào builder/public/ trước khi chạy/đóng gói.
// Nguồn duy nhất là player/, templates/, brand/ ở gốc repo: không sửa bản chép trong public/.
import { rmSync, mkdirSync, cpSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..", "..");
const PUB = join(HERE, "..", "public");

rmSync(PUB, { recursive: true, force: true });
mkdirSync(join(PUB, "assets"), { recursive: true });
cpSync(join(ROOT, "player"), join(PUB, "player"), { recursive: true, filter: (src) => !src.endsWith("course.js") });
cpSync(join(ROOT, "templates", "Mau_nhap_lieu_khoa_hoc.xlsx"), join(PUB, "assets", "Mau_nhap_lieu_khoa_hoc.xlsx"));
for (const f of ["coteccons-logo-white.png", "coteccons-logo-color.png"]) cpSync(join(ROOT, "brand", f), join(PUB, "assets", f));
console.log("Đã chép player/, file Excel mẫu và logo vào builder/public/");
