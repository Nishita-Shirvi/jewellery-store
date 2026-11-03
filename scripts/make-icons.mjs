/**
 * Generates the app icons (PWA) as PNGs with Node only: velvet-maroon square with a pearl
 * diamond. Run once: node scripts/make-icons.mjs  (outputs public/icons/*.png)
 */
import { writeFileSync } from "node:fs";
import { deflateSync } from "node:zlib";

const MAROON = [0x4a, 0x15, 0x28];
const PEARL = [0xfb, 0xf7, 0xf4];

function crc32(buf) {
  let c,
    crc = 0xffffffff;
  for (let n = 0; n < buf.length; n++) {
    c = (crc ^ buf[n]) & 0xff;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crc = (crc >>> 8) ^ c;
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}

/** maskable = keep the shape inside the central 80% safe zone. */
function icon(size, maskable) {
  const rows = [];
  const c = size / 2;
  const r = size * (maskable ? 0.26 : 0.34);
  for (let y = 0; y < size; y++) {
    const row = [0]; // filter: none
    for (let x = 0; x < size; x++) {
      const dx = Math.abs(x + 0.5 - c);
      const dy = y + 0.5 - c;
      // A cut-gem outline: flat top (table), sloped crown, pointed pavilion.
      const top = -r * 0.55;
      const inGem =
        dy >= top &&
        (dy <= 0
          ? dx <= r * (0.55 + (0.45 * (dy - top)) / -top) // crown widens from the table
          : dx <= r * (1 - dy / (r * 1.25))); // pavilion narrows to the point
      row.push(...(inGem ? PEARL : MAROON));
    }
    rows.push(Buffer.from(row));
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // RGB
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(Buffer.concat(rows))),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

for (const [name, size, maskable] of [
  ["icon-192.png", 192, false],
  ["icon-512.png", 512, false],
  ["icon-maskable-512.png", 512, true],
  ["apple-touch-icon.png", 180, false],
]) {
  writeFileSync(new URL(`../public/icons/${name}`, import.meta.url), icon(size, maskable));
  console.log(`public/icons/${name}`);
}
