const DB_NAME = "slide-tkool-db";
const DB_VERSION = 1;
const STORE_NAME = "projects";
const AUTOSAVE_KEY = "autosave";

function openDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) db.createObjectStore(STORE_NAME);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("IndexedDBを開けませんでした。"));
  });
}

async function withStore(mode, action) {
  const db = await openDb();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, mode);
      const store = tx.objectStore(STORE_NAME);
      const request = action(store);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error ?? new Error("保存処理に失敗しました。"));
      tx.onabort = () => reject(tx.error ?? new Error("保存処理が中断されました。"));
    });
  } finally {
    db.close();
  }
}

export async function saveAutosave(project) {
  const snapshot = structuredClone(project);
  snapshot.updatedAt = new Date().toISOString();
  await withStore("readwrite", (store) => store.put(snapshot, AUTOSAVE_KEY));
}

export async function loadAutosave() {
  return await withStore("readonly", (store) => store.get(AUTOSAVE_KEY));
}

export async function clearAutosave() {
  await withStore("readwrite", (store) => store.delete(AUTOSAVE_KEY));
}
