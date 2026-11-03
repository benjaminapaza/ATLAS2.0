/* Servidor de vista previa local: sirve laapp y delega /api/* al mismo handler
   que usará Netlify. No se despliega en producción. Uso:
       GEMINI_API_KEY=xxx node server/dev.mjs
*/
import http from 'node:http';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import handler from '../api/handler.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.PORT || 4173);
const MIME = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8', '.md': 'text/markdown; charset=utf-8'
};

async function toWebResponse(nodeReq, nodeRes, result) {
  nodeRes.writeHead(result.status, Object.fromEntries(result.headers.entries()));
  nodeRes.end(Buffer.from(await result.arrayBuffer()));
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname.startsWith('/api/')) {
    const chunks = [];
    for await (const c of req) chunks.push(c);
    const webReq = new Request(url.href, {
      method: req.method,
      headers: req.headers,
      body: ['POST', 'PUT'].includes(req.method) ? Buffer.concat(chunks) : undefined
    });
    try {
      await toWebResponse(req, res, await handler(webReq));
    } catch (e) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: e.message }));
    }
    return;
  }
  let rel = decodeURIComponent(url.pathname);
  if (rel === '/' || rel === '') rel = '/index.html';
  const file = path.resolve(ROOT, '.' + rel);
  if (!file.startsWith(ROOT + path.sep)) { res.writeHead(403); res.end('Prohibido'); return; }
  try {
    const st = await fsp.stat(file);
    if (!st.isFile()) throw new Error('no file');
    const buf = await fsp.readFile(file);
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(buf);
  } catch (e) {
    const buf = await fsp.readFile(path.join(ROOT, 'index.html'));
    res.writeHead(200, { 'Content-Type': MIME['.html'] });
    res.end(buf);
  }
});

server.listen(PORT, '0.0.0.0', () => {
  console.log('A.T.L.A.S · vista previa Netlify en http://0.0.0.0:' + PORT);
  console.log('  IA:', process.env.GEMINI_API_KEY ? 'GEMINI_API_KEY configurada' : (process.env.OPENAI_API_KEY ? 'OPENAI_API_KEY configurada' : 'sin clave'));
  console.log('  Datos:', process.env.NETLIFY_BLOBS_CONTEXT ? 'Netlify Blobs' : 'memoria local');
});
