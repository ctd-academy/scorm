// Đọc dữ liệu khóa học từ Excel + thư mục video và kiểm tra lỗi.
// Dùng chung cho Builder web và lệnh đóng gói scripts/build-scorm.mjs.
// Không đụng tới trình duyệt ở đây để chạy test được bằng Node.
//
// Cách đọc: readCourse() gọi lần lượt từng phần bên dưới, mỗi phần một sheet:
//   findSheets → readInfo (Thông tin khóa) → readLogo → readVideos (Video, kèm tài liệu PDF)
//   → readQuestions (Câu hỏi) → readChapters (Chương) → checkSize
// Các phần ghi lỗi/cảnh báo vào chung ctx.errors / ctx.warnings, theo đúng thứ tự trên.
import defaults from "./defaults.json" with { type: "json" };
import { VIDEO_EXT, VIDEO_EXTS, mmss } from "./util.js";

const LETTERS = "ABCD";
const SHEETS = { info: "Thông tin khóa", video: "Video", question: "Câu hỏi" };
const CHAPTER_SHEET = "Chương"; // không bắt buộc: Excel mẫu cũ không có sheet này
// "Loại khóa" ở sheet Thông tin khóa. Để trống = Bắt buộc (Excel mẫu cũ không có dòng này)
const KINDS = { "bắt buộc": false, "bat buoc": false, "tham khảo": true, "tham khao": true };
const INFO_LAST_ROW = 12; // sheet Thông tin khóa đọc dòng 2–12; thêm dòng mới thì tăng số này
export const DEFAULT_CONTACT = defaults.contact; // sửa trong defaults.json
export const SIZE_WARN = 3.5 * 1024 ** 3; // Workday giới hạn 4 GB mỗi gói
const SIZE_LIMIT = 4 * 1024 ** 3 - 64 * 1024 ** 2; // chừa chỗ cho Player + header zip
const POPUP_GAP = 60; // giây: pop-up sát nhau hơn thì cảnh báo
const DOC_WARN = 50 * 1024 ** 2; // tài liệu nặng quá thì học viên mở chậm
const isExample = (text) => text.startsWith("(Ví dụ)"); // dòng ví dụ trong Excel mẫu: bỏ qua

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

// Tên gần giống nhất (để gợi ý "Có phải ý bạn là…?"), null nếu không có tên nào đủ giống
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
 * Trả về { course, errors, warnings, files, totalSize } với files: [{ zipPath, path, file }] cần đưa vào gói.
 */
export function readCourse(sheets, folder, durations = null, logoFile = null) {
  const ctx = {
    errors: [],
    warnings: [],
    folder,
    at: (sheet, r, msg) => `Sheet ${sheet}, dòng ${r}: ${msg}`,
    files: [], // [{ zipPath, path, file }] theo thứ tự đưa vào gói: logo, rồi video và tài liệu
    ...fileFinder(folder),
  };
  const { errors, warnings, files } = ctx;

  const found = findSheets(sheets);
  if (found.error) return { course: null, errors: [found.error], warnings, files: [] };

  const { info, infoRow, id, title, settings } = readInfo(found.info, ctx);
  const logo = readLogo(info, infoRow, logoFile, ctx);
  const videos = readVideos(found.video, durations, ctx);
  // Thời lượng (giây) của 1 video đã đọc, 0 nếu chưa đo hoặc không có file
  const duration = (v) => (durations && v.src ? Math.round(durations.get(v.src.path) || 0) : 0);

  const { popups, quiz } = readQuestions(found.question, videos, settings, duration, ctx);
  if (quiz.length && settings.questionsPerAttempt > quiz.length)
    errors.push(ctx.at(SHEETS.info, infoRow["Số câu mỗi lần thi"], `số câu mỗi lần thi (${settings.questionsPerAttempt}) nhiều hơn ngân hàng đề (${quiz.length} câu)`));
  warnPopupGaps(popups, ctx);

  const chapters = readChapters(found.chapter, videos, duration, ctx);
  const totalSize = checkSize(files, ctx);

  const course = {
    id,
    title: title || id,
    description: cell(info["Mô tả ngắn"]),
    logo,
    settings,
    videos: videos.map((v, i) => ({
      title: v.title, src: "videos/" + v.file, duration: duration(v),
      ...(v.docs.length ? { docs: v.docs } : {}),
      ...(chapters[i].length ? { chapters: chapters[i] } : {}),
    })),
    popups: popups.map(({ row, ...p }) => p),
    quiz,
  };
  return { course, errors, warnings, files, totalSize };
}

