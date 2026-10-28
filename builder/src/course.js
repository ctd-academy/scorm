// Đọc dữ liệu khóa học từ Excel + thư mục video và kiểm tra lỗi.
// Dùng chung cho Builder web và lệnh đóng gói scripts/build-scorm.mjs.
// Không đụng tới trình duyệt ở đây để chạy test được bằng Node.
import defaults from "./defaults.json" with { type: "json" };
import { VIDEO_EXT, mmss } from "./util.js";

const LETTERS = "ABCD";
const SHEETS = { info: "Thông tin khóa", video: "Video", question: "Câu hỏi" };
export const DEFAULT_CONTACT = defaults.contact; // sửa trong defaults.json
export const SIZE_WARN = 3.5 * 1024 ** 3; // Workday giới hạn 4 GB mỗi gói
const SIZE_LIMIT = 4 * 1024 ** 3 - 64 * 1024 ** 2; // chừa chỗ cho Player + header zip
const POPUP_GAP = 60;
const DOC_WARN = 50 * 1024 ** 2; // tài liệu nặng quá thì học viên mở chậm

export function cell(v) {
  if (v === undefined || v === null) return "";
  return String(v).normalize("NFC").trim();
}

// "01:30" -> 90 giây. Nếu Excel đã tự đổi thành giờ (số thập phân của ngày),
// hiểu lại giờ:phút thành phút:giây như người nhập muốn.
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
 * folder:    [{ path, name, size, file }] mọi file trong thư mục khóa (kể cả thư mục con);
 *            path tính từ thư mục khóa, dùng "/", ví dụ "01. Tong quan/gioi-thieu.mp4"
 * durations: Map path -> giây (null nếu trình duyệt không mở được); bỏ qua nếu chưa đo
 * logoFile:  File/Blob có name, size nếu người dùng chọn riêng file logo
 *
 * Trả về { course, errors, warnings, files } với files: [{ zipPath, path, file }] cần đưa vào gói.
 */
