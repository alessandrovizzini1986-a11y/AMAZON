import Link from "next/link";
import { db } from "@/lib/db";
import { meseScelto } from "@/lib/meseServer";
import { SelettoreMese } from "@/components/SelettoreMese";
import { SchedePagina } from "@/components/SchedePagina";
import { PageHeader } from "@/components/ui";
import { DS_FATTURATO, codiciDs } from "@/domain/fatture/fatturato";
import { carburanteSettimane, classificaRighe, costoParcheggio, ETICHETTA_VOCE, fatturaStornata, nuoviStd, recapVoce, totaliRun, voceRimborso, VOCI_RIMBORSO, type RecapVoce, type VoceRimborso } from "@/domain/fatture/rimborsi";
import { parametriAlla } from "@/domain/costi/parametri";
import { can } from "@/lib/rbac";
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
  const mese = await meseScelto(q, mesePrec(new Date().toISOString().slice(0, 7)));
  const anno = Number(mese.slice(0, 4));
  const da = new Date(`${anno - 1}-01-01T00:00:00Z`), a = new Date(`${anno + 1}-01-01T00:00:00Z`);
  const filtroDs = solo ? { ds: { in: codiciDs(solo) } } : {};
  const [linee, tp, q8, par, mogV, cons] = await Promise.all([
    db.amazonInvoiceLine.findMany({
      where: { data: { gte: da, lt: a }, ...filtroDs, OR: [{ descrizione: { contains: "archegg", mode: "insensitive" } }, { descrizione: { contains: "edagg", mode: "insensitive" } }, { descrizione: { startsWith: "Fuel", mode: "insensitive" } }, { descrizione: { startsWith: "Modifiche - Carburante" } }, { descrizione: { startsWith: "Training" } }, { descrizione: { startsWith: "OTR Services" } }, { descrizione: { startsWith: "Credit Note for", mode: "insensitive" } }] },
      select: { ds: true, data: true, week: true, descrizione: true, quantita: true, avere: true, invoice: { select: { numero: true } } },
    }).catch(() => []),
    db.telepassRun.findMany({ where: { anno: { in: [anno - 1, anno] } }, orderBy: { eseguitoIl: "asc" }, select: { anno: true, mese: true, totaliJson: true, nomeFile: true } }).catch(() => []),
    db.q8Run.findMany({ where: { anno: { in: [anno - 1, anno] } }, orderBy: { eseguitoIl: "asc" }, select: { anno: true, mese: true, totaliJson: true, nomeFile: true } }).catch(() => []),
    db.parametro.findMany({ where: { OR: [{ chiave: { startsWith: "PARCHEGGIO_" } }, { chiave: "TRAINING_EURO" }] } }).catch(() => []),
    db.mogContratto.findFirst({ orderBy: { versione: "desc" }, select: { versione: true } }).catch(() => null),
    db.costoConsuntivo.findMany({ where: { anno: { in: [anno - 1, anno] } } }).catch(() => []),
  ]);
  const mog = (mogV ? await db.mogContratto.findMany({ where: { versione: mogV.versione }, select: { station: true, dataInizio: true } }).catch(() => []) : []).map((c) => ({ station: c.station, dataInizio: c.dataInizio ? iso(c.dataInizio) : null }));
  // voce delle fatture stornate dalle note credito
  const rif = [...new Set(linee.map((l) => fatturaStornata(l.descrizione)).filter((x): x is string => !!x))];
  const righeRif = rif.length ? await db.amazonInvoiceLine.findMany({ where: { invoice: { numero: { in: rif } } }, select: { descrizione: true, invoice: { select: { numero: true } } } }).catch(() => []) : [];
  const voceFattura = new Map<string, VoceRimborso>();
  for (const r of righeRif) { const v = voceRimborso(r.descrizione); if (v && !voceFattura.has(r.invoice.numero)) voceFattura.set(r.invoice.numero, v); }
  const righe = classificaRighe(linee.map((l) => ({ numero: l.invoice.numero, ds: l.ds, data: iso(l.data), descrizione: l.descrizione, quantita: l.quantita, avere: Number(l.avere), week: l.week })), voceFattura);
  // costi da contabilità (es. consuntivo 2025): se ci sono per mese e voce, valgono loro
  const consuntivo = new Map<string, number>();
  for (const c of cons) { const k = `${c.anno}-${String(c.mese).padStart(2, "0")}|${c.voce}|${c.ds}`; consuntivo.set(k, (consuntivo.get(k) ?? 0) + Number(c.importo)); }
  const haCons = (m: string, v: VoceRimborso) => cons.some((c) => `${c.anno}-${String(c.mese).padStart(2, "0")}` === m && c.voce === v);
  const daCons = (m: string, v: VoceRimborso) => (ds: string) => Math.round((consuntivo.get(`${m}|${v}|${ds}`) ?? 0) * 100) / 100;

  const parametri = par.map((p) => ({ chiave: p.chiave, validaDal: iso(p.validaDal), valore: Number(p.valore) }));
  const ultimo = <T extends { anno: number; mese: number }>(runs: T[], m: string) => [...runs].reverse().find((r) => r.anno === Number(m.slice(0, 4)) && r.mese === Number(m.slice(5, 7))) ?? null;
  const mesiDi = (y: number) => Array.from({ length: 12 }, (_, i) => `${y}-${String(i + 1).padStart(2, "0")}`);
  const recapMese = (m: string): RecapVoce[] => {
    const t = ultimo(tp, m), f = ultimo(q8, m);
    const tTot = t ? totaliRun(t.totaliJson, dsList) : null, fTot = f ? totaliRun(f.totaliJson, dsList) : null;
    const nuovi = nuoviStd(mog, m);
    const euroTraining = parametriAlla(parametri, `${m}-01`).TRAINING_EURO ?? 80;
    return VOCI_RIMBORSO.map((v) => {
      if (v !== "TRAINING" && haCons(m, v)) return recapVoce(v, m, righe, daCons(m, v), "costo da consuntivo contabile (mese di registrazione: i pedaggi sono di solito del mese prima)", dsList);
      if (v === "PARCHEGGI") return recapVoce(v, m, righe, (ds) => costoParcheggio(parametri, ds, m), "costo da Parametri (PARCHEGGIO_<DS>, pro-rata ai giorni)", dsList);
      if (v === "PEDAGGI") return recapVoce(v, m, righe, (ds) => (tTot ? tTot[ds] ?? 0 : null), t ? `Telepass: ${t.nomeFile}` : "Telepass del mese non elaborato", dsList);
      if (v === "CARBURANTE") return recapVoce(v, m, righe, (ds) => (fTot ? fTot[ds] ?? 0 : null), f ? `Q8: ${f.nomeFile}` : "Q8 del mese non elaborato", dsList);
      return recapVoce(v, m, righe, (ds) => (mog.length ? (nuovi[ds] ?? 0) * euroTraining : null), mog.length ? `atteso = nuovi STD del mese (inizio contratto nel file MOG ${mogV!.versione.split("-").reverse().join("/")}) × ${euroTraining} €; i nuovi SIC non sono contati` : "file MOG non caricato", dsList);
    });
  };
  const oggiM = meseSucc(new Date().toISOString().slice(0, 7));
  const tutti = mesiDi(anno).filter((m) => m <= oggiM).map((m) => ({ mese: m, recap: recapMese(m) }));
  const tuttiPrec = mesiDi(anno - 1).map((m) => ({ mese: m, recap: recapMese(m) }));
  const ultimi = (y: number) => mesiDi(y).map((m) => ultimo(q8, m)?.totaliJson).filter(Boolean);
  const settimane = carburanteSettimane(righe.filter((r) => r.data.startsWith(String(anno))), ultimi(anno), dsList);
  const qui = tutti.find((x) => x.mese === mese)?.recap ?? recapMese(mese);
  const nomeMese = `${MESI[Number(mese.slice(5, 7))]} ${anno}`;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader eyebrow="Amazon · parcheggi, pedaggi, carburante, training" title="Rimborsi"
        subtitle="Per ogni DS quanto Amazon ci ha rimborsato in fattura e quanto abbiamo speso, IVA esclusa. Differenza in rosso = rimborsato meno del costo: da controllare o contestare." />
      <div className="flex flex-wrap items-end gap-3 text-sm">
        <SelettoreMese value={mese} href="/fatture-amazon/rimborsi" />
        <ExportRimborsi anno={anno} righe={righe.filter((r) => r.data.startsWith(String(anno)))} recap={tutti} settimane={settimane} />
        {can(user, "import.run") && <Link href="/fatture-amazon/rimborsi/consuntivo" className="btn-secondary">Carica consuntivo contabile</Link>}
      </div>

      <SchedePagina schede={[{ id: "mese", label: `${nomeMese} per DS` }, { id: "andamento", label: `Andamento ${anno} e ${anno - 1}` }, { id: "settimane", label: "Carburante per settimana" }]} />
      {qui.map((r) => (
        <section key={r.voce} data-scheda="mese" className="card p-4 md:p-5">
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

      {[{ y: anno, righe: tutti }, { y: anno - 1, righe: tuttiPrec }].map(({ y, righe: rr }) => (
        <section key={y} data-scheda="andamento" className="card p-4 md:p-5">
          <h2 className="text-[19px] font-semibold">Andamento {y} (tutte le DS)</h2>
          <div className="mt-2 overflow-x-auto">
            <table className="table-base text-sm">
              <thead><tr><th>Mese</th>{VOCI_RIMBORSO.map((v) => <th key={v} colSpan={3} className="text-center">{ETICHETTA_VOCE[v]}</th>)}</tr>
                <tr><th />{VOCI_RIMBORSO.map((v) => [<th key={v + "c"} className="text-right">costo</th>, <th key={v + "r"} className="text-right">rimb.</th>, <th key={v + "d"} className="text-right">diff.</th>])}</tr></thead>
              <tbody>
                {rr.map((m) => (
                  <tr key={m.mese}><td><Link className="underline" href={`/fatture-amazon/rimborsi?mese=${m.mese}`}>{MESI[Number(m.mese.slice(5, 7))]}</Link></td>
                    {m.recap.map((r) => [<td key={r.voce + "c"} className="text-right font-mono">{eur(r.totale.costo)}</td>, <td key={r.voce + "r"} className="text-right font-mono">{eur(r.totale.rimborsato)}</td>, <td key={r.voce + "d"} className="text-right font-mono"><Diff v={r.totale.differenza} /></td>])}
                  </tr>
                ))}
                <tr className="font-semibold"><td>Anno</td>
                  {VOCI_RIMBORSO.map((v) => { const x = rr.map((m) => m.recap.find((r) => r.voce === v)!.totale); const c = x.filter((t) => t.costo !== null); const cs = c.reduce((s, t) => s + t.costo!, 0), rs = x.reduce((s, t) => s + t.rimborsato, 0), rc = c.reduce((s, t) => s + t.rimborsato, 0);
                    return [<td key={v + "c"} className="text-right font-mono">{c.length ? eur(cs) : "—"}</td>, <td key={v + "r"} className="text-right font-mono">{eur(rs)}</td>, <td key={v + "d"} className="text-right font-mono"><Diff v={c.length ? Math.round((rc - cs) * 100) / 100 : null} /></td>]; })}
                </tr>
              </tbody>
            </table>
          </div>
          {y === anno && <p className="mt-2 text-xs text-ink-muted">Il mese è quello della data della riga in fattura (i parcheggi Amazon sono datati il 1° del mese). Le note credito vanno nella voce della fattura che stornano. Pedaggi: da fine aprile 2026 Amazon li rimborsa come &quot;OTR Services&quot;. La differenza dell&apos;anno conta solo i mesi con un costo. Costi parcheggio e € per training si cambiano in Costi → Parametri (PARCHEGGIO_DS, TRAINING_EURO).</p>}
          {y === anno - 1 && <p className="mt-2 text-xs text-ink-muted">Costi {y} dal consuntivo contabile (Costo Effettivo, CDC 5569; parcheggi = Affitti Amazon), per mese di registrazione: possono esserci sfasamenti di un mese e conguagli.</p>}
        </section>
      ))}

      <section data-scheda="settimane" className="card p-4 md:p-5">
        <h2 className="text-[19px] font-semibold">Carburante per settimana {anno}: FuelAllowance contro Q8</h2>
        <p className="mt-1 text-xs text-ink-muted">Settimana Amazon (domenica–sabato). Q8 = Imp. Scontato no IVA delle carte della DS nella stessa settimana. Differenza in rosso = l&apos;allowance non copre il carburante.</p>
        <div className="mt-2 max-h-[32rem] overflow-auto">
          <table className="table-base text-sm">
            <thead><tr><th>Sett.</th><th className="text-right">Allowance</th><th className="text-right">Q8</th><th className="text-right">Diff.</th>{dsList.map((d) => <th key={d} className="text-right">{d}</th>)}</tr></thead>
            <tbody>
              {settimane.map((w) => (
                <tr key={w.week}><td>{w.week}</td><td className="text-right font-mono">{eur(w.allowance)}</td><td className="text-right font-mono">{eur(w.q8)}</td><td className="text-right font-mono"><Diff v={w.diff} /></td>{dsList.map((d) => <td key={d} className="text-right font-mono"><Diff v={w.perDs[d].diff} /></td>)}</tr>
              ))}
              <tr className="font-semibold"><td>Anno</td><td className="text-right font-mono">{eur(settimane.reduce((s, w) => s + w.allowance, 0))}</td><td className="text-right font-mono">{eur(settimane.reduce((s, w) => s + w.q8, 0))}</td><td className="text-right font-mono"><Diff v={Math.round(settimane.reduce((s, w) => s + w.diff, 0) * 100) / 100} /></td>{dsList.map((d) => <td key={d} className="text-right font-mono"><Diff v={Math.round(settimane.reduce((s, w) => s + w.perDs[d].diff, 0) * 100) / 100} /></td>)}</tr>
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