// ---------------------------------------------------------------- tìm sheet

// Tìm sheet theo tên, không phân biệt hoa thường, khoảng trắng thừa, kiểu gõ dấu.
// Trả về { info, video, question, chapter } (chapter = null nếu không có) hoặc { error }.
function findSheets(sheets) {
  const norm = (n) => cell(n).toLowerCase().replace(/\s+/g, " ");
  const byName = new Map(Object.keys(sheets).map((n) => [norm(n), sheets[n]]));
  const got = (n) => byName.get(norm(n));
  const missing = Object.values(SHEETS).filter((n) => !got(n));
  if (missing.length) {
    const found = Object.keys(sheets);
    return {
      error: `File Excel thiếu sheet ${missing.map((n) => `'${n}'`).join(", ")}. ` +
        (found.length ? `File đang có các sheet: ${found.map((n) => `'${n}'`).join(", ")}. ` : "") +
        "Hãy tải file Excel mẫu ở bước 1 và chép nội dung sang, giữ nguyên tên sheet.",
    };
  }
  return { info: got(SHEETS.info), video: got(SHEETS.video), question: got(SHEETS.question), chapter: got(CHAPTER_SHEET) || null };
}

// ---------------------------------------------------------------- tìm file trong thư mục khóa

function fileFinder(folder) {
  const lower = (x) => x.toLowerCase();
  // Tìm file theo tên ghi trong Excel: đúng đường dẫn, hoặc chỉ tên file ở bất kỳ thư mục con nào.
  // Trả về { entry } hoặc { dup: [đường dẫn trùng tên] } hoặc {} nếu không có.
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
  return { findFile, dupMsg };
}

// ---------------------------------------------------------------- sheet Thông tin khóa

// Cột A là mục, cột B là giá trị. Dòng 12 "Loại khóa" thêm từ 11/2026.
function readInfo(rows, ctx) {
  const { errors, at } = ctx;
  const info = {}, infoRow = {};
  for (let r = 2; r <= INFO_LAST_ROW; r++) {
    const row = rows[r] || [];
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
    reference: false,
  };
  // Khóa Tham khảo: không học tuần tự, tua tự do, không pop-up, không bài thi, mở là hoàn thành
  const kindRaw = cell(info["Loại khóa"]);
  if (kindRaw) {
    const k = kindRaw.toLowerCase().normalize("NFC");
    if (k in KINDS) settings.reference = KINDS[k];
    else errors.push(at(SHEETS.info, infoRow["Loại khóa"], `'Loại khóa' phải là 'Bắt buộc' hoặc 'Tham khảo', đang là '${kindRaw}'`));
  }
  return { info, infoRow, id, title, settings };
}

// ---------------------------------------------------------------- logo

// Logo chọn riêng ở bước 1, hoặc tên file ghi trong Excel. Trả về đường dẫn trong gói hoặc null.
function readLogo(info, infoRow, logoFile, ctx) {
  const { errors, at, findFile, dupMsg } = ctx;
  const key = "File logo (tùy chọn)";
  let logo = cell(info[key]);
  let logoSrc = null;
  if (logoFile && (!logo || logo.toLowerCase() === logoFile.name.toLowerCase())) {
    logo = logoFile.name;
    logoSrc = logoFile;
  } else if (logo) {
    const found = findFile(logo);
    logoSrc = found.entry ? found.entry.file : null;
    if (found.dup) errors.push(at(SHEETS.info, infoRow[key], dupMsg(logo, found.dup)));
    else if (!logoSrc)
      errors.push(at(SHEETS.info, infoRow[key], `không tìm thấy file logo '${logo}' trong thư mục bạn chọn. Đặt logo vào thư mục khóa, hoặc chọn file logo ở bước 1`));
    logo = logo.split(/[\\/]/).pop();
  }
  if (!logoSrc) return null;
  ctx.files.push({ zipPath: "assets/" + logo, file: logoSrc });
  return "assets/" + logo;
}

