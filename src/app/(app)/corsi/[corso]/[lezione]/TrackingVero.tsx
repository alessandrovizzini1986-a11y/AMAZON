"use client";

import { useState } from "react";
import Link from "next/link";
import { TrackingFinto } from "@/components/TrackingFinto";
import { GIORNI_DEMO, type Cella, type TrackingDemo } from "@/domain/corsi/corsi";
import { addDays, weekday } from "@/domain/presenze/grid";
import { leggiContratto, personeDelMese, ripartoAtteso, tettoAccordo, TOLLERANZA, type Persona } from "@/domain/presenze/verifica";
import { tuttiIFile } from "@/lib/presenze/archivioLocale";
import { caricaDatiMese } from "@/lib/presenze/carica";

type Caso = { t: TrackingDemo; station: string; pop: string; settimana: string; tot: number; ass: number; atteso: { std: number; sup: number; acc: number; str: number }; reale: { std: number; sup: number; acc: number; str: number }; giorni: number; tetto: number; pt: boolean };
const it = (x: number) => String(Math.round(x * 100) / 100).replace(".", ",");
const ddmm = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;

/** Una settimana intera di una persona, come TrackingDemo. Le assenze sono in un'unica riga (FERIE) perché qui basta sapere che non ha lavorato. */
function caso(p: Persona, lun: string): Caso | null {
  const dd = Array.from({ length: 7 }, (_, i) => addDays(lun, i)), g = dd.map((d) => p.giorni.get(d));
  const col = (f: (o: NonNullable<(typeof g)[number]>) => number): Cella[] => g.map((o) => (o && f(o) ? f(o) : null));
  const s = { std: 0, sup: 0, acc: 0, str: 0, ass: 0 };
  for (const o of g) if (o) { s.std += o.std; s.sup += o.sup; s.acc += o.acc; s.str += o.str; s.ass += o.ass; }
  const tot = s.std + s.sup + s.acc + s.str, giorni = g.filter((o) => o && o.std + o.sup + o.acc + o.str > 0).length;
  if (giorni < 3) return null;
  const c = leggiContratto(p.contratto), tetto = tettoAccordo(dd[6]);
  if (c.tipo === "DISPATCHER") return null;
  return {
    t: { nome: p.nome, contratto: p.contratto || "non indicato", giorni: dd.map((d, i) => `${GIORNI_DEMO[i]} ${d.slice(8)}`), righe: { Standard: col((o) => o.std), Straordinario: col((o) => o.str), Supplementare: col((o) => o.sup), Accordo: col((o) => o.acc), ...(s.ass ? { FERIE: col((o) => o.ass) } : {}) } },
    station: p.station, pop: p.pop, settimana: `${ddmm(lun)}–${ddmm(dd[6])}`, tot, ass: s.ass, giorni, tetto, pt: c.tipo === "PT",
    atteso: ripartoAtteso(tot, 0, c, tetto), reale: s,
  };
}

/**
 * "Ritrovalo nel tuo tracking": prende un driver vero dai tracking dell'archivio di questo PC e lo mostra con lo
 * stesso disegno delle lezioni. I file non lasciano il computer: nessun dato va al server.
 */
