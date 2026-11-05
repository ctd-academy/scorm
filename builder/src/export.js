// Bước 5: xuất gói SCORM. Chrome/Edge ghi thẳng xuống ổ cứng (khóa 1,5 GB không giữ trong RAM);
// trình duyệt khác tạo zip trong bộ nhớ nên chỉ xuất được khóa nhỏ.
import { writePackage, memorySink, diskSink } from "./package.js";
import { esc, mb, copyText } from "./util.js";

const MEMORY_LIMIT = 500 * 1024 ** 2;

// Đang xuất thì khóa nút chọn thư mục/Kiểm tra lại (CSS: body.exporting) và hỏi lại khi đóng trang
export const isExporting = () => document.body.classList.contains("exporting");
window.addEventListener("beforeunload", (e) => {
  if (isExporting()) e.preventDefault();
});

/**
 * el:     phần tử chứa bước 5
 * result: { course, files, totalSize } từ readCourse() (đã hết lỗi)
 */
export function renderExportStep(el, { course, files, totalSize }) {
  const tooBig = !window.showSaveFilePicker && totalSize > MEMORY_LIMIT;
  el.innerHTML = tooBig
    ? `<div class="verdict bad">Khóa này ${mb(totalSize)}, trình duyệt bạn đang dùng chỉ xuất được khóa dưới 500 MB. Hãy mở trang này bằng Chrome hoặc Edge.</div>`
    : `<button class="btn" id="exportBtn">Xuất gói SCORM</button>
       <span class="status">Sẽ lưu thành file <b>SCORM_${esc(course.id)}.zip</b></span>
       <div id="exportState"></div>`;
  if (!tooBig) el.querySelector("#exportBtn").onclick = (e) => exportPackage(el, e.target, { course, files, totalSize });
}

export function closeExport(el) {
  el.innerHTML = '<p class="note">Sửa hết lỗi ở bước 3 để xuất gói.</p>';
}

// Toàn bộ file Player (danh sách do scripts/copy-assets.mjs tạo, vì trang web tĩnh không tự liệt kê thư mục được)
async function playerFiles() {
  const list = await (await fetch("./player-files.json")).json();
  return Promise.all(list.map(async (path) => {
    const r = await fetch("./player/" + path);
    if (!r.ok) throw new Error("Không tải được file Player '" + path + "'. Hãy tải lại trang.");
    return { path, data: new Uint8Array(await r.arrayBuffer()) };
  }));
}

async function exportPackage(el, btn, { course, files, totalSize }) {
  const out = el.querySelector("#exportState");
  const name = `SCORM_${course.id}.zip`;
  let writable = null, mem = null;
  if (window.showSaveFilePicker) {
    try {
      const handle = await window.showSaveFilePicker({ suggestedName: name, types: [{ description: "Gói SCORM", accept: { "application/zip": [".zip"] } }] });
      writable = await handle.createWritable();
    } catch (e) {
      if (e.name === "AbortError") return; // người dùng bấm Hủy
      out.innerHTML = `<div class="verdict bad">Không tạo được file: ${esc(e.message)}</div>`;
      return;
    }
  } else {
    mem = memorySink();
  }

  const progress = (done, total) => {
    const pct = total ? Math.min(100, Math.round((done / total) * 100)) : 100;
    out.innerHTML = `<div class="bar"><span style="width:${pct}%"></span></div>
      <p class="note">Đang ghi ${mb(done)} / ${mb(total)} (${pct}%). Đừng đóng trang này.</p>`;
  };
  document.body.classList.add("exporting");
  btn.disabled = true;
  progress(0, totalSize);
  try {
    const size = await writePackage({
      course, files,
      playerFiles: await playerFiles(),
      sink: writable ? diskSink(writable) : mem,
      onProgress: progress,
    });
    if (writable) await writable.close();
    else download(mem.blob(), name);
    showDone(out, course, name, size);
  } catch (e) {
    if (writable) await writable.abort().catch(() => {});
    out.innerHTML = `<div class="verdict bad">Xuất gói không thành công: ${esc(e.message || e)}. Hãy thử lại.</div>`;
  } finally {
    document.body.classList.remove("exporting");
    btn.disabled = false;
  }
}

function download(blob, name) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 60000);
}

// Xuất xong: các thông tin cần copy sang Workday khi tạo khóa
function showDone(out, course, name, size) {
  const total = course.videos.reduce((s, v) => s + v.duration, 0);
  const rows = [
    ["Tên khóa (Course Title)", course.title],
    ["Mã khóa (Course Number)", course.id],
    ["Mô tả ngắn (Description)", course.description],
    ["Tổng thời lượng, phút (Total Course Duration)", String(Math.max(1, Math.ceil(total / 60)))],
  ];
  out.innerHTML = `<div class="verdict ok">Đã lưu ${esc(name)} (${mb(size)}). Đưa file này lên Workday dưới dạng Packaged Content (SCORM).</div>
    <h3>Thông tin để tạo khóa trên Workday</h3>
    <table class="workday"><tbody>${rows.map(([k, v], i) => `<tr><th>${esc(k)}</th><td>${esc(v) || "<i>(trống)</i>"}</td>
      <td><button class="copy" data-i="${i}">Copy</button></td></tr>`).join("")}</tbody></table>`;
  out.querySelectorAll(".copy").forEach((b) => {
    b.onclick = () => copyText(b, rows[b.dataset.i][1], "Copy");
  });
}