// ---------------------------------------------------------------- sheet Video (+ tài liệu PDF)

// Cột: B STT · C Tên bài · D Tên file video · E Tài liệu PDF. Bỏ qua dòng có STT bắt đầu bằng "(Ví dụ)".
// durations: như readCourse (để báo video trình duyệt không mở được).
// Trả về [{ title, file (tên trong gói), src (mục trong thư mục, null nếu thiếu), docs }]
function readVideos(rows, durations, ctx) {
  const { errors, warnings, at, folder, findFile, dupMsg } = ctx;
  const allVideos = folder.filter((f) => VIDEO_EXT.test(f.name));
  const videos = [];
  const used = new Set();
  // Cột tài liệu chỉ đọc khi tiêu đề cột bắt đầu bằng "Tài liệu" (file Excel mẫu cũ ghi "Ghi chú": bỏ qua)
  const hasDocs = cell((rows[1] || [])[4]).toLowerCase().startsWith("tài liệu");
  const docFiles = new Set(); // cùng 1 tài liệu cho nhiều video chỉ đóng gói 1 lần
  for (let r = 2; r < rows.length; r++) {
    const row = rows[r];
    if (!row || !cell(row[3]) || isExample(cell(row[1]))) continue;
    let fname = cell(row[3]).replace(/\\/g, "/");
    let { entry: src, dup } = findFile(fname);
    // Windows ẩn đuôi file nên người dùng hay ghi "Bai 1" thay vì "Bai 1.mp4": tự thêm đuôi video
    if (!src && !dup && !VIDEO_EXT.test(fname)) {
      const ext = VIDEO_EXTS.find((x) => { const f = findFile(fname + x); return f.entry || f.dup; });
      if (ext) ({ entry: src, dup } = findFile((fname += ext)));
    }
    if (dup) {
      errors.push(at(SHEETS.video, r, dupMsg(fname, dup)));
    } else if (!src) {
      const hint = similar(fname.split("/").pop(), allVideos.map((f) => f.name));
      const where = hint && allVideos.find((f) => f.name === hint).path;
      errors.push(at(SHEETS.video, r, `không tìm thấy video '${fname}' trong thư mục bạn chọn` + (hint ? `. Có phải ý bạn là '${hint}'${where !== hint ? ` (trong '${where.slice(0, -hint.length - 1)}')` : ""}?` : "")));
    } else {
      used.add(src);
      ctx.files.push({ zipPath: "videos/" + fname, path: src.path, file: src.file });
      if (!/\.mp4$/i.test(fname)) warnings.push(at(SHEETS.video, r, `video '${fname}' không phải .mp4, có thể không phát được trên mọi máy. Nên xuất lại dạng .mp4`));
      if (durations && durations.has(src.path) && !durations.get(src.path))
        errors.push(at(SHEETS.video, r, `trình duyệt không mở được video '${fname}'. Hãy xuất lại video dạng .mp4 (H.264)`));
    }
    const docs = hasDocs ? readDocs(cell(row[4]), r, docFiles, ctx) : [];
    videos.push({ title: cell(row[2]) || `Bài ${videos.length + 1}`, file: fname, src: src || null, docs });
  }
  if (!videos.length && !errors.some((e) => e.includes(SHEETS.video)))
    errors.push(`Sheet ${SHEETS.video}: chưa có video nào. Nhập dữ liệu từ dòng 3`);
  const unused = allVideos.filter((f) => !used.has(f));
  if (videos.length && unused.length)
    warnings.push(`Thư mục có ${unused.length} video không dùng trong Excel: ${unused.slice(0, 5).map((f) => `'${f.path}'`).join(", ")}${unused.length > 5 ? "…" : ""}`);
  return videos;
}

