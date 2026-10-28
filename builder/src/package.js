// Đóng gói SCORM 1.2: phải cho ra gói tương đương build() trong tools/build_scorm.py.
import { ZipWriter } from "./zip.js";

const xml = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export function courseJs(course) {
  return "window.COURSE = " + JSON.stringify(course, null, 1) + ";\n";
}

export function manifest(course, files) {
  const fileTags = files.map((f) => `      <file href="${xml(f)}"/>`).join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>
<manifest identifier="CTD_${xml(course.id)}" version="1.0"
  xmlns="http://www.imsproject.org/xsd/imscp_rootv1p1p2"
  xmlns:adlcp="http://www.adlnet.org/xsd/adlcp_rootv1p2"
  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
  xsi:schemaLocation="http://www.imsproject.org/xsd/imscp_rootv1p1p2 imscp_rootv1p1p2.xsd
                      http://www.imsglobal.org/xsd/imsmd_rootv1p2p1 imsmd_rootv1p2p1.xsd
                      http://www.adlnet.org/xsd/adlcp_rootv1p2 adlcp_rootv1p2.xsd">
  <metadata><schema>ADL SCORM</schema><schemaversion>1.2</schemaversion></metadata>
  <organizations default="ORG1">
    <organization identifier="ORG1">
      <title>${xml(course.title)}</title>
      <item identifier="ITEM1" identifierref="RES1">
        <title>${xml(course.title)}</title>
      </item>
    </organization>
  </organizations>
  <resources>
    <resource identifier="RES1" type="webcontent" adlcp:scormtype="sco" href="index.html">
${fileTags}
    </resource>
  </resources>
</manifest>
`;
}

/**
 * course:      course từ readCourse()
 * files:       [{ zipPath, file }] video, tài liệu, logo từ readCourse()
 * playerFiles: [{ path, data: Uint8Array }] toàn bộ player/ (trừ course.js)
 * sink:        nơi ghi (xem ZipWriter)
 * onProgress:  (bytesĐãGhi, tổngBytes) => void
 */
export async function writePackage({ course, files, playerFiles, sink, onProgress = () => {} }) {
  const enc = new TextEncoder();
  const total = files.reduce((s, f) => s + f.file.size, 0);
  let done = 0;
  const zip = new ZipWriter(sink, (n) => { done += n; onProgress(done, total); });

  const names = [];
  // Trình xem PDF (pdfjs/) chỉ cần khi khóa có tài liệu (giống build_scorm.py)
  const hasDocs = course.videos.some((v) => v.docs && v.docs.length);
  for (const p of playerFiles.filter((p) => hasDocs || !p.path.startsWith("pdfjs/"))) {
    await zip.addBytes(p.path, p.data);
    names.push(p.path);
  }
  await zip.addBytes("course.js", enc.encode(courseJs(course)));
  names.push("course.js");
  for (const f of files) {
    if (f.file.size > 8 * 1024 * 1024) await zip.addFile(f.zipPath, f.file);
    else {
      await zip.addBytes(f.zipPath, new Uint8Array(await f.file.arrayBuffer()));
      done += f.file.size;
      onProgress(done, total);
    }
    names.push(f.zipPath);
  }
  await zip.addBytes("imsmanifest.xml", enc.encode(manifest(course, names)));
  await zip.finish();
  return zip.offset;
}

/** Ghi vào bộ nhớ (trình duyệt không có showSaveFilePicker, hoặc test) */
export function memorySink() {
  const parts = [];
  let pos = 0;
  return {
    parts,
    async write(chunk) {
      parts.push({ at: pos, data: chunk });
      pos += chunk.length;
    },
    async patch(at, bytes) {
      // header nằm trọn trong một mảnh đã ghi
      const p = parts.findLast((x) => x.at <= at);
      p.data.set(bytes, at - p.at);
    },
    blob() {
      return new Blob(parts.map((p) => p.data), { type: "application/zip" });
    },
  };
}

/** Ghi thẳng xuống ổ cứng qua FileSystemWritableFileStream (Chrome/Edge) */
export function diskSink(writable) {
  let pos = 0;
  return {
    async write(chunk) {
      await writable.write({ type: "write", position: pos, data: chunk });
      pos += chunk.length;
    },
    async patch(at, bytes) {
      await writable.write({ type: "write", position: at, data: bytes });
    },
  };
}
