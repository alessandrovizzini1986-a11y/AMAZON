import { requireUser } from "@/lib/auth";
import { assertCan, stationScope } from "@/lib/rbac";
import { db } from "@/lib/db";
import { PageHeader } from "@/components/ui";
import { createServiceRecordAction } from "../actions";

export default async function NewServicePage({
  searchParams,
}: {
  searchParams: Promise<{ vehicle?: string }>;
}) {
  const user = await requireUser();
  assertCan(user, "maintenance.manage");
  const params = await searchParams;
  const scope = stationScope(user);

  const vehicles = await db.vehicle.findMany({
    where: { ...(scope.stationId ? { stationId: scope.stationId } : {}), stato: { not: "DISMESSO" } },
    orderBy: { targa: "asc" },
    select: { id: true, targa: true, modello: true },
  });

  return (
    <div>
      <PageHeader title="Registra intervento" subtitle="Tagliando, revisione o riparazione — aggiorna anche km e prossime scadenze" />
      <form action={createServiceRecordAction} className="card p-5 grid grid-cols-1 md:grid-cols-3 gap-4 max-w-4xl">
        <div>
          <label className="label">Veicolo *</label>
          <select className="input font-mono" name="vehicleId" defaultValue={params.vehicle ?? ""} required>
            <option value="" disabled>— seleziona —</option>
            {vehicles.map((v) => <option key={v.id} value={v.id}>{v.targa} — {v.modello}</option>)}
          </select>
        </div>
        <div>
          <label className="label">Tipo intervento *</label>
          <select className="input" name="tipo" required>
            {["TAGLIANDO", "REVISIONE", "RIPARAZIONE", "GOMME", "CARROZZERIA", "ALTRO"].map((t) => (
              <option key={t} value={t}>{t.charAt(0) + t.slice(1).toLowerCase()}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">Officina *</label>
          <input className="input" name="officina" required />
        </div>
        <div>
          <label className="label">Data *</label>
          <input className="input" type="date" name="data" defaultValue={new Date().toISOString().slice(0, 10)} required />
        </div>
        <div>
          <label className="label">Km all&apos;intervento *</label>
          <input className="input" type="number" name="kmIntervento" min={0} required />
        </div>
        <div>
          <label className="label">Costo € *</label>
          <input className="input" type="number" step="0.01" min={0} name="costo" required />
        </div>
        <div className="md:col-span-3">
          <label className="label">Descrizione</label>
          <input className="input" name="descrizione" placeholder="es. tagliando completo con sostituzione filtri" />
        </div>

        <div className="md:col-span-3 border-t border-line pt-4">
          <p className="text-sm font-semibold mb-3">Aggiorna prossime scadenze (opzionale)</p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="label">Prossimo tagliando (data)</label>
              <input className="input" type="date" name="prossimoTagliandoData" />
            </div>
            <div>
              <label className="label">Prossimo tagliando (km)</label>
              <input className="input" type="number" name="prossimoTagliandoKm" min={0} />
            </div>
            <div>
              <label className="label">Prossima revisione</label>
              <input className="input" type="date" name="prossimaRevisione" />
            </div>
          </div>
        </div>

        <div className="md:col-span-3">
          <button className="btn-primary">Registra intervento</button>
        </div>
      </form>
    </div>
  );
}
