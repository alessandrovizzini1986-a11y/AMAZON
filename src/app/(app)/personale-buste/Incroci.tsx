import Link from "next/link";
import type { incrociOrganico } from "@/lib/personale/organico";

type Dati = NonNullable<Awaited<ReturnType<typeof incrociOrganico>>>;
const MESI = ["gennaio", "febbraio", "marzo", "aprile", "maggio", "giugno", "luglio", "agosto", "settembre", "ottobre", "novembre", "dicembre"];
const mese = (m: string) => `${MESI[Number(m.slice(5)) - 1]} ${m.slice(0, 4)}`;
const data = (d: Date) => d.toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "Europe/Rome" });
const chi = (p: { cognome: string; nome: string }) => `${p.cognome} ${p.nome}`;

/** Organico del file HR incrociato con telefoni, SIM e anagrafica costi: le cose da fare che nascono dal confronto. */
export function Incroci({ d }: { d: Dati }) {
  const niente = !d.daRitirare.length && !d.inScadenza.length && !d.mancanoInCdl.length && !d.cdlDaTogliere.length && !d.stationDiversa.length;
  return (
    <section className="card flex flex-col gap-4 p-4 md:p-5" aria-labelledby="incroci">
      <div>
        <h2 id="incroci" className="text-[17px] font-semibold">Organico e controlli incrociati</h2>
        <p className="text-sm text-ink-muted">Dal file HR di {mese(d.versione)}: {d.attivi} dipendenti SIC in forza, {d.usciti.length} usciti nel mese. Il sito lo confronta con Telefoni e SIM e con l&apos;anagrafica dei Costi del personale.</p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead><tr className="text-left text-xs text-ink-muted"><th className="py-1 pr-3 font-normal">Station</th><th className="py-1 pr-3 text-right font-normal">In forza</th><th className="py-1 pr-3 text-right font-normal">di cui autisti</th><th className="py-1 pr-3 text-right font-normal">A termine</th><th className="py-1 pr-3 text-right font-normal">Usciti nel mese</th></tr></thead>
          <tbody>{d.perStation.map((s) => <tr key={s.station} className="border-t border-line"><td className="py-1 pr-3 font-medium">{s.station}</td><td className="py-1 pr-3 text-right tabular-nums">{s.attivi}</td><td className="py-1 pr-3 text-right tabular-nums">{s.autisti}</td><td className="py-1 pr-3 text-right tabular-nums">{s.aTermine || ""}</td><td className="py-1 pr-3 text-right tabular-nums">{s.usciti || ""}</td></tr>)}</tbody>
        </table>
      </div>
      {niente && <p className="rounded-control bg-ok-soft px-3 py-2 text-sm text-ok">✓ Nessuna cosa da fare dal confronto.</p>}
      {d.daRitirare.length > 0 && (
        <div>
          <h3 className="mb-1 text-sm font-semibold">Usciti con telefono o SIM ancora a loro nome ({d.daRitirare.length})</h3>
          <ul className="flex flex-col gap-1 text-sm">{d.daRitirare.map((x) => <li key={x.persona.cf}><b>{chi(x.persona)}</b> · {x.persona.station} · uscito il {data(x.persona.dataCessazione!)}{x.persona.causaCessazione ? ` (${x.persona.causaCessazione.toLowerCase()})` : ""}: {x.dispositivi.map((y) => y.cosa).join(", ")}</li>)}</ul>
          <p className="mt-1 text-xs text-ink-muted">Ritira il dispositivo e segna lo stato in <Link className="underline" href="/telefoni">Telefoni e SIM</Link>: sparisce da qui.</p>
        </div>
      )}
      {d.inScadenza.length > 0 && (
        <div>
          <h3 className="mb-1 text-sm font-semibold">Contratti a termine che scadono entro 60 giorni ({d.inScadenza.length})</h3>
          <ul className="flex flex-col gap-1 text-sm">{d.inScadenza.map((x) => <li key={x.persona.cf}><b>{chi(x.persona)}</b> · {x.persona.station} · scade il {data(x.persona.scadenzaTd!)} (tra {x.giorni} giorni)</li>)}</ul>
        </div>
      )}
      {(d.mancanoInCdl.length > 0 || d.cdlDaTogliere.length > 0 || d.stationDiversa.length > 0) && (
        <div>
          <h3 className="mb-1 text-sm font-semibold">Anagrafica dei costi{d.versioneCdl ? ` (di ${mese(d.versioneCdl)})` : ""} da aggiornare</h3>
          <ul className="flex flex-col gap-1 text-sm">
            {d.mancanoInCdl.length > 0 && <li><b>{d.mancanoInCdl.length} in forza ma senza costo:</b> {d.mancanoInCdl.map((p) => `${chi(p)} (${p.station})`).join(", ")}</li>}
            {d.cdlDaTogliere.length > 0 && <li><b>{d.cdlDaTogliere.length} con costo ma non più in forza:</b> {d.cdlDaTogliere.map((p) => `${chi(p)} (${p.station})`).join(", ")}</li>}
            {d.stationDiversa.length > 0 && <li><b>{d.stationDiversa.length} con station diversa:</b> {d.stationDiversa.map((x) => `${chi(x.persona)} (costi ${x.cdl}, HR ${x.persona.station})`).join(", ")}</li>}
          </ul>
          <p className="mt-1 text-xs text-ink-muted">Finché l&apos;anagrafica non è aggiornata la stima dei SIC conta persone sbagliate. Chiedi a HR il file dei costi aggiornato e caricalo in <Link className="underline" href="/costi/parametri?sezione=anagrafica">Costi → Parametri e anagrafica</Link>.</p>
        </div>
      )}
    </section>
  );
}
