import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { db } from "@/lib/db";
import { getConfigNumber } from "@/lib/config";
import { riaddebitoEffettivo } from "@/domain/fines";
import { PageHeader, StatusBadge, SourceNote, EmptyState } from "@/components/ui";
import { fmtDateTime, fmtDate, fmtEur } from "@/lib/format";
import type { FineStatus, Prisma } from "@prisma/client";
import { FINE_TONE, RIADDEBITO_LABELS, RIADDEBITO_TONE } from "./constants";

export const dynamic = "force-dynamic";

export default async function FinesPage({
  searchParams,
}: {
  searchParams: Promise<{ stato?: string; assegnazione?: string; station?: string; anno?: string }>;
}) {
  const user = await requireUser();
  const params = await searchParams;
  const oggi = new Date();
  const annoCorrente = oggi.getFullYear();

  // scoping: driver → solo proprie; resp → propria stazione; admin → tutte
  let where: Prisma.FineWhereInput = {};
  let scopeLabel = "tutte le stazioni";
  if (user.role === "DRIVER") {
    where = { driverId: user.id };
    scopeLabel = "solo multe intestate a te";
  } else if (user.role === "RESP_MEZZI") {
    where = { vehicle: { stationId: user.stationId! } };
    scopeLabel = "propria stazione";
  } else if (params.station) {
    where = { vehicle: { stationId: params.station } };
    scopeLabel = "stazione filtrata";
  }
  if (params.stato) where.stato = params.stato as FineStatus;
  if (params.assegnazione === "da_assegnare") where.driverId = null;

  // filtro anno: di default nasconde gli anni "vecchi" (prima dell'anno corrente-1),
  // che restano comunque raggiungibili scegliendo esplicitamente l'anno o "Tutti"
  const annoOptions = Array.from({ length: 4 }, (_, i) => annoCorrente - 3 + i);
  if (params.anno === "tutti") {
    // nessun filtro data
  } else if (params.anno) {
    const anno = Number(params.anno);
    where.dataOraInfrazione = { gte: new Date(Date.UTC(anno, 0, 1)), lt: new Date(Date.UTC(anno + 1, 0, 1)) };
  } else {
    where.dataOraInfrazione = { gte: new Date(Date.UTC(annoCorrente - 1, 0, 1)) };
  }

  const [fines, stations, sogliaRiaddebito] = await Promise.all([
    db.fine.findMany({
      where,
      include: { vehicle: { include: { station: true } }, driver: true },
      orderBy: { dataOraInfrazione: "desc" },
      take: 200,
    }),
    user.role === "ADMIN" ? db.station.findMany({ orderBy: { code: "asc" } }) : Promise.resolve([]),
    getConfigNumber("fine.riaddebito.scadenzaGiorni"),
  ]);

  const canManage = can(user, "fine.manage");

  return (
    <div>
      <PageHeader
        title={user.role === "DRIVER" ? "Le mie multe" : "Multe"}
        subtitle={`Ambito: ${scopeLabel}`}
        action={canManage ? <Link href="/fines/new" className="btn-primary">+ Registra multa</Link> : undefined}
      />

      {canManage && (
        <form className="mb-4 flex flex-wrap gap-2" method="get">
          {user.role === "ADMIN" && (
            <select className="input max-w-56" name="station" defaultValue={params.station ?? ""}>
              <option value="">Tutte le stazioni</option>
              {stations.map((s) => <option key={s.id} value={s.id}>{s.code} — {s.name}</option>)}
            </select>
          )}
          <select className="input max-w-48" name="stato" defaultValue={params.stato ?? ""}>
            <option value="">Tutti gli stati</option>
            {Object.keys(FINE_TONE).map((s) => <option key={s} value={s}>{s.replaceAll("_", " ")}</option>)}
          </select>
          <select className="input max-w-52" name="assegnazione" defaultValue={params.assegnazione ?? ""}>
            <option value="">Tutte</option>
            <option value="da_assegnare">Solo da assegnare</option>
          </select>
          <select className="input max-w-40" name="anno" defaultValue={params.anno ?? ""}>
            <option value="">{`${annoCorrente - 1}-${annoCorrente} (recenti)`}</option>
            {annoOptions.map((a) => <option key={a} value={a}>{a}</option>)}
            <option value="tutti">Tutti gli anni</option>
          </select>
          <button className="btn-secondary">Filtra</button>
        </form>
      )}

      {fines.length === 0 ? (
        <EmptyState message="Nessuna multa trovata. 🎉" />
      ) : (
        <div className="card overflow-x-auto">
          <table className="table-base">
            <thead>
              <tr>
                <th>Data/ora</th><th>Targa</th><th>Stazione</th><th>Violazione</th>
                <th>Importo</th><th>Punti</th><th>Conducente</th><th>Stato</th><th>Riaddebito</th><th>Ricorso entro</th>
              </tr>
            </thead>
            <tbody>
              {fines.map((f) => {
                const riaddebito = riaddebitoEffettivo({
                  riaddebito: f.riaddebito, driverId: f.driverId, dataNotifica: f.dataNotifica, oggi, sogliaGiorni: sogliaRiaddebito,
                });
                const scaduto = riaddebito !== f.riaddebito;
                return (
                <tr key={f.id}>
                  <td>
                    <Link href={`/fines/${f.id}`} className="text-brand hover:underline whitespace-nowrap font-semibold">
                      {fmtDateTime(f.dataOraInfrazione)}
                    </Link>
                    {f.verbaleNo && <div className="text-xs text-ink-faint font-mono">{f.verbaleNo}</div>}
                  </td>
                  <td className="font-mono">{f.vehicle.targa}</td>
                  <td>{f.vehicle.station.code}</td>
                  <td>{f.tipoViolazione}<div className="text-xs text-ink-muted">{f.luogo}</div></td>
                  <td className="whitespace-nowrap">{fmtEur(Number(f.importo))}</td>
                  <td>{f.puntiPatente > 0 ? f.puntiPatente : "—"}</td>
                  <td>
                    {f.driver
                      ? `${f.driver.firstName} ${f.driver.lastName}`
                      : <StatusBadge tone="warn">da assegnare</StatusBadge>}
                  </td>
                  <td><StatusBadge tone={FINE_TONE[f.stato]}>{f.stato.replaceAll("_", " ")}</StatusBadge></td>
                  <td className="whitespace-nowrap">
                    <StatusBadge tone={RIADDEBITO_TONE[riaddebito]}>{RIADDEBITO_LABELS[riaddebito]}</StatusBadge>
                    {scaduto && <div className="text-[10px] text-ink-faint mt-0.5">termine assegnazione scaduto</div>}
                  </td>
                  <td className="whitespace-nowrap text-xs">{f.scadenzaRicorso ? fmtDate(f.scadenzaRicorso) : "—"}</td>
                </tr>
                );
              })}
            </tbody>
          </table>
          <div className="px-3 pb-3">
            <SourceNote>
              tabella Fine ({scopeLabel}), ultime 200 righe per data infrazione decrescente — riaddebito calcolato a oggi (soglia {sogliaRiaddebito}gg da AppConfig)
            </SourceNote>
          </div>
        </div>
      )}
    </div>
  );
}
