// Hàm nhỏ dùng chung cho các bước của Builder và lệnh đóng gói (scripts/build-scorm.mjs).
// Không đụng tới trình duyệt ở đây để chạy được bằng Node.

export const VIDEO_EXT = /\.(mp4|m4v|mov|webm|avi|mkv|wmv|flv|mpe?g)$/i;

// Bỏ qua file khóa của Excel (~$...) và file/thư mục ẩn (.DS_Store, .git…)
export const ignored = (name) => name.startsWith("~$") || name.startsWith(".");

export const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

// 90 -> "01:30"
export const mmss = (sec) => `${String(Math.floor(sec / 60)).padStart(2, "0")}:${String(Math.floor(sec % 60)).padStart(2, "0")}`;
