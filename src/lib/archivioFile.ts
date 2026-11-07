/**
 * Archivio file del PC (IndexedDB del browser): ogni file trascinato in una pagina resta qui, così non va ritrascinato
 * dopo un aggiornamento della pagina e si riusa da altre sezioni. Al server non arriva nulla.
 * Si tengono gli ultimi 120 giorni e al massimo 300 file (file oltre 40 MB esclusi).
 */
export type FileArchiviato = { hash: string; nome: string; tipo: string; dimensione: number; sezione: string; caricatoIl: string; usatoIl: string; buffer: ArrayBuffer };
export type MetaArchiviato = Omit<FileArchiviato, "buffer">;

const DB = "fleetdsp-file", STORE = "file";
export const LIMITI = { giorni: 120, file: 300, maxByte: 40 * 1024 * 1024 };

/** Quali tenere: i più usati di recente, entro i limiti (puro, testato). */
export function daTenere<T extends Pick<MetaArchiviato, "hash" | "usatoIl">>(xs: T[], oggi = new Date(), l = LIMITI): Set<string> {
  const soglia = oggi.getTime() - l.giorni * 86400000;
  return new Set([...xs].filter((x) => Date.parse(x.usatoIl) >= soglia).sort((a, b) => b.usatoIl.localeCompare(a.usatoIl)).slice(0, l.file).map((x) => x.hash));
}

/** Estensioni ammesse da un attributo accept (".xlsx,.xlsm") → filtro sul nome. */
export const accetta = (accept: string, nome: string) => !accept.trim() || accept.split(",").map((e) => e.trim().toLowerCase()).some((e) => e.startsWith(".") ? nome.toLowerCase().endsWith(e) : true);

function apri(): Promise<IDBDatabase> {
  return new Promise((ok, ko) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => { if (!r.result.objectStoreNames.contains(STORE)) r.result.createObjectStore(STORE, { keyPath: "hash" }); };
    r.onsuccess = () => ok(r.result); r.onerror = () => ko(r.error);
  });
}
async function conStore<T>(modo: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T> | void): Promise<T | undefined> {
  const db = await apri();
  return new Promise((ok, ko) => {
    const t = db.transaction(STORE, modo); const r = fn(t.objectStore(STORE));
    t.oncomplete = () => { ok(r ? r.result : undefined); db.close(); }; t.onerror = () => { ko(t.error); db.close(); };
  });
}

async function sha256(buf: ArrayBuffer) {
  return [...new Uint8Array(await crypto.subtle.digest("SHA-256", buf))].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function tuttiMeta(): Promise<MetaArchiviato[]> {
  const xs = ((await conStore("readonly", (s) => s.getAll())) ?? []) as FileArchiviato[];
  return xs.map(({ buffer: _b, ...m }) => m).sort((a, b) => b.usatoIl.localeCompare(a.usatoIl));
}

/** Salva i file (stesso contenuto = stesso file: aggiorna solo la data d'uso) e fa pulizia. Non blocca mai la pagina. */
export async function archivia(files: File[], sezione: string): Promise<void> {
  try {
    const ora = new Date().toISOString();
    for (const f of files) {
      if (f.size > LIMITI.maxByte) continue;
      const buffer = await f.arrayBuffer();
      const hash = await sha256(buffer);
      const c = (await conStore("readonly", (s) => s.get(hash))) as FileArchiviato | undefined;
      await conStore("readwrite", (s) => { s.put(c ? { ...c, usatoIl: ora, sezione } : { hash, nome: f.name, tipo: f.type, dimensione: f.size, sezione, caricatoIl: ora, usatoIl: ora, buffer }); });
    }
    const tieni = daTenere(await tuttiMeta());
    const via = (await tuttiMeta()).filter((m) => !tieni.has(m.hash));
    for (const m of via) await conStore("readwrite", (s) => { s.delete(m.hash); });
  } catch { /* archivio non disponibile (navigazione privata): la pagina funziona lo stesso */ }
}

export async function riprendi(hashes: string[], sezione: string): Promise<File[]> {
  const out: File[] = [];
  for (const h of hashes) {
    const x = (await conStore("readonly", (s) => s.get(h))) as FileArchiviato | undefined;
    if (!x) continue;
    out.push(new File([x.buffer], x.nome, { type: x.tipo }));
    await conStore("readwrite", (s) => { s.put({ ...x, usatoIl: new Date().toISOString(), sezione }); });
  }
  return out;
}

export const elimina = (hash: string) => conStore("readwrite", (s) => { s.delete(hash); });
export const svuota = () => conStore("readwrite", (s) => { s.clear(); });
export async function scaricaArchiviato(hash: string) {
  const x = (await conStore("readonly", (s) => s.get(hash))) as FileArchiviato | undefined;
  if (!x) return;
  const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([x.buffer], { type: x.tipo })); a.download = x.nome; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}
