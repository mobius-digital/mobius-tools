/**
 * A streaming ZIP writer, store-only (no compression).
 *
 * A year of receipts is hundreds of megabytes of JPEG and PDF — already
 * compressed, so deflating them would burn CPU to save nothing, and building
 * the archive in memory would blow a Worker's limit. This writes entries to a
 * ReadableStream as each file arrives: local header, bytes, then the central
 * directory at the end, which is the one part that must be held (a few dozen
 * bytes per file).
 *
 * Store-only means sizes and CRCs are known once a file is read, so nothing
 * needs seeking backwards — the format's data-descriptor escape hatch is not
 * required.
 */

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[i] = c >>> 0;
  }
  return t;
})();

function crc32(bytes) {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** DOS date/time — the format predates epoch seconds. */
function dosDateTime(d) {
  const time = ((d.getHours() & 31) << 11) | ((d.getMinutes() & 63) << 5) | ((d.getSeconds() / 2) & 31);
  const date = (((d.getFullYear() - 1980) & 127) << 9) | (((d.getMonth() + 1) & 15) << 5) | (d.getDate() & 31);
  return { time, date };
}

const enc = new TextEncoder();

function u32(v) { const b = new Uint8Array(4); new DataView(b.buffer).setUint32(0, v >>> 0, true); return b; }
function u16(v) { const b = new Uint8Array(2); new DataView(b.buffer).setUint16(0, v & 0xffff, true); return b; }
function cat(parts) {
  const len = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(len);
  let at = 0;
  for (const p of parts) { out.set(p, at); at += p.length; }
  return out;
}

/**
 * @param files async iterable of { name, bytes, date } — yielded one at a time
 *              so the caller can fetch each receipt only when it is needed.
 * @returns ReadableStream of the .zip
 */
export function zipStream(files) {
  return new ReadableStream({
    async start(ctrl) {
      const central = [];
      let offset = 0;
      try {
        for await (const f of files) {
          const nameBytes = enc.encode(f.name);
          const bytes = f.bytes instanceof Uint8Array ? f.bytes : new Uint8Array(f.bytes);
          const crc = crc32(bytes);
          const { time, date } = dosDateTime(f.date || new Date());
          // 0x0808: UTF-8 filenames, and bit 3 unset since sizes are known here
          const local = cat([
            u32(0x04034b50), u16(20), u16(0x0800), u16(0),
            u16(time), u16(date), u32(crc), u32(bytes.length), u32(bytes.length),
            u16(nameBytes.length), u16(0), nameBytes,
          ]);
          ctrl.enqueue(local);
          ctrl.enqueue(bytes);
          central.push(cat([
            u32(0x02014b50), u16(20), u16(20), u16(0x0800), u16(0),
            u16(time), u16(date), u32(crc), u32(bytes.length), u32(bytes.length),
            u16(nameBytes.length), u16(0), u16(0), u16(0), u16(0), u32(0),
            u32(offset), nameBytes,
          ]));
          offset += local.length + bytes.length;
        }
        const dir = cat(central);
        ctrl.enqueue(dir);
        ctrl.enqueue(cat([
          u32(0x06054b50), u16(0), u16(0),
          u16(central.length), u16(central.length),
          u32(dir.length), u32(offset), u16(0),
        ]));
        ctrl.close();
      } catch (e) {
        ctrl.error(e);
      }
    },
  });
}

/** Safe inside a zip entry: no separators, no control characters, not endless. */
export function zipSafe(s, fallback = 'untitled') {
  const out = String(s == null ? '' : s)
    .replace(/[\/:*?"<>|\u0000-\u001f]/g, '-')
    .replace(/\s+/g, ' ')
    .replace(/-{2,}/g, '-')
    .replace(/^[-\s.]+|[-\s.]+$/g, '')   // Windows dislikes a trailing dot or dash
    .slice(0, 70)
    .trim();
  return out || fallback;
}
