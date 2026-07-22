import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { PageHeader } from "@/components/ui";
import { PasswordForm } from "./PasswordForm";

export const dynamic = "force-dynamic";

const ROLE_LABEL: Record<string, string> = {
  ADMIN: "Fleet Manager",
  RESP_MEZZI: "Responsabile Mezzi",
  DRIVER: "Driver",
};

export default async function AccountPage() {
  const user = await requireUser();
  const dbUser = await db.user.findUniqueOrThrow({ where: { id: user.id }, include: { station: true } });

  return (
    <div>
      <PageHeader title="Il mio account" subtitle="Dati personali e password di accesso" />

      <section className="card p-5 mb-6 max-w-sm">
        <dl className="text-sm space-y-3">
          <div>
            <dt className="text-ink-muted text-xs uppercase tracking-wide">Nome</dt>
            <dd className="font-semibold">{dbUser.firstName} {dbUser.lastName}</dd>
          </div>
          <div>
            <dt className="text-ink-muted text-xs uppercase tracking-wide">Email</dt>
            <dd>{dbUser.email}</dd>
          </div>
          <div>
            <dt className="text-ink-muted text-xs uppercase tracking-wide">Ruolo</dt>
            <dd>{ROLE_LABEL[dbUser.role]}</dd>
          </div>
          {dbUser.station && (
            <div>
              <dt className="text-ink-muted text-xs uppercase tracking-wide">Stazione</dt>
              <dd>{dbUser.station.code} — {dbUser.station.name}</dd>
            </div>
          )}
        </dl>
      </section>

      <section className="card p-5 max-w-sm">
        <h2 className="font-semibold mb-3">Cambia password</h2>
        <PasswordForm />
      </section>
    </div>
  );
}
