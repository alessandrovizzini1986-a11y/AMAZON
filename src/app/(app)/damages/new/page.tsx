import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { PageHeader } from "@/components/ui";
import { createDamageAction } from "../actions";

export const dynamic = "force-dynamic";

/** Segnalazione danno — mobile-first, un'unica azione, campi minimi. */
export default async function NewDamagePage() {
  const user = await requireUser();
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // il driver vede preselezionato il mezzo di oggi
  const myAssignment =
    user.role === "DRIVER"
      ? await db.assignment.findFirst({ where: { driverId: user.id, date: today }, select: { vehicleId: true } })
      : null;

  const vehicles = await db.vehicle.findMany({
    where: {
      stato: { not: "DISMESSO" },
      ...(user.role !== "ADMIN" && user.stationId ? { stationId: user.stationId } : {}),
    },
    orderBy: { targa: "asc" },
    select: { id: true, targa: true, modello: true },
  });

  return (
    <div className="max-w-md mx-auto">
      <PageHeader title="Segnala un danno" subtitle="Bastano il mezzo e cosa è successo. La foto aiuta." />
      <form action={createDamageAction} className="card p-5 space-y-4">
        <div>
          <label className="label">Mezzo</label>
          <select className="input font-mono" name="vehicleId" required defaultValue={myAssignment?.vehicleId ?? ""}>
            <option value="" disabled>— seleziona —</option>
            {vehicles.map((v) => <option key={v.id} value={v.id}>{v.targa} — {v.modello}</option>)}
          </select>
        </div>
        <div>
          <label className="label">Che danno è?</label>
          <input className="input" name="tipo" required placeholder="es. graffio portellone laterale" />
        </div>
        <div>
          <label className="label">Foto (consigliata)</label>
          <input className="input" type="file" name="foto" accept="image/*" capture="environment" />
        </div>
        <div>
          <label className="label">Altri dettagli (opzionale)</label>
          <textarea className="input" name="descrizione" rows={3} placeholder="es. trovato al ritiro del mezzo, parcheggio fila 3" />
        </div>
        <button className="btn-primary w-full text-base py-3">Invia segnalazione</button>
      </form>
    </div>
  );
}
