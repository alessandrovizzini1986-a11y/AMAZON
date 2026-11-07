"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { elimina, scaricaArchiviato, svuota, tuttiMeta, LIMITI, type MetaArchiviato } from "@/lib/archivioFile";
import { elencoFile } from "@/lib/presenze/archivioLocale";

const giorno = (iso: string) => new Date(iso).toLocaleDateString("it-IT");
const kb = (n: number) => (n > 1048576 ? `${(n / 1048576).toLocaleString("it-IT", { maximumFractionDigits: 1 })} MB` : `${Math.ceil(n / 1024)} KB`);

export function ArchivioClient() {
  const [file, setFile] = useState<MetaArchiviato[] | null>(null);
  const [presenze, setPresenze] = useState<number | null>(null);
  const [filtro, setFiltro] = useState("");
  const ricarica = async () => {
    setFile(await tuttiMeta().catch(() => []));
    setPresenze(await elencoFile().then((x) => x.length).catch(() => null));
  };
  useEffect(() => { void ricarica(); }, []);
  if (!file) return <p className="text-sm text-ink-muted">Lettura dell&apos;archivio…</p>;
  const sezioni = [...new Set(file.map((f) => f.sezione))].sort();
  const vis = file.filter((f) => !filtro || f.sezione === filtro);
  const tot = file.reduce((a, f) => a + f.dimensione, 0);
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end gap-3 text-sm">
        <label className="flex flex-col gap-1 text-xs font-semibold text-ink-muted">Sezione
          <select className="input h-10 w-72" value={filtro} onChange={(e) => setFiltro(e.target.value)}><option value="">Tutte ({file.length})</option>{sezioni.map((s) => <option key={s}>{s}</option>)}</select>
        </label>
        <span className="text-ink-muted">{file.length} file, {kb(tot)} · si tengono {LIMITI.giorni} giorni dall&apos;ultimo uso</span>
        {file.length > 0 && <button type="button" className="btn-danger" onClick={async () => { if (window.confirm("Svuotare l'archivio di questo PC? I dati già salvati sul sito restano.")) { await svuota(); await ricarica(); } }}>Svuota archivio</button>}
      </div>
      {presenze !== null && <p className="text-sm">I file delle presenze (tracking, CSV Amazon, Zucchetti) hanno il loro archivio: <Link className="text-brand underline" href="/presenze/archivio">{presenze} file in Presenze → Archivio</Link>.</p>}
      <section className="card overflow-x-auto p-4 md:p-5">
        {vis.length === 0 ? <p className="text-sm text-ink-muted">Ancora nessun file: quelli che trascini nelle pagine (fatture, Q8, Telepass, GLS, costi, flotta…) compaiono qui.</p> : (
          <table className="table-base text-sm">
            <thead><tr><th>File</th><th>Sezione</th><th>Caricato</th><th>Ultimo uso</th><th className="text-right">Dimensione</th><th></th></tr></thead>
            <tbody>{vis.map((f) => (
              <tr key={f.hash}>
                <td className="break-all">{f.nome}</td><td>{f.sezione}</td><td>{giorno(f.caricatoIl)}</td><td>{giorno(f.usatoIl)}</td><td className="text-right">{kb(f.dimensione)}</td>
                <td className="whitespace-nowrap"><button type="button" className="btn-secondary px-2 py-1 text-xs" onClick={() => scaricaArchiviato(f.hash)}>Scarica</button> <button type="button" className="btn-secondary px-2 py-1 text-xs" onClick={async () => { await elimina(f.hash); await ricarica(); }}>Togli</button></td>
              </tr>
            ))}</tbody>
          </table>
        )}
      </section>
    </div>
  );
}
