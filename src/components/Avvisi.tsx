/**
 * Avvisi di una sezione raccolti in un riquadro: con un solo avviso si vede subito; con più avvisi una riga
 * "N avvisi" con il primo, e gli altri si aprono a richiesta. Lo stesso elenco è anche nella Home.
 */
export type Avviso = { id: string; testo: React.ReactNode; grave?: boolean };

export function Avvisi({ avvisi }: { avvisi: Avviso[] }) {
  if (!avvisi.length) return null;
  const grave = avvisi.some((a) => a.grave);
  const stile = `mb-3 rounded-control px-4 py-2.5 text-sm print:hidden ${grave ? "bg-danger-soft text-danger" : "bg-warn-soft text-warn"}`;
  if (avvisi.length === 1) return <p role="alert" className={stile}>{avvisi[0].testo}</p>;
  return (
    <details role="alert" className={stile}>
      <summary className="flex min-h-[28px] cursor-pointer list-none flex-wrap items-baseline gap-x-2">
        <b>{avvisi.length} avvisi</b><span className="min-w-0 flex-1 truncate">{avvisi[0].testo}</span><span className="underline">mostra tutti</span>
      </summary>
      <ul className="mt-2 flex flex-col gap-1.5 border-t border-current/20 pt-2">{avvisi.map((a) => <li key={a.id}>{a.testo}</li>)}</ul>
    </details>
  );
}
