// Chạy: npm test (trong builder/). Cần đã chạy tools/setup_assets.sh để có khóa demo.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { readXlsx } from "../src/xlsx.js";
import { unzipSync, zipSync, strFromU8, strToU8 } from "fflate";
import { readCourse, parseTime } from "../src/course.js";
import { ffprobe } from "../scripts/build-scorm.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const DEMO = join(ROOT, "demo-course");
const XLSX = join(DEMO, "ATLD-DEMO.xlsx");

// Mọi file trong thư mục khóa (kể cả thư mục con), giống folderEntries() trong src/main.js
function folderOf(dir, prefix = "") {
  return readdirSync(join(dir, prefix), { withFileTypes: true }).flatMap((d) => {
    const path = prefix + d.name;
    if (d.isDirectory()) return folderOf(dir, path + "/");
    const size = statSync(join(dir, path)).size;
    return [{ path, name: d.name, size, file: { name: d.name, size } }];
  });
}

// Thời lượng thật đọc bằng ffprobe, giống lệnh đóng gói scripts/build-scorm.mjs
function ffDurations(folder) {
  return new Map(folder.filter((x) => x.name.endsWith(".mp4")).map((f) => [f.path, ffprobe(join(DEMO, f.path))]));
}

function demo() {
  return { sheets: readXlsx(readFileSync(XLSX)), folder: folderOf(DEMO) };
}

// Dữ liệu khóa demo đã kiểm tra (xem golden/ATLD-DEMO.json)
const GOLDEN = JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)), "golden", "ATLD-DEMO.json"), "utf8"));

test("đọc thời gian mm:ss và thời gian Excel tự đổi", () => {
  assert.equal(parseTime("01:30"), 90);
  assert.equal(parseTime("1:02:03"), 3723);
  assert.equal(parseTime(0.0625), 90); // Excel đổi "01:30" thành 01:30 giờ
  assert.equal(parseTime("1.30"), null);
});

test("khóa demo: tóm tắt đúng, không lỗi", () => {
  const { sheets, folder } = demo();
  const { course, errors, warnings } = readCourse(sheets, folder, ffDurations(folder));
  assert.deepEqual(errors, []);
  // video demo chỉ dài 55 giây nên 2 pop-up của video 1 cách nhau 25 giây: chỉ cảnh báo, không chặn
  assert.deepEqual(warnings, ["Sheet Câu hỏi, dòng 4: pop-up 00:40 chỉ cách pop-up 00:15 (dòng 3) 25 giây. Nên cách nhau ít nhất 1 phút"]);
  assert.equal(course.id, "ATLD-DEMO");
  assert.equal(course.videos.length, 3);
  assert.equal(course.popups.length, 4);
  assert.equal(course.quiz.length, 6);
  assert.equal(course.settings.questionsPerAttempt, 5);
});

test("khóa demo: dữ liệu khóa giống hệt gói mẫu golden/ATLD-DEMO.json", () => {
  const { sheets, folder } = demo();
  const { course } = readCourse(sheets, folder, ffDurations(folder));
  assert.deepEqual(course, GOLDEN.course);
});

test("cố tình làm sai 5 loại lỗi: báo đúng sheet và dòng", () => {
  const { sheets, folder } = demo();
  const info = sheets["Thông tin khóa"], vid = sheets["Video"], q = sheets["Câu hỏi"];
  info[2][2] = "ATLD DEMO có dấu";        // mã khóa có dấu, khoảng trắng
  vid[4][3] = "02_bao-ho-ca-nhan.mp";     // sai tên file video
  q[4][3] = "1.30";                       // mốc thời gian sai định dạng
  q[5][2] = 9;                            // video số ngoài phạm vi
  q[7][9] = "E";                          // đáp án không hợp lệ
  q[8][6] = "";                           // bỏ trống phương án ở giữa
  const { errors } = readCourse(sheets, folder, ffDurations(folder));
  const expect = [
    "Sheet Thông tin khóa, dòng 2: Mã khóa 'ATLD DEMO có dấu'",
    "Sheet Video, dòng 4: không tìm thấy video '02_bao-ho-ca-nhan.mp' trong thư mục bạn chọn. Có phải ý bạn là '02_bao-ho-ca-nhan.mp4' (trong 'videos')?",
    "Sheet Câu hỏi, dòng 4: mốc thời gian '1.30'",
    "Sheet Câu hỏi, dòng 5: 'Video số' phải từ 1 đến 3",
    "Sheet Câu hỏi, dòng 7: đáp án đúng 'E' không hợp lệ",
    "Sheet Câu hỏi, dòng 8: cần ít nhất phương án A, B và không bỏ trống phương án ở giữa",
    // 2 câu cuối khóa lỗi bị loại -> ngân hàng còn 4 câu < 5 câu mỗi lần thi
    "Sheet Thông tin khóa, dòng 7: số câu mỗi lần thi (5) nhiều hơn ngân hàng đề (4 câu)",
  ];
  for (const e of expect) assert.ok(errors.some((x) => x.startsWith(e)), `thiếu lỗi: ${e}\nđang có:\n${errors.join("\n")}`);
  assert.equal(errors.length, expect.length, errors.join("\n"));
});

