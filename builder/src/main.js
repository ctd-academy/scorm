import "./style.css";
import { readXlsx } from "./xlsx.js";
import { readCourse, formatDuration } from "./course.js";
import { writePackage, memorySink, diskSink } from "./package.js";
import { renderPopupStep } from "./popups.js";
import { renderPreviewStep, closePreview } from "./preview.js";

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const mb = (n) => (n >= 1024 ** 3 ? (n / 1024 ** 3).toFixed(2) + " GB" : Math.max(0.1, n / 1024 ** 2).toFixed(1) + " MB");

const state = { excel: null, folder: null, folderName: "", logo: null, result: null, exporting: false };
const MEMORY_LIMIT = 500 * 1024 ** 2; // trình duyệt không ghi thẳng xuống ổ cứng được thì chỉ xuất khóa nhỏ
const durationCache = new WeakMap(); // File -> giây (null nếu không mở được)
let runId = 0;

// Blob URL để phát video ngay từ máy người dùng (bước 3, 4); bỏ khi chọn thư mục khác
const blobUrls = new Map();
function urlOf(file) {
  if (!blobUrls.has(file)) blobUrls.set(file, URL.createObjectURL(file));
  return blobUrls.get(file);
}
function dropUrls() {
  blobUrls.forEach((u) => URL.revokeObjectURL(u));
  blobUrls.clear();
}

// Mọi file trong thư mục khóa, kể cả thư mục con; path tính từ thư mục khóa
function folderEntries(files) {
  return files
    .map((f) => ({ path: (f.webkitRelativePath || f.name).split("/").slice(1).join("/") || f.name, name: f.name, size: f.size, file: f }))
    .filter((e) => !e.name.startsWith("~$") && !e.name.startsWith("."));
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
  if (state.exporting) return;
  const my = ++runId;
  state.result = null;
  lockLaterSteps();
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

  const folder = folderEntries(state.folder);
  // Lần 1: biết cần những video nào; đo thời lượng; lần 2: kiểm tra đầy đủ
  const first = readCourse(sheets, folder, null, state.logo);
  const videoFiles = first.files.filter((f) => f.zipPath.startsWith("videos/"));
  const durations = new Map();
  for (let i = 0; i < videoFiles.length; i++) {
    if (my !== runId) return;
    showCheck(`<div class="verdict busy">Đang đọc thời lượng video ${i + 1}/${videoFiles.length}…</div>`);
    durations.set(videoFiles[i].path, await videoDuration(videoFiles[i].file));
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
  state.result = errors.length ? null : { course, files, totalSize };

  // Bước 3 dùng được cả khi Excel còn lỗi (đang soạn câu hỏi); bước 4, 5 cần hết lỗi
  const urls = new Map(files.map((f) => [f.zipPath, urlOf(f.file)]));
  setStep("step3");
  renderPopupStep($("popups"), course, course.videos.map((v) => urls.get(v.src) || null));
  if (!errors.length) {
    setStep("step4");
    renderPreviewStep($("preview"), course, urls);
    openExport();
  }
}

function lockLaterSteps() {
  setStep("step3", "locked");
  $("popups").innerHTML = '<p class="note">Chọn file Excel và thư mục video để đặt pop-up.</p>';
  setStep("step4", "locked");
  closePreview($("preview"));
  setStep("step5", "locked");
  $("export").innerHTML = '<p class="note">Sửa hết lỗi ở bước 2 để xuất gói.</p>';
}

// ---------------------------------------------------------------- Bước 5: xuất gói

function openExport() {
  const { course, totalSize } = state.result;
  setStep("step5");
  const tooBig = !window.showSaveFilePicker && totalSize > MEMORY_LIMIT;
  $("export").innerHTML = tooBig
    ? `<div class="verdict bad">Khóa này ${mb(totalSize)}, trình duyệt bạn đang dùng chỉ xuất được khóa dưới 500 MB. Hãy mở trang này bằng Chrome hoặc Edge.</div>`
    : `<button class="btn" id="exportBtn">Xuất gói SCORM</button>
       <span class="status">Sẽ lưu thành file <b>SCORM_${esc(course.id)}.zip</b></span>
       <div id="exportState"></div>`;
  if (!tooBig) $("exportBtn").onclick = exportPackage;
}

async function playerFiles() {
  const list = await (await fetch("./player-files.json")).json();
  return Promise.all(list.map(async (path) => {
    const r = await fetch("./player/" + path);
    if (!r.ok) throw new Error("Không tải được file Player '" + path + "'. Hãy tải lại trang.");
    return { path, data: new Uint8Array(await r.arrayBuffer()) };
  }));
}

function progress(done, total) {
  const pct = total ? Math.min(100, Math.round((done / total) * 100)) : 100;
  $("exportState").innerHTML = `<div class="bar"><span style="width:${pct}%"></span></div>
    <p class="note">Đang ghi ${mb(done)} / ${mb(total)} (${pct}%). Đừng đóng trang này.</p>`;
}

async function exportPackage() {
  const { course, files, totalSize } = state.result;
  const name = `SCORM_${course.id}.zip`;
  let writable = null, mem = null;
  if (window.showSaveFilePicker) {
    try {
      const handle = await window.showSaveFilePicker({ suggestedName: name, types: [{ description: "Gói SCORM", accept: { "application/zip": [".zip"] } }] });
      writable = await handle.createWritable();
    } catch (e) {
      if (e.name === "AbortError") return; // người dùng bấm Hủy
      $("exportState").innerHTML = `<div class="verdict bad">Không tạo được file: ${esc(e.message)}</div>`;
      return;
    }
  } else {
    mem = memorySink();
  }

  state.exporting = true;
  document.body.classList.add("exporting");
  $("exportBtn").disabled = true;
  progress(0, totalSize);
  try {
    const size = await writePackage({
      course, files,
      playerFiles: await playerFiles(),
      sink: writable ? diskSink(writable) : mem,
      onProgress: progress,
    });
    if (writable) await writable.close();
    else {
      const a = document.createElement("a");
      a.href = URL.createObjectURL(mem.blob());
      a.download = name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 60000);
    }
    showDone(course, name, size);
  } catch (e) {
    if (writable) await writable.abort().catch(() => {});
    $("exportState").innerHTML = `<div class="verdict bad">Xuất gói không thành công: ${esc(e.message || e)}. Hãy thử lại.</div>`;
  } finally {
    state.exporting = false;
    document.body.classList.remove("exporting");
    $("exportBtn").disabled = false;
  }
}

