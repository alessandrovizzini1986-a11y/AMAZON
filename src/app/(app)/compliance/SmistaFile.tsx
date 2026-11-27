"use client";

import { useMemo, useRef, useState } from "react";
import type { RigaVista } from "@/lib/compliance/dati";
import { it, nomeMese } from "@/domain/compliance/scadenze";
import { chiusa, COLORE_STATO, NOME_STATO, puoSpuntare } from "@/domain/compliance/stato";
import { nomeEntita, percorsoFolder } from "@/domain/compliance/mail";
import { avvisiFile, nomiStandard, proponi } from "@/domain/compliance/smista";
import { spunta } from "./actions";

type Voce = { chiave: string; file: File; entita: string; mese: string; rigaId: string; station: string; nome: string; certo: boolean; riconosciuto: boolean; scaricato: boolean };
const ym = (r: { anno: number; mese: number }) => `${r.anno}-${String(r.mese).padStart(2, "0")}`;
const peso = (b: number) => (b >= 1048576 ? `${(b / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);

/**
 * "Dove va questo file?": si trascina un documento arrivato, il sito dice in quale folder del portale va e lo restituisce
 * con il nome standard. Tutto nel browser: il file non viene inviato al sito.
 */
export function SmistaFile({ righe, oggi, attesa, fai }: { righe: RigaVista[]; oggi: string; attesa: boolean; fai: (f: () => Promise<unknown>) => void }) {
  const [voci, setVoci] = useState<Voce[]>([]);
  const [sopra, setSopra] = useState(false);
  const conta = useRef(0);
  const usabili = useMemo(() => righe.filter((r) => r.usato && r.stato !== "NON_APPLICABILE"), [righe]);
  const perSmista = useMemo(() => usabili.map((r) => ({ id: r.id, entita: r.entita, area: r.area, anno: r.anno, mese: r.mese, folder: r.folder, aperta: !chiusa(r.stato, r.workflow) })), [usabili]);
  const mesi = useMemo(() => [...new Set(usabili.map(ym))].sort(), [usabili]);
  const meseBase = mesi.filter((m) => m < oggi.slice(0, 7)).slice(-1)[0] ?? mesi[0] ?? oggi.slice(0, 7);
  const riga = (id: string) => usabili.find((r) => r.id === id);
  const nomi = (r: RigaVista | undefined, v: { station: string; file: File }) => (r ? nomiStandard(r.nomeFileStandard, { entita: r.entita, folder: r.folder, anno: r.anno, mese: r.mese, station: v.station.trim().toUpperCase() || null, originale: v.file.name }) : []);

  const aggiungi = (lista: FileList | null) => {
    if (!lista?.length) return;
    const nuove = [...lista].map((file): Voce => {
      const p = proponi(file.name, perSmista), r = p.riga ? riga(p.riga.id) : undefined, station = p.indizio.station ?? "";
      return { chiave: `f${conta.current++}`, file, entita: r?.entita ?? p.indizio.entita ?? "PS", mese: r ? ym(r) : p.indizio.mese && p.indizio.anno ? ym({ anno: p.indizio.anno, mese: p.indizio.mese }) : meseBase, rigaId: r?.id ?? "", station, nome: nomi(r, { station, file })[0]?.nome ?? file.name, certo: p.certo, riconosciuto: !!r, scaricato: false };
    });
    setVoci((v) => [...v, ...nuove]);
  };
  // cambiando entità, mese, folder o station il nome proposto si ricalcola; se il folder non c'è in quel mese si svuota
  const cambia = (chiave: string, d: Partial<Pick<Voce, "entita" | "mese" | "rigaId" | "station">>) => setVoci((tutte) => tutte.map((v) => {
    if (v.chiave !== chiave) return v;
    const n = { ...v, ...d, scaricato: false };
    if (d.entita || d.mese) { const prima = riga(v.rigaId); n.rigaId = usabili.find((r) => r.entita === n.entita && ym(r) === n.mese && r.folder === prima?.folder && r.area === prima?.area)?.id ?? ""; }
    n.nome = nomi(riga(n.rigaId), n)[0]?.nome ?? v.file.name;
    return n;
  }));
  const metti = (chiave: string, d: Partial<Voce>) => setVoci((tutte) => tutte.map((v) => (v.chiave === chiave ? { ...v, ...d } : v)));
  const scarica = (v: Voce) => {
    const url = URL.createObjectURL(v.file), a = document.createElement("a");
    a.href = url; a.download = v.nome; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
    metti(v.chiave, { scaricato: true });
  };

  return (
    <div className="flex flex-col gap-3">
      <section className="card flex flex-col gap-2 p-3 md:p-4">
        <h2 className="text-base font-semibold">Dove va questo file?</h2>
        <p className="text-sm text-ink-muted">Trascina qui i documenti che ti sono arrivati. Il sito ti dice in quale folder del portale vanno e te li ridà con il nome giusto: li salvi, e quando il portale apre la cartella li riconosci a colpo d&apos;occhio. I file restano sul tuo computer: il sito non li riceve e non li conserva.</p>
        <label onDragOver={(e) => { e.preventDefault(); setSopra(true); }} onDragLeave={() => setSopra(false)} onDrop={(e) => { e.preventDefault(); setSopra(false); aggiungi(e.dataTransfer.files); }}
          className={`flex min-h-[120px] cursor-pointer flex-col items-center justify-center gap-1 rounded-control border-2 border-dashed px-3 py-4 text-center text-sm ${sopra ? "border-brand bg-brand-light" : "border-[#c5ccd6] bg-surface-raised"}`}>
          <span className="text-base font-semibold text-brand">Trascina qui i file, oppure clicca per sceglierli</span>
          <span className="text-ink-muted">Anche più di uno insieme. Li riconosco dal nome del file.</span>
          <input type="file" multiple className="sr-only" onChange={(e) => { aggiungi(e.target.files); e.target.value = ""; }} />
        </label>
      </section>

      {voci.map((v) => {
        const r = riga(v.rigaId), scelte = usabili.filter((x) => x.entita === v.entita && ym(x) === v.mese), proposte = nomi(r, v);
        const avvisi = r ? avvisiFile(r.formato, v.file.name, v.file.size) : [], incompleto = /[<>]|GG\.MM\.AA|GGMMAAAA|AAMMGG/.test(v.nome), vuoleStation = !!r && /<DS>/.test(r.nomeFileStandard);
        return (
          <section key={v.chiave} className="card flex flex-col gap-3 p-3 text-sm md:p-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0"><div className="break-all font-semibold">{v.file.name}</div><div className="text-xs text-ink-muted">{peso(v.file.size)} · {!v.riconosciuto ? "non l'ho riconosciuto dal nome: scegli tu il folder" : v.certo ? "riconosciuto dal nome del file" : "riconosciuto in parte: controlla entità e mese"}</div></div>
              <button type="button" className="btn-secondary" onClick={() => setVoci((t) => t.filter((x) => x.chiave !== v.chiave))}>Togli</button>
            </div>
            <div className="grid gap-2 md:grid-cols-3">
              <label className="flex flex-col gap-1">Di chi è<select className="input h-11" value={v.entita} onChange={(e) => cambia(v.chiave, { entita: e.target.value })}><option value="PS">{nomeEntita("PS")}</option><option value="ADECCO">{nomeEntita("ADECCO")}</option></select></label>
              <label className="flex flex-col gap-1">Mese di competenza<select className="input h-11" value={v.mese} onChange={(e) => cambia(v.chiave, { mese: e.target.value })}>{[...new Set([...mesi, v.mese])].sort().map((m) => <option key={m} value={m}>{nomeMese(Number(m.slice(0, 4)), Number(m.slice(5)))}</option>)}</select></label>
              <label className="flex flex-col gap-1">Folder<select className="input h-11" value={v.rigaId} onChange={(e) => cambia(v.chiave, { rigaId: e.target.value })}><option value="">— scegli —</option>{scelte.map((x) => <option key={x.id} value={x.id}>{x.area === "Fiscale" ? "Fiscale · " : ""}{x.folder}</option>)}</select></label>
            </div>
            {!r && <p className="rounded-control bg-orange-50 px-3 py-2 text-orange-800">{scelte.length ? "Scegli il folder: ti dico dove va e come chiamarlo." : `Nel registro non ci sono righe di ${nomeEntita(v.entita)} per questo mese.`}</p>}
            {r && (
              <>
                <div className="rounded-control bg-brand-light px-3 py-3">
                  <div className="text-xs font-semibold uppercase tracking-wide text-brand">Sul portale va qui</div>
                  <div className="text-base font-semibold text-ink">{percorsoFolder(r.entita, r.area, r.anno, r.mese, r.folder)}</div>
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-ink-muted"><span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${COLORE_STATO[r.stato]}`}>{NOME_STATO[r.stato]}</span><span>{r.documento} ({r.formato})</span>{r.scadenzaPortale && <span>· il portale chiude il {it(r.scadenzaPortale)}</span>}</div>
                </div>
                {avvisi.map((a) => <p key={a} className="rounded-control bg-orange-50 px-3 py-2 text-orange-800">{a}</p>)}
                {chiusa(r.stato, r.workflow) && <p className="rounded-control bg-orange-50 px-3 py-2 text-orange-800">Attenzione: nel registro questa riga risulta già {NOME_STATO[r.stato].toLowerCase()}. Controlla di non caricare un doppione.</p>}
                {vuoleStation && <label className="flex flex-col gap-1 md:max-w-[220px]">Station (per il nome)<input className="input h-11 uppercase" value={v.station} maxLength={6} placeholder="es. DER1" onChange={(e) => cambia(v.chiave, { station: e.target.value })} /></label>}
                {proposte.length > 1 && <div className="flex flex-wrap items-center gap-2"><span>Questo folder vuole più file. Questo è:</span>{proposte.map((p) => <button key={p.nome} type="button" className={v.nome === p.nome ? "btn-primary" : "btn-secondary"} onClick={() => metti(v.chiave, { nome: p.nome, scaricato: false })}>{p.nome}</button>)}</div>}
                <label className="flex flex-col gap-1">Nome con cui salvarlo<input className="input h-11 font-mono" value={v.nome} onChange={(e) => metti(v.chiave, { nome: e.target.value.replace(/[\\/:*?"|]/g, ""), scaricato: false })} /></label>
                {incompleto && <p className="rounded-control bg-orange-50 px-3 py-2 text-orange-800">Nel nome c&apos;è un pezzo che non posso sapere (protocollo, data di validità, station…): scrivilo tu al posto del segnaposto, poi scarica.</p>}
                <div className="flex flex-wrap items-center gap-2">
                  <button type="button" className="btn-primary" disabled={incompleto || !v.nome.trim()} onClick={() => scarica(v)}>Scarica rinominato</button>
                  {puoSpuntare(r.stato) && <button type="button" className="btn-secondary" disabled={attesa || !v.scaricato} title={v.scaricato ? undefined : "Prima scarica il file rinominato e caricalo sul portale"} onClick={() => fai(async () => { await spunta(r.id, v.nome); })}>L&apos;ho caricato sul portale: metti la spunta</button>}
                  {v.scaricato && <span className="text-ok">✓ Scaricato. Lo trovi nella cartella Download con questo nome.</span>}
                </div>
              </>
            )}
          </section>
        );
      })}
    </div>
  );
}
