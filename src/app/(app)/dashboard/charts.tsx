"use client";

import { useRouter } from "next/navigation";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, LabelList,
} from "recharts";

/**
 * Palette categorica validata (script dataviz, light mode, ΔE CVD 24.2):
 * ordine fisso, mai ciclato. Le serie sotto 3:1 di contrasto hanno
 * etichette/tabella dettaglio come "relief" (regola del validatore).
 */
export const SERIES_COLORS = {
  danni: "#2a78d6",
  carburante: "#1baf7a",
  pedaggi: "#eda100",
  multe: "#008300",
} as const;

const eur = (v: number) =>
  new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(v);

export type CostRow = {
  station: string; // codice stazione
  stationId: string;
  veicoli: number;
  canone: number; // impegno mensile corrente, non una spesa "ultimi 30gg" — non entra nel grafico impilato
  danni: number;
  carburante: number;
  pedaggi: number;
  multe: number;
};

export function CostByStationChart({ data }: { data: CostRow[] }) {
  const router = useRouter();
  return (
    <ResponsiveContainer width="100%" height={320}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
        <CartesianGrid vertical={false} stroke="var(--color-line)" />
        <XAxis dataKey="station" tick={{ fontSize: 12, fill: "var(--color-ink-muted)" }} axisLine={false} tickLine={false} />
        <YAxis tickFormatter={(v) => eur(v)} tick={{ fontSize: 11, fill: "var(--color-ink-muted)" }} axisLine={false} tickLine={false} width={70} />
        <Tooltip
          formatter={(value: number, name: string) => [eur(value), name]}
          labelFormatter={(l) => `Stazione ${l}`}
          contentStyle={{ borderRadius: 8, border: "1px solid var(--color-line)", fontSize: 12 }}
        />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        {(Object.keys(SERIES_COLORS) as (keyof typeof SERIES_COLORS)[]).map((key, i, arr) => (
          <Bar
            key={key}
            dataKey={key}
            name={key.charAt(0).toUpperCase() + key.slice(1)}
            stackId="costi"
            fill={SERIES_COLORS[key]}
            stroke="var(--color-surface-raised)"
            strokeWidth={2}
            radius={i === arr.length - 1 ? [4, 4, 0, 0] : 0}
            cursor="pointer"
            onClick={(entry) => {
              const row = entry as unknown as { payload?: CostRow };
              if (row.payload?.stationId) router.push(`/dashboard?station=${row.payload.stationId}`);
            }}
          />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}

export type WeekRow = { settimana: string; multe: number; importo: number };

export function FinesTrendChart({ data }: { data: WeekRow[] }) {
  return (
    <ResponsiveContainer width="100%" height={280}>
      <BarChart data={data} margin={{ top: 16, right: 8, left: 8, bottom: 0 }}>
        <CartesianGrid vertical={false} stroke="var(--color-line)" />
        <XAxis dataKey="settimana" tick={{ fontSize: 11, fill: "var(--color-ink-muted)" }} axisLine={false} tickLine={false} />
        <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: "var(--color-ink-muted)" }} axisLine={false} tickLine={false} width={30} />
        <Tooltip
          formatter={(value: number, name: string) => (name === "importo" ? [eur(value), "Importo"] : [value, "Multe"])}
          contentStyle={{ borderRadius: 8, border: "1px solid var(--color-line)", fontSize: 12 }}
        />
        <Bar dataKey="multe" name="Multe" fill="#2a78d6" radius={[4, 4, 0, 0]} maxBarSize={44}>
          <LabelList dataKey="multe" position="top" style={{ fontSize: 11, fill: "var(--color-ink-muted)" }} />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
