import { classifyDamageZones, type DamageZoneKey } from "@/domain/damageZones";
import { fmtDate } from "@/lib/format";

/** Coordinate (in un viewBox 240x480, vista dall'alto, muso in alto) per ogni zona. */
const ZONE_XY: Record<Exclude<DamageZoneKey, "diffuso" | "non-classificato">, [number, number]> = {
  "paraurti-ant": [120, 15],
  "fanale-ant": [72, 26],
  cofano: [120, 48],
  parabrezza: [120, 76],
  "specchio-sx": [12, 96],
  "specchio-dx": [228, 96],
  "ruota-ant-sx": [34, 112],
  "ruota-ant-dx": [206, 112],
  "porta-ant-sx": [46, 155],
  "porta-ant-dx": [194, 155],
  "fiancata-sx": [22, 240],
  "fiancata-dx": [218, 240],
  tetto: [120, 240],
  "porta-post-sx": [46, 325],
  "porta-post-dx": [194, 325],
  "ruota-post-sx": [34, 368],
  "ruota-post-dx": [206, 368],
  lunotto: [120, 404],
  "portellone-post": [120, 434],
  "fanale-post": [72, 454],
  "paraurti-post": [120, 465],
};

type DamageEntry = { id: string; tipo: string; data: Date; descrizione: string | null; chiuso: boolean };

function VanOutline() {
  return (
    <g stroke="var(--color-ink-faint)" fill="none" strokeWidth={1.5}>
      <rect x={20} y={10} width={200} height={460} rx={28} fill="var(--color-surface-sunken)" />
      <rect x={30} y={2} width={30} height={14} rx={3} fill="var(--color-ink-faint)" opacity={0.4} />
      <rect x={180} y={2} width={30} height={14} rx={3} fill="var(--color-ink-faint)" opacity={0.4} />
      <rect x={30} y={464} width={30} height={14} rx={3} fill="var(--color-ink-faint)" opacity={0.4} />
      <rect x={180} y={464} width={30} height={14} rx={3} fill="var(--color-ink-faint)" opacity={0.4} />
      <line x1={20} y1={68} x2={220} y2={68} />
      <line x1={20} y1={396} x2={220} y2={396} />
      <ellipse cx={12} cy={96} rx={8} ry={5} fill="var(--color-surface-sunken)" />
      <ellipse cx={228} cy={96} rx={8} ry={5} fill="var(--color-surface-sunken)" />
      <rect x={6} y={95} width={16} height={30} rx={6} fill="var(--color-ink-faint)" opacity={0.5} />
      <rect x={218} y={95} width={16} height={30} rx={6} fill="var(--color-ink-faint)" opacity={0.5} />
      <rect x={6} y={355} width={16} height={30} rx={6} fill="var(--color-ink-faint)" opacity={0.5} />
      <rect x={218} y={355} width={16} height={30} rx={6} fill="var(--color-ink-faint)" opacity={0.5} />
    </g>
  );
}

function DamageMark({ x, y, n }: { x: number; y: number; n: number }) {
  const s = 7;
  return (
    <g>
      <line x1={x - s} y1={y - s} x2={x + s} y2={y + s} stroke="var(--color-danger)" strokeWidth={3} strokeLinecap="round" />
      <line x1={x - s} y1={y + s} x2={x + s} y2={y - s} stroke="var(--color-danger)" strokeWidth={3} strokeLinecap="round" />
      <circle cx={x + 10} cy={y - 10} r={7} fill="var(--color-danger)" />
      <text x={x + 10} y={y - 10} textAnchor="middle" dominantBaseline="central" fontSize={9} fontWeight="bold" fill="white">
        {n}
      </text>
    </g>
  );
}

/**
 * Sagoma furgone (vista dall'alto) con le X nei punti dei danni registrati,
 * dedotti dalla descrizione libera via classifyDamageZones(). Zone multiple
 * nella stessa descrizione producono più X; danni non geolocalizzabili
 * restano in legenda senza posizione sulla sagoma (non inventiamo un punto).
 */
export function DamageDiagram({ damages }: { damages: DamageEntry[] }) {
  const marks: { x: number; y: number; n: number; damage: DamageEntry; zone: DamageZoneKey }[] = [];
  const diffusi: DamageEntry[] = [];
  const senzaPosizione: DamageEntry[] = [];
  let n = 0;

  for (const d of damages) {
    // "tipo" è il campo "che danno è" (es. "Fiancata dx"); "descrizione" è la
    // narrativa dell'evento (es. "VEICOLO A: ... VEICOLO B: ...") e non contiene
    // quasi mai la parte del corpo — va classificato il tipo, non la narrativa.
    const zones = classifyDamageZones(d.tipo);
    if (zones.length === 0) continue;
    if (zones.includes("diffuso")) { diffusi.push(d); continue; }
    const placeable = zones.filter((z): z is Exclude<DamageZoneKey, "diffuso" | "non-classificato"> => z !== "non-classificato");
    if (placeable.length === 0) { senzaPosizione.push(d); continue; }
    n++;
    for (const z of placeable) {
      const [x, y] = ZONE_XY[z];
      marks.push({ x, y, n, damage: d, zone: z });
    }
  }

  if (marks.length === 0 && diffusi.length === 0) return null;

  return (
    <div className="card p-5">
      <h2 className="font-semibold mb-1">Mappa danni</h2>
      <p className="text-xs text-ink-muted mb-3">
        Posizione dedotta automaticamente dalla descrizione del danno — vista dall&apos;alto, muso in alto
      </p>
      <div className="flex flex-col sm:flex-row gap-4 items-start">
        <svg viewBox="0 0 240 480" className="w-40 shrink-0" role="img" aria-label="Sagoma furgone con danni">
          <VanOutline />
          {diffusi.length > 0 && (
            <circle cx={120} cy={240} r={90} fill="none" stroke="var(--color-warn)" strokeWidth={3} strokeDasharray="6 4">
              <title>Danno diffuso su tutta la carrozzeria (es. grandine)</title>
            </circle>
          )}
          {marks.map((m, i) => (
            <g key={i}>
              <DamageMark x={m.x} y={m.y} n={m.n} />
              <title>{`#${m.n} — ${m.damage.tipo}${m.damage.chiuso ? " (chiuso)" : ""}`}</title>
            </g>
          ))}
        </svg>
        <ul className="text-xs space-y-1.5 flex-1">
          {Array.from(new Map(marks.map((m) => [m.n, m])).values()).map((m) => (
            <li key={m.n} className="flex gap-2">
              <span className="font-bold text-danger shrink-0">#{m.n}</span>
              <span>
                <span className="font-medium">{m.damage.tipo}</span>
                <span className="text-ink-faint"> — {fmtDate(m.damage.data)}{m.damage.chiuso ? " · chiuso" : ""}</span>
              </span>
            </li>
          ))}
          {diffusi.map((d) => (
            <li key={d.id} className="flex gap-2">
              <span className="font-bold text-warn shrink-0">◌</span>
              <span>
                <span className="font-medium">{d.tipo}</span>
                <span className="text-ink-faint"> — {fmtDate(d.data)} · diffuso su tutta la carrozzeria</span>
              </span>
            </li>
          ))}
          {senzaPosizione.map((d) => (
            <li key={d.id} className="flex gap-2 text-ink-muted">
              <span className="shrink-0">·</span>
              <span>{d.tipo} — {fmtDate(d.data)} (posizione non determinata dalla descrizione)</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