export function TrackingVero() {
  const [casi, setCasi] = useState<Caso[] | null>(null);
  const [i, setI] = useState(0);
  const [mostra, setMostra] = useState(false);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  const carica = async () => {
    setBusy(true); setMsg("");
    try {
      const mesi = [...new Set((await tuttiIFile()).filter((f) => f.kind === "TRACKING").flatMap((f) => f.mesi))].sort();
      if (!mesi.length) { setMsg("Nell'archivio di questo computer non c'è ancora nessun tracking."); return; }
      const mese = mesi.at(-1)!;
      const dati = await caricaDatiMese(mese, setMsg);
      const { persone } = personeDelMese(dati.tracking, mese);
      let lun = `${mese}-01`; while (weekday(lun) !== 0) lun = addDays(lun, 1);
      const lunedi = [lun, addDays(lun, 7), addDays(lun, 14)].filter((l) => addDays(l, 6).startsWith(mese));
      const tutti = persone.flatMap((p) => lunedi.map((l) => caso(p, l)).filter(Boolean) as Caso[]);
      if (!tutti.length) { setMsg("Nei tracking dell'archivio non trovo settimane intere con abbastanza giorni lavorati."); return; }
      // mescola: ogni volta un ordine diverso, alternando settimane da 40 ore in su e più corte
      for (let k = tutti.length - 1; k > 0; k--) { const j = Math.floor(Math.random() * (k + 1)); [tutti[k], tutti[j]] = [tutti[j], tutti[k]]; }
      setCasi(tutti.slice(0, 40)); setI(0); setMostra(false); setMsg("");
    } catch (x) { setMsg(x instanceof Error ? x.message : "Non riesco a leggere l'archivio."); }
    finally { setBusy(false); }
  };

  const c = casi?.[i];
  const diff = c ? ([["Standard", c.reale.std, c.atteso.std], ["Supplementare", c.reale.sup, c.atteso.sup], ["Accordo", c.reale.acc, c.atteso.acc], ["Straordinario", c.reale.str, c.atteso.str]] as [string, number, number][]) : [];
  // part time: Standard e Supplementare si guardano insieme, come fa la Verifica tracking
  const torna = c ? (c.pt ? Math.abs(c.reale.std + c.reale.sup - c.atteso.std - c.atteso.sup) <= TOLLERANZA : Math.abs(c.reale.std - c.atteso.std) <= TOLLERANZA && Math.abs(c.reale.sup - c.atteso.sup) <= TOLLERANZA)
    && Math.abs(c.reale.acc - c.atteso.acc) <= TOLLERANZA && Math.abs(c.reale.str - c.atteso.str) <= TOLLERANZA : false;

  return (
    <section className="card flex flex-col gap-4 p-4 md:p-6" aria-label="Un tracking vero">
      <div>
        <h2 className="text-[19px] font-semibold">Ritrovalo in un tracking vero</h2>
        <p className="text-sm text-ink-muted">Qui vedi un driver preso dai tracking che hai caricato su questo computer, con lo stesso disegno delle lezioni. I file restano sul tuo PC. È un allenamento: non conta per passare la lezione.</p>
      </div>
      {!casi && (
        <div className="flex flex-wrap items-center gap-3">
          <button type="button" className="btn-secondary h-11" disabled={busy} onClick={carica}>{busy ? "Leggo i tracking…" : "Mostrami un driver vero"}</button>
          <span className="text-sm text-ink-muted">Servono i tracking in <Link className="underline" href="/presenze/archivio">Archivio file</Link>.</span>
        </div>
      )}
      {msg && <p className="text-sm text-warn">{msg}</p>}
      {c && (
        <>
          <p className="text-sm"><b>{c.station} · {c.pop}</b> · settimana {c.settimana}</p>
          <TrackingFinto t={c.t} />
          <p className="text-sm">Prima di guardare la risposta, chiediti: <b>quante ore ha lavorato? Le righe sono quelle giuste?</b></p>
          {!mostra
            ? <button type="button" className="btn-primary h-11 self-start" onClick={() => setMostra(true)}>Mostra cosa direbbe il sito</button>
            : (
              <div className={`rounded-control px-4 py-3 text-sm ${torna ? "bg-ok-soft text-ok" : "bg-warn-soft text-warn"}`}>
                <p><b>{it(c.tot)} ore lavorate in {c.giorni} giorni{c.ass ? `, più ${it(c.ass)} ore di assenze` : ""}.</b> Tetto dell&apos;Accordo: {c.tetto} ore.</p>
                <p>Atteso: {diff.map(([n, , a]) => `${n} ${it(a)}`).join(" · ")}.</p>
                <p>Nel tracking: {diff.map(([n, r]) => `${n} ${it(r)}`).join(" · ")}.</p>
                <p className="mt-1 font-semibold">{torna ? "Torna: non c'è niente da chiedere." : c.ass ? "Non torna contando solo le ore lavorate. Con le assenze può essere giusto lo stesso: nella Verifica tracking compare solo se non torna in nessuno dei due modi." : "Non torna: nella Verifica tracking questa settimana esce tra le richieste."}</p>
              </div>
            )}
          <div className="flex flex-wrap gap-3">
            <button type="button" className="btn-secondary h-10" onClick={() => { setI((i + 1) % casi!.length); setMostra(false); }}>Un altro driver</button>
            <span className="self-center text-xs text-ink-muted">{i + 1} di {casi!.length}</span>
          </div>
        </>
      )}
    </section>
  );
}
