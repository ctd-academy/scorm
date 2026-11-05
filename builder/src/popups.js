// Bước 2: phát video, bấm "Đặt pop-up tại đây" để lấy mốc phút:giây, rồi copy bảng dán vào Excel.
// Chương cũng vậy: gõ tên chương, bấm "Đặt chương tại đây", copy bảng dán vào sheet Chương (đủ cả 3 cột).
// Dùng được cả khi chưa có Excel: khi đó xếp video theo thứ tự thư mục và cho copy danh sách video.
// Builder không sửa file Excel của người dùng.

import { esc, mmss, copyText } from "./util.js";

// Mốc đã đặt theo thư mục khóa: { path (đường dẫn video trong thư mục), time }.
// Lưu theo file video chứ không theo số thứ tự, để sửa Excel (đổi thứ tự bài) không làm lệch mốc.
const placedBy = new Map();
// Chương đã đặt theo thư mục khóa: { path, time, title }
const chaptersBy = new Map();
// Video đang xem và vị trí đang phát, để bấm Kiểm tra lại không bị nhảy về video 1, giây 0
const lastPos = new Map();

/**
 * el:   phần tử chứa bước 2
 * opts: { key:        tên thư mục khóa (giữ mốc khi kiểm tra lại)
 *         videos:     [{ title, path, url, file }] theo đúng thứ tự "Video số"; url null nếu thiếu file
 *         existing:   [{ path, time }] pop-up đã có trong Excel
 *         existingChapters: [{ path, time }] chương đã có trong Excel
 *         reference:  true nếu khóa Tham khảo (không có pop-up: chỉ đặt chương)
 *         fromFolder: true nếu Excel chưa có danh sách video (xếp theo thư mục) }
 */
