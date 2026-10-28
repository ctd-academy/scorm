// Test gói SCORM: gói của Builder khớp gói mẫu (golden/ATLD-DEMO.json), lệnh đóng gói ra cùng gói với Builder web,
// zip đọc được bằng Python zipfile (không dùng "data descriptor", CRC đúng).
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { readXlsx } from "../src/xlsx.js";
import { readCourse } from "../src/course.js";
import { writePackage, memorySink } from "../src/package.js";
import { crc32 } from "../src/zip.js";
import { readFolder, ffprobe, playerFiles } from "../scripts/build-scorm.mjs";
import { listPlayerFiles } from "../scripts/player-files.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..", "..");
const DEMO = join(ROOT, "demo-course");
const GOLDEN = JSON.parse(readFileSync(join(HERE, "golden", "ATLD-DEMO.json"), "utf8"));
const TMP = mkdtempSync(join(tmpdir(), "scorm-"));
after(() => rmSync(TMP, { recursive: true, force: true }));

async function builderZip() {
  const folder = await readFolder(DEMO);
  const sheets = readXlsx(readFileSync(join(DEMO, "ATLD-DEMO.xlsx")));
  const durations = new Map(folder.filter((f) => f.name.endsWith(".mp4")).map((f) => [f.path, ffprobe(join(DEMO, f.path))]));
  const { course, files, errors } = readCourse(sheets, folder, durations);
  assert.deepEqual(errors, []);
  const sink = memorySink();
  await writePackage({ course, files, playerFiles: playerFiles(), sink });
  const out = join(TMP, "builder.zip");
  writeFileSync(out, Buffer.from(await sink.blob().arrayBuffer()));
  return out;
}

const COMPARE = `
import json, sys, zipfile, xml.dom.minidom
def info(path):
    z = zipfile.ZipFile(path)
    assert z.testzip() is None, "CRC sai"
    js = z.read("course.js").decode("utf-8")
    course = json.loads(js[js.index("=") + 1:].strip().rstrip(";"))
    m = xml.dom.minidom.parseString(z.read("imsmanifest.xml"))
    hrefs = sorted(f.getAttribute("href") for f in m.getElementsByTagName("file"))
    entries = {i.filename: {"stored": i.compress_type == zipfile.ZIP_STORED, "descriptor": bool(i.flag_bits & 8)} for i in z.infolist()}
    return {"names": sorted(z.namelist()), "course": course, "hrefs": hrefs, "entries": entries,
            "scorm": m.getElementsByTagName("schemaversion")[0].firstChild.data}
print(json.dumps([info(p) for p in sys.argv[1:]], ensure_ascii=False))
`;

test("crc32 đúng chuẩn", () => {
  assert.equal(crc32(new TextEncoder().encode("123456789")), 0xcbf43926);
  assert.equal(crc32(new Uint8Array(0)), 0);
});

const zipInfo = (...paths) => JSON.parse(execFileSync("python3", ["-c", COMPARE, ...paths]).toString());

test("gói Builder khớp gói mẫu của khóa demo", async () => {
  const [b] = zipInfo(await builderZip());
  assert.deepEqual(b.names, [...listPlayerFiles(), ...GOLDEN.files].sort(), "đủ file Player + video, tài liệu, course.js, manifest");
  assert.deepEqual(b.hrefs, b.names.filter((n) => n !== "imsmanifest.xml"), "manifest liệt kê mọi file");
  assert.equal(b.scorm, "1.2");
  assert.deepEqual(b.course, GOLDEN.course, "course.js cùng nội dung");
  const own = new Set(GOLDEN.files);
  assert.deepEqual(Object.keys(b.entries).filter((n) => own.has(n) && b.entries[n].stored).sort(), GOLDEN.stored, "video, PDF lưu không nén");
  for (const [name, e] of Object.entries(b.entries)) assert.equal(e.descriptor, false, `${name}: không dùng data descriptor`);
});

test("lệnh đóng gói (scripts/build-scorm.mjs) ra cùng gói với Builder", async () => {
  const mine = await builderZip();
  execFileSync("node", [join(HERE, "..", "scripts", "build-scorm.mjs"), join(DEMO, "ATLD-DEMO.xlsx"), DEMO, TMP]);
  const [b, c] = zipInfo(mine, join(TMP, "SCORM_ATLD-DEMO.zip"));
  assert.deepEqual(c, b);
});

test("khóa không có tài liệu: không đưa trình xem PDF (pdfjs/) vào gói", async () => {
  const sink = memorySink();
  const course = { id: "X", title: "X", description: "", logo: null, settings: {}, videos: [{ title: "a", src: "videos/a.mp4", duration: 1 }], popups: [], quiz: [] };
  await writePackage({ course, files: [], playerFiles: playerFiles(), sink });
  const out = join(TMP, "nodocs.zip");
  writeFileSync(out, Buffer.from(await sink.blob().arrayBuffer()));
  const py = `import zipfile,sys; print("|".join(zipfile.ZipFile(sys.argv[1]).namelist()))`;
  const list = execFileSync("python3", ["-c", py, out]).toString().trim().split("|");
  assert.ok(list.includes("player.js") && !list.some((n) => n.startsWith("pdfjs/")), list.join(", "));
});

test("tên file có dấu tiếng Việt được giữ nguyên", async () => {
  const sink = memorySink();
  const video = Object.assign(new Blob([new Uint8Array(9 * 1024 * 1024).fill(7)]), { name: "bài 1.mp4" });
  const course = { id: "X", title: "Thử & <dấu>", description: "", logo: null, settings: {}, videos: [], popups: [], quiz: [] };
  await writePackage({ course, files: [{ zipPath: "videos/bài 1.mp4", file: video }], playerFiles: [], sink });
  const out = join(TMP, "dau.zip");
  writeFileSync(out, Buffer.from(await sink.blob().arrayBuffer()));
  const py = `import zipfile,sys; z=zipfile.ZipFile(sys.argv[1]); assert z.testzip() is None; print("|".join(z.namelist()))`;
  assert.equal(execFileSync("python3", ["-c", py, out]).toString().trim(), "course.js|videos/bài 1.mp4|imsmanifest.xml");
});
