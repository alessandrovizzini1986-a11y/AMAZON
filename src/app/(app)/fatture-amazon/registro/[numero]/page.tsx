import Link from "next/link";
import { notFound } from "next/navigation";
import { can } from "@/lib/rbac";
import { db } from "@/lib/db";
import { PageHeader } from "@/components/ui";
import { Aiuto } from "@/components/Aiuto";
import { possibiliDoppioni } from "@/domain/fatture/doppioni";
import { codiciDs } from "@/domain/fatture/fatturato";
import { stationUtente, utenteCon } from "../../dati";
import { EliminaRiga } from "../EliminaRiga";

export const dynamic = "force-dynamic";
export const metadata = { title: "Fattura Amazon — FleetDSP" };

const eur = (x: unknown) => Number(x).toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const gg = (d: Date | null) => (d ? d.toLocaleDateString("it-IT", { timeZone: "UTC" }) : "—");

export default async function FatturaPage({ params }: { params: Promise<{ numero: string }> }) {
  const user = await utenteCon("fatture.registro");
  const numero = decodeURIComponent((await params).numero);
  const f = await db.amazonInvoice.findUnique({ where: { numero }, include: { righe: { orderBy: [{ data: "asc" }, { descrizione: "asc" }] } } });
  const solo = await stationUtente(user);
  if (!f || (solo && !codiciDs(solo).includes(f.ds))) notFound();
  const doppie = possibiliDoppioni(f.righe.map((r) => ({ id: r.id, data: r.data.toISOString(), quantita: r.quantita, avere: Number(r.avere), descrizione: r.descrizione })));
  const inDoppia = new Map(doppie.flatMap((g, i) => g.map((r) => [r.id, i + 1] as const)));
  const puo = can(user, "fatture.annulla");
  return (
    <div className="flex flex-col gap-5">
      <PageHeader eyebrow="Amazon · registro" title={f.numero}
        subtitle={`${f.tipo} ${f.ds} del ${gg(f.dataFattura)}, periodo ${gg(f.periodoDa)} – ${gg(f.periodoA)} · ${f.nRighe} righe · imponibile ${eur(f.sommaAvere)} € · da ${f.fonte === "PDF" ? `PDF${f.pdfNome ? ` ${f.pdfNome}` : ""}` : "storico fatt_2026"}`} />
      <Link href="/fatture-amazon/registro" className="text-sm text-brand underline">← Torna al registro</Link>
      {doppie.length > 0 && (
        <div className="rounded-control bg-warn-soft px-4 py-3 text-sm text-warn">
          <b>{doppie.length === 1 ? "1 gruppo" : `${doppie.length} gruppi`} di righe forse doppie</b> (stesso giorno, quantità e importo; le rotte non contano), segnate con ⚠ e un numero.
          {puo ? " Se una è davvero un doppione, eliminala: i totali della fattura si ricalcolano." : " Chiedi a un amministratore di controllarle."} <Aiuto k="fatture.elimina-riga" />
          {f.fonte === "AGGREGATO" && <span className="block pt-1">La fattura viene dallo storico fatt_2026: togli la riga doppia anche lì.</span>}
        </div>
      )}
      <section className="card overflow-x-auto p-4 md:p-5">
        <table className="table-base text-sm">
          <thead><tr><th></th><th>Data</th><th>Settimana</th><th>Descrizione</th><th className="text-right">Quantità</th><th className="text-right">Imponibile €</th><th className="text-right">Totale €</th><th>Classe</th>{puo && <th></th>}</tr></thead>
          <tbody>
            {f.righe.map((r) => {
              const g = inDoppia.get(r.id);
              return (
                <tr key={r.id} className={g ? "bg-warn-soft" : ""}>
                  <td className="whitespace-nowrap text-warn">{g ? `⚠ ${g}` : ""}</td>
                  <td>{gg(r.data)}</td><td>{r.week}</td><td>{r.descrizione}</td><td className="text-right">{r.quantita}</td>
                  <td className="text-right font-mono">{eur(r.avere)}</td><td className="text-right font-mono">{eur(r.totale)}</td><td className="text-xs">{r.classe}</td>
                  {puo && <td>{<EliminaRiga id={r.id} descrizione={r.descrizione} importo={eur(r.avere)} />}</td>}
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>
    </div>
  );
}
