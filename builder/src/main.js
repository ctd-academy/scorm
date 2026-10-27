import "./style.css";
import { readXlsx } from "./xlsx.js";
import { readCourse, formatDuration } from "./course.js";

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const mb = (n) => (n >= 1024 ** 3 ? (n / 1024 ** 3).toFixed(2) + " GB" : Math.max(0.1, n / 1024 ** 2).toFixed(1) + " MB");

const state = { excel: null, folder: null, folderName: "", logo: null, result: null };
const durationCache = new WeakMap(); // File -> giây (null nếu không mở được)
let runId = 0;

// Thư mục khóa: file ở gốc và file trong thư mục con videos/ (giống build_scorm.py)
function splitFolder(files) {
  const root = [], videos = [];
  for (const f of files) {
    const parts = (f.webkitRelativePath || f.name).split("/");
    if (parts.length === 2) root.push(f);
    else if (parts.length === 3 && parts[1].toLowerCase() === "videos") videos.push(f);
  }
  return { root, videos };
}

function videoDuration(file) {
  if (durationCache.has(file)) return Promise.resolve(durationCache.get(file));
  return new Promise((resolve) => {
    const v = document.createElement("video");
    const url = URL.createObjectURL(file);
    const done = (d) => {
      clearTimeout(timer);
      v.removeAttribute("src");
      v.load();
      URL.revokeObjectURL(url);
      durationCache.set(file, d);
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

function setStep(id, cls) {
  const el = $(id);
  el.classList.remove("locked", "done");
  if (cls) el.classList.add(cls);
}

function showCheck(html) {
  $("check").innerHTML = html;
}

async function check() {
  const my = ++runId;
  state.result = null;
  if (!state.excel || !state.folder) {
    setStep("step2", "locked");
    showCheck('<p class="note">Chọn file Excel và thư mục video để kiểm tra.</p>');
    return;
  }
  setStep("step2");
  showCheck('<div class="verdict busy">Đang đọc file Excel…</div>');

  let sheets;
  try {
    sheets = readXlsx(await state.excel.arrayBuffer());
  } catch (e) {
    if (my !== runId) return;
    const msg = e.name === "NotReadableError" || e.name === "NotFoundError"
      ? "Không đọc được file Excel. Nếu bạn vừa sửa và lưu file, hãy bấm chọn lại file Excel."
      : e.message || "Không đọc được file Excel.";
    showCheck(`<div class="verdict bad">${esc(msg)}</div>`);
    return;
  }

  const folder = splitFolder(state.folder);
  // Lần 1: biết cần những video nào; đo thời lượng; lần 2: kiểm tra đầy đủ
  const first = readCourse(sheets, folder, null, state.logo);
  const videoFiles = first.files.filter((f) => f.zipPath.startsWith("videos/")).map((f) => f.file);
  const durations = new Map();
  for (let i = 0; i < videoFiles.length; i++) {
    if (my !== runId) return;
    showCheck(`<div class="verdict busy">Đang đọc thời lượng video ${i + 1}/${videoFiles.length}…</div>`);
    durations.set(videoFiles[i].name, await videoDuration(videoFiles[i]));
  }
  if (my !== runId) return;
  const result = readCourse(sheets, folder, durations, state.logo);
  render(result);
}

function render({ course, errors, warnings, files, totalSize }) {
  if (!course) {
    setStep("step2");
    showCheck(`<div class="verdict bad">${esc(errors[0])}</div>`);
    return;
  }
  const S = course.settings;
  const total = course.videos.reduce((s, v) => s + v.duration, 0);
  const exam = course.quiz.length
    ? [`Đạt từ ${S.passScore}%`, `${S.maxAttempts} lượt`,
       S.questionsPerAttempt ? `${S.questionsPerAttempt} câu mỗi lần (rút từ ${course.quiz.length})` : `cả ${course.quiz.length} câu mỗi lần`,
       S.timeLimitMinutes ? `${S.timeLimitMinutes} phút` : "không giới hạn thời gian",
       S.showAnswers ? "hiện đáp án sau khi nộp" : "không hiện đáp án"].join(" · ")
    : "Không có bài kiểm tra: hoàn thành khi xem hết video";

  const popupsOf = (i) => course.popups.filter((p) => p.video === i).length;
  let html = errors.length
    ? `<div class="verdict bad">Còn ${errors.length} lỗi cần sửa trong file Excel. Sửa xong, lưu file rồi bấm chọn lại file Excel.</div>`
    : `<div class="verdict ok">Không có lỗi. Khóa học sẵn sàng để xuất.</div>`;
  if (errors.length) html += `<h3 class="bad">Lỗi (phải sửa)</h3><ul class="list errors">${errors.map((e) => `<li>${esc(e)}</li>`).join("")}</ul>`;
  if (warnings.length) html += `<h3 class="warn">Lưu ý (không bắt buộc sửa)</h3><ul class="list warnings">${warnings.map((w) => `<li>${esc(w)}</li>`).join("")}</ul>`;

  html += `<h3>Tóm tắt khóa học</h3><div class="summary">
    <div class="wide"><small>Tên khóa</small><b>${esc(course.title)}</b></div>
    <div><small>Mã khóa</small><b>${esc(course.id)}</b></div>
    <div><small>Dung lượng</small><b>${mb(totalSize)}</b></div>
    <div><small>Số video</small><b>${course.videos.length}</b></div>
    <div><small>Tổng thời lượng</small><b>${formatDuration(total)}</b></div>
    <div><small>Câu pop-up</small><b>${course.popups.length}</b></div>
    <div><small>Câu ngân hàng đề</small><b>${course.quiz.length}</b></div>
    <div class="wide" style="grid-column: span 4"><small>Luật bài kiểm tra</small><b>${esc(exam)}</b></div>
  </div>`;
  if (course.videos.length) {
    html += `<table><thead><tr><th>#</th><th>Tên bài</th><th>File video</th><th>Thời lượng</th><th>Pop-up</th></tr></thead><tbody>${course.videos
      .map((v, i) => `<tr><td>${i + 1}</td><td>${esc(v.title)}</td><td>${esc(v.src.slice(7))}</td><td>${v.duration ? formatDuration(v.duration) : "–"}</td><td>${popupsOf(i)}</td></tr>`)
      .join("")}</tbody></table>`;
  }
  showCheck(html);
  setStep("step2", errors.length ? null : "done");
  state.result = errors.length ? null : { course, files }; // dùng cho bước xuất (M2)
}

$("excel").addEventListener("change", (e) => {
  state.excel = e.target.files[0] || null;
  $("excelStatus").textContent = state.excel ? state.excel.name : "Chưa chọn";
  $("excelStatus").className = "status" + (state.excel ? " ok" : "");
  e.target.value = ""; // cho phép chọn lại đúng file đó sau khi sửa
  check();
});

$("folder").addEventListener("change", (e) => {
  const files = [...e.target.files];
  state.folder = files.length ? files : null;
  state.folderName = files.length ? (files[0].webkitRelativePath || "").split("/")[0] : "";
  const { root, videos } = splitFolder(files);
  const n = [...root, ...videos].filter((f) => /\.(mp4|m4v|mov|webm|avi|mkv|wmv)$/i.test(f.name)).length;
  $("folderStatus").textContent = files.length ? `${state.folderName} (${n} video)` : "Chưa chọn";
  $("folderStatus").className = "status" + (files.length ? " ok" : "");
  e.target.value = "";
  check();
});

$("logo").addEventListener("change", (e) => {
  state.logo = e.target.files[0] || null;
  $("logoStatus").textContent = state.logo ? state.logo.name : "Không chọn = dùng logo Coteccons có sẵn";
  $("logoStatus").className = "status" + (state.logo ? " ok" : "");
  e.target.value = "";
  check();
});
