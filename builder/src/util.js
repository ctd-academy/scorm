// Hàm nhỏ dùng chung cho các bước của Builder và lệnh đóng gói (scripts/build-scorm.mjs).
// Nạp được bằng Node: chỉ copyText dùng tới trình duyệt, và chỉ khi được gọi.

export const VIDEO_EXTS = [".mp4", ".m4v", ".mov", ".webm", ".avi", ".mkv", ".wmv", ".flv", ".mpg", ".mpeg"];
export const VIDEO_EXT = /\.(mp4|m4v|mov|webm|avi|mkv|wmv|flv|mpe?g)$/i;

// Bỏ qua file khóa của Excel (~$...) và file/thư mục ẩn (.DS_Store, .git…)
export const ignored = (name) => name.startsWith("~$") || name.startsWith(".");

export const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

// 90 -> "01:30"
export const mmss = (sec) => `${String(Math.floor(sec / 60)).padStart(2, "0")}:${String(Math.floor(sec % 60)).padStart(2, "0")}`;

// Dung lượng dễ đọc: "12.3 MB", "1.25 GB"
export const mb = (n) => (n >= 1024 ** 3 ? (n / 1024 ** 3).toFixed(2) + " GB" : Math.max(0.1, n / 1024 ** 2).toFixed(1) + " MB");

// Nút "Copy": chép chữ vào clipboard, báo "Đã copy" 1,5 giây rồi trả lại nhãn cũ
export async function copyText(btn, text, label) {
  try {
    await navigator.clipboard.writeText(text);
    btn.textContent = "Đã copy";
  } catch {
    btn.textContent = "Không copy được";
  }
  setTimeout(() => (btn.textContent = label), 1500);
}
