// Đọc file .xlsx ngay trên trình duyệt (không cần SheetJS).
// File .xlsx là một file zip chứa XML; ta chỉ cần giá trị ô, không cần định dạng.
import { unzipSync, strFromU8 } from "fflate";

const ENT = { lt: "<", gt: ">", amp: "&", quot: '"', apos: "'" };

function decode(s) {
  return s
    .replace(/&(#x[0-9a-f]+|#\d+|lt|gt|amp|quot|apos);/gi, (_, e) =>
      e[0] === "#" ? String.fromCodePoint(e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10)) : ENT[e])
    .replace(/_x([0-9A-F]{4})_/g, (_, h) => String.fromCharCode(parseInt(h, 16)));
}

// Nối mọi đoạn <t> trong một chuỗi (bỏ phần phiên âm <rPh>)
function textOf(xml) {
  let out = "";
  xml.replace(/<rPh\b[\s\S]*?<\/rPh>/g, "").replace(/<t\b[^>]*>([\s\S]*?)<\/t>/g, (_, t) => { out += decode(t); return ""; });
  return out;
}

function attr(attrs, name) {
  const m = attrs.match(new RegExp("\\b" + name + '="([^"]*)"'));
  return m ? m[1] : null;
}

// "B12" -> cột 1 (tính từ 0)
function colIndex(ref) {
  let n = 0;
  for (const ch of ref.match(/^[A-Z]+/)[0]) n = n * 26 + ch.charCodeAt(0) - 64;
  return n - 1;
}

function resolveTarget(target, dir) {
  if (target.startsWith("/")) return target.slice(1);
  return dir + target.replace(/^\.\//, "");
}

/**
 * Trả về { "Tên sheet": rows } với rows[r][c] là giá trị ô (r, c tính từ 1, giống Excel).
 * Giá trị: chuỗi, số, true/false, hoặc undefined nếu ô trống.
 */
export function readXlsx(buffer) {
  let files;
  try {
    files = unzipSync(new Uint8Array(buffer));
  } catch {
    throw new Error("File này không phải file Excel .xlsx hợp lệ.");
  }
  // Bỏ tiền tố namespace ở tên thẻ (<x:sheet> -> <sheet>): một số cách lưu của Excel/OneDrive ghi kiểu này
  const get = (p) => (files[p] ? strFromU8(files[p]).replace(/<(\/?)[A-Za-z_][\w.-]*:(?=[A-Za-z_])/g, "<$1") : null);
  // Vị trí workbook ghi trong _rels/.rels (thường là xl/workbook.xml)
  let wbPath = "xl/workbook.xml";
  (get("_rels/.rels") || "").replace(/<Relationship\b([^>]*)\/?>/g, (_, a) => {
    if (/officeDocument"?$/.test(attr(a, "Type") || "")) wbPath = attr(a, "Target").replace(/^\//, "");
    return "";
  });
  const wbXml = get(wbPath);
  if (!wbXml) throw new Error("File này không phải file Excel .xlsx hợp lệ.");
  const wbDir = wbPath.includes("/") ? wbPath.slice(0, wbPath.lastIndexOf("/") + 1) : "";

  const rels = {};
  let sharedPath = wbDir + "sharedStrings.xml";
  (get(wbDir + "_rels/" + wbPath.slice(wbDir.length) + ".rels") || "").replace(/<Relationship\b([^>]*)\/?>/g, (_, a) => {
    rels[attr(a, "Id")] = attr(a, "Target");
    if (/sharedStrings$/.test(attr(a, "Type") || "")) sharedPath = resolveTarget(attr(a, "Target"), wbDir);
    return "";
  });

  const shared = [];
  (get(sharedPath) || "").replace(/<si\b[^>]*>([\s\S]*?)<\/si>/g, (_, si) => {
    shared.push(textOf(si));
    return "";
  });

  const sheets = {};
  wbXml.replace(/<sheet\b([^>]*)\/?>/g, (_, a) => {
    const name = decode(attr(a, "name"));
    const target = rels[attr(a, "r:id")];
    const xml = target && get(resolveTarget(target, wbDir));
    if (xml) sheets[name] = readSheet(xml, shared);
    return "";
  });
  return sheets;
}

function readSheet(xml, shared) {
  const rows = [];
  xml.replace(/<row\b([^>]*?)(?:\/>|>([\s\S]*?)<\/row>)/g, (_, ra, body) => {
    const r = parseInt(attr(ra, "r"), 10);
    if (!body) return "";
    const row = (rows[r] = []);
    let next = 0;
    body.replace(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g, (_, ca, inner) => {
      const ref = attr(ca, "r");
      const c = ref ? colIndex(ref) + 1 : next + 1;
      next = c;
      if (!inner) return "";
      const t = attr(ca, "t");
      const v = inner.match(/<v>([\s\S]*?)<\/v>/);
      let val;
      if (t === "s") val = v ? shared[parseInt(v[1], 10)] : undefined;
      else if (t === "inlineStr") val = textOf(inner);
      else if (t === "str") val = v ? decode(v[1]) : undefined;
      else if (t === "b") val = v ? v[1] === "1" : undefined;
      else if (t === "e") val = undefined;
      else val = v ? Number(v[1]) : undefined;
      if (val !== undefined && val !== "") row[c] = val;
      return "";
    });
    return "";
  });
  return rows;
}
