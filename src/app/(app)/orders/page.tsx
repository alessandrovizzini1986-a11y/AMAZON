import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { assertCan, can } from "@/lib/rbac";
import { db } from "@/lib/db";
import { PageHeader, SourceNote, EmptyState } from "@/components/ui";
import { fmtNum } from "@/lib/format";
import { PHASE_LABEL, isoWeek, orderPhase, orderRefDate, todayRome, weekRecap, type OrderPhase } from "@/domain/orders";
import { uploadAyvensOrdersAction } from "./actions";

export const dynamic = "force-dynamic";

// colori delle tre fasi, usati in KPI, barre e badge
const PHASE_COLOR: Record<OrderPhase, string> = {
  RITIRATO: "#17663f",
  RITIRO_FISSATO: "#1f5fa8",
  IN_ARRIVO: "#c2650a",
};
const PHASE_BADGE: Record<OrderPhase, string> = {
  RITIRATO: "badge-ok",
  RITIRO_FISSATO: "badge-info",
  IN_ARRIVO: "badge-warn",
};

const VISTE = [
  { key: "da-arrivare", label: "Da arrivare", phases: ["IN_ARRIVO"] },
  { key: "fissati", label: "Con data ritiro", phases: ["RITIRO_FISSATO"] },
  { key: "ritirati", label: "Ritirati", phases: ["RITIRATO"] },
  { key: "tutti", label: "Tutti", phases: ["IN_ARRIVO", "RITIRO_FISSATO", "RITIRATO"] },
] as const;

const fmtDay = (d: Date | null) =>
  d ? d.toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "UTC" }) : "—";
