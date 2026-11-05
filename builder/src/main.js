// Trang chính của Builder: 5 bước (chọn thư mục → đặt pop-up → kiểm tra → xem thử → xuất).
// File này chỉ điều phối các bước; phần việc nằm ở:
//   folder.js  đọc thư mục, thời lượng video   course.js  đọc Excel, kiểm tra lỗi
//   popups.js  bước 2   preview.js  bước 4   export.js  bước 5
import "./style.css";
import { readXlsx } from "./xlsx.js";
import { readCourse, formatDuration } from "./course.js";
import { readFolder, urlOf, dropUrls, folderVideos, videoDuration } from "./folder.js";
import { renderPopupStep } from "./popups.js";
import { renderPreviewStep, closePreview } from "./preview.js";
import { renderExportStep, closeExport, isExporting } from "./export.js";
import { VIDEO_EXT, esc, mmss, mb } from "./util.js";

const $ = (id) => document.getElementById(id);

// source: thư mục khóa đang chọn, xem readFolder() trong folder.js
// excelChoice: đường dẫn file Excel đang dùng khi thư mục có nhiều file Excel
// excelOverride: file Excel chọn riêng ({ handle } hoặc { file }), null = tự tìm trong thư mục
// logo: file logo chọn riêng ở bước 1
const state = { source: null, folderName: "", excelChoice: "", excelOverride: null, logo: null };
let runId = 0; // mỗi lần Kiểm tra lại tăng 1; lần kiểm tra cũ còn chạy dở thì tự dừng

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

// ---------------------------------------------------------------- Bước 3: kiểm tra

async function check() {
  if (isExporting() || !state.source) return;
  const my = ++runId;
  lockLaterSteps();
  setStep("step3");
  showCheck('<div class="verdict busy">Đang đọc thư mục…</div>');

  let folder;
  try {
    folder = await readFolder(state.source);
  } catch {
    if (my !== runId) return;
    showCheck('<div class="verdict bad">Không đọc được thư mục khóa. Hãy bấm Chọn thư mục khóa và chọn lại.</div>');
    showBar('<span class="bad">Không đọc được thư mục khóa</span>');
    return;
  }
  if (my !== runId) return;
  const nVideo = folder.filter((f) => VIDEO_EXT.test(f.name)).length;
  const nPdf = folder.filter((f) => /\.pdf$/i.test(f.name)).length;
  $("folderStatus").textContent = `${state.folderName} (${nVideo} video${nPdf ? ` · ${nPdf} tài liệu PDF` : ""})`;
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
  await checkPdfFiles(result);
  if (my !== runId) return;
  const n = result.errors.length;
  showBar(`📄 <b>${esc(name)}</b> · đọc lúc ${now()} · ${n ? `<span class="bad">${n} lỗi</span>` : '<span class="ok">không có lỗi</span>'}`);
  render(result, folder);
}

