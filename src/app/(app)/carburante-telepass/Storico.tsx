import type { RunRiga } from "./dati";
import { MESI } from "@/domain/telepass/comune";

const eur = (x: number) => x.toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Storico elaborazioni con i totali per station. */
export function Storico({ runs, etichettaRighe }: { runs: RunRiga[]; etichettaRighe: string }) {
  return (
    <section className="card overflow-x-auto p-4 md:p-5">
      <h2 className="mb-3 text-[19px] font-semibold">Elaborazioni salvate</h2>
      {runs.length === 0 ? <p className="text-sm text-ink-muted">Nessuna elaborazione salvata.</p> : (
        <table className="table-base text-sm">
          <thead><tr><th>Mese</th><th>{etichettaRighe}</th><th>Totale €</th><th>Per station</th><th>Anomalie</th><th>File</th><th>Da</th><th>Il</th></tr></thead>
          <tbody>
            {runs.map((r) => (
              <tr key={r.id}>
                <td className="font-semibold">{MESI[r.mese]} {r.anno}</td><td>{r.righe.toLocaleString("it-IT")}</td><td className="font-mono">{eur(r.totale)}</td>
                <td className="text-xs">{Object.entries(r.totali).map(([st, w]) => `${st} ${eur(Object.values(w).reduce((a, b) => a + b, 0))}`).join(" · ")}</td>
                <td className={r.anomalie ? "font-semibold text-warn" : "text-ok"}>{r.anomalie}</td>
                <td className="text-xs text-ink-muted">{r.nomeFile}</td><td>{r.eseguitoDa}</td><td>{new Date(r.eseguitoIl).toLocaleString("it-IT", { dateStyle: "short", timeStyle: "short" })}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
