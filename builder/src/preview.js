// Bước 4: chạy Player thật trong khung, video lấy thẳng từ máy người dùng (Blob URL).
// player/preview.html (do scripts/copy-assets.mjs tạo từ player/index.html) đọc dữ liệu khóa từ
// window.__previewCourse của trang này, nên nút "Xóa tiến độ" (tải lại khung) vẫn chạy đúng.

/**
 * el:      phần tử chứa bước 4
 * course:  course từ readCourse()
 * urls:    Map zipPath -> Blob URL (video, logo)
 */
export function renderPreviewStep(el, course, urls) {
  el.innerHTML = `<button class="btn" id="pvOpen">Mở xem thử</button>
    <span class="status">Chạy khóa học đúng như học viên sẽ thấy trên Workday.</span>
    <div id="pvFrameWrap"></div>`;
  el.querySelector("#pvOpen").onclick = () => {
    const c = structuredClone(course);
    c.videos.forEach((v) => (v.src = urls.get(v.src) || v.src));
    if (c.logo) c.logo = urls.get(c.logo) || null;
    window.__previewCourse = c;
    // mỗi lần mở là học từ đầu (LMS giả lập lưu tiến độ trong trình duyệt)
    try { localStorage.removeItem("ctd-scorm-preview-" + c.id); } catch {}
    el.querySelector("#pvFrameWrap").innerHTML = `
      <div class="pv-tools"><button class="btn btn-ghost" id="pvFull">Toàn màn hình</button>
        <button class="btn btn-ghost" id="pvClose">Đóng xem thử</button></div>
      <iframe id="pvFrame" class="pv-frame" src="./player/preview.html" allow="fullscreen" allowfullscreen title="Xem thử khóa học"></iframe>`;
    el.querySelector("#pvFull").onclick = () => el.querySelector("#pvFrame").requestFullscreen?.();
    el.querySelector("#pvClose").onclick = () => (el.querySelector("#pvFrameWrap").innerHTML = "");
    el.querySelector("#pvOpen").textContent = "Mở lại từ đầu";
  };
}

export function closePreview(el) {
  el.innerHTML = '<p class="note">Sửa hết lỗi ở bước 2 để xem thử.</p>';
}