function showDone(course, name, size) {
  const total = course.videos.reduce((s, v) => s + v.duration, 0);
  const rows = [
    ["Tên khóa (Course Title)", course.title],
    ["Mã khóa (Course Number)", course.id],
    ["Mô tả ngắn (Description)", course.description],
    ["Tổng thời lượng, phút (Total Course Duration)", String(Math.max(1, Math.ceil(total / 60)))],
  ];
  $("exportState").innerHTML = `<div class="verdict ok">Đã lưu ${esc(name)} (${mb(size)}). Đưa file này lên Workday dưới dạng Packaged Content (SCORM).</div>
    <h3>Thông tin để tạo khóa trên Workday</h3>
    <table class="workday"><tbody>${rows.map(([k, v], i) => `<tr><th>${esc(k)}</th><td>${esc(v) || "<i>(trống)</i>"}</td>
      <td><button class="copy" data-i="${i}">Copy</button></td></tr>`).join("")}</tbody></table>`;
  $("exportState").querySelectorAll(".copy").forEach((b) => {
    b.onclick = async () => {
      try {
        await navigator.clipboard.writeText(rows[b.dataset.i][1]);
        b.textContent = "Đã copy";
      } catch {
        b.textContent = "Không copy được";
      }
      setTimeout(() => (b.textContent = "Copy"), 1500);
    };
  });
}

window.addEventListener("beforeunload", (e) => {
  if (state.exporting) e.preventDefault();
});

$("excel").addEventListener("change", (e) => {
  state.excel = e.target.files[0] || null;
  $("excelStatus").textContent = state.excel ? state.excel.name : "Chưa chọn";
  $("excelStatus").className = "status" + (state.excel ? " ok" : "");
  e.target.value = ""; // cho phép chọn lại đúng file đó sau khi sửa
  check();
});

$("folder").addEventListener("change", (e) => {
  const files = [...e.target.files];
  if (state.exporting) return;
  dropUrls();
  state.folder = files.length ? files : null;
  state.folderName = files.length ? (files[0].webkitRelativePath || "").split("/")[0] : "";
  const n = files.filter((f) => /\.(mp4|m4v|mov|webm|avi|mkv|wmv)$/i.test(f.name)).length;
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
