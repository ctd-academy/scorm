// Bước 3: phát video, bấm "Đặt pop-up tại đây" để lấy mốc phút:giây, rồi copy bảng dán vào Excel.
// Builder không sửa file Excel của người dùng.

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
export const mmss = (sec) => `${String(Math.floor(sec / 60)).padStart(2, "0")}:${String(Math.floor(sec % 60)).padStart(2, "0")}`;

// Mốc đã đặt, giữ theo mã khóa để chọn lại file Excel (sau khi sửa) không bị mất
const placedBy = new Map();

/**
 * el:      phần tử chứa bước 3
 * course:  course từ readCourse()
 * sources: mảng theo thứ tự video: Blob URL, hoặc null nếu thiếu file
 */
export function renderPopupStep(el, course, sources) {
  const placed = placedBy.get(course.id) || [];
  placedBy.set(course.id, placed);
  const playable = course.videos.map((v, i) => i).filter((i) => sources[i]);
  if (!playable.length) {
    el.innerHTML = '<p class="note">Chưa tìm thấy video nào trong thư mục để đặt pop-up.</p>';
    return;
  }

  el.innerHTML = `
    <p class="note" style="margin-top:0">Chọn video, phát tới chỗ muốn hỏi rồi bấm <b>Đặt pop-up tại đây</b>. Xong bấm <b>Copy bảng</b> và dán vào sheet <b>Câu hỏi</b> ở cột <b>Loại</b> của một dòng trống, rồi điền câu hỏi.</p>
    <div class="placer">
      <div class="placer-video">
        <select id="pvSelect">${playable.map((i) => `<option value="${i}">Video ${i + 1}: ${esc(course.videos[i].title)}</option>`).join("")}</select>
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

  const showVideo = () => {
    const i = +sel.value;
    video.src = sources[i];
    clock.textContent = "00:00";
    const have = course.popups.filter((p) => p.video === i).map((p) => mmss(p.time));
    el.querySelector("#pvExisting").textContent = have.length ? `Pop-up đã có trong Excel cho video này: ${have.join(", ")}` : "Video này chưa có pop-up nào trong Excel.";
  };

  const showList = () => {
    const list = el.querySelector("#pvList");
    placed.sort((a, b) => a.video - b.video || a.time - b.time);
    if (!placed.length) {
      list.innerHTML = '<p class="note">Chưa đặt mốc nào.</p>';
      return;
    }
    list.innerHTML = `<table class="placed"><thead><tr><th>Loại</th><th>Video số</th><th>Mốc thời gian</th><th></th></tr></thead><tbody>${placed
      .map((p, k) => `<tr><td>POPUP</td><td>${p.video + 1}</td><td>${mmss(p.time)}</td><td><button class="del" data-k="${k}" title="Xóa mốc này">✕</button></td></tr>`)
      .join("")}</tbody></table>
      <button class="btn" id="pvCopy">Copy bảng</button>
      <button class="btn btn-ghost" id="pvClear">Xóa hết</button>`;
    list.querySelectorAll(".del").forEach((b) => (b.onclick = () => { placed.splice(+b.dataset.k, 1); showList(); }));
    list.querySelector("#pvClear").onclick = () => { placed.length = 0; showList(); };
    list.querySelector("#pvCopy").onclick = async (e) => {
      // Mỗi dòng: Loại, Video số, Mốc thời gian, cách nhau bằng Tab để dán vào 3 cột liền nhau trong Excel
      const text = placed.map((p) => `POPUP\t${p.video + 1}\t${mmss(p.time)}`).join("\r\n");
      try {
        await navigator.clipboard.writeText(text);
        e.target.textContent = "Đã copy";
      } catch {
        e.target.textContent = "Không copy được";
      }
      setTimeout(() => (e.target.textContent = "Copy bảng"), 1500);
    };
  };

  video.ontimeupdate = video.onseeked = () => (clock.textContent = mmss(video.currentTime));
  sel.onchange = showVideo;
  el.querySelector("#pvAdd").onclick = () => {
    const time = Math.floor(video.currentTime);
    const vno = +sel.value;
    if (!placed.some((p) => p.video === vno && p.time === time)) placed.push({ video: vno, time });
    showList();
  };
  showVideo();
  showList();
}