const fmtShort = (d: Date | null) => (d ? d.toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit", timeZone: "UTC" }) : "");

function Kpi({ label, value, note, color }: { label: string; value: number; note: string; color?: string }) {
  return (
    <div className="card relative overflow-hidden p-4 md:p-[22px]">
      {color && <span aria-hidden className="absolute inset-y-0 left-0 w-1" style={{ background: color }} />}
      <div className="text-[13px] font-medium text-ink-muted md:text-sm">{label}</div>
      <div className="mt-1.5 text-[24px] font-bold leading-tight tracking-[-0.02em] tabular-nums md:mt-2 md:text-[38px]">{fmtNum(value)}</div>
      <div className="mt-1 text-[13px] text-ink-muted">{note}</div>
    </div>
  );
}

/**
 * Ordini Ayvens per l'appalto GLS: quanti furgoni sono previsti, in quale
 * settimana, quali hanno già una data di ritiro e quali devono ancora arrivare.
 */
export default async function OrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ vista?: string; ok?: string; nuovi?: string; error?: string }>;
}) {
  const user = await requireUser();
  assertCan(user, "orders.view");
  const params = await searchParams;
  const canUpload = can(user, "import.run");
  const today = todayRome();

  let orders: Awaited<ReturnType<typeof db.fleetOrder.findMany>> = [];
  let tableMissing = false;
  try {
    orders = await db.fleetOrder.findMany({ where: { fornitore: "AYVENS", appalto: "GLS" } });
  } catch {
    // migrazione FleetOrder non ancora applicata su questo database
    tableMissing = true;
  }

  // targhe già entrate in flotta (non dismesse)
  const targhe = orders.map((o) => o.targa).filter((t): t is string => !!t);
  const inFlotta = new Map(
    (targhe.length
      ? await db.vehicle.findMany({
          where: { targa: { in: targhe }, stato: { not: "DISMESSO" } },
          select: { id: true, targa: true, station: { select: { code: true } } },
        })
      : []
    ).map((v) => [v.targa, v]),
  );

  const withPhase = orders
    .map((o) => ({ ...o, phase: orderPhase(o, today), ref: orderRefDate(o) }))
    .sort((a, b) => (a.ref?.getTime() ?? Infinity) - (b.ref?.getTime() ?? Infinity) || a.refOrdine.localeCompare(b.refOrdine));
  const count = (p: OrderPhase) => withPhase.filter((o) => o.phase === p).length;
  const recap = weekRecap(orders, today);
  const maxWeek = Math.max(1, ...recap.map((r) => r.totale));
  const currentWeek = isoWeek(today);
  const currentKey = `${currentWeek.year}-W${String(currentWeek.week).padStart(2, "0")}`;

  const vista = VISTE.find((v) => v.key === params.vista) ?? VISTE[0];
  const listed = withPhase.filter((o) => (vista.phases as readonly string[]).includes(o.phase));

  const upload = canUpload ? (
    <form action={uploadAyvensOrdersAction} className="flex flex-wrap items-end gap-2.5">
      <label className="flex flex-col gap-1 text-xs font-semibold text-ink-muted">
        File ordini Ayvens (.xlsx)
        <input type="file" name="file" accept=".xlsx" required className="input h-11 w-64 py-2 text-sm font-normal" />
      </label>
      <button className="btn-primary h-11 px-[18px] text-[15px]">Carica ordini</button>
    </form>
  ) : undefined;

  return (
    <div>
      <PageHeader eyebrow="Ordini Ayvens · appalto GLS" title="Furgoni in arrivo" action={upload} />

      {params.ok && (
        <p className="mb-4 rounded-control bg-ok-soft px-3 py-2 text-sm text-ok">
          File caricato: {params.ok} ordini letti, {params.nuovi ?? 0} nuovi.
        </p>
      )}
      {params.error && <p className="mb-4 rounded-control bg-danger-soft px-3 py-2 text-sm text-danger">{params.error}</p>}

      {tableMissing ? (
        <EmptyState message="La sezione ordini non è ancora attiva su questo database (manca l'aggiornamento della struttura dati)." />
      ) : orders.length === 0 ? (
        <EmptyState message="Nessun ordine caricato. Carica l'export &quot;Lista Ordini&quot; di Ayvens con il pulsante in alto." />
      ) : (
        <>
          <div className="mb-6 grid grid-cols-2 gap-3 md:gap-4 lg:grid-cols-4">
            <Kpi label="Furgoni ordinati" value={orders.length} note="totale ordini Ayvens GLS" />
            <Kpi label="Da arrivare" value={count("IN_ARRIVO")} note="senza data di ritiro" color={PHASE_COLOR.IN_ARRIVO} />
            <Kpi label="Con data ritiro" value={count("RITIRO_FISSATO")} note="ritiro fissato da oggi in poi" color={PHASE_COLOR.RITIRO_FISSATO} />
            <Kpi label="Ritirati" value={count("RITIRATO")} note="data ritiro già passata" color={PHASE_COLOR.RITIRATO} />
          </div>

          {/* riepilogo per settimana */}
          <section className="card mb-6 p-4 md:p-[26px]">
            <div className="flex flex-wrap items-baseline justify-between gap-3">
              <h2 className="text-[19px] font-semibold">Riepilogo per settimana</h2>
              <div className="flex flex-wrap gap-4 text-[13px] text-[#3c4a5c]">
                {(["RITIRATO", "RITIRO_FISSATO", "IN_ARRIVO"] as const).map((p) => (
                  <div key={p} className="flex items-center gap-1.5">
                    <span aria-hidden className="h-3 w-3 rounded-[3px]" style={{ background: PHASE_COLOR[p] }} />
                    {PHASE_LABEL[p]}
                  </div>
                ))}
              </div>
            </div>
            <div className="mt-4 overflow-x-auto">
              <table className="w-full border-collapse text-sm md:text-[15px]">
                <thead>
                  <tr className="text-[11px] font-semibold uppercase text-ink-muted md:text-xs md:tracking-[0.06em]">
                    <th className="border-b border-line py-2.5 pr-3 text-left">Settimana</th>
                    <th className="hidden border-b border-line px-1.5 py-2.5 text-left sm:table-cell md:px-3">Periodo</th>
                    <th className="hidden w-[34%] border-b border-line px-3 py-2.5 text-left md:table-cell"><span className="sr-only">Grafico</span></th>
                    <th className="border-b border-line px-1.5 py-2.5 text-right md:px-3"><span className="md:hidden">Ritir.</span><span className="hidden md:inline">Ritirati</span></th>
                    <th className="border-b border-line px-1.5 py-2.5 text-right md:px-3"><span className="md:hidden">Fissati</span><span className="hidden md:inline">Ritiro fissato</span></th>
                    <th className="border-b border-line px-1.5 py-2.5 text-right md:px-3"><span className="md:hidden">In arr.</span><span className="hidden md:inline">Da arrivare</span></th>
                    <th className="border-b border-line py-2.5 pl-1.5 text-right md:pl-3">Tot.</th>
                  </tr>
                </thead>
                <tbody>
                  {recap.map((r) => {
                    const corrente = r.key === currentKey;
                    return (
                      <tr key={r.key} className={corrente ? "bg-brand-light" : undefined}>
                        <td className="border-b border-[#eef1f4] py-2.5 pr-3 font-semibold">
                          <span className="whitespace-nowrap">
                            {r.week ? `Week ${r.week}` : "Senza data"}
                            {r.year && r.year !== currentWeek.year ? <span className="block text-xs font-normal text-ink-muted md:inline md:text-sm"><span className="hidden md:inline"> · </span>{r.year}</span> : null}
                          </span>
                          {corrente && <span className="block text-xs font-semibold text-brand">questa settimana</span>}
                        </td>
                        <td className="hidden whitespace-nowrap border-b border-[#eef1f4] px-1.5 py-2.5 text-ink-muted sm:table-cell md:px-3">
                          {r.monday ? `${fmtShort(r.monday)} – ${fmtShort(r.sunday)}` : "—"}
                        </td>
                        <td className="hidden border-b border-[#eef1f4] px-3 py-2.5 md:table-cell">
                          <div className="flex h-[18px] overflow-hidden rounded" style={{ width: `${(r.totale / maxWeek) * 100}%` }}>
                            {r.ritirati > 0 && <span style={{ flex: r.ritirati, background: PHASE_COLOR.RITIRATO }} />}
                            {r.fissati > 0 && <span style={{ flex: r.fissati, background: PHASE_COLOR.RITIRO_FISSATO }} />}
                            {r.inArrivo > 0 && <span style={{ flex: r.inArrivo, background: PHASE_COLOR.IN_ARRIVO }} />}
                          </div>
                        </td>
                        <td className="border-b border-[#eef1f4] px-1.5 py-2.5 text-right tabular-nums md:px-3">{r.ritirati || "—"}</td>
                        <td className="border-b border-[#eef1f4] px-1.5 py-2.5 text-right tabular-nums md:px-3">{r.fissati || "—"}</td>
                        <td className="border-b border-[#eef1f4] px-1.5 py-2.5 text-right tabular-nums md:px-3">{r.inArrivo || "—"}</td>
                        <td className="border-b border-[#eef1f4] py-2.5 pl-3 text-right font-semibold tabular-nums">{r.totale}</td>
                      </tr>
                    );
                  })}
                  <tr className="font-bold">
                    <td className="py-3 pr-3">Totale</td>
                    <td className="hidden sm:table-cell" />
                    <td className="hidden md:table-cell" />
                    <td className="px-3 py-3 text-right tabular-nums">{count("RITIRATO")}</td>
                    <td className="px-3 py-3 text-right tabular-nums">{count("RITIRO_FISSATO")}</td>
                    <td className="px-3 py-3 text-right tabular-nums">{count("IN_ARRIVO")}</td>
                    <td className="py-3 pl-3 text-right tabular-nums">{orders.length}</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <SourceNote>
              settimana della data di ritiro se c&apos;è, altrimenti della consegna prevista da Ayvens · ritirato = data ritiro già passata
              (oggi {fmtDay(today)})
            </SourceNote>
          </section>

          {/* elenco ordini */}
          <section>
            <div className="mb-3 flex flex-wrap items-center gap-2">
              {VISTE.map((v) => {
                const n = withPhase.filter((o) => (v.phases as readonly string[]).includes(o.phase)).length;
                const active = v.key === vista.key;
                return (
                  <Link
                    key={v.key}
                    href={`/orders?vista=${v.key}`}
                    className={`inline-flex h-10 items-center gap-2 rounded-full border px-3.5 text-sm font-semibold transition-colors ${
                      active ? "border-brand bg-brand text-white" : "border-[#d5dbe3] bg-surface-raised text-ink hover:border-brand hover:text-brand"
                    }`}
                  >
                    {v.label}
                    <span className={active ? "text-white/80" : "text-ink-muted"}>{n}</span>
                  </Link>
                );
              })}
            </div>
            {listed.length === 0 ? (
              <EmptyState message="Nessun ordine in questa vista." />
            ) : (
              <div className="card overflow-x-auto">
                <table className="table-base text-[15px]">
                  <thead>
                    <tr>
                      <th>Ordine</th>
                      <th>Targa</th>
                      <th>Fase</th>
                      <th>Stato Ayvens</th>
                      <th>Consegna prevista</th>
                      <th>Data ritiro</th>
                      <th>Week</th>
                      <th>Punto di ritiro</th>
                      <th>In flotta</th>
                    </tr>
                  </thead>
                  <tbody>
                    {listed.map((o) => {
                      const v = o.targa ? inFlotta.get(o.targa) : undefined;
                      return (
                        <tr key={o.id}>
                          <td className="font-mono text-sm">{o.refOrdine}</td>
                          <td className="whitespace-nowrap font-mono font-semibold">{o.targa ?? <span className="font-sans font-normal text-ink-faint">da assegnare</span>}</td>
                          <td className="whitespace-nowrap">
                            <span className={PHASE_BADGE[o.phase]}>
                              <span aria-hidden className="badge-dot" />
                              {PHASE_LABEL[o.phase]}
                            </span>
                          </td>
                          <td className="whitespace-nowrap text-[#3c4a5c]">{o.statoFornitore}</td>
                          <td className="whitespace-nowrap">{fmtDay(o.previstaConsegna)}</td>
                          <td className="whitespace-nowrap font-semibold">{fmtDay(o.dataRitiro)}</td>
                          <td>{o.ref ? isoWeek(o.ref).week : "—"}</td>
                          <td className="max-w-[220px] truncate text-[#3c4a5c]" title={[o.puntoRitiro, o.indirizzoRitiro].filter(Boolean).join(" — ")}>
                            {o.puntoRitiro ?? "—"}
                          </td>
                          <td className="whitespace-nowrap">
                            {v ? (
                              <Link href={`/vehicles/${v.id}`} className="font-semibold text-brand hover:underline">
                                Sì · {v.station.code}
                              </Link>
                            ) : (
                              <span className="text-ink-faint">No</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
            <SourceNote>
              export &quot;Lista Ordini&quot; Ayvens · {listed.length} di {orders.length} ordini · ultimo aggiornamento{" "}
              {fmtDay(orders.reduce<Date | null>((m, o) => (!m || o.updatedAt > m ? o.updatedAt : m), null))}
            </SourceNote>
          </section>
        </>
      )}
    </div>
  );
}
