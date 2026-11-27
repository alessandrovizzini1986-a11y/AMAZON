import { requireRole } from "@/lib/auth";
import { db } from "@/lib/db";
import { PageHeader, StatusBadge, SourceNote } from "@/components/ui";
import { createUserAction, toggleUserActiveAction, resetUserPasswordAction, changeUserRoleAction, setUserPasswordAction, setUserMenuAction } from "./actions";
import { vociDelRuolo } from "@/components/navModel";
import { Aiuto } from "@/components/Aiuto";

export const dynamic = "force-dynamic";

const ROLE_LABEL: Record<string, string> = { ADMIN: "Admin", RESP_MEZZI: "Resp. Mezzi", DRIVER: "Driver", CONTROLLO: "Controllo presenze", STAGISTA: "Stagista (training)", COMPLIANCE: "Compliance (solo registro documenti)" };

export default async function UsersPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; created?: string; ok?: string }>;
}) {
  const io = await requireRole("ADMIN");
  const params = await searchParams;

  const [users, stations] = await Promise.all([
    db.user.findMany({ include: { station: true }, orderBy: [{ role: "asc" }, { lastName: "asc" }] }),
    db.station.findMany({ where: { active: true }, orderBy: { code: "asc" } }),
  ]);

  return (
    <div>
      <PageHeader title="Utenti e permessi" subtitle="Gestione account per i 5 ruoli: puoi cambiare ruolo e impostare una password a scelta. Il super admin decide, con le spunte in «Menu che vede», quali voci vede ogni persona. Le password sono salvate cifrate, quindi nessuno può rileggerle: se una persona la dimentica, gliene imposti una nuova." />

      {params.error && <p className="mb-4 text-sm text-danger bg-danger-soft rounded-control px-3 py-2">{params.error}</p>}
      {params.ok && <p className="mb-4 text-sm bg-ok-soft text-ok rounded-control px-3 py-2">{params.ok}</p>}
      {params.created && (
        <p className="mb-4 text-sm bg-ok-soft text-ok rounded-control px-3 py-2 font-mono">{params.created} <span className="font-sans">(conservare e comunicare in modo sicuro)</span></p>
      )}

      <section className="card p-5 mb-6 max-w-4xl">
        <h2 className="font-semibold mb-3">Nuovo utente</h2>
        <form action={createUserAction} className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <input className="input" name="email" type="email" placeholder="Email *" required />
          <input className="input" name="firstName" placeholder="Nome *" required />
          <input className="input" name="lastName" placeholder="Cognome *" required />
          <select className="input" name="role" required defaultValue="DRIVER">
            {Object.entries(ROLE_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
          <select className="input" name="stationId" defaultValue="">
            <option value="">— stazione (non richiesta per Admin, Controllo presenze e Stagista) —</option>
            {stations.map((s) => <option key={s.id} value={s.id}>{s.code} — {s.name}</option>)}
          </select>
          <input className="input" name="licenseNo" placeholder="N. patente" />
          <div className="md:col-span-3"><button className="btn-primary">Crea utente</button> <Aiuto k="utenti.crea" /></div>
        </form>
      </section>

      <div className="card overflow-x-auto">
        <table className="table-base">
          <thead>
            <tr><th>Nome</th><th>Email</th><th colSpan={2}>Ruolo e stazione</th><th>Stato</th><th>Azioni</th></tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id}>
                <td className="font-semibold">{u.lastName} {u.firstName}{u.superAdmin && <span className="ml-2 rounded bg-brand-soft px-1.5 py-0.5 text-[11px] font-semibold text-brand">Super admin</span>}</td>
                <td className="text-xs">{u.email}</td>
                <td colSpan={2}>
                  <form action={changeUserRoleAction.bind(null, u.id)} className="flex flex-wrap items-center gap-2">
                    <select className="input h-9 w-44 py-0 text-xs" name="role" defaultValue={u.role} aria-label={`Ruolo di ${u.firstName} ${u.lastName}`}>
                      {Object.entries(ROLE_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                    </select>
                    <select className="input h-9 w-28 py-0 text-xs" name="stationId" defaultValue={u.stationId ?? ""} aria-label="Stazione">
                      <option value="">—</option>
                      {stations.map((s) => <option key={s.id} value={s.id}>{s.code}</option>)}
                    </select>
                    <button className="btn-secondary py-1 px-2 text-xs">Salva ruolo</button>
                  </form>
                </td>
                <td><StatusBadge tone={u.active ? "ok" : "danger"}>{u.active ? "attivo" : "disattivato"}</StatusBadge></td>
                <td>
                  <div className="flex gap-2">
                    <form action={toggleUserActiveAction.bind(null, u.id)}>
                      <button className="btn-secondary py-1 px-2 text-xs">{u.active ? "Disattiva" : "Riattiva"}</button>
                    </form>
                    <form action={resetUserPasswordAction.bind(null, u.id)}>
                      <button className="btn-secondary py-1 px-2 text-xs whitespace-nowrap">Reset password</button>
                    </form>
                  </div>
                  <form action={setUserPasswordAction.bind(null, u.id)} className="mt-2 flex gap-2">
                    <input className="input h-9 w-44 py-0 text-xs" name="password" type="text" minLength={8} maxLength={100} required autoComplete="off" placeholder="Nuova password (min 8)" aria-label={`Nuova password per ${u.firstName} ${u.lastName}`} />
                    <button className="btn-secondary py-1 px-2 text-xs whitespace-nowrap">Imposta password</button>
                  </form>
                  {io.superAdmin && !u.superAdmin && (
                    <details className="mt-2">
                      <summary className="cursor-pointer text-xs font-semibold text-brand">Menu che vede{u.menuNascosti.length ? ` (${u.menuNascosti.length} nascosti)` : " (tutti)"}</summary>
                      <form action={setUserMenuAction.bind(null, u.id)} className="mt-2 flex flex-col gap-2 rounded-control border border-line p-3">
                        {vociDelRuolo(u.role).map((g) => (
                          <fieldset key={g.id}>
                            <legend className="text-[11px] font-semibold uppercase tracking-wide text-ink-muted">{g.label}</legend>
                            <div className="flex flex-wrap gap-x-4 gap-y-1">
                              {g.items.map((i) => (
                                <label key={i.href} className="flex items-center gap-1.5 text-xs">
                                  <input type="checkbox" name="v" value={i.href} defaultChecked={!u.menuNascosti.includes(i.href)} />{i.label}
                                </label>
                              ))}
                            </div>
                          </fieldset>
                        ))}
                        <div><button className="btn-primary py-1 px-3 text-xs">Salva menu</button></div>
                      </form>
                    </details>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="px-3 pb-3"><SourceNote>tabella User — {users.length} account</SourceNote></div>
      </div>
    </div>
  );
}