test("pop-up vượt thời lượng video, số câu thi > ngân hàng, pop-up quá sát", () => {
  const { sheets, folder } = demo();
  const q = sheets["Câu hỏi"];
  q[3][3] = "02:00";                      // video demo dài 55 giây
  q[4][3] = "00:20";                      // cách pop-up 00:40 dòng 4 chỉ 20 giây
  sheets["Thông tin khóa"][7][2] = 50;    // Số câu mỗi lần thi
  const { errors, warnings } = readCourse(sheets, folder, ffDurations(folder));
  assert.ok(errors.some((e) => e.startsWith("Sheet Câu hỏi, dòng 3: mốc 02:00 vượt quá thời lượng video 1 (00:55)")), errors.join("\n"));
  assert.ok(errors.some((e) => e.includes("số câu mỗi lần thi (50) nhiều hơn ngân hàng đề (6 câu)")), errors.join("\n"));
  assert.equal(warnings.length, 0, warnings.join("\n")); // pop-up dòng 3 đã bị loại vì lỗi
  q[3][3] = "00:15";
  const w = readCourse(sheets, folder, ffDurations(folder)).warnings;
  assert.ok(w.some((x) => x.startsWith("Sheet Câu hỏi, dòng 4: pop-up 00:20 chỉ cách pop-up 00:15 (dòng 3) 5 giây")), w.join("\n"));
});

test("template chuẩn trống: báo thiếu mã khóa, tên khóa, video", () => {
  const sheets = readXlsx(readFileSync(join(ROOT, "templates", "Mau_nhap_lieu_khoa_hoc.xlsx")));
  const { errors } = readCourse(sheets, []);
  assert.deepEqual(errors, [
    "Sheet Thông tin khóa, dòng 2: chưa điền Mã khóa",
    "Sheet Thông tin khóa, dòng 3: chưa điền Tên khóa",
    "Sheet Video: chưa có video nào. Nhập dữ liệu từ dòng 3",
  ]);
});

test("video nằm trong thư mục con bất kỳ (như thư mục khóa Hội nhập)", () => {
  const { sheets } = demo();
  // mỗi video một thư mục chủ đề, Excel chỉ ghi tên file
  const folder = folderOf(DEMO).map((f) => f.path.startsWith("videos/")
    ? { ...f, path: { "01_vi-sao-an-toan.mp4": "01. Tong quan/", "02_bao-ho-ca-nhan.mp4": "02. Chinh sach/", "03_nhan-dien-moi-nguy.mp4": "03. ATLD/" }[f.name] + f.name }
    : f);
  const { course, errors, files } = readCourse(sheets, folder);
  assert.deepEqual(errors, []);
  assert.deepEqual(course.videos.map((v) => v.src), ["videos/01_vi-sao-an-toan.mp4", "videos/02_bao-ho-ca-nhan.mp4", "videos/03_nhan-dien-moi-nguy.mp4"]);
  assert.deepEqual(files.filter((f) => f.zipPath.startsWith("videos/")).map((f) => f.path), ["01. Tong quan/01_vi-sao-an-toan.mp4", "02. Chinh sach/02_bao-ho-ca-nhan.mp4", "03. ATLD/03_nhan-dien-moi-nguy.mp4"]);
});

test("tài liệu PDF: đọc theo từng video, nhiều file cách nhau bằng ;, tìm ở mọi thư mục con", () => {
  const { sheets } = demo();
  const folder = folderOf(DEMO).map((f) => (f.name === "slide-bai-3.pdf" ? { ...f, path: "03. ATLD/slide-bai-3.pdf" } : f));
  const { course, errors, files } = readCourse(sheets, folder);
  assert.deepEqual(errors, []);
  assert.deepEqual(course.videos.map((v) => v.docs), [
    [{ title: "slide-bai-1", src: "docs/slide-bai-1.pdf" }],
    undefined,
    [{ title: "slide-bai-3", src: "docs/slide-bai-3.pdf" }, { title: "checklist-moi-nguy", src: "docs/checklist-moi-nguy.pdf" }],
  ]);
  assert.equal(files.find((f) => f.zipPath === "docs/slide-bai-3.pdf").path, "03. ATLD/slide-bai-3.pdf");
});

