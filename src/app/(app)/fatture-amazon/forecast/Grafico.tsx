/**
 * Previsto vs reale per settimana (tutte le DS): colonne affiancate, una sola
 * scala, legenda, tooltip nativo su ogni colonna. Colori validati (dataviz).
 */
const PREV = "#2a78d6"; // serie 1
const REAL = "#eb6834"; // serie 2
const k = (x: number) => `${Math.round(x / 1000).toLocaleString("it-IT")} k€`;

export function GraficoSettimane({ punti }: { punti: { label: string; previsto: number; reale: number | null }[] }) {
  if (!punti.length) return null;
  const W = 760, H = 240, L = 56, B = 28, T = 12;
  const max = Math.max(...punti.flatMap((p) => [p.previsto, p.reale ?? 0])) * 1.1 || 1;
  const step = (W - L - 8) / punti.length;
  const bw = Math.min(22, (step - 10) / 2);
  const y = (v: number) => T + (H - T - B) * (1 - v / max);
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => f * max);
  return (
    <figure className="m-0">
      <div className="mb-2 flex gap-4 text-xs text-ink-muted">
        <span className="flex items-center gap-1"><span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: PREV }} /> Previsto</span>
        <span className="flex items-center gap-1"><span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: REAL }} /> Fatturato (rotte + extra previsti)</span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full max-w-[760px]" role="img" aria-label="Previsto e fatturato per settimana">
        {ticks.map((t) => (
          <g key={t}>
            <line x1={L} x2={W - 8} y1={y(t)} y2={y(t)} stroke="#e7e9ee" strokeWidth={1} />
            <text x={L - 6} y={y(t) + 4} textAnchor="end" fontSize="10" fill="#52514e">{k(t)}</text>
          </g>
        ))}
        {punti.map((p, i) => {
          const x0 = L + i * step + (step - 2 * bw - 2) / 2;
          const col = (x: number, v: number, c: string, nome: string) => (
            <g>
              <title>{`${p.label} · ${nome}: ${v.toLocaleString("it-IT", { maximumFractionDigits: 0 })} €`}</title>
              <rect x={x - 3} y={T} width={bw + 6} height={H - T - B} fill="transparent" />
              <path d={`M${x},${y(0)} V${y(v) + 4} q0,-4 4,-4 h${bw - 8} q4,0 4,4 V${y(0)} Z`} fill={c} />
            </g>
          );
          return (
            <g key={p.label}>
              {col(x0, p.previsto, PREV, "previsto")}
              {p.reale !== null && col(x0 + bw + 2, p.reale, REAL, "fatturato")}
              <text x={x0 + bw} y={H - 10} textAnchor="middle" fontSize="10" fill="#52514e">{p.label}</text>
            </g>
          );
        })}
        <line x1={L} x2={W - 8} y1={y(0)} y2={y(0)} stroke="#c4ccd6" strokeWidth={1} />
      </svg>
    </figure>
  );
}
