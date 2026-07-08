import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { assertCan, stationScope } from "@/lib/rbac";
import { db } from "@/lib/db";
import { getConfigNumber } from "@/lib/config";
import { giorniScoperti, importoStorno, isPraticaStagnante } from "@/domain/replacement";
import { PageHeader, StatusBadge, SourceNote, EmptyState } from "@/components/ui";
import { fmtDate, fmtEur } from "@/lib/format";

export const dynamic = "force-dynamic";

const STATO_TONE: Record<string, "ok" | "warn" | "danger" | "info" | "neutral"> = {
  APERTA: "warn",
  INVIATA: "info",
  CONFERMATA: "ok",
  CONTESTATA: "danger",
  CHIUSA: "neutral",
};

export default async function ReplacementsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; stato?: string; senzaSostitutivo?: string; station?: string }>;
}) {
  const user = await requireUser();
  assertCan(user, "replacement.manage");
  const params = await searchParams;
  const scope = stationScope(user);
  const soloSenzaSostitutivo = params.senzaSostitutivo === "1";
  const stationFilter = scope.stationId ?? (user.role === "ADMIN" ? params.station || null : null);

  const [cases, vehicles, sogliaStagnante, giorniConvenzionaliMese, filterStation] = await Promise.all([
    db.replacementCase.findMany({
      where: {
        ...(stationFilter ? { vehicle: { stationId: stationFilter } } : {}),
        ...(params.stato ? { stato: params.stato as never } : {}),
        ...(soloSenzaSostitutivo ? { replacementVehicleId: null, stato: { not: "CHIUSA" } } : {}),
      },
      include: { vehicle: { include: { station: true } }, replacementVehicle: true },
      orderBy: { dataIngressoOfficina: "desc" },
      take: 100,
    }),
    db.vehicle.findMany({
      where: { ...(stationFilter ? { stationId: stationFilter } : {}), stato: { not: "DISMESSO" } },
      orderBy: { targa: "asc" },
      select: { id: true, targa: true, modello: true },
    }),
    getConfigNumber("replacement.alert.giorniSenzaRisposta"),
    getConfigNumber("replacement.giorniConvenzionaliMese"),
    stationFilter && user.role === "ADMIN" ? db.station.findUnique({ where: { id: stationFilter } }) : Promise.resolve(null),
  ]);

  const oggi = new Date();
  const rows = cases.map((c) => {
    const giorni = c.giorniScoperti ?? giorniScoperti({
      dataIngressoOfficina: c.dataIngressoOfficina,
      dataRicezioneSostitutivo: c.dataRicezioneSostitutivo,
      dataRientroOriginale: c.dataRientroOriginale,
      oggi,
    });
    const canone = c.canoneMeseSnapshot ? Number(c.canoneMeseSnapshot) : Number(c.vehicle.canoneMese ?? 0);
    const storno = c.importoStorno ? Number(c.importoStorno) : importoStorno(giorni, canone, giorniConvenzionaliMese);
    const stagnante = isPraticaStagnante({ stato: c.stato, inviataAt: c.inviataAt, oggi, sogliaGiorni: sogliaStagnante });
    return { c, giorni, storno, stagnante };
  });

  const totStorno = rows.filter((r) => r.c.stato !== "CHIUSA").reduce((s, r) => s + r.storno, 0);
  const stagnanti = rows.filter((r) => r.stagnante).length;

  return (
    <div>
      <PageHeader
        title="Mezzi sostitutivi e storno canone"
        subtitle={`Credito verso leasing tracciato per singola targa · pratiche in alert dopo ${sogliaStagnante} giorni senza risposta`}
        action={<a href="#nuova" className="btn-primary">+ Apri pratica</a>}
      />

      {params.error && (
        <p className="mb-4 text-sm text-danger bg-danger-soft rounded-control px-3 py-2">{params.error}</p>
      )}

      {soloSenzaSostitutivo && (
        <p className="mb-4 text-sm text-warn bg-warn-soft rounded-control px-3 py-2 flex items-center justify-between">
          <span>Filtro attivo: solo pratiche aperte <strong>senza</strong> mezzo sostitutivo assegnato</span>
          <a href={stationFilter && user.role === "ADMIN" ? `/replacements?station=${stationFilter}` : "/replacements"} className="underline">rimuovi filtro</a>
        </p>
      )}

      {filterStation && (
        <p className="mb-4 text-sm text-info bg-info-soft rounded-control px-3 py-2 flex items-center justify-between">
          <span>Filtro attivo: solo stazione <strong>{filterStation.code} — {filterStation.name}</strong></span>
          <a href={soloSenzaSostitutivo ? "/replacements?senzaSostitutivo=1" : "/replacements"} className="underline">rimuovi filtro</a>
        </p>
      )}

      <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-6">
        <div className="card p-4">
          <div className="text-xs font-semibold text-ink-muted uppercase">Storno potenziale/attivo</div>
          <div className="text-2xl font-bold">{fmtEur(totStorno)}</div>
          <div className="text-[11px] text-ink-faint">pratiche non chiuse, giorni × canone per targa</div>
        </div>
        <div className="card p-4">
          <div className="text-xs font-semibold text-ink-muted uppercase">Pratiche aperte/inviate</div>
          <div className="text-2xl font-bold">{rows.filter((r) => r.c.stato === "APERTA" || r.c.stato === "INVIATA").length}</div>
        </div>
        <div className="card p-4">
          <div className="text-xs font-semibold text-ink-muted uppercase">In alert (senza risposta)</div>
          <div className={`text-2xl font-bold ${stagnanti > 0 ? "text-danger" : "text-ok"}`}>{stagnanti}</div>
        </div>
      </div>

      {rows.length === 0 ? (
        <EmptyState message="Nessuna pratica sostitutivo." />
      ) : (
        <div className="card overflow-x-auto">
          <table className="table-base">
            <thead>
              <tr>
                <th>Targa</th><th>Stazione</th><th>Motivo</th><th>Ingresso officina</th>
                <th>Sostitutivo</th><th>Giorni scoperti</th><th>Storno</th><th>Stato</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ c, giorni, storno, stagnante }) => (
                <tr key={c.id} className={stagnante ? "bg-danger-soft" : ""}>
                  <td>
                    <Link href={`/replacements/${c.id}`} className="font-mono font-semibold text-brand hover:underline">
                      {c.vehicle.targa}
                    </Link>
                  </td>
                  <td>{c.vehicle.station.code}</td>
                  <td>{c.motivo}</td>
                  <td>{fmtDate(c.dataIngressoOfficina)}<div className="text-xs text-ink-muted">{c.centroConvenzionato}</div></td>
                  <td>
                    {c.replacementVehicle
                      ? <span className="font-mono">{c.replacementVehicle.targa}</span>
                      : <StatusBadge tone="warn">non assegnato</StatusBadge>}
                    {c.dataRicezioneSostitutivo && <div className="text-xs text-ink-muted">dal {fmtDate(c.dataRicezioneSostitutivo)}</div>}
                  </td>
                  <td className="font-semibold">{giorni}</td>
                  <td className="font-semibold whitespace-nowrap">{fmtEur(storno)}</td>
                  <td>
                    <StatusBadge tone={STATO_TONE[c.stato]}>{c.stato}</StatusBadge>
                    {stagnante && <div className="mt-1"><StatusBadge tone="danger">senza risposta</StatusBadge></div>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="px-3 pb-3">
            <SourceNote>
              tabella ReplacementCase{stationFilter ? ` (stazione ${filterStation?.code ?? ""})` : " (cluster)"} — giorni/storno congelati all&apos;invio, altrimenti calcolati a oggi ({oggi.toLocaleDateString("it-IT")}) su canone corrente
            </SourceNote>
          </div>
        </div>
      )}

      {/* nuova pratica */}
      <section id="nuova" className="card p-5 mt-6 max-w-3xl">
        <h2 className="font-semibold mb-3">Apri nuova pratica</h2>
        <p className="text-xs text-ink-muted mb-4">
          Vincolo anti doppio-storno: non è possibile aprire due pratiche per la stessa targa con la stessa data di ingresso officina.
        </p>
        <FormNuovaPratica vehicles={vehicles} />
      </section>
    </div>
  );
}

