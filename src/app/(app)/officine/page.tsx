import { requireUser } from "@/lib/auth";
import { assertCan, can } from "@/lib/rbac";
import { db } from "@/lib/db";
import { PageHeader, EmptyState } from "@/components/ui";
import { uploadCentriAction } from "./actions";
import { OfficineExplorer } from "./OfficineExplorer";

export const dynamic = "force-dynamic";
export const metadata = { title: "Officine Ayvens — FleetDSP" };

/** Centri autorizzati Ayvens: stessi filtri del loro Excel, più export. */
export default async function OfficinePage({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  const user = await requireUser();
  assertCan(user, "officine.view");
  const params = await searchParams;
  const canUpload = can(user, "import.run");

  let centri: Awaited<ReturnType<typeof loadCentri>> = [];
  let tableMissing = false;
  try {
    centri = await loadCentri();
  } catch {
    // migrazione ServiceCenter non ancora applicata su questo database
    tableMissing = true;
  }
  const fonte = centri[0]?.fonte ?? null;
  const caricato = centri.reduce<Date | null>((m, c) => (!m || c.createdAt > m ? c.createdAt : m), null);

  const upload = canUpload ? (
    <form action={uploadCentriAction} className="flex flex-wrap items-end gap-2.5 print:hidden">
      <label className="flex flex-col gap-1 text-xs font-semibold text-ink-muted">
        Nuovo file Ayvens (.xlsm)
        <input type="file" name="file" accept=".xlsm,.xlsx" required className="input h-11 w-64 py-2 text-sm font-normal" />
      </label>
      <button className="btn-secondary h-11">Carica</button>
    </form>
  ) : undefined;

  return (
    <div>
      <PageHeader
        eyebrow="Rete Ayvens · veicoli commerciali"
        title="Officine e carrozzerie autorizzate"
        subtitle={fonte && caricato ? `File ${fonte} · caricato il ${caricato.toLocaleDateString("it-IT")}` : undefined}
        action={upload}
      />
      {params.ok && (
        <p className="mb-4 rounded-control bg-ok-soft px-3 py-2 text-sm text-ok">File caricato: {params.ok} righe. L&apos;elenco è stato sostituito.</p>
      )}
      {params.error && <p className="mb-4 rounded-control bg-danger-soft px-3 py-2 text-sm text-danger">{params.error}</p>}

      {tableMissing ? (
        <EmptyState message="La sezione officine non è ancora attiva su questo database (manca l'aggiornamento della struttura dati)." />
      ) : centri.length === 0 ? (
        <EmptyState message="Nessun centro caricato. Carica il file &quot;Lista centri autorizzati&quot; di Ayvens con il pulsante in alto." />
      ) : (
        <OfficineExplorer centri={centri.map(({ fonte: _f, createdAt: _c, id: _i, ...c }) => c)} />
      )}
    </div>
  );
}

function loadCentri() {
  return db.serviceCenter.findMany();
}
