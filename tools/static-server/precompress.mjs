// Writes .br (quality 11) and .gz (level 9) copies next to every compressible
// file in the build, skipping source maps (only downloaded by dev tools).
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";

const ROOT = path.resolve(process.argv[2] || "build");
const EXT = new Set([".html", ".js", ".mjs", ".css", ".json", ".webmanifest", ".wasm", ".svg", ".ttf", ".txt", ".xml", ".ico"]);
let files = 0, raw = 0, br = 0, gz = 0;
function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p);
    else if (EXT.has(path.extname(e.name).toLowerCase())) {
      const data = fs.readFileSync(p);
      if (data.length < 1024) continue;
      const b = zlib.brotliCompressSync(data, {
        params: {
          [zlib.constants.BROTLI_PARAM_QUALITY]: 11,
          [zlib.constants.BROTLI_PARAM_SIZE_HINT]: data.length
        }
      });
      const g = zlib.gzipSync(data, { level: 9 });
      if (b.length < data.length) fs.writeFileSync(p + ".br", b);
      if (g.length < data.length) fs.writeFileSync(p + ".gz", g);
      files++; raw += data.length; br += Math.min(b.length, data.length); gz += Math.min(g.length, data.length);
    }
  }
}
walk(ROOT);
console.log(JSON.stringify({ files, raw, br, gz }));
