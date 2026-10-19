import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createServer } from '../server.mjs';

test('server saves picks, serves the app-size copies only, and hides private files', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sel-'));
  const photo = path.join(dir, 'x.jpg');
  fs.writeFileSync(photo, 'jpgbytes');
  fs.mkdirSync(path.join(dir, 'images', 'QUAC2'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'img', 'QUAC2'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'images', 'QUAC2', '1.jpg'), 'appbytes');
  fs.writeFileSync(path.join(dir, 'img', 'QUAC2', '1.jpg'), 'bigbytes');
  fs.writeFileSync(path.join(dir, 'pools.json'), JSON.stringify({ targets: [{ target: 'QUAC2', photos: [{ key: 'QUAC2-01', n: 1, abs: photo }] }] }));
  fs.writeFileSync(path.join(dir, 'pick-public.json'), JSON.stringify({ targets: [] }));
  const srv = createServer({ dir, evalDir: dir }).listen(0, '127.0.0.1');
  await new Promise(r => srv.once('listening', r));
  const base = `http://127.0.0.1:${srv.address().port}`;
  try {
    assert.equal((await fetch(`${base}/pools.json`)).status, 404);
    assert.equal((await fetch(`${base}/picks.json`)).status, 404);
    const appRes = await fetch(`${base}/images/QUAC2/1.jpg`);
    assert.equal(appRes.status, 200);
    assert.equal(await appRes.text(), 'appbytes');
    assert.equal((await fetch(`${base}/images/QUAC2/2.jpg`)).status, 404);
    // No route gives a bigger photo: not the 1,200 px copy, not the original.
    assert.equal((await fetch(`${base}/full/QUAC2-01`)).status, 404);
    assert.equal((await fetch(`${base}/img/QUAC2/1.jpg`)).status, 404);
    assert.equal((await fetch(`${base}/x.jpg`)).status, 404);
    assert.ok(!fs.readFileSync(path.join(import.meta.dirname, '..', 'pick.html'), 'utf8').match(/full size|\/full\/|\/img\//));
    assert.equal((await fetch(`${base}/pick-public.json`)).status, 200);
    const body = { targets: { QUAC2: { picks: ['QUAC2-01'], done: true } } };
    assert.equal((await fetch(`${base}/picks`, { method: 'POST', body: JSON.stringify(body) })).status, 200);
    const saved = JSON.parse(fs.readFileSync(path.join(dir, 'picks.json'), 'utf8'));
    assert.deepEqual(saved.targets, body.targets);
    assert.ok(saved.saved_at);
    assert.deepEqual((await (await fetch(`${base}/picks`)).json()).targets, body.targets);
    assert.equal((await fetch(`${base}/picks`, { method: 'POST', body: '[1]' })).status, 400);
  } finally { srv.close(); }
});
