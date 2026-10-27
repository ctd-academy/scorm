// Đọc dữ liệu khóa học từ Excel + thư mục video và kiểm tra lỗi.
// Quy tắc đọc phải giống read_excel() trong tools/build_scorm.py (bản tham chiếu).
// Không đụng tới trình duyệt ở đây để chạy test được bằng Node.

const LETTERS = "ABCD";
const SHEETS = { info: "Thông tin khóa", video: "Video", question: "Câu hỏi" };
export const DEFAULT_CONTACT =
  "Bạn đã dùng hết lượt làm bài. Vui lòng liên hệ L&OD: Mr. Minh (minhvt02@coteccons.vn) hoặc cta@coteccons.vn để được hỗ trợ đăng ký lại.";
const VIDEO_EXT = /\.(mp4|m4v|mov|webm|avi|mkv|wmv|flv|mpe?g)$/i;
export const SIZE_WARN = 3.5 * 1024 ** 3; // Workday giới hạn 4 GB mỗi gói
const POPUP_GAP = 60;

export function cell(v) {
  if (v === undefined || v === null) return "";
  return String(v).normalize("NFC").trim();
}

// "01:30" -> 90 giây. Nếu Excel đã tự đổi thành giờ (số thập phân của ngày),
// hiểu lại giờ:phút thành phút:giây như người nhập muốn (giống build_scorm.py).
export function parseTime(v) {
  if (typeof v === "number") {
    if (v < 0 || v >= 1) return null;
    const minutes = Math.round(v * 1440);
    return Math.floor(minutes / 60) * 60 + (minutes % 60);
  }
  const m = cell(v).match(/^(?:(\d+):)?(\d{1,3}):(\d{1,2})$/);
  if (!m) return null;
  return (parseInt(m[1] || "0", 10) * 3600) + parseInt(m[2], 10) * 60 + parseInt(m[3], 10);
}

export function formatDuration(sec) {
  sec = Math.round(sec);
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
  return h ? `${h} giờ ${m} phút` : m ? `${m} phút ${s} giây` : `${s} giây`;
}

function mmss(sec) {
  return `${String(Math.floor(sec / 60)).padStart(2, "0")}:${String(sec % 60).padStart(2, "0")}`;
}