import { createReplacementCaseAction } from "./actions";

function FormNuovaPratica({ vehicles }: { vehicles: { id: string; targa: string; modello: string }[] }) {
  return (
    <form action={createReplacementCaseAction} className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <div>
        <label className="label">Veicolo originale *</label>
        <select className="input font-mono" name="vehicleId" required defaultValue="">
          <option value="" disabled>— seleziona —</option>
          {vehicles.map((v) => <option key={v.id} value={v.id}>{v.targa} — {v.modello}</option>)}
        </select>
      </div>
      <div>
        <label className="label">Motivo *</label>
        <select className="input" name="motivo" required>
          <option value="GUASTO">Guasto</option>
          <option value="INCIDENTE">Incidente</option>
          <option value="MANUTENZIONE">Manutenzione</option>
        </select>
      </div>
      <div>
        <label className="label">Data ingresso officina *</label>
        <input className="input" type="date" name="dataIngressoOfficina" required defaultValue={new Date().toISOString().slice(0, 10)} />
      </div>
      <div>
        <label className="label">Centro convenzionato *</label>
        <input className="input" name="centroConvenzionato" required />
      </div>
      <div className="md:col-span-2">
        <label className="label">Note</label>
        <input className="input" name="note" />
      </div>
      <div className="md:col-span-2">
        <button className="btn-primary">Apri pratica</button>
      </div>
    </form>
  );
}
