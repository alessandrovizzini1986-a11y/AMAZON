import { requireUser } from "@/lib/auth";
import { assertCan, stationScope } from "@/lib/rbac";
import { db } from "@/lib/db";
import { PageHeader } from "@/components/ui";
import { createFineAction } from "../actions";

export default async function NewFinePage() {
  const user = await requireUser();
  assertCan(user, "fine.manage");
  const scope = stationScope(user);

  const vehicles = await db.vehicle.findMany({
    where: { ...(scope.stationId ? { stationId: scope.stationId } : {}), stato: { not: "DISMESSO" } },
    orderBy: { targa: "asc" },
    select: { id: true, targa: true, modello: true },
  });

  return (
    <div>
      <PageHeader
        title="Registra multa"
        subtitle="Il conducente viene individuato automaticamente dal log movimentazione del giorno dell'infrazione"
      />
      <form action={createFineAction} className="card p-5 grid grid-cols-1 md:grid-cols-3 gap-4 max-w-4xl">
        <div>
          <label className="label">Veicolo (targa) *</label>
          <select className="input font-mono" name="vehicleId" required defaultValue="">
            <option value="" disabled>— seleziona —</option>
            {vehicles.map((v) => <option key={v.id} value={v.id}>{v.targa} — {v.modello}</option>)}
          </select>
        </div>
        <div>
          <label className="label">N. verbale</label>
          <input className="input font-mono" name="verbaleNo" placeholder="VB-2026-…" />
        </div>
        <div>
          <label className="label">Data e ora infrazione *</label>
          <input className="input" type="datetime-local" name="dataOraInfrazione" required />
        </div>
        <div>
          <label className="label">Luogo *</label>
          <input className="input" name="luogo" required />
        </div>
        <div>
          <label className="label">Tipo violazione *</label>
          <input className="input" name="tipoViolazione" required placeholder="es. Eccesso velocità oltre 10 km/h" />
        </div>
        <div>
          <label className="label">Importo € *</label>
          <input className="input" type="number" step="0.01" min={0} name="importo" required />
        </div>
        <div>
          <label className="label">Punti patente</label>
          <input className="input" type="number" min={0} max={10} name="puntiPatente" defaultValue={0} />
        </div>
        <div className="md:col-span-3">
          <button className="btn-primary">Registra multa</button>
        </div>
      </form>
    </div>
  );
}
