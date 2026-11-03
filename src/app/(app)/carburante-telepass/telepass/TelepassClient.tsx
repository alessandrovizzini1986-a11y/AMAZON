"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { MESI } from "@/domain/telepass/comune";
import { elaboraTelepass, type EsitoTelepass } from "@/domain/telepass/telepass";
import { leggiFile, PAGINA } from "@/lib/telepass/riconosci";
import { excelTelepass } from "@/lib/telepass/excelTelepass";
import { scarica } from "@/lib/presenze/excelUtil";
import { salvaTelepassRun } from "../actions";
import type { RunRiga } from "../dati";
import { Dropzone } from "../Dropzone";
import { Griglia } from "../Griglia";
import { Storico } from "../Storico";

const eur = (x: number) => x.toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function TelepassClient({ mappa, runs, canRun }: { mappa: Record<string, string>; runs: RunRiga[]; canRun: boolean }) {
  const router = useRouter();
  const [lavoro, setLavoro] = useState(false);
  const [errore, setErrore] = useState<React.ReactNode>(null);
  const [e, setE] = useState<(EsitoTelepass & { origine: string; hash: string }) | null>(null);
  const [salvata, setSalvata] = useState(false);
  const nMappa = Object.keys(mappa).length;
  const giaFatto = e ? runs.find((r) => r.anno === e.anno && r.mese === e.mese) : undefined;

  const carica = async (files: File[]) => {
    if (!files.length) return;
    setLavoro(true); setErrore(null); setE(null); setSalvata(false);
    try {
      const f = await leggiFile(files[0]);
      if (f.tipo !== "TELEPASS") {
        setErrore(<>{f.nome} è un {PAGINA[f.tipo].descr}: va nella pagina <Link className="font-semibold underline" href={PAGINA[f.tipo].href}>{PAGINA[f.tipo].nome}</Link>.</>);
        return;
      }
      await new Promise((r) => setTimeout(r, 0));
      setE({ ...elaboraTelepass(f.tabella, new Map(Object.entries(mappa))), origine: f.nome, hash: f.hash });
    } catch (x) {
      setErrore(x instanceof Error ? x.message : String(x));
    } finally {
      setLavoro(false);
    }
  };

  const genera = async () => { if (e) { setLavoro(true); try { await scarica(excelTelepass(e), e.nomeFile); } finally { setLavoro(false); } } };
  const salva = async () => {
    if (!e) return;
    await salvaTelepassRun({
      nomeFile: e.origine, hash: e.hash, anno: e.anno, mese: e.mese, righe: e.righe.length, fuoriMese: e.fuoriMese,
      nonMappati: e.nonMappati.length, ricondotti: e.ricondotti.length, totale: e.totale, totali: e.totali,
      anomalie: e.anomalie.map((a) => ({ ...a })),
    });
    setSalvata(true);
    router.refresh();
  };

  return (
    <div className="flex flex-col gap-6">
      {nMappa === 0 && (
        <p className="rounded-control bg-warn-soft px-4 py-3 text-sm text-warn">La mappa dei dispositivi è vuota: prima importa <code>TBusiness_carica_veicoli.xlsx</code> nella pagina <Link className="font-semibold underline" href="/carburante-telepass/anagrafiche">Anagrafiche</Link>, altrimenti ogni transazione risulta NON MAPPATO.</p>
      )}
      {canRun && (
        <Dropzone titolo="Trascina qui il CSV Telepass" accept=".csv" lavoro={lavoro} onFiles={carica}
          testo={<>Telepass Business → Transazioni → Esporta CSV (<code>_lista_transazioni_….csv</code>). Mese e anno si leggono dalla colonna Data; mappa attuale: {nMappa} dispositivi.</>} />
      )}
      {errore && <p className="rounded-control bg-warn-soft px-4 py-3 text-sm text-warn">{errore}</p>}

      {e && (
        <>
          <section className="grid grid-cols-2 gap-3 lg:grid-cols-5">
            <Kpi l="Mese" v={`${MESI[e.mese]} ${e.anno}`} />
            <Kpi l="Transazioni" v={e.righe.length.toLocaleString("it-IT")} />
            <Kpi l="Totale Importo €" v={eur(e.totale)} />
            <Kpi l="Dispositivi non mappati" v={String(e.nonMappati.length)} rosso={e.nonMappati.length > 0} />
            <Kpi l="Ricondotti a GLS - CASTEL MAGGIORE" v={String(e.ricondotti.length)} giallo={e.ricondotti.length > 0} />
          </section>

          {(e.nonMappati.length > 0 || e.ricondotti.length > 0 || e.fuoriMese > 0) && (
            <section className="card border-warn p-4 md:p-5">
              <h2 className="mb-1 text-[19px] font-semibold">Anomalie da guardare prima di generare</h2>
              <p className="mb-3 text-sm text-ink-muted">Le anomalie non si correggono nel file: si aggiorna la mappa in <Link className="font-semibold text-brand" href="/carburante-telepass/anagrafiche">Anagrafiche</Link> e si rielabora.</p>
              <table className="table-base text-sm">
                <thead><tr><th>Tipo</th><th>Dispositivo</th><th>Transazioni</th><th>Nota</th></tr></thead>
                <tbody>{e.anomalie.map((a, i) => <tr key={i}><td>{a.tipo}</td><td className="font-mono">{a.chiave}</td><td>{a.n}</td><td className="text-ink-muted">{a.nota}{e.ricondotti.find((r) => r.codice === a.chiave) ? ` · ${eur(e.ricondotti.find((r) => r.codice === a.chiave)!.importo)} €` : ""}</td></tr>)}</tbody>
              </table>
            </section>
          )}

          <section className="card p-4 md:p-5">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <h2 className="mr-auto text-[19px] font-semibold">Somma di Importo per station e settimana</h2>
              <button type="button" className="btn-primary h-10" disabled={lavoro} onClick={genera}>Genera Excel</button>
              {canRun && <button type="button" className="btn-secondary h-10" disabled={salvata} onClick={salva}>{salvata ? "Salvata ✓" : "Salva elaborazione"}</button>}
            </div>
            {giaFatto && !salvata && <p className="mb-2 text-sm text-warn">{MESI[e.mese]} {e.anno} è già stato elaborato il {new Date(giaFatto.eseguitoIl).toLocaleDateString("it-IT")} da {giaFatto.eseguitoDa}: salvando ne registri una nuova versione.</p>}
            <Griglia titolo="STATION" settimane={e.settimane} stazioni={e.stazioni} totali={e.totali} perStation={e.perStation} totale={e.totale} />
            <p className="mt-2 text-xs text-ink-faint">Settimane WEEKNUM di Excel (inizio domenica). L&apos;Excel {e.nomeFile} contiene la tabella Toll, il foglio PVT a formule (con RMPP, ZTL e TOTALE), i fogli ztlrimini e RMPP vuoti da compilare e le Anomalie.</p>
          </section>
        </>
      )}

      <Storico runs={runs} etichettaRighe="Transazioni" />
    </div>
  );
}

function Kpi({ l, v, rosso, giallo }: { l: string; v: string; rosso?: boolean; giallo?: boolean }) {
  return (
    <div className={`card p-4 ${rosso ? "border-danger bg-danger-soft" : giallo ? "border-warn bg-warn-soft" : ""}`}>
      <div className="text-xs font-medium text-ink-muted">{l}</div>
      <div className={`text-2xl font-bold ${rosso ? "text-danger" : giallo ? "text-warn" : ""}`}>{v}</div>
    </div>
  );
}
