import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const normalize = (request) => {
  const value = typeof request === 'string' ? request : request.url;
  const url = new URL(value, 'http://localhost');
  return `${url.pathname}${url.search}`;
};

test('installed service worker serves the app shell and course data with the network unavailable', async () => {
  const listeners = new Map();
  const stores = new Map();
  let offline = false;

  class FakeCache {
    constructor() { this.entries = new Map(); }
    async put(request, response) { this.entries.set(normalize(request), response.clone()); }
    async match(request) { return this.entries.get(normalize(request))?.clone(); }
    async addAll(requests) {
      for (const request of requests) {
        const response = await fakeFetch(request);
        if (!response.ok) throw new Error(`Could not cache ${request}`);
        await this.put(request, response);
      }
    }
  }

  const caches = {
    async open(name) {
      if (!stores.has(name)) stores.set(name, new FakeCache());
      return stores.get(name);
    },
    async keys() { return [...stores.keys()]; },
    async delete(name) { return stores.delete(name); },
  };

  async function fakeFetch(request) {
    if (offline) throw new Error('network unavailable');
    const path = normalize(request);
    if (path === '/') return new Response('<link rel="manifest" href="/manifest.webmanifest"><script src="/assets/app.js"></script>');
    if (path === '/api/course') return new Response(JSON.stringify({ ok: true, course: { id: 'cached-course' } }), { headers: { 'content-type': 'application/json' } });
    return new Response(`asset:${path}`);
  }

  const self = {
    location: { origin: 'http://localhost' },
    clients: { claim: async () => {} },
    skipWaiting: async () => {},
    addEventListener(type, handler) { listeners.set(type, handler); },
  };
  const context = vm.createContext({ self, caches, fetch: fakeFetch, Response, URL, console, Set, Promise });
  vm.runInContext(fs.readFileSync(new URL('../public/sw.js', import.meta.url), 'utf8'), context);

  let installPromise;
  listeners.get('install')({ waitUntil(promise) { installPromise = promise; } });
  await installPromise;
  offline = true;

  let navigationPromise;
  listeners.get('fetch')({
    request: { method: 'GET', mode: 'navigate', url: 'http://localhost/hole/2' },
    respondWith(promise) { navigationPromise = promise; },
  });
  assert.match(await (await navigationPromise).text(), /manifest\.webmanifest/);

  let coursePromise;
  listeners.get('fetch')({
    request: { method: 'GET', mode: 'cors', url: 'http://localhost/api/course' },
    respondWith(promise) { coursePromise = promise; },
  });
  assert.deepEqual(await (await coursePromise).json(), { ok: true, course: { id: 'cached-course' } });
});
