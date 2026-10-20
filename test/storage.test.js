import assert from 'node:assert/strict';
import test from 'node:test';

class FakeIndexedDb {
  constructor() { this.values = new Map(); this.created = false; }

  open() {
    const request = {};
    const database = {
      objectStoreNames: { contains: () => this.created },
      createObjectStore: () => { this.created = true; },
      close: () => {},
      transaction: () => {
        const transaction = {
          objectStore: () => ({
            get: (key) => this.request(() => this.values.get(key), transaction),
            put: (value, key) => this.request(() => this.values.set(key, structuredClone(value)), transaction),
            delete: (key) => this.request(() => this.values.delete(key), transaction),
          }),
        };
        return transaction;
      },
    };
    queueMicrotask(() => {
      request.result = database;
      if (!this.created) request.onupgradeneeded?.();
      request.onsuccess?.();
    });
    return request;
  }

  request(operation, transaction) {
    const request = {};
    queueMicrotask(() => {
      request.result = operation();
      request.onsuccess?.();
      queueMicrotask(() => transaction.oncomplete?.());
    });
    return request;
  }
}

test('profile and active round persist, load, and clear through IndexedDB', async () => {
  globalThis.indexedDB = new FakeIndexedDb();
  const storage = await import(`../src/storage.js?test=${Date.now()}`);
  const profile = { teeColour: 'red', targetHandicap: 20 };
  const round = { schemaVersion: 1, id: 'round-1', status: 'active' };
  await storage.saveProfile(profile);
  await storage.saveRound(round);
  assert.deepEqual(await storage.loadProfile(), profile);
  assert.deepEqual(await storage.loadRound(), round);
  await storage.clearRound();
  assert.equal(await storage.loadRound(), null);
});
