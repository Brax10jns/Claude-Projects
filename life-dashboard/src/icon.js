// Draws the home-screen icon (a ring on black) as a PNG data URI, no image files needed.
import zlib from 'node:zlib';

const CRC = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}

export function iconDataUri(size = 180) {
  const c = size / 2, outer = size * 0.4, inner = size * 0.31;
  const track = [38, 38, 36], arc = [12, 163, 12], bg = [0, 0, 0];
  const sweep = 0.78; // share of the ring that is lit
  const rows = [];
  for (let y = 0; y < size; y++) {
    const row = Buffer.alloc(1 + size * 3);
    for (let x = 0; x < size; x++) {
      const dx = x + 0.5 - c, dy = y + 0.5 - c, r = Math.hypot(dx, dy);
      const cover = Math.max(0, Math.min(1, outer - r + 0.5)) * Math.max(0, Math.min(1, r - inner + 0.5));
      const angle = (Math.atan2(dx, -dy) / (2 * Math.PI) + 1) % 1; // 0 at 12 o'clock, clockwise
      const fg = angle <= sweep ? arc : track;
      for (let i = 0; i < 3; i++) row[1 + x * 3 + i] = Math.round(bg[i] + (fg[i] - bg[i]) * cover);
    }
    rows.push(row);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 2; // 8-bit RGB
  const png = Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(Buffer.concat(rows))),
    chunk('IEND', Buffer.alloc(0)),
  ]);
  return 'data:image/png;base64,' + png.toString('base64');
}
