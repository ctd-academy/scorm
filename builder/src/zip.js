// Ghi file zip theo kiểu streaming: đọc từng đoạn video, ghi thẳng xuống ổ cứng, không giữ cả gói trong RAM.
// Mỗi file ghi header với CRC và kích thước thật (không dùng "data descriptor"), giống Python zipfile,
// để mọi trình giải nén (kể cả Java của LMS) đều đọc được. Không hỗ trợ zip > 4 GB (Workday cũng không nhận).
import { deflateSync } from "fflate";

const CRC_TABLE = (() => {
  const t = new Uint32Array(256 * 8);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  for (let n = 0; n < 256; n++) for (let k = 1; k < 8; k++) t[k * 256 + n] = (t[(k - 1) * 256 + n] >>> 8) ^ t[t[(k - 1) * 256 + n] & 0xff];
  return t;
})();

// CRC32 (slicing-by-8 cho nhanh với file video lớn)
export function crc32(data, crc = 0) {
  let c = ~crc >>> 0, i = 0;
  const T = CRC_TABLE, n = data.length - (data.length % 8);
  for (; i < n; i += 8) {
    c ^= data[i] | (data[i + 1] << 8) | (data[i + 2] << 16) | (data[i + 3] << 24);
    c = T[1792 + (c & 0xff)] ^ T[1536 + ((c >>> 8) & 0xff)] ^ T[1280 + ((c >>> 16) & 0xff)] ^ T[1024 + (c >>> 24)] ^
        T[768 + data[i + 4]] ^ T[512 + data[i + 5]] ^ T[256 + data[i + 6]] ^ T[data[i + 7]];
  }
  for (; i < data.length; i++) c = T[(c ^ data[i]) & 0xff] ^ (c >>> 8);
  return ~c >>> 0;
}

// Giống build_scorm.py: file đã nén sẵn thì lưu nguyên (STORED), còn lại nén DEFLATE
const STORED = /\.(mp4|m4v|mov|webm|avi|mkv|wmv|flv|mpe?g|woff2|png|jpg|pdf)$/i;
export const isStored = (name) => STORED.test(name);

const LIMIT = 0xffffffff;
const enc = new TextEncoder();

function dosTime(d) {
  return {
    time: (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1),
    date: ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate(),
  };
}

function header(sig, size) {
  const b = new Uint8Array(size);
  const v = new DataView(b.buffer);
  v.setUint32(0, sig, true);
  return { b, v };
}

/**
 * sink: { write(Uint8Array): Promise, patch(position, Uint8Array): Promise }
 * Ghi tuần tự; patch() dùng để điền CRC + kích thước vào header sau khi đã ghi xong dữ liệu.
 */
export class ZipWriter {
  constructor(sink, onProgress = () => {}) {
    this.sink = sink;
    this.offset = 0;
    this.entries = [];
    this.onProgress = onProgress;
    this.when = dosTime(new Date());
  }

  async _write(chunk) {
    await this.sink.write(chunk);
    this.offset += chunk.length;
    if (this.offset > LIMIT) throw new Error("Gói SCORM vượt quá 4 GB, Workday không nhận. Hãy nén video nhỏ hơn.");
  }

  async _local(name, method, crc, csize, usize) {
    const nameB = enc.encode(name);
    const { b, v } = header(0x04034b50, 30 + nameB.length);
    const flags = /[^\x00-\x7f]/.test(name) ? 0x0800 : 0; // tên file có dấu -> đánh dấu UTF-8
    v.setUint16(4, 20, true);
    v.setUint16(6, flags, true);
    v.setUint16(8, method, true);
    v.setUint16(10, this.when.time, true);
    v.setUint16(12, this.when.date, true);
    v.setUint32(14, crc, true);
    v.setUint32(18, csize, true);
    v.setUint32(22, usize, true);
    v.setUint16(26, nameB.length, true);
    b.set(nameB, 30);
    const at = this.offset;
    this.entries.push({ nameB, flags, method, crc, csize, usize, at });
    await this._write(b);
    return this.entries[this.entries.length - 1];
  }

  /** File nhỏ (đã có sẵn trong bộ nhớ) */
  async addBytes(name, data) {
    const crc = crc32(data);
    const method = isStored(name) ? 0 : 8;
    const body = method ? deflateSync(data, { level: 6 }) : data;
    await this._local(name, method, crc, body.length, data.length);
    await this._write(body);
  }

  /** File lớn (video): đọc từng đoạn từ File/Blob, ghi luôn, cuối cùng sửa lại CRC trong header */
  async addFile(name, file) {
    const e = await this._local(name, 0, 0, 0, 0);
    const reader = file.stream().getReader();
    let crc = 0, size = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      crc = crc32(value, crc);
      size += value.length;
      await this._write(value);
      this.onProgress(value.length);
    }
    if (size !== file.size) throw new Error(`File '${file.name}' đã thay đổi trong lúc xuất. Hãy chọn lại thư mục video.`);
    e.crc = crc; e.csize = size; e.usize = size;
    const fix = new Uint8Array(12);
    const v = new DataView(fix.buffer);
    v.setUint32(0, crc, true);
    v.setUint32(4, size, true);
    v.setUint32(8, size, true);
    await this.sink.patch(e.at + 14, fix);
  }

  async finish() {
    const start = this.offset;
    for (const e of this.entries) {
      const { b, v } = header(0x02014b50, 46 + e.nameB.length);
      v.setUint16(4, 20, true);
      v.setUint16(6, 20, true);
      v.setUint16(8, e.flags, true);
      v.setUint16(10, e.method, true);
      v.setUint16(12, this.when.time, true);
      v.setUint16(14, this.when.date, true);
      v.setUint32(16, e.crc, true);
      v.setUint32(20, e.csize, true);
      v.setUint32(24, e.usize, true);
      v.setUint16(28, e.nameB.length, true);
      v.setUint32(38, 0o100644 << 16, true); // quyền đọc file bình thường
      v.setUint32(42, e.at, true);
      b.set(e.nameB, 46);
      await this._write(b);
    }
    const { b, v } = header(0x06054b50, 22);
    v.setUint16(8, this.entries.length, true);
    v.setUint16(10, this.entries.length, true);
    v.setUint32(12, this.offset - start, true);
    v.setUint32(16, start, true);
    await this._write(b);
  }
}