export function renderPopupStep(el, { key, videos, existing = [], existingChapters = [], reference = false, fromFolder = false }) {
  const placed = placedBy.get(key) || [];
  placedBy.set(key, placed);
  const chapters = chaptersBy.get(key) || [];
  chaptersBy.set(key, chapters);
  const playable = videos.map((v, i) => i).filter((i) => videos[i].url);
  if (!playable.length) {
    el.innerHTML = '<p class="note">Chưa tìm thấy video nào trong thư mục để đặt pop-up, chương.</p>';
    return;
  }
  const indexOf = (path) => videos.findIndex((v) => v.path === path);

  const folderNote = fromFolder
    ? `<div class="hint"><b>Excel chưa có danh sách video</b>, nên Builder xếp video theo thứ tự thư mục.
        Bấm <b>Copy danh sách video</b> rồi dán vào sheet <b>Video</b> ở ô <b>A3</b>, để "Video số" của các mốc pop-up, chương khớp với Excel.
        Đổi thứ tự bài trong Excel cũng được: bấm Kiểm tra lại ở bước 3, số video của các mốc sẽ tự đổi theo.
        <div style="margin-top:8px"><button class="btn btn-ghost" id="pvCopyVideos">Copy danh sách video</button></div></div>`
    : "";

  el.innerHTML = `${folderNote}
    ${reference ? `<p class="note" style="margin-top:0">Khóa <b>Tham khảo</b> không có pop-up. Bạn có thể đặt <b>chương</b> để học viên bấm nhảy tới đúng đoạn cần xem.</p>`
      : `<p class="note" style="margin-top:0"><b>Pop-up:</b> chọn video, phát tới chỗ muốn hỏi rồi bấm <b>Đặt pop-up tại đây</b>. Xong bấm <b>Copy bảng pop-up</b> và dán vào sheet <b>Câu hỏi</b> ở cột <b>Loại</b> của một dòng trống, rồi điền câu hỏi.</p>`}
    <p class="note"><b>Chương</b> (không bắt buộc): phát tới đầu chương, gõ tên chương rồi bấm <b>Đặt chương tại đây</b>. Xong bấm <b>Copy bảng chương</b> và dán vào sheet <b>Chương</b> ở cột <b>Video số</b> của một dòng trống: đủ cả 3 cột, không phải điền thêm.</p>
    <div class="placer">
      <div class="placer-video">
        <select id="pvSelect">${playable.map((i) => `<option value="${i}">Video ${i + 1}: ${esc(videos[i].title)}</option>`).join("")}</select>
        <video id="pvVideo" controls preload="metadata"></video>
        <div class="placer-bar">
          <span class="clock" id="pvClock">00:00</span>
          ${reference ? "" : '<button class="btn" id="pvAdd">Đặt pop-up tại đây</button>'}
        </div>
        <div class="placer-bar">
          <input id="chName" class="ch-name" placeholder="Tên chương, ví dụ: Cài đặt phần mềm" maxlength="200">
          <button class="btn" id="chAdd">Đặt chương tại đây</button>
        </div>
        <p class="note" id="pvExisting"></p>
      </div>
      <div class="placer-list">
        ${reference ? "" : '<h3 style="margin-top:0">Pop-up đã đặt</h3><div id="pvList"></div>'}
        <h3${reference ? ' style="margin-top:0"' : ""}>Chương đã đặt</h3>
        <div id="chList"></div>
      </div>
    </div>`;

  const sel = el.querySelector("#pvSelect");
  const video = el.querySelector("#pvVideo");
  const clock = el.querySelector("#pvClock");

  if (fromFolder) {
    // Cột STT, Tên bài, Tên file video của sheet Video
    const rows = videos.map((v, i) => `${i + 1}\t${v.title}\t${v.file}`).join("\r\n");
    el.querySelector("#pvCopyVideos").onclick = (e) => copyText(e.target, rows, "Copy danh sách video");
  }

  const showVideo = (at = 0) => {
    const i = +sel.value;
    video.src = videos[i].url;
    clock.textContent = mmss(at);
    if (at) video.addEventListener("loadedmetadata", () => (video.currentTime = at), { once: true });
    const have = existing.filter((p) => p.path === videos[i].path).map((p) => mmss(p.time));
    const haveCh = existingChapters.filter((c) => c.path === videos[i].path).map((c) => mmss(c.time));
    el.querySelector("#pvExisting").textContent = fromFolder ? "" : [
      reference ? "" : have.length ? `Pop-up đã có trong Excel cho video này: ${have.join(", ")}.` : "Video này chưa có pop-up nào trong Excel.",
      haveCh.length ? `Chương đã có trong Excel: ${haveCh.join(", ")}.` : "Chưa có chương nào trong Excel.",
    ].filter(Boolean).join(" ");
  };

  const showList = () => {
    showChapters();
    const list = el.querySelector("#pvList");
    if (!list) return; // khóa Tham khảo: không có pop-up
    // Chỉ hiện mốc của video đang có trong danh sách; mốc của video khác vẫn giữ lại
    const shown = placed
      .map((p) => ({ p, i: indexOf(p.path) }))
      .filter((x) => x.i >= 0)
      .sort((a, b) => a.i - b.i || a.p.time - b.p.time);
    if (!shown.length) {
      list.innerHTML = '<p class="note">Chưa đặt mốc nào.</p>';
      return;
    }
    list.innerHTML = `<table class="placed"><thead><tr><th>Loại</th><th>Video số</th><th>Mốc thời gian</th><th></th></tr></thead><tbody>${shown
      .map((x, k) => `<tr><td>POPUP</td><td>${x.i + 1}</td><td>${mmss(x.p.time)}</td><td><button class="del" data-k="${k}" title="Xóa mốc này">✕</button></td></tr>`)
      .join("")}</tbody></table>
      <button class="btn" id="pvCopy">Copy bảng pop-up</button>
      <button class="btn btn-ghost" id="pvClear">Xóa hết</button>`;
    const remove = (p) => placed.splice(placed.indexOf(p), 1);
    list.querySelectorAll(".del").forEach((b) => (b.onclick = () => { remove(shown[+b.dataset.k].p); showList(); }));
    list.querySelector("#pvClear").onclick = () => { shown.forEach((x) => remove(x.p)); showList(); };
    // Mỗi dòng: Loại, Video số, Mốc thời gian, cách nhau bằng Tab để dán vào 3 cột liền nhau trong Excel
    list.querySelector("#pvCopy").onclick = (e) =>
      copyText(e.target, shown.map((x) => `POPUP\t${x.i + 1}\t${mmss(x.p.time)}`).join("\r\n"), "Copy bảng pop-up");
  };

  function showChapters() {
    const list = el.querySelector("#chList");
    const shown = chapters
      .map((c) => ({ c, i: indexOf(c.path) }))
      .filter((x) => x.i >= 0)
      .sort((a, b) => a.i - b.i || a.c.time - b.c.time);
    if (!shown.length) {
      list.innerHTML = '<p class="note">Chưa đặt chương nào.</p>';
      return;
    }
    list.innerHTML = `<table class="placed"><thead><tr><th>Video số</th><th>Mốc thời gian</th><th>Tên chương</th><th></th></tr></thead><tbody>${shown
      .map((x, k) => `<tr><td>${x.i + 1}</td><td>${mmss(x.c.time)}</td><td><input class="ch-title" data-k="${k}" value="${esc(x.c.title)}" placeholder="(chưa có tên)"></td><td><button class="del" data-k="${k}" title="Xóa chương này">✕</button></td></tr>`)
      .join("")}</tbody></table>
      <button class="btn" id="chCopy">Copy bảng chương</button>
      <button class="btn btn-ghost" id="chClear">Xóa hết</button>`;
    const remove = (c) => chapters.splice(chapters.indexOf(c), 1);
    // Sửa tên ngay trong bảng (không vẽ lại để không mất chỗ đang gõ)
    list.querySelectorAll(".ch-title").forEach((inp) => (inp.oninput = () => (shown[+inp.dataset.k].c.title = inp.value.trim())));
    list.querySelectorAll(".del").forEach((b) => (b.onclick = () => { remove(shown[+b.dataset.k].c); showChapters(); }));
    list.querySelector("#chClear").onclick = () => { shown.forEach((x) => remove(x.c)); showChapters(); };
    // Mỗi dòng: Video số, Mốc thời gian, Tên chương: dán vào 3 cột A, B, C của sheet Chương
    list.querySelector("#chCopy").onclick = (e) =>
      copyText(e.target, shown.map((x) => `${x.i + 1}\t${mmss(x.c.time)}\t${x.c.title.replace(/[\t\r\n]+/g, " ")}`).join("\r\n"), "Copy bảng chương");
  }

  video.ontimeupdate = video.onseeked = () => {
    clock.textContent = mmss(video.currentTime);
    lastPos.set(key, { path: videos[+sel.value].path, time: video.currentTime });
  };
  sel.onchange = () => {
    lastPos.set(key, { path: videos[+sel.value].path, time: 0 });
    showVideo();
  };
  if (!reference) el.querySelector("#pvAdd").onclick = () => {
    const time = Math.floor(video.currentTime);
    const path = videos[+sel.value].path;
    if (!placed.some((p) => p.path === path && p.time === time)) placed.push({ path, time });
    showList();
  };
  const name = el.querySelector("#chName");
  const addChapter = () => {
    const time = Math.floor(video.currentTime);
    const path = videos[+sel.value].path;
    const title = name.value.trim();
    const same = chapters.find((c) => c.path === path && c.time === time);
    if (same) same.title = title || same.title; // cùng giây: đổi tên, không thêm trùng
    else chapters.push({ path, time, title });
    name.value = "";
    name.focus();
    showChapters();
  };
  el.querySelector("#chAdd").onclick = addChapter;
  name.onkeydown = (e) => { if (e.key === "Enter") addChapter(); };
  const last = lastPos.get(key);
  const back = last ? indexOf(last.path) : -1;
  if (back >= 0 && videos[back].url) sel.value = String(back);
  showVideo(back >= 0 && videos[back].url ? last.time : 0);
  showList();
}
