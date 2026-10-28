import "./style.css";
import { readXlsx } from "./xlsx.js";
import { readCourse, formatDuration } from "./course.js";
import { writePackage, memorySink, diskSink } from "./package.js";
import { renderPopupStep } from "./popups.js";
import { renderPreviewStep, closePreview } from "./preview.js";

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const mb = (n) => (n >= 1024 ** 3 ? (n / 1024 ** 3).toFixed(2) + " GB" : Math.max(0.1, n / 1024 ** 2).toFixed(1) + " MB");

// source: { kind: "handle", dir } (Chrome/Edge: đọc lại thư mục mỗi lần Kiểm tra lại)
//      or { kind: "input", files } (trình duyệt khác: phải chọn lại thư mục sau khi sửa Excel)
// excelOverride: file Excel chọn riêng ({ handle } hoặc { file }), null = tự tìm trong thư mục
const state = { source: null, folderName: "", excelChoice: "", excelOverride: null, logo: null, result: null, exporting: false };
const MEMORY_LIMIT = 500 * 1024 ** 2; // trình duyệt không ghi thẳng xuống ổ cứng được thì chỉ xuất khóa nhỏ
const VIDEO_EXT = /\.(mp4|m4v|mov|webm|avi|mkv|wmv|flv|mpe?g)$/i;
const durationCache = new Map(); // khóa file -> giây (null nếu không mở được)
let runId = 0;

// Mỗi lần Kiểm tra lại, trình duyệt trả File mới cho cùng một file: nhận diện file theo đường dẫn + kích thước + giờ sửa
const fileKey = (e) => `${e.path}|${e.file.size}|${e.file.lastModified}`;

// Blob URL để phát video ngay từ máy người dùng (bước 2, 4); bỏ khi chọn thư mục khác
const blobUrls = new Map();
function urlOf(entry) {
  const k = fileKey(entry);
  if (!blobUrls.has(k)) blobUrls.set(k, URL.createObjectURL(entry.file));
  return blobUrls.get(k);
}
function dropUrls() {
  blobUrls.forEach((u) => URL.revokeObjectURL(u));
  blobUrls.clear();
}

const skip = (name) => name.startsWith("~$") || name.startsWith(".");

// Mọi file trong thư mục khóa, kể cả thư mục con; path tính từ thư mục khóa
function folderEntries(files) {
  return files
    .map((f) => ({ path: (f.webkitRelativePath || f.name).split("/").slice(1).join("/") || f.name, name: f.name, size: f.size, file: f }))
    .filter((e) => !e.path.split("/").some(skip));
}

async function walk(dir, prefix = "", out = []) {
  for await (const h of dir.values()) {
    if (skip(h.name)) continue;
    if (h.kind === "directory") await walk(h, prefix + h.name + "/", out);
    else {
      const file = await h.getFile();
      out.push({ path: prefix + h.name, name: h.name, size: file.size, file });
    }
  }
  return out;
}

async function readFolder() {
  const src = state.source;
  if (src.kind === "input") return folderEntries(src.files);
  if (src.dir.queryPermission && (await src.dir.queryPermission({ mode: "read" })) !== "granted") {
    if ((await src.dir.requestPermission({ mode: "read" })) !== "granted") throw new Error("permission");
  }
  return walk(src.dir);
}

// Video trong thư mục, theo thứ tự thư mục (01., 02., … 10.); tên file ghi như trong Excel
function folderVideos(folder) {
  const names = new Map();
  folder.forEach((f) => names.set(f.name.toLowerCase(), (names.get(f.name.toLowerCase()) || 0) + 1));
  return folder
    .filter((f) => VIDEO_EXT.test(f.name))
    .sort((a, b) => a.path.localeCompare(b.path, "vi", { numeric: true, sensitivity: "base" }))
    .map((f) => ({ title: f.name.replace(/\.[^.]+$/, ""), path: f.path, url: urlOf(f), file: names.get(f.name.toLowerCase()) > 1 ? f.path : f.name }));
}

function videoDuration(entry) {
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

function setStep(id, cls) {
  const el = $(id);
  el.classList.remove("locked", "done");
  if (cls) el.classList.add(cls);
}

function showCheck(html) {
  $("check").innerHTML = html;
}

// Thanh ở bước 3: bản Excel nào, đọc lúc mấy giờ, còn bao nhiêu lỗi
function showBar(html) {
  $("topbar").hidden = false;
  $("barText").innerHTML = html;
  $("recheck").textContent = state.source.kind === "handle" ? "🔄 Kiểm tra lại" : "🔄 Chọn lại thư mục";
}
const now = () => new Date().toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });

async function pickExcel(folder) {
  const o = state.excelOverride;
  if (o) {
    $("excelPick").hidden = true;
    return { file: o.handle ? await o.handle.getFile() : o.file, chosen: true };
  }
  const list = folder.filter((f) => /\.xlsx$/i.test(f.name));
  // Nhiều file Excel: giữ file đã chọn trước đó, không thì lấy file sửa gần nhất
  const pick = list.find((f) => f.path === state.excelChoice) || [...list].sort((a, b) => b.file.lastModified - a.file.lastModified)[0];
  state.excelChoice = pick ? pick.path : "";
  const sel = $("excelPick");
  sel.hidden = list.length < 2;
  sel.innerHTML = list.map((f) => `<option value="${esc(f.path)}"${f === pick ? " selected" : ""}>${esc(f.path)}</option>`).join("");
  return { file: pick && pick.file, name: pick && pick.path, count: list.length };
}

async function check() {
  if (state.exporting || !state.source) return;
  const my = ++runId;
  state.result = null;
  lockLaterSteps();
  setStep("step3");
  showCheck('<div class="verdict busy">Đang đọc thư mục…</div>');

  let folder;
  try {
    folder = await readFolder();
  } catch {
    if (my !== runId) return;
    showCheck('<div class="verdict bad">Không đọc được thư mục khóa. Hãy bấm Chọn thư mục khóa và chọn lại.</div>');
    showBar('<span class="bad">Không đọc được thư mục khóa</span>');
    return;
  }
  if (my !== runId) return;
  const nVideo = folder.filter((f) => VIDEO_EXT.test(f.name)).length;
  $("folderStatus").textContent = `${state.folderName} (${nVideo} video)`;
  $("folderStatus").className = "status ok";

  const ex = await pickExcel(folder).catch((e) => ({ error: e }));
  if (my !== runId) return;
  $("excelRow").hidden = false;
  const noExcel = (msg, bar) => {
    showCheck(msg);
    showBar(bar);
    showFolderPopups(folder);
  };
  if (ex.error || !ex.file) {
    $("excelStatus").textContent = ex.error ? "Không đọc được file Excel đã chọn" : "Chưa có file Excel trong thư mục";
    $("excelStatus").className = "status";
    if (ex.error) return noExcel('<div class="verdict bad">Không đọc được file Excel đã chọn. Hãy bấm "Chọn file Excel khác" và chọn lại.</div>', '<span class="bad">Không đọc được file Excel</span>');
    return noExcel(`<div class="verdict busy">Chưa có file Excel trong thư mục khóa. Bạn vẫn đặt pop-up được ở bước 2.
      <a href="./assets/Mau_nhap_lieu_khoa_hoc.xlsx" download>Tải file Excel mẫu</a>, lưu vào thư mục khóa, điền rồi bấm Kiểm tra lại.</div>`,
      `📄 Chưa có file Excel · đọc lúc ${now()}`);
  }
  const name = ex.chosen ? ex.file.name : ex.name;
  $("excelStatus").textContent = `File Excel: ${name}` + (ex.count > 1 ? ` (thư mục có ${ex.count} file Excel, chọn file khác ở đây:)` : "");
  $("excelStatus").className = "status ok";

  let sheets;
  try {
    sheets = readXlsx(await ex.file.arrayBuffer());
  } catch (e) {
    if (my !== runId) return;
    const stale = e.name === "NotReadableError" || e.name === "NotFoundError";
    const msg = stale
      ? (state.source.kind === "input" || (ex.chosen && !state.excelOverride.handle)
        ? "Không đọc được file Excel. Nếu bạn vừa sửa và lưu file, hãy chọn lại thư mục khóa (trình duyệt này không tự đọc lại được)."
        : "Không đọc được file Excel. Nếu file đang mở trong Excel, hãy lưu lại rồi bấm Kiểm tra lại.")
      : e.message || "Không đọc được file Excel.";
    return noExcel(`<div class="verdict bad">${esc(msg)}</div>`, `📄 <b>${esc(name)}</b> · <span class="bad">không đọc được</span>`);
  }

  // Lần 1: biết cần những video nào; đo thời lượng; lần 2: kiểm tra đầy đủ
  const first = readCourse(sheets, folder, null, state.logo);
  const videoFiles = first.files.filter((f) => f.zipPath.startsWith("videos/"));
  const byPath = new Map(folder.map((f) => [f.path, f]));
  const durations = new Map();
  for (let i = 0; i < videoFiles.length; i++) {
    if (my !== runId) return;
    showCheck(`<div class="verdict busy">Đang đọc thời lượng video ${i + 1}/${videoFiles.length}…</div>`);
    durations.set(videoFiles[i].path, await videoDuration(byPath.get(videoFiles[i].path)));
  }
  if (my !== runId) return;
  const result = readCourse(sheets, folder, durations, state.logo);
  const n = result.errors.length;
  showBar(`📄 <b>${esc(name)}</b> · đọc lúc ${now()} · ${n ? `<span class="bad">${n} lỗi</span>` : '<span class="ok">không có lỗi</span>'}`);
  render(result, folder);
}