test("tài liệu PDF: sai tên, không phải PDF, dùng chung cho 2 video, Excel mẫu cũ (cột Ghi chú)", () => {
  const { sheets, folder } = demo();
  const V = sheets["Video"];
  V[3][4] = "slide-bai1.pdf";
  V[4][4] = "slide.pptx";
  V[5][4] = "slide-bai-1.pdf";
  let r = readCourse(sheets, folder);
  assert.deepEqual(r.errors, [
    "Sheet Video, dòng 3: không tìm thấy tài liệu 'slide-bai1.pdf' trong thư mục bạn chọn. Có phải ý bạn là 'slide-bai-1.pdf'?",
    "Sheet Video, dòng 4: tài liệu 'slide.pptx' không phải file PDF. Hãy xuất sang PDF (trong PowerPoint: File > Save As > PDF)",
  ]);
  V[3][4] = V[5][4] = "slide-bai-1.pdf";
  V[4][4] = "";
  r = readCourse(sheets, folder);
  assert.deepEqual(r.errors, []);
  assert.equal(r.files.filter((f) => f.zipPath === "docs/slide-bai-1.pdf").length, 1, "dùng chung: chỉ đóng gói 1 lần");
  V[1][4] = "Ghi chú";
  V[3][4] = "nhớ nói chậm";
  r = readCourse(sheets, folder);
  assert.deepEqual(r.errors, []);
  assert.ok(r.course.videos.every((v) => !v.docs));
});

test("2 video trùng tên ở 2 thư mục: báo lỗi, ghi rõ thư mục thì hết lỗi", () => {
  const { sheets } = demo();
  const v = { name: "bai.mp4", size: 1, file: { name: "bai.mp4", size: 1 } };
  const folder = [{ ...v, path: "01. A/bai.mp4" }, { ...v, path: "02. B/bai.mp4" }, ...folderOf(DEMO).filter((f) => !f.name.startsWith("01_"))];
  sheets["Video"][3][3] = "bai.mp4";
  const r1 = readCourse(sheets, folder);
  assert.ok(r1.errors[0].startsWith("Sheet Video, dòng 3: có 2 file tên 'bai.mp4' ở các thư mục khác nhau ('01. A/bai.mp4', '02. B/bai.mp4')"), r1.errors.join("\n"));
  sheets["Video"][3][3] = "02. B\\bai.mp4"; // gõ kiểu Windows
  const r2 = readCourse(sheets, folder);
  assert.deepEqual(r2.errors, []);
  assert.equal(r2.files[0].path, "02. B/bai.mp4");
  assert.equal(r2.course.videos[0].src, "videos/02. B/bai.mp4");
});

test("thiếu sheet: liệt kê các sheet đang có; tên sheet khác hoa thường/khoảng trắng vẫn nhận", () => {
  const { sheets, folder } = demo();
  const renamed = { "thông tin KHÓA ": sheets["Thông tin khóa"], Video: sheets["Video"], "Câu hỏi": sheets["Câu hỏi"] };
  assert.deepEqual(readCourse(renamed, folder).errors, []);
  const { errors } = readCourse({ Sheet1: [], "Câu hỏi": sheets["Câu hỏi"] }, folder);
  assert.equal(errors[0], "File Excel thiếu sheet 'Thông tin khóa', 'Video'. File đang có các sheet: 'Sheet1', 'Câu hỏi'. Hãy tải file Excel mẫu ở bước 1 và chép nội dung sang, giữ nguyên tên sheet.");
});

test("đọc được file Excel ghi thẻ có tiền tố namespace (<x:sheet>, <x:row>...)", () => {
  const files = unzipSync(new Uint8Array(readFileSync(XLSX)));
  for (const [p, data] of Object.entries(files)) {
    if (!/\.xml$/.test(p) || p.includes("_rels")) continue;
    files[p] = strToU8(strFromU8(data).replace(/<(\/?)(workbook|sheets|sheet|worksheet|sheetData|row|c|v|t|si|sst|is)\b/g, "<$1x:$2"));
  }
  const prefixed = readXlsx(zipSync(files));
  assert.deepEqual(Object.keys(prefixed), Object.keys(readXlsx(readFileSync(XLSX))));
  assert.deepEqual(prefixed["Câu hỏi"], readXlsx(readFileSync(XLSX))["Câu hỏi"]);
});
