// 将 build/icon.png 包装为 build/icon.ico（256x256 PNG 压缩条目，Vista+ 支持）
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = path.dirname(fileURLToPath(import.meta.url));
const pngPath = path.join(dir, '..', 'build', 'icon.png');
const icoPath = path.join(dir, '..', 'build', 'icon.ico');

if (!fs.existsSync(pngPath)) {
  console.error('缺少 build/icon.png，请先运行 scripts/make-icon.ps1');
  process.exit(1);
}
const png = fs.readFileSync(pngPath);
if (png.length > 0xffffff) throw new Error('png 过大');

const buf = Buffer.alloc(22 + png.length);
buf.writeUInt16LE(0, 0);      // reserved
buf.writeUInt16LE(1, 2);      // type: icon
buf.writeUInt16LE(1, 4);      // count
buf[6] = 0; buf[7] = 0;       // 256x256
buf[8] = 0; buf[9] = 0;       // palette / reserved
buf.writeUInt16LE(1, 10);     // planes
buf.writeUInt16LE(32, 12);    // bpp
buf.writeUInt32LE(png.length, 14);
buf.writeUInt32LE(22, 18);
png.copy(buf, 22);
fs.writeFileSync(icoPath, buf);
console.log('icon.ico 已生成:', icoPath);
