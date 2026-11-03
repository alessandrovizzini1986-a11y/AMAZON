const eur = (x: number) => x.toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Anteprima della griglia STATION × WEEK (stessi numeri del foglio PVT / Recap dopo il ricalcolo). */
export function Griglia({ titolo, settimane, stazioni, totali, perStation, totale }: {
  titolo: string; settimane: number[]; stazioni: string[]; totali: Record<string, Record<number, number>>; perStation: Record<string, number>; totale: number;
}) {
  const colTot = (w: number) => stazioni.reduce((s, st) => s + (totali[st]?.[w] ?? 0), 0);
  return (
    <div className="overflow-x-auto">
      <table className="table-base text-sm">
        <thead><tr><th>{titolo}</th>{settimane.map((w) => <th key={w} className="text-right">Sett. {w}</th>)}<th className="text-right">Totale</th></tr></thead>
        <tbody>
          {stazioni.map((st) => (
            <tr key={st} className={st === "NON MAPPATO" || st === "NON CENSITA" ? "bg-danger-soft font-semibold text-danger" : ""}>
              <td className="font-mono font-semibold">{st}</td>
              {settimane.map((w) => <td key={w} className="text-right font-mono">{totali[st]?.[w] ? eur(totali[st][w]) : ""}</td>)}
              <td className="text-right font-mono font-semibold">{eur(perStation[st] ?? 0)}</td>
            </tr>
          ))}
          <tr className="border-t-2 font-bold"><td>Totale complessivo</td>{settimane.map((w) => <td key={w} className="text-right font-mono">{eur(Math.round(colTot(w) * 100) / 100)}</td>)}<td className="text-right font-mono">{eur(totale)}</td></tr>
        </tbody>
      </table>
    </div>
  );
}
