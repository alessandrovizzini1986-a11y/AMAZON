import Link from "next/link";
import { db } from "@/lib/db";
import { PageHeader } from "@/components/ui";
import { MESI, STATION_TELEPASS } from "@/domain/telepass/comune";
import { cartaNonAttribuita } from "@/domain/telepass/anagrafiche";
import { runQ8, runTelepass, ultimiImport, type RunRiga } from "./dati";

export const dynamic = "force-dynamic";
export const metadata = { title: "Telepass e carburante — FleetDSP" };

const quando = (iso: string) => new Date(iso).toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit", year: "numeric" });

export default async function CarburanteTelepassPage() {
  const [tp, q8, imports, disp, carte] = await Promise.all([
    runTelepass(), runQ8(), ultimiImport(),
    db.telepassDispositivo.findMany({ select: { station: true, nonPiuInFile: true } }).catch(() => []),
    db.cartaCarburante.findMany({ select: { ds: true, nonPiuInFile: true } }).catch(() => []),
  ]);
  // ultimi 12 mesi, dal mese scorso all'indietro (il mese in corso si elabora a inizio mese successivo)
  const oggi = new Date();
  const mesi = Array.from({ length: 12 }, (_, i) => {
    const d = new Date(Date.UTC(oggi.getUTCFullYear(), oggi.getUTCMonth() - 1 - i, 1));
    return { anno: d.getUTCFullYear(), mese: d.getUTCMonth() + 1 };
  });
  const ultimo = (runs: RunRiga[], a: number, m: number) => runs.find((r) => r.anno === a && r.mese === m); // runs già in ordine decrescente
  const imp = (t: string) => imports.find((i) => i.tipo === t);
  const nonStd = disp.filter((d) => !d.nonPiuInFile && !STATION_TELEPASS.includes(d.station)).length;
  const nonAttr = carte.filter((c) => !c.nonPiuInFile && cartaNonAttribuita(c.ds)).length;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Telepass e carburante"
        title="Telepass e carte carburante"
        subtitle="Ogni mese: aggiorna le anagrafiche se è cambiato qualcosa, elabora il CSV Telepass e l'export Q8, controlla le anomalie e salva. Qui vedi cosa è già fatto."
      />

      <section className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <Link href="/carburante-telepass/anagrafiche" className="card p-4 hover:border-brand">
          <div className="text-sm font-medium text-ink-muted">Mappa dispositivi Telepass</div>
          <div className="text-2xl font-bold">{disp.filter((d) => !d.nonPiuInFile).length} dispositivi</div>
          <div className="text-xs text-ink-muted">Ultimo import: {imp("TELEPASS") ? `${quando(imp("TELEPASS")!.eseguitoIl)} (${imp("TELEPASS")!.eseguitoDa})` : "mai"}{nonStd ? ` · ${nonStd} con STATION non standard` : ""}</div>
        </Link>
        <Link href="/carburante-telepass/anagrafiche" className={`card p-4 hover:border-brand ${nonAttr ? "border-warn bg-warn-soft" : ""}`}>
          <div className="text-sm font-medium text-ink-muted">Censimento fuel card</div>
          <div className="text-2xl font-bold">{carte.filter((c) => !c.nonPiuInFile).length} carte</div>
          <div className={`text-xs ${nonAttr ? "font-semibold text-warn" : "text-ink-muted"}`}>Ultimo import: {imp("FUELCARD") ? `${quando(imp("FUELCARD")!.eseguitoIl)} (${imp("FUELCARD")!.eseguitoDa})` : "mai"}{nonAttr ? ` · ${nonAttr} carte senza DS` : ""}</div>
        </Link>
      </section>

      <section className="card overflow-x-auto p-4 md:p-5">
        <h2 className="mb-3 text-[19px] font-semibold">Stato per mese</h2>
        <table className="table-base text-sm">
          <thead><tr><th>Mese</th><th>Telepass</th><th>Q8</th><th>Anomalie aperte</th></tr></thead>
          <tbody>
            {mesi.map(({ anno, mese }) => {
              const t = ultimo(tp, anno, mese);
              const q = ultimo(q8, anno, mese);
              const an = (t?.anomalie ?? 0) + (q?.anomalie ?? 0);
              return (
                <tr key={`${anno}-${mese}`}>
                  <td className="font-semibold">{MESI[mese]} {anno}</td>
                  <td>{t ? <span className="badge-ok">fatto il {quando(t.eseguitoIl)}</span> : <Link href="/carburante-telepass/telepass" className="badge-neutral hover:underline">da fare</Link>}</td>
                  <td>{q ? <span className="badge-ok">fatto il {quando(q.eseguitoIl)}</span> : <Link href="/carburante-telepass/q8" className="badge-neutral hover:underline">da fare</Link>}</td>
                  <td className={an ? "font-semibold text-warn" : "text-ink-muted"}>{t || q ? an : "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <p className="mt-2 text-xs text-ink-faint">Anomalie aperte = dispositivi non mappati o ricondotti a GLS - CASTEL MAGGIORE + carte non censite o abbinate per Identificativo, nell&apos;ultima elaborazione salvata del mese. Si chiudono aggiornando le anagrafiche e rielaborando.</p>
      </section>
    </div>
  );
}
