import { createServer } from 'node:http';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { dirname, extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

// Porto Sol — tiny static file server for local playtesting.
// Serves the repo root on port 8080, with game/ mounted at /.

const repoRoot = dirname(fileURLToPath(import.meta.url));
const PORT = 8080;

const CONTENT_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.json': 'application/json; charset=utf-8',
};

const server = createServer((req, res) => {
  const urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
  // game/ is served at / : /src/main.js means game/src/main.js, and
  // /index.html means game/index.html. A literal /game/... path works too.
  const rel = urlPath === '/'
    ? 'game/index.html'
    : urlPath.startsWith('/game/')
      ? urlPath.slice(1)
      : `game${urlPath}`;
  const filePath = resolve(join(repoRoot, normalize(rel)));

  // Never serve anything outside the repo root.
  if (!filePath.startsWith(repoRoot + sep) && filePath !== repoRoot) {
    res.writeHead(403, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('Forbidden');
    return;
  }
  if (!existsSync(filePath) || !statSync(filePath).isFile()) {
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('Not found');
    return;
  }
  const type = CONTENT_TYPES[extname(filePath).toLowerCase()] || 'application/octet-stream';
  res.writeHead(200, { 'content-type': type });
  createReadStream(filePath).pipe(res);
});

server.listen(PORT, () => {
  console.log(`Porto Sol running at http://localhost:${PORT}/`);
  console.log(`Serving repo root: ${fileURLToPath(new URL('.', import.meta.url))}`);
});
