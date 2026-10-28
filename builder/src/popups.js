// Bước 2: phát video, bấm "Đặt pop-up tại đây" để lấy mốc phút:giây, rồi copy bảng dán vào Excel.
// Dùng được cả khi chưa có Excel: khi đó xếp video theo thứ tự thư mục và cho copy danh sách video.
// Builder không sửa file Excel của người dùng.

import { esc, mmss } from "./util.js";

// Mốc đã đặt theo thư mục khóa: { path (đường dẫn video trong thư mục), time }.
// Lưu theo file video chứ không theo số thứ tự, để sửa Excel (đổi thứ tự bài) không làm lệch mốc.
const placedBy = new Map();
// Video đang xem và vị trí đang phát, để bấm Kiểm tra lại không bị nhảy về video 1, giây 0
const lastPos = new Map();

async function copyText(btn, text, label) {
  try {
    await navigator.clipboard.writeText(text);
    btn.textContent = "Đã copy";
  } catch {
    btn.textContent = "Không copy được";
  }
  setTimeout(() => (btn.textContent = label), 1500);
}

/**
 * el:   phần tử chứa bước 2
 * opts: { key:        tên thư mục khóa (giữ mốc khi kiểm tra lại)
 *         videos:     [{ title, path, url, file }] theo đúng thứ tự "Video số"; url null nếu thiếu file
 *         existing:   [{ path, time }] pop-up đã có trong Excel
 *         fromFolder: true nếu Excel chưa có danh sách video (xếp theo thư mục) }
 */
export function renderPopupStep(el, { key, videos, existing = [], fromFolder = false }) {
  const placed = placedBy.get(key) || [];
  placedBy.set(key, placed);
  const playable = videos.map((v, i) => i).filter((i) => videos[i].url);
  if (!playable.length) {
    el.innerHTML = '<p class="note">Chưa tìm thấy video nào trong thư mục để đặt pop-up.</p>';
    return;
  }
  const indexOf = (path) => videos.findIndex((v) => v.path === path);

  const folderNote = fromFolder
    ? `<div class="hint"><b>Excel chưa có danh sách video</b>, nên Builder xếp video theo thứ tự thư mục.
        Bấm <b>Copy danh sách video</b> rồi dán vào sheet <b>Video</b> ở ô <b>A3</b>, để "Video số" của các mốc pop-up khớp với Excel.
        Đổi thứ tự bài trong Excel cũng được: bấm Kiểm tra lại ở bước 3, số video của các mốc sẽ tự đổi theo.
        <div style="margin-top:8px"><button class="btn btn-ghost" id="pvCopyVideos">Copy danh sách video</button></div></div>`
    : "";

  el.innerHTML = `${folderNote}
    <p class="note" style="margin-top:0">Chọn video, phát tới chỗ muốn hỏi rồi bấm <b>Đặt pop-up tại đây</b>. Xong bấm <b>Copy bảng</b> và dán vào sheet <b>Câu hỏi</b> ở cột <b>Loại</b> của một dòng trống, rồi điền câu hỏi.</p>
    <div class="placer">
      <div class="placer-video">
        <select id="pvSelect">${playable.map((i) => `<option value="${i}">Video ${i + 1}: ${esc(videos[i].title)}</option>`).join("")}</select>
        <video id="pvVideo" controls preload="metadata"></video>
        <div class="placer-bar">
          <span class="clock" id="pvClock">00:00</span>
          <button class="btn" id="pvAdd">Đặt pop-up tại đây</button>
        </div>
        <p class="note" id="pvExisting"></p>
      </div>
      <div class="placer-list">
        <h3 style="margin-top:0">Mốc đã đặt</h3>
        <div id="pvList"></div>
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
    el.querySelector("#pvExisting").textContent = fromFolder ? ""
      : have.length ? `Pop-up đã có trong Excel cho video này: ${have.join(", ")}` : "Video này chưa có pop-up nào trong Excel.";
  };

  const showList = () => {
    const list = el.querySelector("#pvList");
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
      <button class="btn" id="pvCopy">Copy bảng</button>
      <button class="btn btn-ghost" id="pvClear">Xóa hết</button>`;
    const remove = (p) => placed.splice(placed.indexOf(p), 1);
    list.querySelectorAll(".del").forEach((b) => (b.onclick = () => { remove(shown[+b.dataset.k].p); showList(); }));
    list.querySelector("#pvClear").onclick = () => { shown.forEach((x) => remove(x.p)); showList(); };
    // Mỗi dòng: Loại, Video số, Mốc thời gian, cách nhau bằng Tab để dán vào 3 cột liền nhau trong Excel
    list.querySelector("#pvCopy").onclick = (e) =>
      copyText(e.target, shown.map((x) => `POPUP\t${x.i + 1}\t${mmss(x.p.time)}`).join("\r\n"), "Copy bảng");
  };

  video.ontimeupdate = video.onseeked = () => {
    clock.textContent = mmss(video.currentTime);
    lastPos.set(key, { path: videos[+sel.value].path, time: video.currentTime });
  };
  sel.onchange = () => {
    lastPos.set(key, { path: videos[+sel.value].path, time: 0 });
    showVideo();
  };
  el.querySelector("#pvAdd").onclick = () => {
    const time = Math.floor(video.currentTime);
    const path = videos[+sel.value].path;
    if (!placed.some((p) => p.path === path && p.time === time)) placed.push({ path, time });
    showList();
  };
  const last = lastPos.get(key);
  const back = last ? indexOf(last.path) : -1;
  if (back >= 0 && videos[back].url) sel.value = String(back);
  showVideo(back >= 0 && videos[back].url ? last.time : 0);
  showList();
}