function showFolderPopups(folder) {
  setStep("step2");
  renderPopupStep($("popups"), { key: state.folderName, videos: folderVideos(folder), fromFolder: true });
}

function render({ course, errors, warnings, files, totalSize }, folder) {
  if (!course) {
    showCheck(`<div class="verdict bad">${esc(errors[0])}</div>`);
    showFolderPopups(folder);
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
  const again = state.source.kind === "handle" ? "Sửa xong, lưu file rồi bấm Kiểm tra lại." : "Sửa xong, lưu file rồi chọn lại thư mục khóa.";
  let html = errors.length
    ? `<div class="verdict bad">Còn ${errors.length} lỗi cần sửa trong file Excel. ${again}</div>`
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
  setStep("step3", errors.length ? null : "done");
  state.result = errors.length ? null : { course, files, totalSize };

  // Bước 2 dùng được cả khi Excel còn lỗi (đang soạn câu hỏi); bước 4, 5 cần hết lỗi.
  // Excel chưa có video nào thì đặt pop-up theo thứ tự thư mục.
  const urls = new Map(files.map((f) => [f.zipPath, urlOf(f)]));
  if (!course.videos.length) showFolderPopups(folder);
  else {
    const byZip = new Map(files.map((f) => [f.zipPath, f]));
    const videos = course.videos.map((v) => {
      const f = byZip.get(v.src);
      return { title: v.title, path: f ? f.path : v.src, url: f ? urls.get(v.src) : null, file: v.src.slice(7) };
    });
    setStep("step2");
    renderPopupStep($("popups"), {
      key: state.folderName, videos,
      existing: course.popups.map((p) => ({ path: videos[p.video].path, time: p.time })),
    });
  }
  if (!errors.length) {
    setStep("step4");
    renderPreviewStep($("preview"), course, urls);
    openExport();
  }
}

function lockLaterSteps() {
  setStep("step4", "locked");
  closePreview($("preview"));
  setStep("step5", "locked");
  $("export").innerHTML = '<p class="note">Sửa hết lỗi ở bước 3 để xuất gói.</p>';
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

function useFolder(source, name) {
  if (state.exporting) return;
  dropUrls();
  state.source = source;
  state.folderName = name;
  state.excelChoice = "";
  state.excelOverride = null;
  check();
}

$("folderBtn").addEventListener("click", async () => {
  if (!window.showDirectoryPicker) return $("folder").click();
  let dir;
  try {
    dir = await window.showDirectoryPicker({ id: "scorm-course", mode: "read" });
  } catch (e) {
    if (e.name !== "AbortError") $("folder").click(); // không mở được hộp chọn thư mục kiểu mới: dùng kiểu cũ
    return;
  }
  useFolder({ kind: "handle", dir }, dir.name);
});

$("folder").addEventListener("change", (e) => {
  const files = [...e.target.files];
  e.target.value = "";
  if (!files.length) return;
  useFolder({ kind: "input", files }, (files[0].webkitRelativePath || "").split("/")[0]);
});

$("recheck").addEventListener("click", () => {
  if (state.source && state.source.kind === "input") $("folder").click();
  else check();
});

$("excelPick").addEventListener("change", (e) => {
  state.excelChoice = e.target.value;
  check();
});

$("excelBtn").addEventListener("click", async () => {
  if (!window.showOpenFilePicker) return $("excel").click();
  try {
    const [handle] = await window.showOpenFilePicker({ types: [{ description: "File Excel", accept: { "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": [".xlsx"] } }] });
    state.excelOverride = { handle };
    check();
  } catch (e) {
    if (e.name !== "AbortError") $("excel").click();
  }
});

$("excel").addEventListener("change", (e) => {
  const file = e.target.files[0];
  e.target.value = ""; // cho phép chọn lại đúng file đó sau khi sửa
  if (!file) return;
  state.excelOverride = { file };
  check();
});

$("logo").addEventListener("change", (e) => {
  state.logo = e.target.files[0] || null;
  $("logoStatus").textContent = state.logo ? state.logo.name : "Không chọn = dùng logo Coteccons có sẵn";
  $("logoStatus").className = "status" + (state.logo ? " ok" : "");
  e.target.value = "";
  check();
});
