"use client";

import { useState } from "react";
import { Dropzone } from "@/components/Dropzone";
import { Aiuto } from "@/components/Aiuto";
import { fogliDelFile, matriceFoglio } from "@/lib/fatture/xlsxStream";
import { meseDaNome, perStationRun, storicoQ8, storicoTelepass, type TotaliRun } from "@/domain/telepass/storico";
import { etichettaMese } from "@/lib/mesi";
import { runEsistenti, salvaStorico } from "./actions";

type Voce = { tipo: "Q8" | "TELEPASS"; anno: number; mese: number; nomeFile: string; hash: string; righe: number; totale: number; totali: TotaliRun; perStation: Record<string, number>; salva: boolean };
type Esistenti = Awaited<ReturnType<typeof runEsistenti>>;
const eur = (v: number) => v.toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const chiave = (v: Pick<Voce, "tipo" | "anno" | "mese">) => `${v.tipo}|${v.anno}-${v.mese}`;
const mm = (v: Pick<Voce, "anno" | "mese">) => `${v.anno}-${String(v.mese).padStart(2, "0")}`;

async function sha256(buf: ArrayBuffer) {
  const h = await crypto.subtle.digest("SHA-256", buf);
  return [...new Uint8Array(h)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function StoricoClient() {
  const [voci, setVoci] = useState<Voce[]>([]);
  const [esistenti, setEsistenti] = useState<Esistenti>({});
  const [lavoro, setLavoro] = useState(false);
  const [msg, setMsg] = useState<string[]>([]);
  const [fatto, setFatto] = useState<string | null>(null);

  const carica = async (files: File[]) => {
    setLavoro(true); setFatto(null);
    const out: string[] = [], nuove: Voce[] = [];
    for (const f of files) {
      try {
        const buf = await f.arrayBuffer();
        const fogli = await fogliDelFile(buf);
        const hash = await sha256(buf);
        if (fogli.includes("PVT") && /telepass/i.test(f.name + fogli.join(" "))) {
          const r = storicoTelepass(await matriceFoglio(buf, "PVT"));
          const m = meseDaNome(f.name) ?? meseDaNome(fogli[0] + ".x");
          if (!m) throw new Error("mese non riconosciuto dal nome del file (atteso MM_Telepass_<Mese>_AAAA)");
          nuove.push({ tipo: "TELEPASS", ...m, nomeFile: f.name, hash, righe: 0, totale: r.totale, totali: r.totali, perStation: perStationRun(r.totali), salva: true });
          out.push(`${f.name}: Telepass elaborato di ${etichettaMese(mm(m))}`);
          continue;
        }
        const ordine = [...fogli].sort((a, b) => Number(/transazioni/i.test(b)) - Number(/transazioni/i.test(a)));
        let ok = false;
        for (const nome of ordine) {
          try {
            const r = storicoQ8(await matriceFoglio(buf, nome));
            nuove.push({ tipo: "Q8", anno: r.anno, mese: r.mese, nomeFile: f.name, hash, righe: r.righe, totale: r.totale, totali: r.totali, perStation: perStationRun(r.totali), salva: true });
            out.push(`${f.name}: Q8 elaborato di ${etichettaMese(mm(r))}, ${r.righe} transazioni${r.senzaStation ? `, ${r.senzaStation} senza STATION escluse` : ""}`);
            ok = true; break;
          } catch { /* foglio successivo */ }
        }
        if (!ok) throw new Error("non è un file Q8 elaborato (colonna STATION) né un Telepass elaborato (foglio PVT)");
      } catch (e) { out.push(`${f.name}: ${(e as Error).message}`); }
    }
    const tutte = [...voci.filter((v) => !nuove.some((n) => chiave(n) === chiave(v))), ...nuove].sort((a, b) => a.tipo.localeCompare(b.tipo) || mm(a).localeCompare(mm(b)));
    const es = tutte.length ? await runEsistenti(tutte.map(({ tipo, anno, mese }) => ({ tipo, anno, mese }))) : {};
    setEsistenti(es);
    setVoci(tutte.map((v) => ({ ...v, salva: nuove.some((n) => chiave(n) === chiave(v)) ? !es[chiave(v)] : v.salva })));
    setMsg(out); setLavoro(false);
  };

  const salva = async () => {
    const s = voci.filter((v) => v.salva);
    if (!s.length) return;
    setLavoro(true);
    try {
      await salvaStorico(s.map(({ tipo, anno, mese, nomeFile, hash, righe, totale, totali }) => ({ tipo, anno, mese, nomeFile, hash, righe, totale, totali })));
      setFatto(`${s.length} mesi salvati: da ora valgono in Rimborsi, nel foglio F.O. e nello stato del mese.`);
      setVoci([]); setEsistenti({});
    } catch (e) { setMsg([(e as Error).message]); } finally { setLavoro(false); }
  };

  return (
    <div className="flex flex-col gap-5">
      <Dropzone titolo="File elaborati Q8 e Telepass" aiuto="telepass.storico.file" multiple accept=".xlsx,.xlsm" lavoro={lavoro} onFiles={carica}
        testo={<>Trascina i file <b>MM_Transazioni_&lt;Mese&gt;_AA_Q8.xlsx</b> e <b>MM_Telepass_&lt;Mese&gt;_AAAA.xlsx</b> dei mesi che mancano. Anche tutti insieme.</>} />
      {msg.length > 0 && <ul className="text-sm text-ink-muted">{msg.map((m) => <li key={m}>{m}</li>)}</ul>}
      {fatto && <p className="rounded-control bg-ok-soft px-4 py-3 text-sm text-ok">✓ {fatto}</p>}
      {voci.length > 0 && (
        <section className="card p-4 md:p-5">
          <h2 className="mb-2 text-[19px] font-semibold">Anteprima</h2>
          <p className="mb-3 text-sm text-ink-muted">Per ogni mese: il totale del file e quello già sul sito. Se il mese c&apos;è già è deselezionato: selezionalo solo se vuoi che valga il file (l&apos;elaborazione nuova si aggiunge e diventa quella che vale).</p>
          <div className="overflow-x-auto"><table className="table-base text-sm">
            <thead><tr><th>Salva</th><th>Tipo</th><th>Mese</th><th>File</th><th className="text-right">Totale file €</th><th className="text-right">Sul sito €</th><th className="text-right">Differenza</th><th>Per station (file)</th></tr></thead>
            <tbody>{voci.map((v) => {
              const e = esistenti[chiave(v)];
              const fileTot = Object.values(v.perStation).reduce((a, x) => a + x, 0);
              return (
                <tr key={chiave(v)}>
                  <td><input type="checkbox" className="h-4 w-4" checked={v.salva} aria-label={`Salva ${v.tipo} ${mm(v)}`} onChange={(ev) => setVoci(voci.map((x) => (chiave(x) === chiave(v) ? { ...x, salva: ev.target.checked } : x)))} /></td>
                  <td>{v.tipo === "Q8" ? "Carburante Q8" : "Telepass"}</td><td>{etichettaMese(mm(v))}</td><td className="text-xs">{v.nomeFile}</td>
                  <td className="text-right font-mono">{eur(fileTot)}</td>
                  <td className="text-right font-mono">{e ? eur(e.totale) : <span className="text-ink-muted">nessuna</span>}</td>
                  <td className={`text-right font-mono ${e && Math.abs(fileTot - e.totale) > 1 ? "text-warn" : ""}`}>{e ? eur(fileTot - e.totale) : "—"}</td>
                  <td className="text-xs">{Object.entries(v.perStation).map(([s, x]) => `${s} ${eur(x)}`).join(" · ")}</td>
                </tr>
              );
            })}</tbody>
          </table></div>
          <div className="mt-3 flex items-center gap-2">
            <button type="button" className="btn-primary" disabled={lavoro || !voci.some((v) => v.salva)} onClick={salva}>Salva {voci.filter((v) => v.salva).length} mesi sul sito</button><Aiuto k="telepass.storico.salva" />
          </div>
        </section>
      )}
    </div>
  );
}
