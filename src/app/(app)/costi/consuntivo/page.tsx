import { can } from "@/lib/rbac";
import { PageHeader } from "@/components/ui";
import { mesiAdit, utenteCosti } from "../dati";
import { ConsuntivoClient } from "./ConsuntivoClient";

export const dynamic = "force-dynamic";
export const metadata = { title: "Consuntivo costi del personale — FleetDSP" };

const eur = (v: number) => v.toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default async function ConsuntivoPage() {
  const user = await utenteCosti("costi.view");
  const adit = await mesiAdit();
  return (
    <div className="flex flex-col gap-6">
      <PageHeader eyebrow="Costi del personale · consuntivo" title="Consuntivo"
        subtitle="Quando arrivano le fatture ADIT (circa 5 settimane dopo il mese) trascinale qui: il sito le riconosce dal contenuto, tiene solo il CDC 5569 e da quel momento usa le loro tariffe per le stime." />
      {can(user, "costi.run") && <ConsuntivoClient />}
      <section className="card p-4 md:p-5">
        <h2 className="mb-3 text-[19px] font-semibold">ADIT caricati</h2>
        {adit.length === 0 ? <p className="text-sm text-ink-muted">Nessuno.</p> : (
          <table className="table-base text-sm"><thead><tr><th>Mese fattura</th><th className="text-right">Righe</th><th className="text-right">Costo € (CDC 5569)</th></tr></thead>
            <tbody>{adit.map((a) => <tr key={a.mese}><td>{a.mese.split("-").reverse().join("/")}</td><td className="text-right font-mono">{a.righe.toLocaleString("it-IT")}</td><td className="text-right font-mono">{eur(a.costo)}</td></tr>)}</tbody></table>
        )}
      </section>
    </div>
  );
}
