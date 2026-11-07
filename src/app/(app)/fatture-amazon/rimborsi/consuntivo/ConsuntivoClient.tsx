"use client";

import { useState } from "react";
import Link from "next/link";
import { Dropzone } from "@/components/Dropzone";
import { Aiuto } from "@/components/Aiuto";
import { fogliDelFile, matriceFoglio } from "@/lib/fatture/xlsxStream";
import { annoDaNome, leggiConsuntivo, totaliMeseVoce, type RigaConsuntivo } from "@/domain/fatture/consuntivo";
import { MESI_NOMI } from "@/lib/mesi";
import { consuntivoEsistente, salvaConsuntivo } from "./actions";

const VOCI = ["CARBURANTE", "PEDAGGI", "PARCHEGGI"] as const;
const eur = (v: number | undefined) => (v === undefined ? "—" : v.toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 }));

export function ConsuntivoClient() {
  const [file, setFile] = useState<{ nome: string; m: unknown[][] } | null>(null);
  const [anno, setAnno] = useState<number>(new Date().getFullYear() - 1);
  const [righe, setRighe] = useState<RigaConsuntivo[]>([]);
  const [scartate, setScartate] = useState(0);
  const [esist, setEsist] = useState<Awaited<ReturnType<typeof consuntivoEsistente>> | null>(null);
  const [lavoro, setLavoro] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [fatto, setFatto] = useState<string | null>(null);

  const calcola = async (m: unknown[][], a: number) => {
    const r = leggiConsuntivo(m as never, a);
    setRighe(r.righe); setScartate(r.scartate);
    setEsist(await consuntivoEsistente(a));
  };
  const carica = async (files: File[]) => {
    const f = files[0]; if (!f) return;
    setLavoro(true); setMsg(null); setFatto(null);
    try {
      const buf = await f.arrayBuffer();
      const fogli = await fogliDelFile(buf);
      const nome = fogli.find((s) => s.trim().toUpperCase() === "SOLITO");
      if (!nome) throw new Error(`manca il foglio SOLITO (fogli: ${fogli.join(", ")})`);
      const m = await matriceFoglio(buf, nome);
      const a = annoDaNome(f.name) ?? anno;
      setAnno(a); setFile({ nome: f.name, m });
      await calcola(m, a);
    } catch (e) { setMsg(`${f.name}: ${(e as Error).message}`); setRighe([]); } finally { setLavoro(false); }
  };
  const cambiaAnno = async (a: number) => { setAnno(a); if (file && a > 2019 && a < 2101) { setLavoro(true); try { await calcola(file.m, a); } finally { setLavoro(false); } } };
  const salva = async () => {
    if (!file) return;
    setLavoro(true);
    try {
      const r = await salvaConsuntivo({ anno, nomeFile: file.nome, righe });
      setFatto(`Salvati ${r.righe} importi su ${r.mesi} mesi del ${anno}: in Rimborsi valgono al posto dei costi stimati.`);
      setFile(null); setRighe([]); setEsist(null);
    } catch (e) { setMsg((e as Error).message); } finally { setLavoro(false); }
  };

  const nuovi = totaliMeseVoce(righe);
  const mesi = [...new Set(righe.map((r) => r.mese))].sort((a, b) => a - b);
  return (
    <div className="flex flex-col gap-5">
      <Dropzone titolo="Consuntivo contabile" aiuto="consuntivo.file" accept=".xlsx,.xlsm" lavoro={lavoro} onFiles={carica}
        testo={<>Trascina <b>consuntivo_costi_fatturato_AAAA.xlsx</b> (foglio SOLITO). Il file non si salva: il sito tiene solo i totali per mese, DS e voce.</>} />
      {msg && <p className="rounded-control bg-danger-soft px-4 py-3 text-sm text-danger">{msg}</p>}
      {fatto && <p className="rounded-control bg-ok-soft px-4 py-3 text-sm text-ok">✓ {fatto} <Link className="underline" href="/fatture-amazon/rimborsi">Apri Rimborsi</Link></p>}
      {file && (
        <section className="card p-4 md:p-5">
          <h2 className="mb-2 text-[19px] font-semibold">Anteprima</h2>
          <div className="mb-3 flex flex-wrap items-center gap-3 text-sm">
            <label className="flex items-center gap-2">Anno del file <input type="number" className="input w-24" value={anno} onChange={(e) => cambiaAnno(Number(e.target.value))} /></label>
            <span className="text-ink-muted">{file.nome} · {righe.length} importi (CDC 5569) · {scartate} righe senza DS o importo escluse</span>
          </div>
          <p className="mb-3 text-sm text-ink-muted">Per ogni mese del file i costi del sito vengono sostituiti con questi. I mesi che non sono nel file restano come sono. {esist?.fonte.length ? `Oggi sul sito: ${esist.fonte.join(", ")}.` : "Oggi sul sito non c'è un consuntivo per quest'anno."}</p>
          <div className="overflow-x-auto"><table className="table-base text-sm">
            <thead><tr><th>Mese</th>{VOCI.map((v) => <th key={v} className="text-right">{v.toLowerCase()} file €</th>)}{VOCI.map((v) => <th key={`s${v}`} className="text-right">{v.toLowerCase()} sito €</th>)}</tr></thead>
            <tbody>{mesi.map((m) => (
              <tr key={m}><td>{MESI_NOMI[m - 1]}</td>
                {VOCI.map((v) => <td key={v} className="text-right font-mono">{eur(nuovi[`${m}|${v}`])}</td>)}
                {VOCI.map((v) => { const s = esist?.totali[`${m}|${v}`], n = nuovi[`${m}|${v}`] ?? 0; return <td key={`s${v}`} className={`text-right font-mono ${s !== undefined && Math.abs(s - n) > 1 ? "text-warn" : "text-ink-muted"}`}>{eur(s)}</td>; })}
              </tr>
            ))}</tbody>
          </table></div>
          <div className="mt-3 flex items-center gap-2">
            <button type="button" className="btn-primary" disabled={lavoro || !righe.length} onClick={salva}>Salva il consuntivo {anno}</button><Aiuto k="consuntivo.salva" />
          </div>
        </section>
      )}
    </div>
  );
}
