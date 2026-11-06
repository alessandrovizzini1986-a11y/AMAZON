import Link from "next/link";
import { db } from "@/lib/db";
import { PageHeader } from "@/components/ui";
import { DS_FATTURATO, codiciDs } from "@/domain/fatture/fatturato";
import { classificaRighe, costoParcheggio, ETICHETTA_VOCE, fatturaStornata, nuoviStd, recapVoce, totaliRun, voceRimborso, VOCI_RIMBORSO, type RecapVoce, type VoceRimborso } from "@/domain/fatture/rimborsi";
import { parametriAlla } from "@/domain/costi/parametri";
import { stationUtente, utenteCon } from "../dati";
import { ExportRimborsi } from "./ExportRimborsi";

export const dynamic = "force-dynamic";
export const metadata = { title: "Rimborsi Amazon — FleetDSP" };

const MESI = ["", "Gen", "Feb", "Mar", "Apr", "Mag", "Giu", "Lug", "Ago", "Set", "Ott", "Nov", "Dic"];
const eur = (x: number | null) => (x === null ? "—" : x.toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
const iso = (d: Date) => d.toISOString().slice(0, 10);
const mesePrec = (m: string) => { const [a, b] = m.split("-").map(Number); return b === 1 ? `${a - 1}-12` : `${a}-${String(b - 1).padStart(2, "0")}`; };
const meseSucc = (m: string) => { const [a, b] = m.split("-").map(Number); return b === 12 ? `${a + 1}-01` : `${a}-${String(b + 1).padStart(2, "0")}`; };

function Diff({ v }: { v: number | null }) {
  if (v === null) return <span className="text-ink-muted">—</span>;
  return <span className={v < -0.5 ? "font-semibold text-danger" : v > 0.5 ? "text-ok" : ""}>{eur(v)}</span>;
}

export default async function RimborsiPage({ searchParams }: { searchParams: Promise<{ mese?: string }> }) {
  const user = await utenteCon("fatturato.view");
  const solo = await stationUtente(user);
  const dsList = solo ? [solo] : DS_FATTURATO;
  const q = (await searchParams).mese;
  const mese = q && /^\d{4}-\d{2}$/.test(q) ? q : mesePrec(new Date().toISOString().slice(0, 7));
  const anno = Number(mese.slice(0, 4));
  const da = new Date(`${anno}-01-01T00:00:00Z`), a = new Date(`${anno + 1}-01-01T00:00:00Z`);
  const filtroDs = solo ? { ds: { in: codiciDs(solo) } } : {};
  const [linee, tp, q8, par, mogV] = await Promise.all([
    db.amazonInvoiceLine.findMany({
      where: { data: { gte: da, lt: a }, ...filtroDs, OR: [{ descrizione: { contains: "archegg", mode: "insensitive" } }, { descrizione: { contains: "edagg", mode: "insensitive" } }, { descrizione: { startsWith: "Fuel", mode: "insensitive" } }, { descrizione: { startsWith: "Modifiche - Carburante" } }, { descrizione: { startsWith: "Training" } }, { descrizione: { startsWith: "Credit Note for", mode: "insensitive" } }] },
      select: { ds: true, data: true, descrizione: true, quantita: true, avere: true, invoice: { select: { numero: true } } },
    }).catch(() => []),
    db.telepassRun.findMany({ where: { anno }, orderBy: { eseguitoIl: "asc" }, select: { mese: true, totaliJson: true, nomeFile: true } }).catch(() => []),
    db.q8Run.findMany({ where: { anno }, orderBy: { eseguitoIl: "asc" }, select: { mese: true, totaliJson: true, nomeFile: true } }).catch(() => []),
    db.parametro.findMany({ where: { OR: [{ chiave: { startsWith: "PARCHEGGIO_" } }, { chiave: "TRAINING_EURO" }] } }).catch(() => []),
    db.mogContratto.findFirst({ orderBy: { versione: "desc" }, select: { versione: true } }).catch(() => null),
  ]);
  const mog = (mogV ? await db.mogContratto.findMany({ where: { versione: mogV.versione }, select: { station: true, dataInizio: true } }).catch(() => []) : []).map((c) => ({ station: c.station, dataInizio: c.dataInizio ? iso(c.dataInizio) : null }));
  // voce delle fatture stornate dalle note credito
  const rif = [...new Set(linee.map((l) => fatturaStornata(l.descrizione)).filter((x): x is string => !!x))];
  const righeRif = rif.length ? await db.amazonInvoiceLine.findMany({ where: { invoice: { numero: { in: rif } } }, select: { descrizione: true, invoice: { select: { numero: true } } } }).catch(() => []) : [];
  const voceFattura = new Map<string, VoceRimborso>();
  for (const r of righeRif) { const v = voceRimborso(r.descrizione); if (v && !voceFattura.has(r.invoice.numero)) voceFattura.set(r.invoice.numero, v); }
  const righe = classificaRighe(linee.map((l) => ({ numero: l.invoice.numero, ds: l.ds, data: iso(l.data), descrizione: l.descrizione, quantita: l.quantita, avere: Number(l.avere) })), voceFattura);

  const parametri = par.map((p) => ({ chiave: p.chiave, validaDal: iso(p.validaDal), valore: Number(p.valore) }));
  const ultimo = <T extends { mese: number }>(runs: T[], m: number) => [...runs].reverse().find((r) => r.mese === m) ?? null;
  const mesi = Array.from({ length: 12 }, (_, i) => `${anno}-${String(i + 1).padStart(2, "0")}`);
  const recapMese = (m: string): RecapVoce[] => {
    const nm = Number(m.slice(5, 7));
    const t = ultimo(tp, nm), f = ultimo(q8, nm);
    const tTot = t ? totaliRun(t.totaliJson, dsList) : null, fTot = f ? totaliRun(f.totaliJson, dsList) : null;
    const nuovi = nuoviStd(mog, m);
    const euroTraining = parametriAlla(parametri, `${m}-01`).TRAINING_EURO ?? 80;
    return VOCI_RIMBORSO.map((v) => {
      if (v === "PARCHEGGI") return recapVoce(v, m, righe, (ds) => costoParcheggio(parametri, ds, m), "costo da Parametri (PARCHEGGIO_<DS>, pro-rata ai giorni)", dsList);
      if (v === "PEDAGGI") return recapVoce(v, m, righe, (ds) => (tTot ? tTot[ds] ?? 0 : null), t ? `Telepass: ${t.nomeFile}` : "Telepass del mese non elaborato", dsList);
      if (v === "CARBURANTE") return recapVoce(v, m, righe, (ds) => (fTot ? fTot[ds] ?? 0 : null), f ? `Q8: ${f.nomeFile}` : "Q8 del mese non elaborato", dsList);
      return recapVoce(v, m, righe, (ds) => (mog.length ? (nuovi[ds] ?? 0) * euroTraining : null), mog.length ? `atteso = nuovi STD del mese (inizio contratto nel file MOG ${mogV!.versione.split("-").reverse().join("/")}) × ${euroTraining} €; i nuovi SIC non sono contati` : "file MOG non caricato", dsList);
    });
  };
  const tutti = mesi.filter((m) => m <= meseSucc(new Date().toISOString().slice(0, 7))).map((m) => ({ mese: m, recap: recapMese(m) }));
  const qui = tutti.find((x) => x.mese === mese)?.recap ?? recapMese(mese);
  const nomeMese = `${MESI[Number(mese.slice(5, 7))]} ${anno}`;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader eyebrow="Fatture Amazon · controllo rimborsi" title="Rimborsi: parcheggi, pedaggi, carburante, training"
        subtitle="Per ogni DS quanto Amazon ci ha rimborsato in fattura e quanto abbiamo speso, IVA esclusa. Differenza in rosso = rimborsato meno del costo: da controllare o contestare." />
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <Link className="btn-secondary" href={`/fatture-amazon/rimborsi?mese=${mesePrec(mese)}`}>← {MESI[Number(mesePrec(mese).slice(5, 7))]}</Link>
        <b className="px-2">{nomeMese}</b>
        <Link className="btn-secondary" href={`/fatture-amazon/rimborsi?mese=${meseSucc(mese)}`}>{MESI[Number(meseSucc(mese).slice(5, 7))]} →</Link>
        <ExportRimborsi anno={anno} righe={righe} recap={tutti} />
      </div>

      {qui.map((r) => (
        <section key={r.voce} className="card p-4 md:p-5">
          <h2 className="text-[19px] font-semibold">{ETICHETTA_VOCE[r.voce]} — {nomeMese}</h2>
          <p className="mt-1 text-xs text-ink-muted">{r.notaCosto}</p>
          <div className="mt-2 overflow-x-auto">
            <table className="table-base text-sm">
              <thead><tr><th>DS</th><th className="text-right">{r.voce === "TRAINING" ? "Atteso" : "Nostro costo"}</th><th className="text-right">Rimborsato</th><th className="text-right">Differenza</th>{r.voce === "TRAINING" && <th className="text-right">Giornate</th>}<th>Fatture</th></tr></thead>
              <tbody>
                {dsList.map((ds) => { const c = r.perDs[ds]; return (
                  <tr key={ds}><td>{ds}</td><td className="text-right font-mono">{eur(c.costo)}</td><td className="text-right font-mono">{eur(c.rimborsato)}</td><td className="text-right font-mono"><Diff v={c.differenza} /></td>{r.voce === "TRAINING" && <td className="text-right">{c.quantita}</td>}<td className="text-xs">{c.fatture.join(", ")}{c.storni ? ` (${c.storni} storno)` : ""}</td></tr>
                ); })}
                <tr className="font-semibold"><td>Totale</td><td className="text-right font-mono">{eur(r.totale.costo)}</td><td className="text-right font-mono">{eur(r.totale.rimborsato)}</td><td className="text-right font-mono"><Diff v={r.totale.differenza} /></td>{r.voce === "TRAINING" && <td className="text-right">{r.totale.quantita}</td>}<td /></tr>
              </tbody>
            </table>
          </div>
        </section>
      ))}

      <section className="card p-4 md:p-5">
        <h2 className="text-[19px] font-semibold">Andamento {anno} (tutte le DS)</h2>
        <div className="mt-2 overflow-x-auto">
          <table className="table-base text-sm">
            <thead><tr><th>Mese</th>{VOCI_RIMBORSO.map((v) => <th key={v} colSpan={3} className="text-center">{ETICHETTA_VOCE[v]}</th>)}</tr>
              <tr><th />{VOCI_RIMBORSO.map((v) => [<th key={v + "c"} className="text-right">costo</th>, <th key={v + "r"} className="text-right">rimb.</th>, <th key={v + "d"} className="text-right">diff.</th>])}</tr></thead>
            <tbody>
              {tutti.map((m) => (
                <tr key={m.mese}><td><Link className="underline" href={`/fatture-amazon/rimborsi?mese=${m.mese}`}>{MESI[Number(m.mese.slice(5, 7))]}</Link></td>
                  {m.recap.map((r) => [<td key={r.voce + "c"} className="text-right font-mono">{eur(r.totale.costo)}</td>, <td key={r.voce + "r"} className="text-right font-mono">{eur(r.totale.rimborsato)}</td>, <td key={r.voce + "d"} className="text-right font-mono"><Diff v={r.totale.differenza} /></td>])}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-xs text-ink-muted">Il mese è quello della data della riga in fattura (i parcheggi Amazon sono datati il 1° del mese). Le note credito vanno nella voce della fattura che stornano. Costi parcheggio e € per training si cambiano in Costi → Parametri (PARCHEGGIO_DS, TRAINING_EURO), con la data da cui valgono.</p>
      </section>
    </div>
  );
}
