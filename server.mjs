import { createServer } from 'node:http';
import { readFile, realpath, stat } from 'node:fs/promises';
import { dirname, extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { handleGemmaRequest } from './lib/gemma.mjs';

const PROJECT_ROOT = dirname(fileURLToPath(import.meta.url));
const BODY_LIMITS = { connect: 24 * 1024, explore: 64 * 1024, analyze: 3 * 1024 * 1024 };
const MIME_TYPES = {
  '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp',
  '.gif': 'image/gif', '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
  '.woff': 'font/woff', '.woff2': 'font/woff2'
};

class HttpError extends Error {
  constructor(status, code, message) { super(message); this.status = status; this.code = code; }
}

function sendError(response, status, code, message, extraHeaders = {}) {
  if (response.destroyed || response.writableEnded) return;
  const body = JSON.stringify({ error: { code, message } });
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8', 'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', ...extraHeaders
  });
  response.end(body);
}

function publicOrigin(value) {
  if (!value) return null;
  const url = new URL(value);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.pathname !== '/' || url.search || url.hash) {
    throw new Error('PUBLIC_ORIGIN must be an http:// or https:// origin, without a path.');
  }
  return url.origin;
}

function requestOrigin(request, configuredOrigin) {
  if (configuredOrigin) return configuredOrigin;
  const host = request.headers.host;
  if (!host || /[\s/@\\?#]/.test(host)) throw new HttpError(400, 'invalid_host', 'A valid Host header is required.');
  try { return new URL(`http://${host}`).origin; }
  catch { throw new HttpError(400, 'invalid_host', 'A valid Host header is required.'); }
}

function pathname(request) {
  const target = request.url || '/';
  if (!target.startsWith('/') || target.startsWith('//')) throw new HttpError(400, 'invalid_path', 'Invalid request path.');
  let path;
  try { path = decodeURIComponent(target.split('?')[0]); }
  catch { throw new HttpError(400, 'invalid_path', 'Invalid request path.'); }
  if (/[\u0000-\u001f\u007f\\]/.test(path) || path.split('/').some(segment => segment.startsWith('.'))) {
    throw new HttpError(404, 'not_found', 'Not found.');
  }
  return path;
}

// Bound the incoming Node stream before constructing the Web Request. This keeps
// the HTTP adapter from buffering an unbounded photo or question in memory.
function readBody(request, limit, signal) {
  const announced = request.headers['content-length'];
  if (announced !== undefined && Number(announced) > limit) {
    return Promise.reject(new HttpError(413, 'request_too_large', 'This request is too large. Use a smaller photo or a shorter question.'));
  }
  return new Promise((resolveBody, rejectBody) => {
    let size = 0;
    const chunks = [];
    const cleanup = () => {
      request.off('data', onData); request.off('end', onEnd); request.off('error', onError);
      signal.removeEventListener('abort', onAbort);
    };
    const onError = error => { cleanup(); rejectBody(error); };
    const onAbort = () => onError(new HttpError(499, 'request_cancelled', 'This request was cancelled.'));
    const onData = chunk => {
      size += chunk.length;
      if (size > limit) {
        request.pause();
        onError(new HttpError(413, 'request_too_large', 'This request is too large. Use a smaller photo or a shorter question.'));
      } else chunks.push(chunk);
    };
    const onEnd = () => { cleanup(); resolveBody(Buffer.concat(chunks, size)); };
    request.on('data', onData); request.once('end', onEnd); request.once('error', onError);
    signal.addEventListener('abort', onAbort, { once: true });
    if (signal.aborted) onAbort();
  });
}

async function sendStatic(request, response, path, root) {
  const isIndex = path === '/' || path === '/index.html';
  const base = isIndex ? root : resolve(root, 'public');
  const target = isIndex ? resolve(root, 'index.html') : resolve(base, `.${path}`);
  const type = isIndex ? 'text/html; charset=utf-8' : MIME_TYPES[extname(path).toLowerCase()];
  if (!type) throw new HttpError(404, 'not_found', 'Not found.');
  let canonicalBase, canonicalTarget, info;
  try {
    [canonicalBase, canonicalTarget] = await Promise.all([realpath(base), realpath(target)]);
    if (canonicalTarget !== canonicalBase && !canonicalTarget.startsWith(`${canonicalBase}${sep}`)) throw new Error('Outside public directory');
    info = await stat(canonicalTarget);
    if (!info.isFile()) throw new Error('Not a file');
  } catch { throw new HttpError(404, 'not_found', 'Not found.'); }
  const body = request.method === 'HEAD' ? null : await readFile(canonicalTarget);
  response.writeHead(200, {
    'Content-Type': type, 'Content-Length': info.size, 'Cache-Control': 'no-cache',
    'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'strict-origin-when-cross-origin'
  });
  response.end(body);
}

/** Create the portable server without listening, so tests can use a local socket. */
export function createAppServer({ root = PROJECT_ROOT, env = process.env, gemmaHandler = handleGemmaRequest, gemmaOptions = {} } = {}) {
  const origin = publicOrigin(env.PUBLIC_ORIGIN);
  const server = createServer(async (request, response) => {
    const controller = new AbortController();
    const onAbort = () => controller.abort();
    const onClose = () => { if (!response.writableEnded) onAbort(); };
    request.once('aborted', onAbort);
    response.once('close', onClose);
    try {
      const path = pathname(request);
      if (path.startsWith('/api/')) {
        const operation = path.slice('/api/'.length);
        if (operation !== 'status' && !Object.hasOwn(BODY_LIMITS, operation)) throw new HttpError(404, 'not_found', 'Not found.');
        const method = operation === 'status' ? 'GET' : 'POST';
        if (request.method !== method) {
          sendError(response, 405, 'method_not_allowed', `Use ${method} for this endpoint.`, { Allow: method });
          return;
        }
        const expectedOrigin = requestOrigin(request, origin);
        if ((request.headers.origin && request.headers.origin !== expectedOrigin) || request.headers['sec-fetch-site'] === 'cross-site') {
          throw new HttpError(403, 'forbidden_origin', 'Open UNFOLD directly to use this feature.');
        }
        const headers = new Headers();
        for (const [key, value] of Object.entries(request.headers)) {
          if (value !== undefined) headers.set(key, Array.isArray(value) ? value.join(', ') : value);
        }
        const body = method === 'POST' ? await readBody(request, BODY_LIMITS[operation], controller.signal) : undefined;
        const webRequest = new Request(`${expectedOrigin}${path}`, { method, headers, body, signal: controller.signal });
        const result = await gemmaHandler(operation, webRequest, env, gemmaOptions);
        const data = Buffer.from(await result.arrayBuffer());
        if (response.destroyed || controller.signal.aborted) return;
        response.writeHead(result.status, { ...Object.fromEntries(result.headers), 'Content-Length': data.length });
        response.end(data);
      } else {
        if (request.method !== 'GET' && request.method !== 'HEAD') {
          sendError(response, 405, 'method_not_allowed', 'Use GET or HEAD for static files.', { Allow: 'GET, HEAD' });
          return;
        }
        await sendStatic(request, response, path, root);
      }
    } catch (error) {
      if (controller.signal.aborted || response.destroyed) return;
      const known = error instanceof HttpError;
      const tooLarge = known && error.status === 413;
      if (tooLarge) response.once('finish', () => { if (!request.complete) request.destroy(); });
      sendError(response, known ? error.status : 500, known ? error.code : 'internal_error',
        known ? error.message : 'This request could not be completed.', tooLarge ? { Connection: 'close' } : {});
    } finally {
      request.off('aborted', onAbort);
      response.off('close', onClose);
    }
  });
  server.requestTimeout = 120000;
  server.headersTimeout = 15000;
  server.keepAliveTimeout = 5000;
  server.setTimeout(120000, socket => socket.destroy());
  return server;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const host = process.env.HOST || '127.0.0.1';
  const port = Number(process.env.PORT || '3000');
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT must be an integer between 1 and 65535.');
  const server = createAppServer();
  server.listen(port, host, () => {
    const displayHost = host.includes(':') ? `[${host}]` : host;
    console.log(`UNFOLD is running at http://${displayHost}:${port}`);
  });
}
