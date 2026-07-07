import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { StatusBadge } from "@/components/ui";
import { fmtKm, fmtDateTime, fmtDate } from "@/lib/format";
import { checkInAction, checkOutAction } from "./actions";

export const dynamic = "force-dynamic";

/**
 * Schermata Driver — stile consumer: una sola azione primaria per stato.
 * Nessun menu complesso: il driver vede il mezzo di oggi e fa check-in/out.
 */
export default async function DriverPage() {
  const user = await requireUser();
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const assignment = await db.assignment.findFirst({
    where: { driverId: user.id, date: today },
    include: { vehicle: { include: { station: true } } },
  });

  const myFines = await db.fine.count({ where: { driverId: user.id, stato: { in: ["NOTIFICATA", "DA_NOTIFICARE"] } } });

  return (
    <div className="max-w-md mx-auto space-y-4">
      <div className="text-center pt-2">
        <p className="text-sm text-ink-muted">Ciao {user.name.split(" ")[0]} 👋</p>
        <h1 className="text-xl font-bold">{fmtDate(new Date())}</h1>
      </div>

      {!assignment ? (
        <div className="card p-8 text-center space-y-2">
          <div className="text-4xl">🚐</div>
          <p className="font-semibold">Nessun mezzo assegnato per oggi</p>
          <p className="text-sm text-ink-muted">Rivolgiti al responsabile mezzi della tua stazione.</p>
        </div>
      ) : (
        <>
          {/* card mezzo */}
          <div className="card p-5">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-2xl font-bold font-mono">{assignment.vehicle.targa}</div>
                <div className="text-sm text-ink-muted">{assignment.vehicle.modello} · {assignment.vehicle.station.code}</div>
              </div>
              {assignment.checkOutAt ? (
                <StatusBadge tone="ok">giornata chiusa</StatusBadge>
              ) : assignment.checkInAt ? (
                <StatusBadge tone="info">in servizio</StatusBadge>
              ) : (
                <StatusBadge tone="warn">da ritirare</StatusBadge>
              )}
            </div>
            {assignment.checkInAt && (
              <p className="text-xs text-ink-muted mt-3">
                Check-in {fmtDateTime(assignment.checkInAt)} · {fmtKm(assignment.checkInKm)}
              </p>
            )}
            {assignment.checkOutAt && (
              <p className="text-xs text-ink-muted">
                Check-out {fmtDateTime(assignment.checkOutAt)} · {fmtKm(assignment.checkOutKm)}
              </p>
            )}
          </div>

          {/* azione primaria unica */}
          {!assignment.checkInAt && (
            <form action={checkInAction.bind(null, assignment.id)} className="card p-5 space-y-4">
              <h2 className="font-bold text-lg">Check-in mezzo</h2>
              <div>
                <label className="label">Km sul contachilometri</label>
                <input className="input text-lg" type="number" name="km" inputMode="numeric"
                  defaultValue={assignment.vehicle.kmAttuali} min={0} required />
              </div>
              <div>
                <label className="label">Foto stato mezzo (opzionale)</label>
                <input className="input" type="file" name="foto" accept="image/*" capture="environment" />
              </div>
              <div>
                <label className="label">Note (opzionale)</label>
                <input className="input" name="note" placeholder="es. mezzo pulito, nessun danno visibile" />
              </div>
              <button className="btn-primary w-full text-base py-3">✓ Conferma check-in</button>
            </form>
          )}

          {assignment.checkInAt && !assignment.checkOutAt && (
            <form action={checkOutAction.bind(null, assignment.id)} className="card p-5 space-y-4">
              <h2 className="font-bold text-lg">Check-out mezzo</h2>
              <div>
                <label className="label">Km sul contachilometri</label>
                <input className="input text-lg" type="number" name="km" inputMode="numeric"
                  min={assignment.checkInKm ?? 0} defaultValue={assignment.checkInKm ?? 0} required />
              </div>
              <div>
                <label className="label">Danni rilevati? (lascia vuoto se nessuno)</label>
                <input className="input" name="danni" placeholder="es. graffio portellone laterale" />
              </div>
              <div>
                <label className="label">Foto stato mezzo (opzionale)</label>
                <input className="input" type="file" name="foto" accept="image/*" capture="environment" />
              </div>
              <div>
                <label className="label">Note (opzionale)</label>
                <input className="input" name="note" />
              </div>
              <button className="btn-primary w-full text-base py-3">✓ Conferma check-out</button>
            </form>
          )}

          {assignment.checkOutAt && (
            <div className="card p-6 text-center space-y-1">
              <div className="text-3xl">✅</div>
              <p className="font-semibold">Giornata completata</p>
              <p className="text-sm text-ink-muted">Percorsi {fmtKm((assignment.checkOutKm ?? 0) - (assignment.checkInKm ?? 0))}</p>
            </div>
          )}
        </>
      )}

      {/* scorciatoie secondarie */}
      <div className="grid grid-cols-2 gap-3">
        <Link href="/fines" className="card p-4 text-center hover:border-brand transition-colors">
          <div className="text-2xl">🧾</div>
          <div className="text-sm font-semibold mt-1">Le mie multe</div>
          {myFines > 0 && <div className="text-xs text-warn font-semibold">{myFines} da gestire</div>}
        </Link>
        <Link href="/damages/new" className="card p-4 text-center hover:border-brand transition-colors">
          <div className="text-2xl">⚠️</div>
          <div className="text-sm font-semibold mt-1">Segnala danno</div>
        </Link>
      </div>
    </div>
  );
}
