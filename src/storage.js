const DATABASE_NAME = 'golfcaddie';
const DATABASE_VERSION = 1;
const STORE_NAME = 'app';
const PROFILE_KEY = 'profile';
const ROUND_KEY = 'active-round';

function openDatabase() {
  return new Promise((resolve, reject) => {
    if (!globalThis.indexedDB) return reject(new Error('IndexedDB is unavailable'));
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) request.result.createObjectStore(STORE_NAME);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('Could not open local storage'));
  });
}

async function transact(mode, operation) {
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, mode);
    const request = operation(transaction.objectStore(STORE_NAME));
    request.onsuccess = () => resolve(request.result ?? null);
    request.onerror = () => reject(request.error || new Error('Local storage operation failed'));
    transaction.oncomplete = () => database.close();
    transaction.onerror = () => reject(transaction.error || new Error('Local storage transaction failed'));
  });
}

export const loadProfile = () => transact('readonly', (store) => store.get(PROFILE_KEY));
export const saveProfile = (profile) => transact('readwrite', (store) => store.put(profile, PROFILE_KEY));
export const loadRound = () => transact('readonly', (store) => store.get(ROUND_KEY));
export const saveRound = (round) => transact('readwrite', (store) => store.put(round, ROUND_KEY));
export const clearRound = () => transact('readwrite', (store) => store.delete(ROUND_KEY));
