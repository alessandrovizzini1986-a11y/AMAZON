import { can } from "@/lib/rbac";
import { PageHeader } from "@/components/ui";
import { PARAMETRI } from "@/domain/costi/parametri";
import { prossimoCambio, valoreAlla } from "@/domain/costi/tariffe";
import { STATIONS_COSTI } from "@/domain/costi/festivi";
import { contrattiMog, festivi, oggiIso, parametri, tariffe, utenteCosti, variazioniMog, versioniCDL, versioniMog } from "../dati";
import { AumentiMog, ConsolidamentiMog, MogClient, VariazioneMog } from "./MogClient";
import { AnagraficaCDLClient, EliminaFestivo, NuovoFestivo, NuovoParametro, NuovaTariffa } from "./ParametriClient";

export const dynamic = "force-dynamic";
export const metadata = { title: "Parametri costi del personale — FleetDSP" };

const it = (s: string) => s.split("-").reverse().join("/");
const num = (v: number, unita = "") => (unita === "%" ? `${(v * 100).toLocaleString("it-IT", { maximumFractionDigits: 3 })} %` : v.toLocaleString("it-IT", { maximumFractionDigits: 4 }));
const eur = (v: number) => v.toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default async function ParametriPage({ searchParams }: { searchParams: Promise<{ anno?: string }> }) {
  const user = await utenteCosti();
  const edit = can(user, "costi.parametri");
  const oggi = oggiIso();
  const anno = Number((await searchParams).anno) || Number(oggi.slice(0, 4));
  const [tar, par, fest, versioni, vMog, cMog, varMog] = await Promise.all([tariffe(), parametri(), festivi(anno), versioniCDL(), versioniMog(), contrattiMog(), variazioniMog()]);
  const voci = [...new Set(tar.map((t) => t.voce))];
  const chiavi = [...new Set([...Object.keys(PARAMETRI), ...par.map((p) => p.chiave)])];
  return (
    <div className="flex flex-col gap-6">
      <PageHeader eyebrow="Costi del personale · parametri" title="Parametri e anagrafica"
        subtitle="Tariffe per data, coefficienti con storico, festivi e patroni, anagrafica CDL di HR. Il calcolo di fine mese usa sempre il valore valido alla data di ogni giorno." />

      <section id="tariffe" className="card p-4 md:p-5">
        <h2 className="mb-3 text-[19px] font-semibold">Tariffe trasferta</h2>
        <p className="mb-3 text-sm text-ink-muted">Giorno con più di 4 ore lavorate (Standard + Straordinario + Supplementare + Accordo). Domenica = feriale + extra. Avviso in testa al modulo 60, 30 e 7 giorni prima di ogni cambio.</p>
        <div className="grid gap-4 md:grid-cols-2">
          {voci.map((v) => {
            const pc = prossimoCambio(tar, v, oggi);
            return (
              <div key={v}>
                <h3 className="mb-2 font-semibold">{v === "TRASFERTA" ? "Trasferta feriale" : "Extra domenica"} — oggi {eur(valoreAlla(tar, v, oggi) ?? 0)} €</h3>
                <table className="table-base text-sm"><thead><tr><th>Valida dal</th><th className="text-right">€/giorno</th><th>Fonte</th></tr></thead>
                  <tbody>{tar.filter((t) => t.voce === v).map((t) => <tr key={t.validaDal} className={t.validaDal === pc?.validaDal ? "bg-warn-soft" : ""}><td>{it(t.validaDal)}</td><td className="text-right font-mono">{eur(t.valore)}</td><td className="text-ink-muted">{t.fonte ?? ""}</td></tr>)}</tbody>
                </table>
                {pc && <p className="mt-2 text-sm">Prossimo cambio: <b>{it(pc.validaDal)}</b> ({pc.giorni} giorni), {eur(pc.precedente ?? 0)} → {eur(pc.valore)} €</p>}
              </div>
            );
          })}
        </div>
        {edit && <NuovaTariffa />}
      </section>

      <section id="coefficienti" className="card p-4 md:p-5">
        <h2 className="mb-3 text-[19px] font-semibold">Coefficienti</h2>
        <p className="mb-3 text-sm text-ink-muted">Si ricalcolano dal consuntivo (Costi del personale PS e ADIT) con &quot;Aggiorna parametri&quot;; qui si può anche inserire a mano un nuovo valore con la sua data di validità. Le tariffe STD per voce si prendono dall&apos;ultimo ADIT caricato.</p>
        <div className="overflow-x-auto"><table className="table-base text-sm">
          <thead><tr><th>Gruppo</th><th>Coefficiente</th><th className="text-right">Valore oggi</th><th>Dal</th><th>Storico</th></tr></thead>
          <tbody>{chiavi.map((k) => {
            const st = par.filter((p) => p.chiave === k);
            const att = [...st].reverse().find((p) => p.validaDal <= oggi);
            const fut = st.filter((p) => p.validaDal > oggi);
            const u = PARAMETRI[k]?.unita ?? "";
            return <tr key={k}><td>{PARAMETRI[k]?.gruppo ?? "—"}</td><td>{PARAMETRI[k]?.etichetta ?? k} <span className="font-mono text-xs text-ink-muted">{k}</span></td>
              <td className="text-right font-mono font-semibold">{att ? `${num(att.valore, u)}${u && u !== "%" ? ` ${u}` : ""}` : "—"}</td><td>{att ? it(att.validaDal) : ""}</td>
              <td className="text-xs text-ink-muted">{st.filter((p) => p !== att).map((p) => `${it(p.validaDal)}: ${num(p.valore, u)}${fut.includes(p) ? " (futuro)" : ""}`).join(" · ")}</td></tr>;
          })}</tbody>
        </table></div>
        {edit && <NuovoParametro chiavi={chiavi} />}
      </section>

      <section id="festivi" className="card p-4 md:p-5">
        <div className="mb-3 flex flex-wrap items-center gap-3">
          <h2 className="text-[19px] font-semibold">Festivi {anno}</h2>
          {[anno - 1, anno + 1].map((a) => <a key={a} className="btn-secondary px-3 py-1 text-xs" href={`?anno=${a}#festivi`}>{a}</a>)}
        </div>
        <p className="mb-3 text-sm text-ink-muted">Nazionali (anche 24/12 e 31/12, semifestivi art. 10 Accordo) e patrono di ogni station. Valgono come la domenica per MAGG50/STR65/SUPP65 e per le festività. Mai il sabato come domenica.</p>
        <div className="overflow-x-auto"><table className="table-base text-sm">
          <thead><tr><th>Data</th><th>Giorno</th><th>Descrizione</th><th>Station</th>{edit && <th />}</tr></thead>
          <tbody>{fest.map((f) => <tr key={f.id}><td>{it(f.data)}</td><td>{new Date(f.data + "T12:00:00Z").toLocaleDateString("it-IT", { weekday: "long", timeZone: "UTC" })}</td><td>{f.descrizione}</td><td>{f.station}</td>{edit && <td><EliminaFestivo id={f.id} /></td>}</tr>)}</tbody>
        </table></div>
        {fest.length === 0 && <p className="text-sm text-warn">Nessun festivo per il {anno}: aggiungili (nazionali con station TUTTE, patroni con la station).</p>}
        {edit && <NuovoFestivo stations={[...STATIONS_COSTI]} />}
      </section>

      <section id="mog" className="card p-4 md:p-5">
        <h2 className="mb-3 text-[19px] font-semibold">File MOG Adecco (somministrati STD)</h2>
        <p className="mb-3 text-sm text-ink-muted">Monte ore garantito: se un somministrato chiude il mese sotto le sue ore MOG, Adecco fattura la differenza come &quot;Integrazione MOG&quot;. Il file serve ai controlli MOG di Presenze (settimanale e fine mese) e alla riga Integrazione MOG dei costi. Va aggiornato ogni mese: oltre 40 giorni il sito lo segnala.</p>
        {vMog.length > 0 && (
          <table className="table-base mb-4 text-sm"><thead><tr><th>Chiusura payroll</th><th className="text-right">Lavoratori</th><th>Per station</th><th>Caricato il</th></tr></thead>
            <tbody>{vMog.map((v, i) => <tr key={v.versione} className={i === 0 ? "font-semibold" : ""}><td>{it(v.versione)}{i === 0 ? " (in uso)" : ""}</td><td className="text-right font-mono">{v.teste}</td><td className="text-xs">{Object.entries(v.perStation).sort().map(([s, n]) => `${s} ${n}`).join(" · ")}</td><td>{v.caricatoIl ? new Date(v.caricatoIl).toLocaleString("it-IT") : ""}</td></tr>)}</tbody>
          </table>
        )}
        {cMog.contratti.length > 0 && <ConsolidamentiMog contratti={cMog.contratti} daMese={oggiIso().slice(0, 7)} variazioni={varMog} />}
        {edit && <MogClient />}
        <h3 className="mb-1 mt-5 font-semibold">Aumenti MOG comunicati</h3>
        <p className="text-sm text-ink-muted">Dai PDF &quot;Mog_Cambio…&quot; e dall&apos;Excel &quot;Aumenti MOG PS&quot;: dalla data il MOG del mese si ricalcola con la nuova % × 169 h, pro-rata. Trascina i due file insieme: dal PDF si prendono data e % prima/dopo, dall&apos;Excel il codice fiscale.</p>
        {varMog.length > 0 && <table className="table-base mt-2 text-sm"><thead><tr><th>Lavoratore</th><th className="text-right">Nuova %</th><th>Dal</th><th>Fonte</th></tr></thead><tbody>{varMog.map((v) => <tr key={v.id}><td>{v.nome}</td><td className="text-right font-mono">{v.pctNuova}</td><td>{it(v.validaDal)}</td><td>{v.fonte ?? ""}</td></tr>)}</tbody></table>}
        {edit && cMog.contratti.length > 0 && <AumentiMog contratti={cMog.contratti} />}
        {edit && cMog.contratti.length > 0 && <p className="mt-3 text-sm text-ink-muted">Oppure a mano, uno per volta:</p>}
        {edit && cMog.contratti.length > 0 && <VariazioneMog lavoratori={cMog.contratti.map((c) => ({ cf: c.cf, nome: `${c.cognome} ${c.nome}`, station: c.station, pct: c.pctMog }))} />}
      </section>

      <section id="anagrafica" className="card p-4 md:p-5">
        <h2 className="mb-3 text-[19px] font-semibold">Anagrafica CDL</h2>
        <p className="mb-3 text-sm text-ink-muted">File di HR <code>DB_CDL_base_MMAA_AmazonGLS_BO.xlsx</code>, foglio <code>SIC Amazon TR</code>. Ogni caricamento è una nuova versione per mese; la stima usa l&apos;ultima disponibile e scrive quale. Il file non viene salvato: si leggono solo le colonne che servono.</p>
        {versioni.length > 0 && (
          <table className="table-base mb-4 text-sm"><thead><tr><th>Versione</th><th className="text-right">Teste</th><th className="text-right">CDL totale €</th><th>Caricata il</th></tr></thead>
            <tbody>{versioni.map((v, i) => <tr key={v.mese} className={i === 0 ? "font-semibold" : ""}><td>{v.mese.split("-").reverse().join("/")}{i === 0 ? " (in uso)" : ""}</td><td className="text-right font-mono">{v.teste}</td><td className="text-right font-mono">{eur(v.cdl)}</td><td>{v.caricatoIl ? new Date(v.caricatoIl).toLocaleString("it-IT") : ""}</td></tr>)}</tbody>
          </table>
        )}
        {edit ? <AnagraficaCDLClient /> : <p className="text-sm text-ink-muted">Solo chi ha il permesso parametri può caricare l&apos;anagrafica.</p>}
      </section>
    </div>
  );
}
