// Danh sách file của Player đưa vào mọi gói (trừ course.js, file này sinh riêng cho từng khóa).
// Dùng chung cho copy-assets.mjs (Builder web), build-scorm.mjs (dòng lệnh) và test.
import { readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

export const PLAYER_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "player");

/** Đường dẫn tương đối (dùng "/"), file trước thư mục, theo thứ tự tên */
export function listPlayerFiles(dir = PLAYER_DIR, prefix = "") {
  return readdirSync(dir, { withFileTypes: true })
    .sort((a, b) => (a.isDirectory() - b.isDirectory()) || a.name.localeCompare(b.name))
    .flatMap((d) => (d.isDirectory() ? listPlayerFiles(join(dir, d.name), prefix + d.name + "/") : d.name === "course.js" ? [] : [prefix + d.name]));
}
