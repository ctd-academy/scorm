// Test tương đương (BUILDER_SPEC mục 4): gói của Builder so với gói của build_scorm.py cho khóa demo.
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync, openAsBlob, writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { readXlsx } from "../src/xlsx.js";
import { readCourse } from "../src/course.js";
import { writePackage, memorySink } from "../src/package.js";
import { crc32 } from "../src/zip.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const DEMO = join(ROOT, "demo-course");
const TMP = mkdtempSync(join(tmpdir(), "scorm-"));
after(() => rmSync(TMP, { recursive: true, force: true }));

async function folderOf(dir) {
  const list = async (d) => {
    const out = [];
    for (const name of readdirSync(d)) {
      const p = join(d, name);
      if (!statSync(p).isFile()) continue;
      const blob = await openAsBlob(p);
      out.push(Object.assign(blob, { name }));
    }
    return out;
  };
  return { root: await list(dir), videos: await list(join(dir, "videos")) };
}

function playerFiles() {
  const P = join(ROOT, "player");
  const walk = (dir, prefix = "") =>
    readdirSync(dir, { withFileTypes: true }).flatMap((d) =>
      d.isDirectory() ? walk(join(dir, d.name), prefix + d.name + "/") : d.name === "course.js" ? [] : [prefix + d.name]);
  return walk(P).map((path) => ({ path, data: new Uint8Array(readFileSync(join(P, path))) }));
}

function durations(folder) {
  const m = new Map();
  for (const f of folder.videos) {
    const out = execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "default=nw=1:nk=1", join(DEMO, "videos", f.name)]);
    m.set(f.name, parseFloat(out.toString()));
  }
  return m;
}

async function builderZip() {
  const folder = await folderOf(DEMO);
  const sheets = readXlsx(readFileSync(join(DEMO, "ATLD-DEMO.xlsx")));
  const { course, files, errors } = readCourse(sheets, folder, durations(folder));
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
print(json.dumps({"builder": info(sys.argv[1]), "python": info(sys.argv[2])}, ensure_ascii=False))
`;

test("crc32 đúng chuẩn", () => {
  assert.equal(crc32(new TextEncoder().encode("123456789")), 0xcbf43926);
  assert.equal(crc32(new Uint8Array(0)), 0);
});

test("gói Builder tương đương gói build_scorm.py cho khóa demo", async () => {
  const mine = await builderZip();
  execFileSync("python3", [join(ROOT, "tools", "build_scorm.py"), join(DEMO, "ATLD-DEMO.xlsx"), DEMO, TMP]);
  const ref = join(TMP, "SCORM_ATLD-DEMO.zip");
  const { builder: b, python: p } = JSON.parse(execFileSync("python3", ["-c", COMPARE, mine, ref]).toString());

  assert.deepEqual(b.names, p.names, "cùng danh sách file");
  assert.deepEqual(b.hrefs, p.hrefs, "manifest liệt kê cùng file");
  assert.equal(b.scorm, "1.2");
  p.course.videos.forEach((v, i) => assert.ok(Math.abs(v.duration - b.course.videos[i].duration) <= 1));
  const strip = (c) => ({ ...c, videos: c.videos.map(({ duration, ...v }) => v) });
  assert.deepEqual(strip(b.course), strip(p.course), "course.js cùng nội dung");
  for (const [name, e] of Object.entries(b.entries)) {
    assert.equal(e.stored, p.entries[name].stored, `${name}: cùng kiểu nén`);
    assert.equal(e.descriptor, false, `${name}: không dùng data descriptor`);
  }
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
