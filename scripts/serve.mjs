// Serves dist/ on http://localhost:5174 for trying the web version and for the screen tests.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';

const ROOT = process.env.SERVE_DIR || 'dist';
const PORT = Number(process.env.PORT || 5174);
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.map': 'application/json', '.webp': 'image/webp', '.png': 'image/png' };

export function serve(root = ROOT, port = PORT) {
  const server = createServer(async (req, res) => {
    const path = normalize(decodeURIComponent((req.url || '/').split('?')[0])).replace(/^(\.\.[/\\])+/, '');
    let file = join(root, path === '/' ? 'index.html' : path);
    let body;
    try { body = await readFile(file); } catch { file = join(root, 'index.html'); body = await readFile(file); }
    res.writeHead(200, { 'content-type': TYPES[extname(file)] || 'application/octet-stream', 'cache-control': 'no-store' });
    res.end(body);
  });
  return new Promise(ok => server.listen(port, () => ok(server)));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await serve();
  console.log(`Admin EAB on http://localhost:${PORT}`);
}
