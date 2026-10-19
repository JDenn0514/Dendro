// node server.mjs [--dir tracer] [--port 8770]  ->  http://127.0.0.1:8770/
// Serves the pick page, the blind page, their public JSON, and the app-size copies (images/<target>/<n>.jpg).
// It has no route for a full-size photo or an original.
// Never serves pools.json, runs/, out/, wf/, or briefs/.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { EVAL } from './lib/data.mjs';

const TYPES = { '.html': 'text/html; charset=utf-8', '.json': 'application/json; charset=utf-8', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.gif': 'image/gif' };
const MAX_BODY = 1024 * 1024;

export function createServer({ dir, evalDir = EVAL }) {
  const readJ = (f, dflt) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return dflt; } };
  const send = (res, code, body, type = 'text/plain; charset=utf-8') => { res.writeHead(code, { 'Content-Type': type, 'Cache-Control': 'no-store' }); res.end(body); };
  const sendFile = (res, file) => fs.stat(file, (err, st) => {
    if (err || !st.isFile()) return send(res, 404, 'not found');
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream', 'Content-Length': st.size, 'Cache-Control': 'no-store' });
    fs.createReadStream(file).pipe(res);
  });
  const round = () => readJ(path.join(dir, 'blind-public.json'), {}).round ?? 0;
  const store = p => (p === '/picks' ? path.join(dir, 'picks.json') : path.join(dir, `blind-r${round()}.json`));

  return http.createServer((req, res) => {
    let p;
    try { p = decodeURIComponent(new URL(req.url, 'http://127.0.0.1').pathname); } catch { return send(res, 400, 'bad path'); }
    if (p === '/picks' || p === '/blind-answers') {
      const file = store(p);
      if (req.method === 'GET') return fs.readFile(file, 'utf8', (err, txt) => send(res, 200, err ? '{}' : txt, TYPES['.json']));
      if (req.method !== 'POST') return send(res, 405, 'method not allowed');
      const chunks = [];
      let size = 0, over = false;
      req.on('data', c => {
        if (over) return;
        size += c.length;
        if (size > MAX_BODY) { over = true; send(res, 413, 'body over 1 MB'); req.destroy(); return; }
        chunks.push(c);
      });
      req.on('end', () => {
        if (over) return;
        let obj;
        try { obj = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { return send(res, 400, 'bad JSON'); }
        if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return send(res, 400, 'not an object');
        obj.saved_at = new Date().toISOString();
        try {
          if (fs.existsSync(file)) fs.copyFileSync(file, file.replace(/\.json$/, '.backup.json'));
          const tmp = `${file}.${process.pid}.tmp`;
          fs.writeFileSync(tmp, JSON.stringify(obj, null, 2) + '\n');
          fs.renameSync(tmp, file);
          send(res, 200, JSON.stringify({ ok: true }), TYPES['.json']);
        } catch (e) { send(res, 500, 'write failed: ' + e.message); }
      });
      return;
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, 'method not allowed');
    if (p === '/' || p === '/pick.html') return sendFile(res, path.join(evalDir, 'pick.html'));
    if (p === '/blind' || p === '/blind.html') return sendFile(res, path.join(evalDir, 'blind.html'));
    if (p === '/pick-public.json' || p === '/blind-public.json') return sendFile(res, path.join(dir, p.slice(1)));
    const app = p.match(/^\/images\/([A-Z0-9]+)\/(\d+)\.jpg$/);
    if (app) return sendFile(res, path.join(evalDir, 'images', app[1], `${app[2]}.jpg`));
    send(res, 404, 'not found');
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2);
  const opt = (n, d) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : d; };
  const dir = path.resolve(EVAL, opt('--dir', '.'));
  const port = Number(opt('--port', 8770));
  createServer({ dir }).listen(port, '127.0.0.1', () => console.log(`selection-eval pages on http://127.0.0.1:${port}/ (dir ${dir})`));
}