// Ô "Tài liệu PDF" của 1 video: nhiều file cách nhau bằng ; hoặc xuống dòng. Trả về [{ title, src }]
function readDocs(text, r, docFiles, ctx) {
  const { errors, warnings, at, folder, findFile, dupMsg } = ctx;
  const pdfs = folder.filter((f) => /\.pdf$/i.test(f.name));
  const docs = [];
  for (const raw of text.split(/[;\n]/)) {
    let d = raw.trim().replace(/\\/g, "/");
    if (!d) continue;
    let found = findFile(d);
    // Không có đuôi (Windows ẩn đuôi file): "Slide bai 1" -> "Slide bai 1.pdf"
    if (!found.entry && !found.dup && !/\.pdf$/i.test(d)) {
      const withPdf = findFile(d + ".pdf");
      if (withPdf.entry || withPdf.dup) [found, d] = [withPdf, d + ".pdf"];
    }
    if (found.dup) errors.push(at(SHEETS.video, r, dupMsg(d, found.dup)));
    else if (!found.entry) {
      const name = d.split("/").pop();
      const hint = similar(name, pdfs.map((f) => f.name)) || similar(name + ".pdf", pdfs.map((f) => f.name));
      errors.push(at(SHEETS.video, r, `không tìm thấy tài liệu '${d}' trong thư mục bạn chọn` + (hint ? `. Có phải ý bạn là '${hint}'?` : "")));
    } else if (!/\.pdf$/i.test(found.entry.name)) {
      const stem = found.entry.name.replace(/\.[^.]*$/, "").toLowerCase();
      const pdf = pdfs.find((f) => f.name.slice(0, -4).toLowerCase() === stem);
      errors.push(at(SHEETS.video, r, pdf
        ? `tài liệu '${d}' không phải file PDF. Trong thư mục có '${pdf.name}': hãy ghi tên file này`
        : `tài liệu '${d}' không phải file PDF. Hãy xuất sang PDF (trong PowerPoint: File > Save As > PDF)`));
    } else if (!docFiles.has("docs/" + d)) {
      docFiles.add("docs/" + d);
      ctx.files.push({ zipPath: "docs/" + d, path: found.entry.path, file: found.entry.file });
      if (found.entry.size > DOC_WARN)
        warnings.push(at(SHEETS.video, r, `tài liệu '${d}' nặng ${(found.entry.size / 1024 ** 2).toFixed(0)} MB, học viên sẽ mở chậm. Nên nén PDF dưới 50 MB`));
    }
    docs.push({ title: d.split("/").pop().replace(/\.pdf$/i, ""), src: "docs/" + d });
  }
  return docs;
}

// ---------------------------------------------------------------- sheet Câu hỏi

// Cột: B Loại · C Video số · D Mốc thời gian · E Câu hỏi · F–I phương án A–D · J Đáp án đúng · K Giải thích.
// Bỏ qua dòng có câu hỏi bắt đầu bằng "(Ví dụ)". Khóa Tham khảo không đọc sheet này.
// Trả về { popups: [{ q, options, answer, explain, video, time, row }], quiz: [{ q, options, answer, explain }] }
function readQuestions(rows, videos, settings, duration, ctx) {
  const { errors, warnings, at } = ctx;
  const popups = [], quiz = [];
  const isQuestion = (row) => row && cell(row[4]) && !isExample(cell(row[4]));
  if (settings.reference) {
    const ignoredQ = rows.slice(2).filter(isQuestion).length;
    if (ignoredQ)
      warnings.push(`Khóa Tham khảo không có pop-up và bài kiểm tra: ${ignoredQ} câu hỏi trong sheet ${SHEETS.question} sẽ bị bỏ qua`);
    return { popups, quiz };
  }
  for (let r = 2; r < rows.length; r++) {
    const row = rows[r];
    if (!isQuestion(row)) continue;
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
      popups.push({ ...q, video: vno - 1, time: t, row: r });
    } else if (kind === "CUOI KHOA" || kind === "CUỐI KHÓA") {
      quiz.push(q);
    } else {
      errors.push(at(SHEETS.question, r, `loại '${cell(row[1])}' phải là POPUP hoặc CUOI KHOA`));
    }
  }
  return { popups, quiz };
}

