// Small IndexedDB wrapper for the PWA's uploaded local alarm files — not a
// general-purpose library, just enough to store/fetch a Blob by filename
// (no filesystem access exists in a browser tab, unlike Electron's native
// file dialog + local HTTP server route). Keyed by filename rather than a
// generated id so js/alarmModal.js's existing getFileName()-based display
// logic works unchanged for both platforms — re-uploading a file with the
// same name overwrites the previous blob, which is the expected/desired
// behavior here, not a bug.
const DB_NAME = "interval-timer-pwa";
const DB_VERSION = 1;
const STORE_NAME = "alarmBlobs";

function openDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      request.result.createObjectStore(STORE_NAME);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function putBlob(key, blob) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).put(blob, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function getBlob(key) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const request = tx.objectStore(STORE_NAME).get(key);
    request.onsuccess = () => resolve(request.result ?? null);
    request.onerror = () => reject(request.error);
  });
}

// Used to undo putBlob() when a caller stores a file speculatively (e.g.
// pick()/fromDroppedFile() below, which must persist the blob to return a
// stable string key at all) and then rejects it after the fact (wrong
// extension, etc.) — without this, rejected files would silently
// accumulate in IndexedDB forever since nothing else ever references them.
export async function deleteBlob(key) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).delete(key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
