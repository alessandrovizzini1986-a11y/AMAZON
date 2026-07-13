import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { assertCan, stationScope } from "@/lib/rbac";
import { db } from "@/lib/db";
import { getConfigNumber } from "@/lib/config";
import { giorniScoperti, importoStorno, isPraticaStagnante } from "@/domain/replacement";
import { PageHeader, StatusBadge, SourceNote } from "@/components/ui";
import { fmtDate, fmtDateTime, fmtEur } from "@/lib/format";
import { updateReplacementCaseAction, sendReplacementCaseAction, updateReplacementStatusAction } from "../actions";

export const dynamic = "force-dynamic";

export default async function ReplacementDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  assertCan(user, "replacement.manage");
  const { id } = await params;
  const scope = stationScope(user);

  const rc = await db.replacementCase.findUnique({
    where: { id },
    include: { vehicle: { include: { station: true } }, replacementVehicle: true },
  });
  if (!rc) notFound();
  if (scope.stationId && rc.vehicle.stationId !== scope.stationId) notFound();

  const oggi = new Date();
  const sogliaStagnante = await getConfigNumber("replacement.alert.giorniSenzaRisposta");
  const giorniConvenzionaliMese = await getConfigNumber("replacement.giorniConvenzionaliMese");
  const isLocked = rc.stato !== "APERTA";
  const isAdmin = user.role === "ADMIN";

  const giorniLive = giorniScoperti({
    dataIngressoOfficina: rc.dataIngressoOfficina,
    dataRicezioneSostitutivo: rc.dataRicezioneSostitutivo,
    dataRientroOriginale: rc.dataRientroOriginale,
    oggi,
  });
  const giorni = rc.giorniScoperti ?? giorniLive;
  const canone = rc.canoneMeseSnapshot ? Number(rc.canoneMeseSnapshot) : Number(rc.vehicle.canoneMese ?? 0);
  const storno = rc.importoStorno ? Number(rc.importoStorno) : importoStorno(giorniLive, canone, giorniConvenzionaliMese);
  const stagnante = isPraticaStagnante({ stato: rc.stato, inviataAt: rc.inviataAt, oggi, sogliaGiorni: sogliaStagnante });

  const substitutes = await db.vehicle.findMany({
    where: { id: { not: rc.vehicleId }, stato: { in: ["ATTIVO", "SOSTITUTIVO"] } },
    orderBy: { targa: "asc" },
    select: { id: true, targa: true, modello: true },
  });

  const auditRows = await db.auditLog.findMany({
    where: { entity: "ReplacementCase", entityId: id },
    include: { user: { select: { firstName: true, lastName: true } } },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div className="max-w-5xl">
      <PageHeader
        title={`Pratica sostitutivo — ${rc.vehicle.targa}`}
        subtitle={`${rc.motivo} · ingresso officina ${fmtDate(rc.dataIngressoOfficina)} · ${rc.centroConvenzionato}`}
        backHref="/replacements"
        backLabel="Sostitutivi"
        action={
          <div className="flex gap-2">
            <StatusBadge tone={rc.stato === "CONFERMATA" ? "ok" : rc.stato === "CONTESTATA" ? "danger" : rc.stato === "APERTA" ? "warn" : "info"}>{rc.stato}</StatusBadge>
            {stagnante && <StatusBadge tone="danger">senza risposta da &gt;{sogliaStagnante}gg</StatusBadge>}
          </div>
        }
      />

      {/* calcolo storno — sempre trasparente */}
      <div className="card p-5 mb-6">
        <h2 className="font-semibold mb-3">Storno canone</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
          <div>
            <div className="text-3xl font-bold">{giorni}</div>
            <div className="text-xs text-ink-muted">giorni senza sostitutivo</div>
          </div>
          <div>
            <div className="text-3xl font-bold">{fmtEur(canone)}</div>
            <div className="text-xs text-ink-muted">canone/mese {rc.canoneMeseSnapshot ? "(congelato all'invio)" : "(corrente)"}</div>
          </div>
          <div>
            <div className="text-3xl font-bold text-brand">{fmtEur(storno)}</div>
            <div className="text-xs text-ink-muted">credito da richiedere</div>
          </div>
          <div className="flex items-center justify-center">
            {rc.stato === "APERTA" ? (
              <form action={sendReplacementCaseAction.bind(null, rc.id)}>
                <button className="btn-primary">Invia alla leasing →</button>
              </form>
            ) : (
              <div className="text-xs text-ink-muted">
                inviata il {fmtDate(rc.inviataAt)}<br />pratica bloccata {isAdmin ? "(Admin può correggere)" : ""}
              </div>
            )}
          </div>
        </div>
        <SourceNote>
          giorni = da ingresso officina a min(ricezione sostitutivo, rientro originale, oggi); importo = giorni × (canone mensile ÷ {giorniConvenzionaliMese} giorni convenzionali) {rc.canoneMeseSnapshot ? "fotografato all'invio" : `corrente del veicolo (${rc.vehicle.leasingCompany ?? "leasing n/d"})`}
        </SourceNote>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* dati mezzo sostitutivo */}
        <section className="card p-5">
          <h2 className="font-semibold mb-3">Mezzo sostitutivo e date</h2>
          {isLocked && !isAdmin ? (
            <dl className="grid grid-cols-2 gap-y-2 text-sm">
              <dt className="text-ink-muted">Sostitutivo</dt>
              <dd>{rc.replacementVehicle ? rc.replacementVehicle.targa : "non assegnato"}</dd>
              <dt className="text-ink-muted">Ricezione sostitutivo</dt><dd>{fmtDate(rc.dataRicezioneSostitutivo)}</dd>
              <dt className="text-ink-muted">Rientro originale</dt><dd>{fmtDate(rc.dataRientroOriginale)}</dd>
            </dl>
          ) : (
            <form action={updateReplacementCaseAction.bind(null, rc.id)} className="space-y-3">
              {isLocked && isAdmin && (
                <p className="text-xs bg-warn-soft text-warn rounded-control px-3 py-2">
                  Pratica già inviata: la modifica è un override Admin e resta tracciata in audit.
                </p>
              )}
              <div>
                <label className="label">Mezzo sostitutivo</label>
                <select className="input font-mono" name="replacementVehicleId" defaultValue={rc.replacementVehicleId ?? ""}>
                  <option value="">— nessuno —</option>
                  {substitutes.map((v) => <option key={v.id} value={v.id}>{v.targa} — {v.modello}</option>)}
                </select>
              </div>
              <div>
                <label className="label">Data ricezione sostitutivo</label>
                <input className="input" type="date" name="dataRicezioneSostitutivo"
                  defaultValue={rc.dataRicezioneSostitutivo ? rc.dataRicezioneSostitutivo.toISOString().slice(0, 10) : ""} />
              </div>
              <div>
                <label className="label">Data rientro veicolo originale</label>
                <input className="input" type="date" name="dataRientroOriginale"
                  defaultValue={rc.dataRientroOriginale ? rc.dataRientroOriginale.toISOString().slice(0, 10) : ""} />
              </div>
              <button className="btn-secondary">Salva</button>
            </form>
          )}
        </section>

        {/* stato pratica */}
        <section className="card p-5">
          <h2 className="font-semibold mb-3">Esito leasing company</h2>
          <dl className="grid grid-cols-2 gap-y-2 text-sm mb-4">
            <dt className="text-ink-muted">Veicolo</dt>
            <dd><Link href={`/vehicles/${rc.vehicleId}`} className="text-brand font-mono hover:underline">{rc.vehicle.targa}</Link> ({rc.vehicle.station.code})</dd>
            <dt className="text-ink-muted">Leasing</dt><dd>{rc.vehicle.leasingCompany ?? "—"}</dd>
            <dt className="text-ink-muted">Contratto</dt><dd>{rc.vehicle.contrattoLeasingNo ?? "—"}</dd>
          </dl>
          {rc.stato !== "APERTA" ? (
            <form action={updateReplacementStatusAction.bind(null, rc.id)} className="space-y-3">
              <select className="input" name="stato" defaultValue={rc.stato === "INVIATA" ? "CONFERMATA" : rc.stato}>
                <option value="CONFERMATA">Confermata (credito riconosciuto)</option>
                <option value="CONTESTATA">Contestata</option>
                <option value="CHIUSA">Chiusa</option>
              </select>
              <input className="input" name="note" placeholder="Note (es. numero nota credito)" defaultValue={rc.note ?? ""} />
              <button className="btn-secondary">Aggiorna esito</button>
            </form>
          ) : (
            <p className="text-sm text-ink-muted">Invia prima la pratica alla leasing per registrare l&apos;esito.</p>
          )}
          {rc.note && <p className="text-xs bg-surface-sunken rounded-control p-2 mt-3">{rc.note}</p>}
        </section>
      </div>

      {/* audit */}
      <section className="card p-5 mt-6">
        <h2 className="font-semibold mb-3 text-sm">Audit trail pratica</h2>
        <ul className="text-xs space-y-1.5">
          {auditRows.map((a) => (
            <li key={a.id} className="flex gap-2">
              <span className="text-ink-faint whitespace-nowrap">{fmtDateTime(a.createdAt)}</span>
              <span className="font-mono">{a.action}</span>
              <span className="text-ink-muted">{a.user ? `${a.user.firstName} ${a.user.lastName}` : "sistema"}</span>
              {a.meta ? <span className="text-ink-faint truncate">{JSON.stringify(a.meta)}</span> : null}
            </li>
          ))}
        </ul>
        <SourceNote>tabella AuditLog, entity=ReplacementCase, entityId={rc.id}</SourceNote>
      </section>
    </div>
  );
}
