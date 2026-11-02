import { requireUser } from "@/lib/auth";
import { assertCan } from "@/lib/rbac";
import { db } from "@/lib/db";
import { PageHeader, StatusBadge } from "@/components/ui";
import { NON_GIUSTIFICATIVI, STATIONS } from "@/domain/presenze/regole";
import {
  aggiungiDispatcher, aggiungiGiustificativo, attivaDispatcher, attivaGiustificativo,
  eliminaDispatcher, eliminaGiustificativo, salvaReferenti,
} from "./actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Configurazione presenze — FleetDSP" };

export default async function ConfigurazionePresenzePage() {
  const user = await requireUser();
  assertCan(user, "presenze.config");
  const [referenti, dispatcher, giustificativi] = await Promise.all([
    db.presenzeReferente.findMany(),
    db.presenzeDispatcher.findMany({ orderBy: [{ cognome: "asc" }, { nome: "asc" }] }),
    db.presenzeGiustificativo.findMany({ orderBy: { codice: "asc" } }),
  ]);
  const ref = Object.fromEntries(referenti.map((r) => [r.station, r.nome]));

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Presenze · solo admin"
        title="Configurazione dei controlli"
        subtitle="Referenti da salutare nei messaggi Teams, dispatcher esclusi dagli alert e codici della riga RIPOSO che giustificano il giorno. Le modifiche valgono dal prossimo controllo."
      />

      <section className="card p-4 md:p-5">
        <h2 className="mb-1 text-[19px] font-semibold">Referenti Ops per station</h2>
        <p className="mb-3 text-sm text-ink-muted">Il messaggio inizia con &quot;Ciao &lt;nome&gt;&quot;; se il campo è vuoto, solo &quot;Ciao&quot;.</p>
        <form action={salvaReferenti} className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {STATIONS.map((s) => (
            <label key={s} className="flex flex-col gap-1 text-xs font-semibold text-ink-muted">{s}
              <input className="input h-10" name={s} defaultValue={ref[s] ?? ""} placeholder="es. Marco" maxLength={80} />
            </label>
          ))}
          <div className="flex items-end"><button className="btn-primary h-10">Salva referenti</button></div>
        </form>
      </section>

      <section className="card p-4 md:p-5">
        <h2 className="mb-1 text-[19px] font-semibold">Dispatcher ({dispatcher.filter((d) => d.attivo).length} attivi)</h2>
        <p className="mb-3 text-sm text-ink-muted">Esclusi da ogni alert del controllo settimanale (nessuna trasferta dovuta). Riconosciuti per nome e cognome, in qualsiasi ordine e senza accenti, in tutte le station (la station qui è solo un promemoria).</p>
        <form action={aggiungiDispatcher} className="mb-4 flex flex-wrap items-end gap-3">
          <input className="input h-10 w-48" name="cognome" placeholder="Cognome *" required minLength={2} />
          <input className="input h-10 w-48" name="nome" placeholder="Nome *" required minLength={2} />
          <select className="input h-10 w-52" name="station" defaultValue="">
            <option value="">Station (facoltativa)</option>
            {STATIONS.map((s) => <option key={s}>{s}</option>)}
          </select>
          <button className="btn-primary h-10">Aggiungi</button>
        </form>
        <div className="overflow-x-auto">
          <table className="table-base text-sm">
            <thead><tr><th>Cognome</th><th>Nome</th><th>Station</th><th>Stato</th><th></th></tr></thead>
            <tbody>
              {dispatcher.map((d) => (
                <tr key={d.id}>
                  <td className="font-semibold">{d.cognome}</td><td>{d.nome}</td><td>{d.station ?? "—"}</td>
                  <td><StatusBadge tone={d.attivo ? "ok" : "neutral"}>{d.attivo ? "attivo" : "disattivato"}</StatusBadge></td>
                  <td>
                    <div className="flex gap-2">
                      <form action={attivaDispatcher.bind(null, d.id)}><button className="btn-secondary px-2 py-1 text-xs">{d.attivo ? "Disattiva" : "Riattiva"}</button></form>
                      <form action={eliminaDispatcher.bind(null, d.id)}><button className="btn-secondary px-2 py-1 text-xs text-danger">Elimina</button></form>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="card p-4 md:p-5">
        <h2 className="mb-1 text-[19px] font-semibold">Giustificativi della riga RIPOSO ({giustificativi.filter((g) => g.attivo).length} attivi)</h2>
        <p className="mb-3 text-sm text-ink-muted">Se nella riga RIPOSO (o in un commento della cella) c&apos;è uno di questi codici, il giorno non va in alert. Non sono giustificativi: {NON_GIUSTIFICATIVI.join(", ")}.</p>
        <form action={aggiungiGiustificativo} className="mb-4 flex flex-wrap items-end gap-3">
          <input className="input h-10 w-40 uppercase" name="codice" placeholder="Codice *" required pattern="[A-Za-z0-9]{1,20}" title="Solo lettere e numeri, senza spazi" />
          <input className="input h-10 w-72" name="descrizione" placeholder="Descrizione" maxLength={100} />
          <button className="btn-primary h-10">Aggiungi</button>
        </form>
        <div className="overflow-x-auto">
          <table className="table-base text-sm">
            <thead><tr><th>Codice</th><th>Descrizione</th><th>Stato</th><th></th></tr></thead>
            <tbody>
              {giustificativi.map((g) => (
                <tr key={g.codice}>
                  <td className="font-mono font-semibold">{g.codice}</td><td>{g.descrizione}</td>
                  <td><StatusBadge tone={g.attivo ? "ok" : "neutral"}>{g.attivo ? "attivo" : "disattivato"}</StatusBadge></td>
                  <td>
                    <div className="flex gap-2">
                      <form action={attivaGiustificativo.bind(null, g.codice)}><button className="btn-secondary px-2 py-1 text-xs">{g.attivo ? "Disattiva" : "Riattiva"}</button></form>
                      <form action={eliminaGiustificativo.bind(null, g.codice)}><button className="btn-secondary px-2 py-1 text-xs text-danger">Elimina</button></form>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