// Cảnh báo pop-up quá sát nhau trong cùng video
function warnPopupGaps(popups, ctx) {
  const order = [...popups].sort((a, b) => a.video - b.video || a.time - b.time);
  for (let i = 1; i < order.length; i++) {
    const a = order[i - 1], b = order[i];
    if (a.video === b.video && b.time - a.time < POPUP_GAP)
      ctx.warnings.push(ctx.at(SHEETS.question, b.row, `pop-up ${mmss(b.time)} chỉ cách pop-up ${mmss(a.time)} (dòng ${a.row}) ${b.time - a.time} giây. Nên cách nhau ít nhất 1 phút`));
  }
}

// ---------------------------------------------------------------- sheet Chương (không bắt buộc)

// Cột: B Video số · C Mốc thời gian · D Tên chương. Trả về chapters[video] = [{ time, title }] đã xếp theo thời gian.
function readChapters(rows, videos, duration, ctx) {
  const { errors, warnings, at } = ctx;
  const chapters = videos.map(() => []);
  const chapterRows = videos.map(() => []);
  rows = rows || [];
  for (let r = 2; r < rows.length; r++) {
    const row = rows[r];
    if (!row) continue;
    const [vRaw, tRaw, title] = [cell(row[1]), cell(row[2]), cell(row[3])];
    if (!vRaw && !tRaw && !title) continue;
    if (isExample(title)) continue;
    const vno = Math.trunc(Number(vRaw));
    const t = parseTime(row[2]);
    if (!(vno >= 1 && vno <= videos.length && String(vno) === vRaw)) {
      errors.push(at(CHAPTER_SHEET, r, `'Video số' phải từ 1 đến ${videos.length}, đang là '${vRaw}'`));
      continue;
    }
    if (t === null) {
      errors.push(at(CHAPTER_SHEET, r, `mốc thời gian '${tRaw}' phải có dạng phút:giây, ví dụ 03:20`));
      continue;
    }
    if (!title) {
      errors.push(at(CHAPTER_SHEET, r, "chưa điền tên chương"));
      continue;
    }
    const d = duration(videos[vno - 1]);
    if (d && t >= d) {
      errors.push(at(CHAPTER_SHEET, r, `mốc ${mmss(t)} vượt quá thời lượng video ${vno} (${mmss(d)})`));
      continue;
    }
    const list = chapters[vno - 1], rowsOf = chapterRows[vno - 1];
    const same = list.findIndex((c) => c.time === t);
    if (same >= 0) {
      warnings.push(at(CHAPTER_SHEET, r, `chương '${title}' trùng mốc ${mmss(t)} với chương ở dòng ${rowsOf[same]} (video ${vno}). Chỉ giữ chương ở dòng ${rowsOf[same]}`));
      continue;
    }
    list.push({ time: t, title });
    rowsOf.push(r);
  }
  return chapters.map((list, i) => {
    // Trainer nhập lộn thứ tự cũng được: xếp theo thời gian
    const order = list.map((c, k) => k).sort((a, b) => list[a].time - list[b].time);
    const sorted = order.map((k) => list[k]);
    if (sorted.length && sorted[0].time > 0)
      warnings.push(at(CHAPTER_SHEET, chapterRows[i][order[0]], `chương đầu tiên của video ${i + 1} bắt đầu ở ${mmss(sorted[0].time)}. Nên thêm một chương ở 00:00 để học viên quay về được đoạn đầu video`));
    return sorted;
  });
}

// ---------------------------------------------------------------- dung lượng

function checkSize(files, ctx) {
  const totalSize = files.reduce((s, f) => s + (f.file.size || 0), 0);
  if (totalSize > SIZE_LIMIT)
    ctx.errors.push(`Tổng dung lượng ${(totalSize / 1024 ** 3).toFixed(2)} GB, vượt giới hạn 4 GB của Workday. Hãy nén video nhỏ hơn (720p)`);
  else if (totalSize > SIZE_WARN)
    ctx.warnings.push(`Tổng dung lượng ${(totalSize / 1024 ** 3).toFixed(2)} GB, gần giới hạn 4 GB của Workday. Nên nén video nhỏ hơn (720p)`);
  return totalSize;
}
