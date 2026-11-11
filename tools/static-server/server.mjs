// Small static server for the Notesnook web build.
// - serves precompressed .br / .gz files made by precompress.mjs (no CPU spent
//   compressing on every request, and brotli q11 is ~16% smaller than gzip)
// - long, immutable caching for hashed files in /assets, no-cache for
//   index.html and the service worker so updates are picked up
// - SPA fallback to index.html
import http from "node:http";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(process.argv[2] || "build");
const PORT = Number(process.argv[3] || 3100);
const HOST = process.argv[4] || "127.0.0.1";

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".mjs": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".wasm": "application/wasm",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
  ".woff": "font/woff",
  ".ttf": "font/ttf",
  ".txt": "text/plain; charset=utf-8",
  ".xml": "application/xml; charset=utf-8"
};
const COMPRESSIBLE = new Set([
  ".html", ".js", ".mjs", ".css", ".json", ".webmanifest", ".map",
  ".wasm", ".svg", ".ttf", ".txt", ".xml", ".ico"
]);

function cacheControl(rel) {
  if (rel.startsWith("/assets/")) return "public, max-age=31536000, immutable";
  return "no-cache";
}

function resolveFile(urlPath) {
  const requested = decodeURIComponent(urlPath.split("?")[0]);
  let rel = requested;
  if (rel.endsWith("/")) rel += "index.html";
  const abs = path.join(ROOT, path.normalize(rel));
  if (!abs.startsWith(ROOT)) return null;
  try {
    if (fs.statSync(abs).isFile()) return { abs, rel };
  } catch {}
  // SPA fallback (only for paths that don't look like files)
  if (!path.extname(requested)) return { abs: path.join(ROOT, "index.html"), rel: "/index.html" };
  return null;
}

const server = http.createServer((req, res) => {
  const start = Date.now();
  const file = resolveFile(req.url || "/");
  if (!file) {
    res.writeHead(404, { "Content-Type": "text/plain" });
    return res.end("Not found");
  }
  const ext = path.extname(file.abs).toLowerCase();
  const accept = String(req.headers["accept-encoding"] || "");
  const headers = {
    "Content-Type": MIME[ext] || "application/octet-stream",
    "Cache-Control": cacheControl(file.rel),
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "no-referrer"
  };
  let body = file.abs;
  if (COMPRESSIBLE.has(ext)) {
    headers["Vary"] = "Accept-Encoding";
    if (/\bbr\b/.test(accept) && fs.existsSync(file.abs + ".br")) {
      body = file.abs + ".br";
      headers["Content-Encoding"] = "br";
    } else if (/\bgzip\b/.test(accept) && fs.existsSync(file.abs + ".gz")) {
      body = file.abs + ".gz";
      headers["Content-Encoding"] = "gzip";
    }
  }
  let stat;
  try {
    stat = fs.statSync(body);
  } catch {
    res.writeHead(500);
    return res.end();
  }
  const etag = `"${stat.size.toString(16)}-${Math.floor(stat.mtimeMs).toString(16)}${headers["Content-Encoding"] ? "-" + headers["Content-Encoding"] : ""}"`;
  headers["ETag"] = etag;
  headers["Content-Length"] = stat.size;
  if (req.headers["if-none-match"] === etag) {
    res.writeHead(304, { ETag: etag, "Cache-Control": headers["Cache-Control"] });
    return res.end();
  }
  res.writeHead(200, headers);
  if (req.method === "HEAD") return res.end();
  fs.createReadStream(body)
    .on("error", () => res.destroy())
    .pipe(res)
    .on("finish", () => {
      if (process.env.LOG) console.log(req.method, req.url, res.statusCode, headers["Content-Encoding"] || "identity", stat.size, Date.now() - start + "ms");
    });
});
server.keepAliveTimeout = 65000;
server.listen(PORT, HOST, () => console.log(`serving ${ROOT} on http://${HOST}:${PORT}`));
