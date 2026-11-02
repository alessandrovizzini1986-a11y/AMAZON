import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { db } from "@/lib/db";
import { PageHeader } from "@/components/ui";
import { EsitoOps } from "./EsitoOps";

export const dynamic = "force-dynamic";

const ddmm = (d: Date) => d.toISOString().slice(8, 10) + "/" + d.toISOString().slice(5, 7);
const CAT_LABEL: Record<string, string> = {
  "+1": "+1 trasferta senza rotta", "-1": "−1 rotta senza ore", H: "H ore senza Amazon", A: "A non nei tracking",
  DELTA: "Delta Zucchetti", NON_ABBINATO: "Non abbinato", "6+DOM": "6 giorni + domenica", CONSECUTIVI: ">6 consecutivi",
};

export default async function EsecuzionePage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const run = await db.presenzeRun.findUnique({ where: { id }, include: { risultati: { orderBy: [{ station: "asc" }, { categoria: "asc" }, { driver: "asc" }] } } });
  if (!run) notFound();
  const aperti = run.risultati.filter((r) => r.esitoOps === "aperto").length;
  const back = run.tipo === "SETTIMANALE" ? "/presenze/settimanale" : "/presenze/fine-mese";
  return (
    <div>
      <PageHeader
        backHref={back}
        backLabel="Torna al controllo"
        eyebrow={run.tipo === "SETTIMANALE" ? "Controllo settimanale salvato" : "Controllo di fine mese salvato"}
        title={`${run.station ?? "Tutte le station"} · ${ddmm(run.periodoDa)}–${ddmm(run.periodoA)}/${run.periodoA.getUTCFullYear()}`}
        subtitle={`Eseguito da ${run.eseguitoDa} il ${run.eseguitoIl.toLocaleString("it-IT")} · ${run.risultati.length} righe, ${aperti} ancora aperte`}
      />
      {run.risultati.length === 0 ? (
        <p className="card p-6 text-sm text-ink-muted">Nessuna anomalia in questa esecuzione.</p>
      ) : (
        <div className="card overflow-x-auto">
          <table className="table-base text-sm">
            <thead><tr><th>Station</th><th>Esito</th><th>Tipo</th><th>Driver</th><th>ID</th><th>Giorni</th><th>Nota</th><th>Esito Ops</th></tr></thead>
            <tbody>
              {run.risultati.map((r) => {
                const giorni = (r.giorni as { data?: string }[]).map((g) => (g.data ? g.data.slice(8, 10) + "/" + g.data.slice(5, 7) : "")).filter(Boolean);
                return (
                  <tr key={r.id} className={r.esitoOps === "aperto" ? "" : "opacity-60"}>
                    <td className="font-mono">{r.station}</td>
                    <td className="whitespace-nowrap font-semibold">{CAT_LABEL[r.categoria] ?? r.categoria}</td>
                    <td>{r.tipo}</td>
                    <td className="font-semibold">{r.driver}</td>
                    <td className="font-mono text-xs">{r.driverId}</td>
                    <td className="max-w-[200px]">{giorni.join(", ")}</td>
                    <td className="min-w-[240px] text-ink-muted">{r.nota}</td>
                    <td className="min-w-[260px]"><EsitoOps id={r.id} esito={r.esitoOps} nota={r.notaOps ?? ""} disabled={!can(user, "presenze.run")} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <p className="mt-3 text-sm"><Link href={back} className="text-brand hover:underline">← Torna al controllo</Link></p>
    </div>
  );
}
