// Đọc thư mục khóa trên trình duyệt: danh sách file, thời lượng video, link phát video ngay trên máy.
// Mỗi file trong thư mục là một "entry": { path, name, size, file }, path tính từ thư mục khóa, dùng "/".
// (Lệnh dòng lệnh scripts/build-scorm.mjs có hàm readFolder riêng, trả về cùng dạng.)
import { VIDEO_EXT, ignored } from "./util.js";

// Mỗi lần Kiểm tra lại, trình duyệt trả File mới cho cùng một file: nhận diện file theo đường dẫn + kích thước + giờ sửa
const fileKey = (e) => `${e.path}|${e.file.size}|${e.file.lastModified}`;

// ---------------------------------------------------------------- danh sách file

/**
 * source: { kind: "handle", dir }   Chrome/Edge (showDirectoryPicker): đọc lại thư mục mỗi lần Kiểm tra lại
 *      or { kind: "input", files }  trình duyệt khác (<input webkitdirectory>): phải chọn lại thư mục sau khi sửa
 * Trả về mọi file trong thư mục, kể cả thư mục con; bỏ file ẩn và file khóa của Excel.
 */
export async function readFolder(source) {
  if (source.kind === "input") return fromInput(source.files);
  const dir = source.dir;
  if (dir.queryPermission && (await dir.queryPermission({ mode: "read" })) !== "granted") {
    if ((await dir.requestPermission({ mode: "read" })) !== "granted") throw new Error("permission");
  }
  return walk(dir);
}

function fromInput(files) {
  return files
    .map((f) => ({ path: (f.webkitRelativePath || f.name).split("/").slice(1).join("/") || f.name, name: f.name, size: f.size, file: f }))
    .filter((e) => !e.path.split("/").some(ignored));
}

async function walk(dir, prefix = "", out = []) {
  for await (const h of dir.values()) {
    if (ignored(h.name)) continue;
    if (h.kind === "directory") await walk(h, prefix + h.name + "/", out);
    else {
      const file = await h.getFile();
      out.push({ path: prefix + h.name, name: h.name, size: file.size, file });
    }
  }
  return out;
}

// ---------------------------------------------------------------- link phát video (bước 2, 4)

// Blob URL để phát video ngay từ máy người dùng; bỏ hết khi chọn thư mục khác
const blobUrls = new Map();
export function urlOf(entry) {
  const k = fileKey(entry);
  if (!blobUrls.has(k)) blobUrls.set(k, URL.createObjectURL(entry.file));
  return blobUrls.get(k);
}
export function dropUrls() {
  blobUrls.forEach((u) => URL.revokeObjectURL(u));
  blobUrls.clear();
}

// Video trong thư mục, theo thứ tự thư mục (01., 02., … 10.); tên file ghi như trong Excel.
// Dùng ở bước 2 khi Excel chưa có danh sách video.
export function folderVideos(folder) {
  const names = new Map();
  folder.forEach((f) => names.set(f.name.toLowerCase(), (names.get(f.name.toLowerCase()) || 0) + 1));
  return folder
    .filter((f) => VIDEO_EXT.test(f.name))
    .sort((a, b) => a.path.localeCompare(b.path, "vi", { numeric: true, sensitivity: "base" }))
    .map((f) => ({ title: f.name.replace(/\.[^.]+$/, ""), path: f.path, url: urlOf(f), file: names.get(f.name.toLowerCase()) > 1 ? f.path : f.name }));
}

// ---------------------------------------------------------------- thời lượng video

const durationCache = new Map(); // fileKey -> giây (null nếu không mở được)

// Thời lượng (giây) đọc bằng thẻ <video> của trình duyệt; null nếu không mở được trong 20 giây
export function videoDuration(entry) {
  const k = fileKey(entry);
  if (durationCache.has(k)) return Promise.resolve(durationCache.get(k));
  return new Promise((resolve) => {
    const v = document.createElement("video");
    const url = URL.createObjectURL(entry.file);
    const done = (d) => {
      clearTimeout(timer);
      v.removeAttribute("src");
      v.load();
      URL.revokeObjectURL(url);
      durationCache.set(k, d);
      resolve(d);
    };
    const timer = setTimeout(() => done(null), 20000);
    v.preload = "metadata";
    v.muted = true;
    v.onloadedmetadata = () => done(Number.isFinite(v.duration) && v.duration > 0 ? v.duration : null);
    v.onerror = () => done(null);
    v.src = url;
  });
}
