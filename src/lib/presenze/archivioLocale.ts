/**
 * Archivio locale dei file presenze nel browser (IndexedDB): i file restano sul
 * PC della stagista e sopravvivono al refresh; al server vanno solo i metadati.
 */
import type { FileLocale } from "./riconosci";

const DB = "fleetdsp-presenze";
const STORE = "files";

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE, { keyPath: "hash" });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return open().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const t = db.transaction(STORE, mode);
        const r = fn(t.objectStore(STORE));
        t.oncomplete = () => { resolve(r.result); db.close(); };
        t.onerror = () => { reject(t.error); db.close(); };
      }),
  );
}

export const salvaFile = (f: FileLocale) => tx("readwrite", (s) => s.put(f)).then(() => undefined);
export const eliminaFile = (hash: string) => tx("readwrite", (s) => s.delete(hash)).then(() => undefined);
export const svuotaArchivio = () => tx("readwrite", (s) => s.clear()).then(() => undefined);
export const tuttiIFile = () => tx<FileLocale[]>("readonly", (s) => s.getAll() as IDBRequest<FileLocale[]>);

/** Solo metadati (senza buffer e righe) per le liste a video. */
export async function elencoFile(): Promise<Omit<FileLocale, "buffer" | "flexRows">[]> {
  return (await tuttiIFile()).map(({ buffer: _b, flexRows: _f, ...m }) => m).sort((a, b) => a.nome.localeCompare(b.nome));
}