export function readCourse(sheets, folder, durations = null, logoFile = null) {
  const errors = [];
  const warnings = [];
  const at = (sheet, r, msg) => `Sheet ${sheet}, dòng ${r}: ${msg}`;

  // Tìm sheet theo tên, không phân biệt hoa thường, khoảng trắng thừa, kiểu gõ dấu
  const norm = (n) => cell(n).toLowerCase().replace(/\s+/g, " ");
  const byName = new Map(Object.keys(sheets).map((n) => [norm(n), sheets[n]]));
  const got = Object.fromEntries(Object.values(SHEETS).map((n) => [n, byName.get(norm(n))]));
  const missing = Object.values(SHEETS).filter((n) => !got[n]);
  if (missing.length) {
    const found = Object.keys(sheets);
    errors.push(`File Excel thiếu sheet ${missing.map((n) => `'${n}'`).join(", ")}. ` +
      (found.length ? `File đang có các sheet: ${found.map((n) => `'${n}'`).join(", ")}. ` : "") +
      "Hãy tải file Excel mẫu ở bước 1 và chép nội dung sang, giữ nguyên tên sheet.");
    return { course: null, errors, warnings, files: [] };
  }
  sheets = got;

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
  // Tìm file theo tên ghi trong Excel: đúng đường dẫn, hoặc chỉ tên file ở bất kỳ thư mục con nào.
  // Trả về { entry } hoặc { dup: [đường dẫn trùng tên] } hoặc {} nếu không có.
  const lower = (x) => x.toLowerCase();
  const findFile = (want) => {
    const w = lower(want.replace(/\\/g, "/").replace(/^\.?\//, ""));
    const exact = folder.find((f) => lower(f.path) === w);
    if (exact || w.includes("/")) return exact ? { entry: exact } : {};
    const same = folder.filter((f) => lower(f.name) === w);
    if (same.length <= 1) return same.length ? { entry: same[0] } : {};
    const inVideos = same.filter((f) => lower(f.path) === "videos/" + w);
    return inVideos.length ? { entry: inVideos[0] } : { dup: same.map((f) => f.path) };
  };
  const dupMsg = (fname, dup) =>
    `có ${dup.length} file tên '${fname}' ở các thư mục khác nhau (${dup.map((p) => `'${p}'`).join(", ")}). Hãy ghi rõ thư mục, ví dụ '${dup[0]}'`;

  // ---- Logo: chọn riêng, hoặc tên file trong Excel nằm ở gốc thư mục khóa
  let logo = cell(info["File logo (tùy chọn)"]);
  let logoSrc = null;
  if (logoFile && (!logo || logo.toLowerCase() === logoFile.name.toLowerCase())) {
    logo = logoFile.name;
    logoSrc = logoFile;
  } else if (logo) {
    const found = findFile(logo);
    logoSrc = found.entry ? found.entry.file : null;
    if (found.dup) errors.push(at(SHEETS.info, infoRow["File logo (tùy chọn)"], dupMsg(logo, found.dup)));
    else if (!logoSrc)
      errors.push(at(SHEETS.info, infoRow["File logo (tùy chọn)"], `không tìm thấy file logo '${logo}' trong thư mục bạn chọn. Đặt logo vào thư mục khóa, hoặc chọn file logo ở bước 1`));
    logo = logo.split(/[\\/]/).pop();
  }
  if (logoSrc) files.push({ zipPath: "assets/" + logo, file: logoSrc });

  // ---- Video (bỏ qua dòng có STT bắt đầu bằng "(Ví dụ)")
  const allVideos = folder.filter((f) => VIDEO_EXT.test(f.name));
  const videos = [];
  const videoRows = [];
  const used = new Set();
  const vrows = sheets[SHEETS.video];
  // Cột D là tài liệu PDF khi tiêu đề cột bắt đầu bằng "Tài liệu" (file Excel mẫu cũ ghi "Ghi chú": bỏ qua)
  const hasDocs = cell((vrows[1] || [])[4]).toLowerCase().startsWith("tài liệu");
  const docFiles = new Map(); // zipPath -> file: cùng 1 tài liệu cho nhiều video chỉ đóng gói 1 lần
  for (let r = 2; r < vrows.length; r++) {
    const row = vrows[r];
    if (!row || !cell(row[3]) || cell(row[1]).startsWith("(Ví dụ)")) continue;
    const fname = cell(row[3]).replace(/\\/g, "/");
    const { entry: src, dup } = findFile(fname);
    if (dup) {
      errors.push(at(SHEETS.video, r, dupMsg(fname, dup)));
    } else if (!src) {
      const hint = similar(fname.split("/").pop(), allVideos.map((f) => f.name));
      const where = hint && allVideos.find((f) => f.name === hint).path;
      errors.push(at(SHEETS.video, r, `không tìm thấy video '${fname}' trong thư mục bạn chọn` + (hint ? `. Có phải ý bạn là '${hint}'${where !== hint ? ` (trong '${where.slice(0, -hint.length - 1)}')` : ""}?` : "")));
    } else {
      used.add(src);
      files.push({ zipPath: "videos/" + fname, path: src.path, file: src.file });
      if (!/\.mp4$/i.test(fname)) warnings.push(at(SHEETS.video, r, `video '${fname}' không phải .mp4, có thể không phát được trên mọi máy. Nên xuất lại dạng .mp4`));
      if (durations && durations.has(src.path) && !durations.get(src.path))
        errors.push(at(SHEETS.video, r, `trình duyệt không mở được video '${fname}'. Hãy xuất lại video dạng .mp4 (H.264)`));
    }
    const docs = [];
    for (const raw of hasDocs ? cell(row[4]).split(/[;\n]/) : []) {
      const d = raw.trim().replace(/\\/g, "/");
      if (!d) continue;
      const found = findFile(d);
      if (!/\.pdf$/i.test(d)) errors.push(at(SHEETS.video, r, `tài liệu '${d}' không phải file PDF. Hãy xuất sang PDF (trong PowerPoint: File > Save As > PDF)`));
      else if (found.dup) errors.push(at(SHEETS.video, r, dupMsg(d, found.dup)));
      else if (!found.entry) {
        const pdfs = folder.filter((f) => /\.pdf$/i.test(f.name));
        const hint = similar(d.split("/").pop(), pdfs.map((f) => f.name));
        errors.push(at(SHEETS.video, r, `không tìm thấy tài liệu '${d}' trong thư mục bạn chọn` + (hint ? `. Có phải ý bạn là '${hint}'?` : "")));
      } else {
        if (!docFiles.has("docs/" + d)) {
          docFiles.set("docs/" + d, found.entry);
          files.push({ zipPath: "docs/" + d, path: found.entry.path, file: found.entry.file });
          if (found.entry.size > DOC_WARN)
            warnings.push(at(SHEETS.video, r, `tài liệu '${d}' nặng ${(found.entry.size / 1024 ** 2).toFixed(0)} MB, học viên sẽ mở chậm. Nên nén PDF dưới 50 MB`));
        }
      }
      docs.push({ title: d.split("/").pop().replace(/\.pdf$/i, ""), src: "docs/" + d });
    }
    videos.push({ title: cell(row[2]) || `Bài ${videos.length + 1}`, file: fname, src, docs });
    videoRows.push(r);
  }
  if (!videos.length && !errors.some((e) => e.includes(SHEETS.video)))
    errors.push(`Sheet ${SHEETS.video}: chưa có video nào. Nhập dữ liệu từ dòng 3`);
  const unused = allVideos.filter((f) => !used.has(f));
  if (videos.length && unused.length)
    warnings.push(`Thư mục có ${unused.length} video không dùng trong Excel: ${unused.slice(0, 5).map((f) => `'${f.path}'`).join(", ")}${unused.length > 5 ? "…" : ""}`);

  const duration = (v) => (durations && v.src ? Math.round(durations.get(v.src.path) || 0) : 0);

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
  if (totalSize > SIZE_LIMIT)
    errors.push(`Tổng dung lượng ${(totalSize / 1024 ** 3).toFixed(2)} GB, vượt giới hạn 4 GB của Workday. Hãy nén video nhỏ hơn (720p)`);
  else if (totalSize > SIZE_WARN)
    warnings.push(`Tổng dung lượng ${(totalSize / 1024 ** 3).toFixed(2)} GB, gần giới hạn 4 GB của Workday. Nên nén video nhỏ hơn (720p)`);

  const course = {
    id,
    title: title || id,
    description: cell(info["Mô tả ngắn"]),
    logo: logoSrc ? "assets/" + logo : null,
    settings,
    videos: videos.map((v) => ({ title: v.title, src: "videos/" + v.file, duration: duration(v), ...(v.docs.length ? { docs: v.docs } : {}) })),
    popups,
    quiz,
  };
  return { course, errors, warnings, files, totalSize };
}