function levenshtein(a, b) {
  const d = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = d[0];
    d[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = d[j];
      d[j] = Math.min(d[j] + 1, d[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = tmp;
    }
  }
  return d[b.length];
}

function similar(name, candidates) {
  const n = name.toLowerCase();
  let best = null, bestD = Infinity;
  for (const c of candidates) {
    const d = levenshtein(n, c.toLowerCase());
    if (d < bestD) { best = c; bestD = d; }
  }
  return best && bestD <= Math.max(3, Math.floor(n.length * 0.3)) ? best : null;
}

/**
 * sheets:    kết quả readXlsx()
 * folder:    { root: [{name, size}], videos: [{name, size}] }  file ở gốc thư mục khóa và trong videos/
 * durations: Map tên file -> giây (null nếu trình duyệt không mở được); bỏ qua nếu chưa đo
 * logoFile:  { name, size } nếu người dùng chọn riêng file logo
 *
 * Trả về { course, errors, warnings, files } với files: [{ zipPath, file }] cần đưa vào gói.
 */
export function readCourse(sheets, folder, durations = null, logoFile = null) {
  const errors = [];
  const warnings = [];
  const at = (sheet, r, msg) => `Sheet ${sheet}, dòng ${r}: ${msg}`;

  const missing = Object.values(SHEETS).filter((s) => !sheets[s]);
  if (missing.length) {
    errors.push(`File Excel thiếu sheet ${missing.map((s) => `'${s}'`).join(", ")}. Hãy dùng đúng file mẫu.`);
    return { course: null, errors, warnings, files: [] };
  }

  // ---- Thông tin khóa (dòng 2–11: cột A là mục, cột B là giá trị)
  const info = {}, infoRow = {};
  for (let r = 2; r <= 11; r++) {
    const row = sheets[SHEETS.info][r] || [];
    if (cell(row[1])) { info[cell(row[1])] = row[2]; infoRow[cell(row[1])] = r; }
  }
  const num = (key, def, min, max) => {
    const raw = cell(info[key]);
    if (!raw) return def;
    const n = Math.trunc(Number(raw.replace(",", ".")));
    if (!Number.isFinite(n) || n < min || n > max) {
      errors.push(at(SHEETS.info, infoRow[key], `'${key}' phải là số từ ${min} đến ${max}, đang là '${raw}'`));
      return def;
    }
    return n;
  };

  const rawId = cell(info["Mã khóa"]);
  if (!rawId) errors.push(at(SHEETS.info, infoRow["Mã khóa"] || 2, "chưa điền Mã khóa"));
  else if (!/^[A-Za-z0-9_-]+$/.test(rawId))
    errors.push(at(SHEETS.info, infoRow["Mã khóa"], `Mã khóa '${rawId}' chỉ được dùng chữ không dấu, số, gạch ngang (-) và gạch dưới (_), không có khoảng trắng`));
  const id = rawId.replace(/[^A-Za-z0-9_-]/g, "") || "KHOA";
  const title = cell(info["Tên khóa"]);
  if (!title) errors.push(at(SHEETS.info, infoRow["Tên khóa"] || 3, "chưa điền Tên khóa"));

  const settings = {
    passScore: num("Điểm đạt (%)", 80, 0, 100),
    maxAttempts: num("Số lượt làm bài", 3, 1, 20),
    questionsPerAttempt: num("Số câu mỗi lần thi", 0, 0, 500),
    timeLimitMinutes: num("Thời gian làm bài (phút)", 0, 0, 600),
    showAnswers: ["có", "co", "yes", "x"].includes(cell(info["Hiện đáp án sau khi nộp"]).toLowerCase()),
    maxSpeed: 2,
    contact: cell(info["Nội dung liên hệ khi hết lượt"]) || DEFAULT_CONTACT,
  };

  const files = [];
  const findIn = (list, name) => list.find((f) => f.name === name) || list.find((f) => f.name.toLowerCase() === name.toLowerCase());

  // ---- Logo: chọn riêng, hoặc tên file trong Excel nằm ở gốc thư mục khóa
  let logo = cell(info["File logo (tùy chọn)"]);
  let logoSrc = null;
  if (logoFile && (!logo || logo.toLowerCase() === logoFile.name.toLowerCase())) {
    logo = logoFile.name;
    logoSrc = logoFile;
  } else if (logo) {
    logoSrc = findIn(folder.root, logo);
    if (!logoSrc)
      errors.push(at(SHEETS.info, infoRow["File logo (tùy chọn)"], `không tìm thấy file logo '${logo}' trong thư mục bạn chọn. Đặt logo vào thư mục khóa, hoặc chọn file logo ở bước 1`));
  }
  if (logoSrc) files.push({ zipPath: "assets/" + logo, file: logoSrc });

  // ---- Video (bỏ qua dòng có STT bắt đầu bằng "(Ví dụ)")
  const allVideos = [...folder.root, ...folder.videos].filter((f) => VIDEO_EXT.test(f.name));
  const videos = [];
  const videoRows = [];
  const used = new Set();
  const vrows = sheets[SHEETS.video];
  for (let r = 2; r < vrows.length; r++) {
    const row = vrows[r];
    if (!row || !cell(row[3]) || cell(row[1]).startsWith("(Ví dụ)")) continue;
    const fname = cell(row[3]);
    const src = findIn(folder.root, fname) || findIn(folder.videos, fname);
    if (!src) {
      const hint = similar(fname, allVideos.map((f) => f.name));
      errors.push(at(SHEETS.video, r, `không tìm thấy video '${fname}' trong thư mục bạn chọn` + (hint ? `. Có phải ý bạn là '${hint}'?` : "")));
    } else {
      used.add(src);
      files.push({ zipPath: "videos/" + fname, file: src });
      if (!/\.mp4$/i.test(fname)) warnings.push(at(SHEETS.video, r, `video '${fname}' không phải .mp4, có thể không phát được trên mọi máy. Nên xuất lại dạng .mp4`));
      if (durations && durations.has(src.name) && !durations.get(src.name))
        errors.push(at(SHEETS.video, r, `trình duyệt không mở được video '${fname}'. Hãy xuất lại video dạng .mp4 (H.264)`));
    }
    videos.push({ title: cell(row[2]) || `Bài ${videos.length + 1}`, file: fname, src });
    videoRows.push(r);
  }
  if (!videos.length && !errors.some((e) => e.includes(SHEETS.video)))
    errors.push(`Sheet ${SHEETS.video}: chưa có video nào. Nhập dữ liệu từ dòng 3`);
  const unused = allVideos.filter((f) => !used.has(f));
  if (videos.length && unused.length)
    warnings.push(`Thư mục có ${unused.length} video không dùng trong Excel: ${unused.slice(0, 5).map((f) => `'${f.name}'`).join(", ")}${unused.length > 5 ? "…" : ""}`);

  const duration = (v) => (durations && v.src ? Math.round(durations.get(v.src.name) || 0) : 0);

  // ---- Câu hỏi (bỏ qua dòng có câu hỏi bắt đầu bằng "(Ví dụ)")
  const popups = [], quiz = [], popupRows = [];
  const qrows = sheets[SHEETS.question];
  for (let r = 2; r < qrows.length; r++) {
    const row = qrows[r];
    if (!row || !cell(row[4]) || cell(row[4]).startsWith("(Ví dụ)")) continue;
    const kind = cell(row[1]).toUpperCase();
    const opts = [5, 6, 7, 8].map((c) => cell(row[c]));
    while (opts.length && !opts[opts.length - 1]) opts.pop();
    if (opts.length < 2 || opts.includes("")) {
      errors.push(at(SHEETS.question, r, "cần ít nhất phương án A, B và không bỏ trống phương án ở giữa"));
      continue;
    }
    const ans = cell(row[9]).toUpperCase();
    if (!LETTERS.slice(0, opts.length).includes(ans) || ans.length !== 1) {
      errors.push(at(SHEETS.question, r, ans ? `đáp án đúng '${ans}' không hợp lệ, phải là ${LETTERS.slice(0, opts.length).split("").join(", ")}` : "chưa điền đáp án đúng"));
      continue;
    }
    const q = { q: cell(row[4]), options: opts, answer: LETTERS.indexOf(ans), explain: cell(row[10]) };
    if (kind === "POPUP") {
      const vno = Math.trunc(Number(cell(row[2])));
      const t = parseTime(row[3]);
      if (!(vno >= 1 && vno <= videos.length)) {
        errors.push(at(SHEETS.question, r, `'Video số' phải từ 1 đến ${videos.length}, đang là '${cell(row[2])}'`));
        continue;
      }
      if (t === null) {
        errors.push(at(SHEETS.question, r, `mốc thời gian '${cell(row[3])}' phải có dạng phút:giây, ví dụ 01:30`));
        continue;
      }
      const d = duration(videos[vno - 1]);
      if (d && t >= d) {
        errors.push(at(SHEETS.question, r, `mốc ${mmss(t)} vượt quá thời lượng video ${vno} (${mmss(d)})`));
        continue;
      }
      popups.push({ ...q, video: vno - 1, time: t });
      popupRows.push(r);
    } else if (kind === "CUOI KHOA" || kind === "CUỐI KHÓA") {
      quiz.push(q);
    } else {
      errors.push(at(SHEETS.question, r, `loại '${cell(row[1])}' phải là POPUP hoặc CUOI KHOA`));
    }
  }

  if (quiz.length && settings.questionsPerAttempt > quiz.length)
    errors.push(at(SHEETS.info, infoRow["Số câu mỗi lần thi"], `số câu mỗi lần thi (${settings.questionsPerAttempt}) nhiều hơn ngân hàng đề (${quiz.length} câu)`));

  // Cảnh báo pop-up quá sát nhau trong cùng video
  const order = popups.map((p, i) => ({ p, r: popupRows[i] })).sort((a, b) => a.p.video - b.p.video || a.p.time - b.p.time);
  for (let i = 1; i < order.length; i++) {
    const a = order[i - 1], b = order[i];
    if (a.p.video === b.p.video && b.p.time - a.p.time < POPUP_GAP)
      warnings.push(at(SHEETS.question, b.r, `pop-up ${mmss(b.p.time)} chỉ cách pop-up ${mmss(a.p.time)} (dòng ${a.r}) ${b.p.time - a.p.time} giây. Nên cách nhau ít nhất 1 phút`));
  }

  const totalSize = files.reduce((s, f) => s + (f.file.size || 0), 0);
  if (totalSize > SIZE_WARN)
    warnings.push(`Tổng dung lượng ${(totalSize / 1024 ** 3).toFixed(2)} GB, gần giới hạn 4 GB của Workday. Nên nén video nhỏ hơn (720p)`);

  const course = {
    id,
    title: title || id,
    description: cell(info["Mô tả ngắn"]),
    logo: logoSrc ? "assets/" + logo : null,
    settings,
    videos: videos.map((v) => ({ title: v.title, src: "videos/" + v.file, duration: duration(v) })),
    popups,
    quiz,
  };
  return { course, errors, warnings, files, totalSize };
}
