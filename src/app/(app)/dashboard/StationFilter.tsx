"use client";

import { useRouter } from "next/navigation";

type StationOption = { id: string; code: string; name: string };

/**
 * Selettore stazione della dashboard Admin.
 * Sostituisce il precedente approccio "form + script iniettato via
 * dangerouslySetInnerHTML": gli script inseriti così nel DOM non vengono
 * MAI eseguiti dal browser (limite dello standard HTML, non un bug
 * occasionale) quindi il cambio stazione non aveva alcun effetto.
 */
export function StationFilter({ stations, value }: { stations: StationOption[]; value: string }) {
  const router = useRouter();
  return (
    <select
      className="input"
      value={value}
      onChange={(e) => {
        const v = e.target.value;
        router.push(v ? `/dashboard?station=${v}` : "/dashboard");
      }}
    >
      <option value="">Vista cluster</option>
      {stations.map((s) => (
        <option key={s.id} value={s.id}>
          {s.code} — {s.name}
        </option>
      ))}
    </select>
  );
}
