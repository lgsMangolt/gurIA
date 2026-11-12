import fs from 'node:fs';
import sharp from 'sharp';
const svg = fs.readFileSync('public/study/gurIA-icon.svg');
const sizes = [16, 32, 48, 64, 128, 256];
const images = [];
for (const size of sizes) images.push(await sharp(svg).resize(size, size).png().toBuffer());
const header = Buffer.alloc(6 + 16 * sizes.length);
header.writeUInt16LE(1, 2); header.writeUInt16LE(sizes.length, 4);
let offset = header.length;
for (let i = 0; i < sizes.length; i++) {
  const entry = 6 + i * 16;
  header[entry] = sizes[i] === 256 ? 0 : sizes[i]; header[entry + 1] = header[entry];
  header.writeUInt16LE(1, entry + 4); header.writeUInt16LE(32, entry + 6);
  header.writeUInt32LE(images[i].length, entry + 8); header.writeUInt32LE(offset, entry + 12);
  offset += images[i].length;
}
fs.writeFileSync('public/study/gurIA.ico', Buffer.concat([header, ...images]));
