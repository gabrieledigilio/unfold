import test from 'node:test';
import assert from 'node:assert/strict';
import { request as httpRequest } from 'node:http';
import { mkdtemp, mkdir, writeFile, symlink, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createAppServer } from '../server.mjs';

async function withServer(t, options = {}) {
  const server = createAppServer({ env: {}, ...options });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }));
  return { server, origin: `http://127.0.0.1:${server.address().port}` };
}

function rawRequest(origin, path, { method = 'GET', headers = {}, chunks = [] } = {}) {
  return new Promise((resolve, reject) => {
    const request = httpRequest(origin, { path, method, headers }, response => {
      const chunks = [];
      response.on('data', chunk => chunks.push(chunk));
      response.on('end', () => resolve({ status: response.statusCode, headers: response.headers, body: Buffer.concat(chunks).toString() }));
    });
    request.on('error', reject);
    chunks.forEach(chunk => request.write(chunk));
    request.end();
  });
}

test('serves the entry screen and real vendored assets with the right MIME types', async t => {
  const { origin } = await withServer(t);
  const home = await fetch(`${origin}/?view=home`);
  assert.equal(home.status, 200);
  assert.match(home.headers.get('content-type'), /text\/html/);
  assert.match(await home.text(), /UNFOLD — Object atlas/);
  for (const [path, type] of [['/app.js?v=10', 'text/javascript'], ['/blueprint-schema.mjs', 'text/javascript'], ['/vendor/three.module.js', 'text/javascript'], ['/interface.css', 'text/css'], ['/content.json', 'application/json']]) {
    const response = await fetch(`${origin}${path}`, { method: 'HEAD' });
    assert.equal(response.status, 200, path);
    assert.ok(response.headers.get('content-type').startsWith(type), path);
    assert.ok(Number(response.headers.get('content-length')) > 0, path);
    assert.equal(await response.text(), '', path);
  }
});

test('the status and connect routes use the shared Gemma handler without disclosing credentials', async t => {
  const key = 'test-only-key-do-not-use-in-production';
  let providerCalls = 0;
  const { origin } = await withServer(t, { env: { GEMINI_API_KEY: key }, gemmaOptions: {
    warn: () => {}, fetchImpl: async (_url, options) => {
      providerCalls++;
      assert.equal(options.headers['x-goog-api-key'], key);
      return Response.json({ candidates: [{ content: { parts: [{ text: 'ready' }] }, finishReason: 'STOP' }] });
    }
  } });
  const status = await fetch(`${origin}/api/status`);
  assert.deepEqual(await status.json(), { configured: true, model: 'gemma-4-26b-a4b-it' });
  const connect = await fetch(`${origin}/api/connect`, { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json' }, body: '{}' });
  assert.equal(connect.status, 200);
  assert.deepEqual(await connect.json(), { ok: true, model: 'gemma-4-26b-a4b-it' });
  assert.equal(providerCalls, 1);
});

test('rejects cross-origin API calls and supports an explicitly configured public HTTPS origin', async t => {
  let calls = 0;
  const { origin } = await withServer(t, { env: { PUBLIC_ORIGIN: 'https://unfold.example' }, gemmaHandler: async (_operation, request) => {
    calls++;
    assert.equal(new URL(request.url).origin, 'https://unfold.example');
    return Response.json({ ok: true });
  } });
  const rejected = await fetch(`${origin}/api/status`, { headers: { Origin: 'https://other.example' } });
  assert.equal(rejected.status, 403);
  const crossSite = await fetch(`${origin}/api/status`, { headers: { 'Sec-Fetch-Site': 'cross-site' } });
  assert.equal(crossSite.status, 403);
  const accepted = await fetch(`${origin}/api/status`, { headers: { Origin: 'https://unfold.example' } });
  assert.equal(accepted.status, 200);
  assert.equal(calls, 1);
});

test('routes only documented API operations and methods', async t => {
  let calls = 0;
  const { origin } = await withServer(t, { gemmaHandler: async () => { calls++; return Response.json({ ok: true }); } });
  for (const [path, method, expected, allow] of [
    ['/api/connect', 'GET', 405, 'POST'], ['/api/status', 'POST', 405, 'GET'],
    ['/api/analyze', 'OPTIONS', 405, 'POST'], ['/api/unknown', 'POST', 404, null],
    ['/api/status/extra', 'GET', 404, null], ['/app.js', 'POST', 405, 'GET, HEAD']
  ]) {
    const response = await fetch(`${origin}${path}`, { method });
    assert.equal(response.status, expected);
    assert.equal(response.headers.get('allow'), allow);
  }
  assert.equal(calls, 0);
});

test('bounds both declared and chunked request bodies before invoking Gemma', async t => {
  let calls = 0;
  const { origin } = await withServer(t, { gemmaHandler: async () => { calls++; return Response.json({ ok: true }); } });
  const declared = await rawRequest(origin, '/api/analyze', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': 3 * 1024 * 1024 + 1 } });
  assert.equal(declared.status, 413);
  const chunked = await rawRequest(origin, '/api/connect', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Transfer-Encoding': 'chunked' }, chunks: [Buffer.alloc(16000, 'a'), Buffer.alloc(16000, 'b')] });
  assert.equal(chunked.status, 413);
  assert.equal(calls, 0);
});

test('never exposes source, hidden files, directory listings, traversal, or escaping symlinks', async t => {
  const root = await mkdtemp(join(tmpdir(), 'unfold-server-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(join(root, 'public'));
  await writeFile(join(root, 'index.html'), '<h1>Demo</h1>');
  await writeFile(join(root, 'secret.json'), '{"private":true}');
  await writeFile(join(root, 'public', '.hidden.json'), '{"hidden":true}');
  await symlink(join(root, 'secret.json'), join(root, 'public', 'escape.json'));
  const { origin } = await withServer(t, { root });
  for (const path of ['/package.json', '/server.mjs', '/lib/gemma.mjs', '/.env', '/.hidden.json', '/public/', '/escape.json', '/../secret.json', '/%2e%2e/secret.json', '/%2e%2e%2fsecret.json', '/%5c..%5csecret.json']) {
    const response = await rawRequest(origin, path);
    assert.equal(response.status, 404, path);
    assert.equal(response.body.includes('private'), false, path);
  }
  assert.equal((await rawRequest(origin, '/bad%zz')).status, 400);
});

test('disconnecting the client aborts the shared API request', async t => {
  let started;
  const startedPromise = new Promise(resolve => { started = resolve; });
  let aborted;
  const abortedPromise = new Promise(resolve => { aborted = resolve; });
  const { origin } = await withServer(t, { gemmaHandler: async (_operation, request) => {
    started();
    await new Promise(resolve => request.signal.addEventListener('abort', () => { aborted(); resolve(); }, { once: true }));
    return Response.json({ ok: false });
  } });
  const request = httpRequest(`${origin}/api/connect`, { method: 'POST', headers: { 'Content-Type': 'application/json' } });
  request.on('error', () => {});
  request.end('{}');
  await startedPromise;
  request.destroy();
  await abortedPromise;
});
