import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const root = new URL('../', import.meta.url);
const read = (path) => fs.readFileSync(new URL(path, root), 'utf8');

test('manifest declares standalone display and usable home-screen icons', () => {
  const manifest = JSON.parse(read('public/manifest.webmanifest'));
  assert.equal(manifest.display, 'standalone');
  assert.equal(manifest.start_url, '/');
  assert.equal(manifest.id, '/');
  assert.equal(manifest.orientation, 'portrait-primary');
  for (const size of ['192x192', '512x512']) {
    const icon = manifest.icons.find((candidate) => candidate.sizes === size && candidate.type === 'image/png');
    assert.ok(icon, `missing ${size} PNG icon`);
    assert.ok(fs.existsSync(new URL(`public${icon.src}`, root)));
  }
});

test('startup exposes an Android install action and safe mobile viewport', () => {
  const main = read('src/main.js');
  const html = read('index.html');
  const css = read('src/style.css');
  assert.match(main, /beforeinstallprompt/);
  assert.match(main, /Install GolfCaddie/);
  assert.match(html, /viewport-fit=cover/);
  assert.match(css, /safe-area-inset-bottom/);
  assert.match(css, /@media \(max-width: 560px\)/);
});

test('runtime registers a service worker that caches the app and course endpoint', () => {
  const main = read('src/main.js');
  const worker = read('public/sw.js');
  assert.match(main, /serviceWorker\.register\('\/sw\.js'\)/);
  assert.match(worker, /'\/api\/course'/);
  assert.match(worker, /cacheApplicationShell/);
  assert.match(worker, /request\.mode === 'navigate'/);
});