// Đọc thử đầu mỗi tài liệu: file OneDrive "chỉ trên mạng" chưa tải về, hoặc file đổi đuôi thành .pdf
async function checkPdfFiles(result) {
  for (const f of result.files.filter((f) => f.zipPath.startsWith("docs/"))) {
    let head = "";
    try {
      head = new TextDecoder().decode(await f.file.slice(0, 5).arrayBuffer());
    } catch {
      result.errors.push(`Không đọc được tài liệu '${f.path}'. Nếu thư mục khóa nằm trên OneDrive: chuột phải thư mục > "Always keep on this device", đợi các file hiện dấu tick xanh rồi bấm Kiểm tra lại`);
      continue;
    }
    if (head !== "%PDF-") result.errors.push(`Tài liệu '${f.path}' có đuôi .pdf nhưng không phải file PDF thật. Hãy mở file gốc và xuất lại sang PDF`);
  }
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
  const exam = S.reference
    ? "Khóa Tham khảo: mở bài nào cũng được, tua tự do, không có pop-up và bài kiểm tra. Học viên mở khóa là hoàn thành"
    : course.quiz.length
    ? [`Đạt từ ${S.passScore}%`, `${S.maxAttempts} lượt`,
       S.questionsPerAttempt ? `${S.questionsPerAttempt} câu mỗi lần (rút từ ${course.quiz.length})` : `cả ${course.quiz.length} câu mỗi lần`,
       S.timeLimitMinutes ? `${S.timeLimitMinutes} phút` : "không giới hạn thời gian",
       S.showAnswers ? "hiện đáp án sau khi nộp" : "không hiện đáp án"].join(" · ")
    : "Không có bài kiểm tra: hoàn thành khi xem hết video";

  const popupsOf = (i) => course.popups.filter((p) => p.video === i).length;
  const nChapters = course.videos.reduce((s, v) => s + (v.chapters || []).length, 0);
  const again = state.source.kind === "handle" ? "Sửa xong, lưu file rồi bấm Kiểm tra lại." : "Sửa xong, lưu file rồi chọn lại thư mục khóa.";
  let html = errors.length
    ? `<div class="verdict bad">Còn ${errors.length} lỗi cần sửa trong file Excel. ${again}</div>`
    : `<div class="verdict ok">Không có lỗi. Khóa học sẵn sàng để xuất.</div>`;
  if (errors.length) html += `<h3 class="bad">Lỗi (phải sửa)</h3><ul class="list errors">${errors.map((e) => `<li>${esc(e)}</li>`).join("")}</ul>`;
  if (warnings.length) html += `<h3 class="warn">Lưu ý (không bắt buộc sửa)</h3><ul class="list warnings">${warnings.map((w) => `<li>${esc(w)}</li>`).join("")}</ul>`;

  html += `<h3>Tóm tắt khóa học</h3><div class="summary">
    <div class="wide"><small>Tên khóa</small><b>${esc(course.title)}</b></div>
    <div><small>Mã khóa</small><b>${esc(course.id)}</b></div>
    <div><small>Loại khóa</small><b>${S.reference ? "Tham khảo" : "Bắt buộc"}</b></div>
    <div><small>Dung lượng</small><b>${mb(totalSize)}</b></div>
    <div><small>Số video</small><b>${course.videos.length}</b></div>
    <div><small>Tổng thời lượng</small><b>${formatDuration(total)}</b></div>
    <div><small>Câu pop-up</small><b>${course.popups.length}</b></div>
    <div><small>Câu ngân hàng đề</small><b>${course.quiz.length}</b></div>
    <div><small>Video có tài liệu PDF</small><b>${course.videos.filter((v) => v.docs).length}/${course.videos.length}</b></div>
    <div><small>Số chương</small><b>${nChapters}</b></div>
    <div class="wide" style="grid-column: 1 / -1"><small>${S.reference ? "Luật học" : "Luật bài kiểm tra"}</small><b>${esc(exam)}</b></div>
  </div>`;
  if (course.videos.length) {
    const docsOf = (v) => (v.docs || []).map((d) => esc(d.src.slice(5))).join("<br>") || "–";
    const chaptersOf = (v) => (v.chapters || []).map((c) => `${mmss(c.time)} ${esc(c.title)}`).join("<br>") || "–";
    html += `<table><thead><tr><th>#</th><th>Tên bài</th><th>File video</th><th>Thời lượng</th><th>Pop-up</th><th>Tài liệu</th><th>Chương</th></tr></thead><tbody>${course.videos
      .map((v, i) => `<tr><td>${i + 1}</td><td>${esc(v.title)}</td><td>${esc(v.src.slice(7))}</td><td>${v.duration ? formatDuration(v.duration) : "–"}</td><td>${popupsOf(i)}</td><td>${docsOf(v)}</td><td>${chaptersOf(v)}</td></tr>`)
      .join("")}</tbody></table>`;
  }
  showCheck(html);
  setStep("step3", errors.length ? null : "done");

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
      existingChapters: course.videos.flatMap((v, i) => (v.chapters || []).map((c) => ({ path: videos[i].path, time: c.time }))),
      reference: S.reference,
    });
  }
  if (!errors.length) {
    setStep("step4");
    renderPreviewStep($("preview"), course, urls);
    setStep("step5");
    renderExportStep($("export"), { course, files, totalSize });
  }
}

function lockLaterSteps() {
  setStep("step4", "locked");
  closePreview($("preview"));
  setStep("step5", "locked");
  closeExport($("export"));
}

// ---------------------------------------------------------------- Bước 1: chọn thư mục, Excel, logo

function useFolder(source, name) {
  if (isExporting()) return;
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
