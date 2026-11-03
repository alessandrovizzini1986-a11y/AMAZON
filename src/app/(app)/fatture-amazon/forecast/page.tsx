import { can } from "@/lib/rbac";
import { db } from "@/lib/db";
import { PageHeader } from "@/components/ui";
import { numeroSettimana, addGiorni } from "@/domain/forecast/settimane";
import { utenteCon } from "../dati";
import { calcolaForecast } from "./dati";
import { versioniForecast } from "@/lib/forecastVersioni";
import { eliminaRegolaMappa, salvaRegolaMappa } from "./actions";
import { ExportForecast, ForecastUpload } from "./ForecastClient";
import { GraficoSettimane } from "./Grafico";
import { Aiuto } from "@/components/Aiuto";

export const dynamic = "force-dynamic";
export const metadata = { title: "Forecast ricavi Amazon — FleetDSP" };

const eur = (x: number | null | undefined) => (x === null || x === undefined ? "—" : x.toLocaleString("it-IT", { minimumFractionDigits: 0, maximumFractionDigits: 0 }));
const pct = (x: number) => `${x > 0 ? "+" : ""}${x.toLocaleString("it-IT", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
const gg = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
const MESI = ["", "gennaio", "febbraio", "marzo", "aprile", "maggio", "giugno", "luglio", "agosto", "settembre", "ottobre", "novembre", "dicembre"];

export default async function ForecastPage({ searchParams }: { searchParams: Promise<{ n?: string; oggi?: string }> }) {
  const user = await utenteCon("forecast.view");
  const p = await searchParams;
  const n = Math.min(12, Math.max(1, Number(p.n) || 5));
  const oggi = p.oggi && /^\d{4}-\d{2}-\d{2}$/.test(p.oggi) ? p.oggi : new Date().toISOString().slice(0, 10);
  const [d, files, regole, vers] = await Promise.all([
    calcolaForecast(n, oggi),
    db.forecastFile.findMany({ orderBy: { caricatoIl: "desc" }, include: { _count: { select: { righe: true } } } }),
    db.forecastClasseMap.findMany({ orderBy: [{ serviceType: "asc" }, { cycle: "asc" }, { station: "asc" }] }),
    versioniForecast(),
  ]);
  const vMap = new Map(vers.map((f) => [f.id, f]));
  const ultimoPerLinea = new Map<string, string>();
  for (const f of [...vers].sort((a, b) => `${a.versione}|${a.caricatoIl}`.localeCompare(`${b.versione}|${b.caricatoIl}`))) ultimoPerLinea.set(f.linea, f.id);
  const nmPerFile = new Map((await db.forecastRoute.groupBy({ by: ["fileId"], where: { classe: "NON_MAPPATO" }, _count: { _all: true } })).map((x) => [x.fileId, x._count._all]));
  const puoImport = can(user, "forecast.import");
  const ds = [...new Set([...d.previsione.map((x) => x.ds), ...d.backtest.map((x) => x.ds)])].sort();
  const settimane = [...new Set(d.previsione.map((x) => x.settimana))].sort();
  const cella = (w: string, s: string) => d.previsione.find((x) => x.settimana === w && x.ds === s);
  const totW = (w: string) => d.previsione.filter((x) => x.settimana === w).reduce((s, x) => s + x.totale, 0);
  const btSett = [...new Set(d.backtest.map((x) => x.settimana))].sort();
  const bt = (w: string) => { const r = d.backtest.filter((x) => x.settimana === w); const pr = r.reduce((s, x) => s + x.previsto, 0), re = r.reduce((s, x) => s + x.reale, 0); return { pr, re, err: re ? ((pr - re) / re) * 100 : 0 }; };
  const punti = [
    ...btSett.map((w) => ({ label: `S${numeroSettimana(w)}`, previsto: bt(w).pr, reale: bt(w).re })),
    ...settimane.filter((w) => d.previsione.some((x) => x.settimana === w && !x.soloSD)).map((w) => { const f = d.previsione.filter((x) => x.settimana === w && x.fatturato !== null); return { label: `S${numeroSettimana(w)}`, previsto: totW(w), reale: f.length ? f.reduce((s, x) => s + (x.fatturato ?? 0), 0) : null }; }),
  ];
  const mesi = Object.keys(d.mesi).sort();
  const dsCal = Object.keys(d.cal.settimane).sort();
  const export_ = [
    { foglio: "previsione settimana", colonne: ["Settimana", "Dal", "DS", "Rotte ND", "Rotte SD", "SD da media", "Previsto ND", "Previsto SD", "Previsto extra", "Previsto totale", "Fatturato"], righe: d.previsione.map((x) => [x.week, x.settimana, x.ds, x.rotteND, x.rotteSD, x.sdDaMedia ? "sì" : "", x.previstoND, x.previstoSD, x.previstoExtra, x.totale, x.fatturato]) },
    { foglio: "previsione mese", colonne: ["Mese", "DS", "Previsto"], righe: mesi.flatMap((m) => Object.entries(d.mesi[m]).map(([s, v]) => [m, s, v])) },
    { foglio: "backtest", colonne: ["Settimana", "Dal", "DS", "Previsto", "Fatturato", "Errore %", "Rotte previste", "Rotte fatturate", "Errore rotte %"], righe: d.backtest.map((x) => [x.week, x.settimana, x.ds, x.previsto, x.reale, x.erroreTot, x.rottePreviste, x.rotteFatturate, x.erroreRotte]) },
    { foglio: "tariffe", colonne: ["DS", "Classe", "Rotte", "AVERE", "Tariffa"], righe: d.cal.tariffe.map((t) => [t.ds, t.classe, t.rotte, t.avere, t.tariffa]) },
    { foglio: "extra per rotta", colonne: ["DS", "Classe", "AVERE", "€ per rotta", "Rotte totali"], righe: d.cal.extra.map((e) => [e.ds, e.classe, e.avere, e.euroPerRotta, e.rotteTotali]) },
  ];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader eyebrow="Fatture Amazon · forecast" title="Ricavo previsto dai forecast Amazon"
        subtitle={`Rotte del forecast × tariffa per descrizione ricavata dalle ultime ${n} settimane Amazon chiuse (terminate da almeno 14 giorni), più gli extra per rotta. Incentivi e voci una tantum non sono previsti.`} />

      <form className="card flex flex-wrap items-end gap-3 p-4">
        <label className="flex flex-col gap-1 text-xs font-semibold text-ink-muted">Settimane di calibrazione<input name="n" type="number" min={1} max={12} defaultValue={n} className="input h-10 w-28" /></label>
        <label className="flex flex-col gap-1 text-xs font-semibold text-ink-muted">Data di riferimento<input name="oggi" type="date" defaultValue={oggi} className="input h-10 w-44" /></label>
        <button className="btn-primary h-10">Ricalcola</button>
        <span className="ml-auto"><ExportForecast tabelle={export_} nome={`forecast_${oggi}.xlsx`} /></span>
      </form>

      {puoImport && <ForecastUpload regole={regole} />}

      <section className="card overflow-x-auto p-4 md:p-5">
        <h2 className="mb-3 text-[19px] font-semibold">File caricati ({files.length})</h2>
        {files.length === 0 ? <p className="text-sm text-ink-muted">Nessun forecast caricato.</p> : (
          <table className="table-base text-sm">
            <thead><tr><th>File</th><th>Linea</th><th>Righe</th><th>NON_MAPPATO</th><th>Caricato il</th></tr></thead>
            <tbody>{files.map((f) => <tr key={f.id}><td>{f.nome} <span className="text-xs text-ink-muted">(versione wk {vMap.get(f.id) ? numeroSettimana(vMap.get(f.id)!.versione) : "?"})</span>{ultimoPerLinea.get(f.linea) === f.id && <span className="ml-2 badge-ok">ultimo {f.linea}</span>}</td><td>{f.linea}</td><td>{f._count.righe}</td><td className={nmPerFile.get(f.id) ? "font-semibold text-warn" : ""}>{nmPerFile.get(f.id) ?? 0}</td><td>{f.caricatoIl.toLocaleString("it-IT", { timeZone: "Europe/Rome" })}</td></tr>)}</tbody>
          </table>
        )}
        {d.nonMappate > 0 && <p className="mt-2 text-sm text-warn">{d.nonMappate} rotte con servizio NON_MAPPATO non entrano nella previsione: aggiungi la regola nella mappa in fondo alla pagina.</p>}
      </section>

      {punti.length > 0 && (
        <section className="card p-4 md:p-5">
          <h2 className="mb-3 text-[19px] font-semibold">Previsto e fatturato per settimana (tutte le DS)</h2>
          <GraficoSettimane punti={punti} />
        </section>
      )}

      <section className="card overflow-x-auto p-4 md:p-5">
        <h2 className="mb-1 text-[19px] font-semibold">Previsione per settimana × DS (€)</h2>
        <p className="mb-3 text-sm text-ink-muted">Settimane non ancora chiuse coperte da un forecast. <span className="badge-neutral">SD media</span> = nessun forecast SD per la DS: usata la media settimanale SD delle {n} settimane. <span className="badge-warn">stimata</span> = tariffa media della classe sulle altre DS. <span className="badge-warn">solo SD</span> = per quella settimana c&apos;è solo il forecast same-day: previsione parziale, esclusa dal grafico e dai mesi.</p>
        {settimane.length === 0 ? <p className="text-sm text-ink-muted">Nessun forecast per le prossime settimane.</p> : (
          <table className="table-base text-sm">
            <thead><tr><th>Settimana</th>{ds.map((s) => <th key={s} className="text-right">{s}</th>)}<th className="text-right">TOTALE</th></tr></thead>
            <tbody>
              {settimane.map((w) => (
                <tr key={w}>
                  <td className="whitespace-nowrap font-semibold">S{numeroSettimana(w)} <span className="text-xs font-normal text-ink-muted">{gg(w)}–{gg(addGiorni(w, 6))}</span></td>
                  {ds.map((s) => { const c = cella(w, s); return (
                    <td key={s} className="text-right font-mono" title={c ? `ND ${c.rotteND} rotte · SD ${c.rotteSD} · rotte ${eur(c.previstoND + c.previstoSD)} € + extra ${eur(c.previstoExtra)} €${c.fatturato !== null ? ` · fatturato ${eur(c.fatturato)} €` : ""}` : ""}>
                      {c ? eur(c.totale) : ""}{c?.sdDaMedia && <span className="ml-1 badge-neutral">SD media</span>}{c?.soloSD && <span className="ml-1 badge-warn">solo SD</span>}{c?.tariffeStimate.length ? <span className="ml-1 badge-warn">stimata</span> : null}
                    </td>
                  ); })}
                  <td className="text-right font-mono font-semibold">{eur(totW(w))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {mesi.length > 0 && (
        <section className="card overflow-x-auto p-4 md:p-5">
          <h2 className="mb-1 text-[19px] font-semibold">Previsione per mese × DS (€)</h2>
          <p className="mb-3 text-sm text-ink-muted">Le settimane a cavallo di due mesi sono divise per giorni. Somma delle sole settimane coperte dal forecast.</p>
          <table className="table-base text-sm">
            <thead><tr><th>Mese</th>{ds.map((s) => <th key={s} className="text-right">{s}</th>)}<th className="text-right">TOTALE</th></tr></thead>
            <tbody>{mesi.map((m) => <tr key={m}><td className="font-semibold">{MESI[Number(m.slice(5))]} {m.slice(0, 4)}</td>{ds.map((s) => <td key={s} className="text-right font-mono">{eur(d.mesi[m][s])}</td>)}<td className="text-right font-mono font-semibold">{eur(Object.values(d.mesi[m]).reduce((a, b) => a + b, 0))}</td></tr>)}</tbody>
          </table>
        </section>
      )}

      <section className="card overflow-x-auto p-4 md:p-5">
        <h2 className="mb-1 text-[19px] font-semibold">Backtest</h2>
        <p className="mb-3 text-sm text-ink-muted">Settimane chiuse coperte da un forecast: previsto con le tariffe delle {n} settimane precedenti contro il fatturato (rotte + extra previsti). L&apos;errore sulle rotte separa l&apos;errore di volume da quello di tariffa.</p>
        {btSett.length === 0 ? <p className="text-sm text-ink-muted">Nessuna settimana chiusa con forecast.</p> : (
          <table className="table-base text-sm">
            <thead><tr><th>Settimana</th><th>DS</th><th className="text-right">Previsto</th><th className="text-right">Fatturato</th><th className="text-right">Errore</th><th className="text-right">Rotte previste</th><th className="text-right">Rotte fatturate</th><th className="text-right">Errore rotte</th></tr></thead>
            <tbody>
              {btSett.flatMap((w) => [
                ...d.backtest.filter((x) => x.settimana === w).map((x) => (
                  <tr key={w + x.ds}><td>S{x.week}</td><td className="font-mono">{x.ds}</td><td className="text-right font-mono">{eur(x.previsto)}</td><td className="text-right font-mono">{eur(x.reale)}</td>
                    <td className={`text-right font-mono ${Math.abs(x.erroreTot) > 5 ? "font-semibold text-warn" : ""}`}>{pct(x.erroreTot)}</td><td className="text-right">{x.rottePreviste}</td><td className="text-right">{x.rotteFatturate}</td><td className="text-right font-mono">{pct(x.erroreRotte)}</td></tr>
                )),
                <tr key={w + "tot"} className="border-t-2 font-bold"><td>S{numeroSettimana(w)}</td><td>Totale</td><td className="text-right font-mono">{eur(bt(w).pr)}</td><td className="text-right font-mono">{eur(bt(w).re)}</td><td className="text-right font-mono">{pct(Math.round(bt(w).err * 10) / 10)}</td><td colSpan={3} /></tr>,
              ])}
            </tbody>
          </table>
        )}
      </section>

      <section className="card overflow-x-auto p-4 md:p-5">
        <h2 className="mb-1 text-[19px] font-semibold">Calibrazione: tariffe ed extra per rotta</h2>
        <p className="mb-3 text-sm text-ink-muted">Finestra per DS: {dsCal.length ? dsCal.map((s) => `${s} S${d.cal.settimane[s].map((w) => numeroSettimana(w)).join(",S")}`).join(" · ") : "nessuna settimana chiusa nello storico"}.</p>
        <div className="grid gap-6 lg:grid-cols-2">
          <table className="table-base text-sm">
            <thead><tr><th>DS</th><th>Classe</th><th className="text-right">Rotte</th><th className="text-right">Tariffa €</th></tr></thead>
            <tbody>{d.cal.tariffe.map((t) => <tr key={t.ds + t.classe}><td className="font-mono">{t.ds}</td><td className="font-mono text-xs">{t.classe}</td><td className="text-right">{t.rotte}</td><td className="text-right font-mono">{t.tariffa.toLocaleString("it-IT", { minimumFractionDigits: 2 })}</td></tr>)}</tbody>
          </table>
          <table className="table-base text-sm">
            <thead><tr><th>DS</th><th className="text-right">Extra per rotta €</th><th>di cui</th></tr></thead>
            <tbody>{Object.entries(d.cal.extraPerRotta).map(([s, v]) => <tr key={s}><td className="font-mono">{s}</td><td className="text-right font-mono font-semibold">{v.toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td><td className="text-xs text-ink-muted">{d.cal.extra.filter((e) => e.ds === s).map((e) => `${e.classe.replace("EXTRA_", "").toLowerCase()} ${e.euroPerRotta.toLocaleString("it-IT", { maximumFractionDigits: 2 })}`).join(" · ")}</td></tr>)}</tbody>
          </table>
        </div>
        {d.cal.nonPreviste.length > 0 && <p className="mt-3 text-xs text-ink-faint">Non previsti (mostrati a parte): {d.cal.nonPreviste.map((x) => `${x.ds} ${x.classe.replace("EXTRA_", "").toLowerCase()} ${eur(x.avere)} €`).join(" · ")}.</p>}
      </section>

      <section className="card overflow-x-auto p-4 md:p-5">
        <h2 className="mb-1 text-[19px] font-semibold">Mappa servizio forecast → classe</h2>
        <p className="mb-3 text-sm text-ink-muted">&quot;*&quot; = qualsiasi. La regola più specifica vince (station, poi cycle).</p>
        <table className="table-base text-sm">
          <thead><tr><th>service_type_scheduling</th><th>cycle</th><th>station</th><th>Classe</th>{puoImport && <th></th>}</tr></thead>
          <tbody>{regole.map((r) => <tr key={r.id}><td>{r.serviceType}</td><td className="font-mono text-xs">{r.cycle}</td><td className="font-mono">{r.station}</td><td className="font-mono text-xs">{r.classe}</td>{puoImport && <td><form action={eliminaRegolaMappa.bind(null, r.id)}><button className="btn-secondary px-2 py-1 text-xs">Elimina</button></form></td>}</tr>)}</tbody>
        </table>
        {puoImport && (
          <form action={salvaRegolaMappa} className="mt-3 flex flex-wrap items-end gap-2">
            <input name="serviceType" className="input h-10 w-64" placeholder="service_type_scheduling *" required />
            <input name="cycle" className="input h-10 w-36" placeholder="cycle (*)" />
            <input name="station" className="input h-10 w-28" placeholder="station (*)" />
            <input name="classe" className="input h-10 w-40" placeholder="es. ND_STANDARD" required pattern="(ND|SD)_[A-Z]+" />
            <button className="btn-primary h-10">Aggiungi / aggiorna</button> <Aiuto k="forecast.mappa" />
          </form>
        )}
      </section>
    </div>
  );
}
