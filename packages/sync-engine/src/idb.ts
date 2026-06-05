/**
 * Minimal IndexedDB key-value store — just enough to persist the offline
 * mutation queue (XP-3 Phase 2). No external deps; falls back to an in-memory
 * map when IndexedDB is unavailable (SSR, private-mode quirks) so callers never
 * have to branch on environment.
 */

export interface KvStore {
  getAll<T>(): Promise<T[]>;
  put(key: string, value: unknown): Promise<void>;
  delete(key: string): Promise<void>;
  clear(): Promise<void>;
}

class MemoryStore implements KvStore {
  private map = new Map<string, unknown>();
  async getAll<T>(): Promise<T[]> {
    return [...this.map.values()] as T[];
  }
  async put(key: string, value: unknown): Promise<void> {
    this.map.set(key, value);
  }
  async delete(key: string): Promise<void> {
    this.map.delete(key);
  }
  async clear(): Promise<void> {
    this.map.clear();
  }
}

class IdbStore implements KvStore {
  private dbName: string;
  private storeName: string;
  private dbp: Promise<IDBDatabase> | null = null;

  constructor(dbName: string, storeName: string) {
    this.dbName = dbName;
    this.storeName = storeName;
  }

  private db(): Promise<IDBDatabase> {
    if (this.dbp) return this.dbp;
    this.dbp = new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open(this.dbName, 1);
      req.onupgradeneeded = () => {
        if (!req.result.objectStoreNames.contains(this.storeName)) {
          req.result.createObjectStore(this.storeName);
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    return this.dbp;
  }

  private async tx(mode: IDBTransactionMode): Promise<IDBObjectStore> {
    const db = await this.db();
    return db.transaction(this.storeName, mode).objectStore(this.storeName);
  }

  async getAll<T>(): Promise<T[]> {
    const store = await this.tx('readonly');
    return new Promise<T[]>((resolve, reject) => {
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result as T[]);
      req.onerror = () => reject(req.error);
    });
  }

  async put(key: string, value: unknown): Promise<void> {
    const store = await this.tx('readwrite');
    return new Promise<void>((resolve, reject) => {
      const req = store.put(value, key);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }

  async delete(key: string): Promise<void> {
    const store = await this.tx('readwrite');
    return new Promise<void>((resolve, reject) => {
      const req = store.delete(key);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }

  async clear(): Promise<void> {
    const store = await this.tx('readwrite');
    return new Promise<void>((resolve, reject) => {
      const req = store.clear();
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }
}

export function openKvStore(dbName: string, storeName: string): KvStore {
  try {
    if (typeof indexedDB !== 'undefined') return new IdbStore(dbName, storeName);
  } catch {
    /* fall through */
  }
  return new MemoryStore();
}
