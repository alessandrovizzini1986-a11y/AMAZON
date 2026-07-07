import { requireRole } from "@/lib/auth";
import { db } from "@/lib/db";
import { ensureConfigDefaults } from "@/lib/config";
import { PageHeader, SourceNote } from "@/components/ui";
import { fmtDateTime } from "@/lib/format";
import { updateConfigAction } from "./actions";

export const dynamic = "force-dynamic";

export default async function ConfigPage() {
  await requireRole("ADMIN");
  await ensureConfigDefaults(); // ripristina eventuali chiavi mancanti

  const configs = await db.appConfig.findMany({ orderBy: { key: "asc" } });

  return (
    <div className="max-w-4xl">
      <PageHeader
        title="Configurazione"
        subtitle="Zero valori hardcoded: soglie, termini e coefficienti vivono qui, non nel codice. Ogni modifica è tracciata."
      />
      <div className="space-y-3">
        {configs.map((c) => (
          <form key={c.key} action={updateConfigAction.bind(null, c.key)} className="card p-4 flex flex-wrap items-center gap-3">
            <div className="flex-1 min-w-64">
              <div className="font-mono text-sm font-semibold">{c.key}</div>
              <div className="text-xs text-ink-muted">{c.description}</div>
              <div className="text-[11px] text-ink-faint mt-0.5">
                tipo: {c.type} · ultimo aggiornamento {fmtDateTime(c.updatedAt)}
              </div>
            </div>
            <input className="input max-w-44 font-mono" name="value" defaultValue={c.value} required />
            <button className="btn-secondary">Salva</button>
          </form>
        ))}
      </div>
      <SourceNote>tabella AppConfig — le modifiche entrano in vigore immediatamente su alert, scadenze e riconciliazioni</SourceNote>
    </div>
  );
}
