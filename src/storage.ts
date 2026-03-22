type Note = {
  id: string;
  title: string;
  body: string;
  importance: number;
  urgency: number;
  dueDate?: string;
  dueAnchorAt?: number;
  color: string;
  completed: boolean;
  completedAt?: number;
  createdAt: number;
  updatedAt: number;
};

const DB_NAME = 'quad-to-do';
const STORE_NAME = 'notes';
const DB_VERSION = 1;

const openDb = () =>
  new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });

const runTransaction = async (
  mode: IDBTransactionMode,
  action: (store: IDBObjectStore) => void
): Promise<void> => {
  const db = await openDb();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, mode);
    const store = tx.objectStore(STORE_NAME);
    action(store);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
};

const withStore = async <T,>(
  mode: IDBTransactionMode,
  action: (store: IDBObjectStore) => IDBRequest<T>
): Promise<T> => {
  const db = await openDb();
  return new Promise<T>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, mode);
    const store = tx.objectStore(STORE_NAME);
    const request = action(store);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
};

export const loadNotes = async (): Promise<Note[]> => {
  try {
    const result = await withStore<Note[]>('readonly', (store) => store.getAll());
    return result ?? [];
  } catch {
    return [];
  }
};

export const saveNote = async (note: Note): Promise<void> => {
  await withStore('readwrite', (store) => store.put(note));
};

export const deleteNote = async (id: string): Promise<void> => {
  await withStore('readwrite', (store) => store.delete(id));
};

export async function replaceNotes(notes: Note[]): Promise<void> {
  await runTransaction('readwrite', (store) => {
    store.clear();
    notes.forEach((note) => {
      store.put(note);
    });
  });
}
