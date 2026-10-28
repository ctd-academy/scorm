#!/usr/bin/env node
// Đóng gói 1 khóa học thành SCORM 1.2 bằng dòng lệnh, không cần mở trình duyệt.
// Dùng đúng code của Builder web (src/course.js, src/package.js), nên ra cùng một gói.
//
// Cách dùng (từ gốc repo, cần đã chạy "npm install" trong builder/ và có ffprobe):
//   node builder/scripts/build-scorm.mjs <file_excel> <thư_mục_khóa_chứa_video> <thư_mục_xuất>
import { readFileSync, readdirSync, openAsBlob, mkdirSync } from "node:fs";
import { open } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { readXlsx } from "../src/xlsx.js";
import { readCourse, formatDuration } from "../src/course.js";
import { writePackage } from "../src/package.js";
import { ignored } from "../src/util.js";
import { PLAYER_DIR, listPlayerFiles } from "./player-files.mjs";

/** Mọi file trong thư mục khóa (kể cả thư mục con), cùng dạng với Builder web: [{ path, name, size, file }] */
export async function readFolder(dir, prefix = "") {
  const out = [];
  for (const d of readdirSync(join(dir, prefix), { withFileTypes: true })) {
    if (ignored(d.name)) continue;
    const path = prefix + d.name;
    if (d.isDirectory()) out.push(...(await readFolder(dir, path + "/")));
    else {
      const file = Object.assign(await openAsBlob(join(dir, path)), { name: d.name });
      out.push({ path, name: d.name, size: file.size, file });
    }
  }
  return out;
}

/** Thời lượng video (giây) đọc bằng ffprobe; null nếu không đọc được */
export function ffprobe(file) {
  try {
    const out = execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "default=nw=1:nk=1", file]);
    const d = parseFloat(out.toString());
    return Number.isFinite(d) && d > 0 ? d : null;
  } catch (e) {
    if (e.code === "ENOENT") throw new Error("Không tìm thấy ffprobe. Hãy cài ffmpeg (có kèm ffprobe).");
    return null;
  }
}

export function playerFiles() {
  return listPlayerFiles().map((path) => ({ path, data: new Uint8Array(readFileSync(join(PLAYER_DIR, path))) }));
}

/** Ghi thẳng xuống file trên ổ cứng */
async function fileSink(path) {
  const fh = await open(path, "w");
  let pos = 0;
  return {
    async write(chunk) {
      await fh.write(chunk, 0, chunk.length, pos);
      pos += chunk.length;
    },
    async patch(at, bytes) {
      await fh.write(bytes, 0, bytes.length, at);
    },
    close: () => fh.close(),
  };
}

export async function buildScorm(xlsx, courseDir, outDir, log = console.log) {
  const folder = await readFolder(courseDir);
  const sheets = readXlsx(readFileSync(xlsx));

  // Lần 1: biết cần những video nào; đo thời lượng; lần 2: kiểm tra đầy đủ (giống bước 3 của Builder web)
  const first = readCourse(sheets, folder);
  const durations = new Map();
  for (const f of first.files.filter((f) => f.zipPath.startsWith("videos/"))) durations.set(f.path, ffprobe(join(courseDir, f.path)));
  const { course, errors, warnings, files } = readCourse(sheets, folder, durations);

  if (warnings.length) {
    log("Lưu ý:");
    warnings.forEach((w) => log("  -", w));
  }
  if (errors.length) {
    log("KHÔNG XUẤT ĐƯỢC. Hãy sửa các lỗi sau trong file Excel:");
    errors.forEach((e) => log("  -", e));
    return null;
  }

  mkdirSync(outDir, { recursive: true });
  const out = join(outDir, `SCORM_${course.id}.zip`);
  const sink = await fileSink(out);
  let size;
  try {
    size = await writePackage({ course, files, playerFiles: playerFiles(), sink });
  } finally {
    await sink.close();
  }
  const total = course.videos.reduce((s, v) => s + v.duration, 0);
  const nDocs = new Set(course.videos.flatMap((v) => (v.docs || []).map((d) => d.src))).size;
  log(`Đã xuất: ${out} (${(size / 1024 ** 2).toFixed(1)} MB)`);
  log(`  ${course.videos.length} video · ${nDocs} tài liệu · ${course.popups.length} pop-up · ${course.quiz.length} câu ngân hàng đề`);
  log(`  Tổng thời lượng video: ${formatDuration(total)} (dùng cho trường Total Course Duration trên Workday)`);
  return { out, course };
}

if (import.meta.url === pathToFileURL(resolve(process.argv[1] || "")).href) {
  const args = process.argv.slice(2);
  if (args.length !== 3) {
    console.log("Cách dùng: node builder/scripts/build-scorm.mjs <file_excel> <thư_mục_khóa_chứa_video> <thư_mục_xuất>");
    process.exit(1);
  }
  buildScorm(...args).then(
    (r) => process.exit(r ? 0 : 2),
    (e) => {
      console.error("Lỗi:", e.message);
      process.exit(1);
    },
  );
}
