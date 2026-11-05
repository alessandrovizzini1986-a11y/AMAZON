/** Tipi di attività del training (senza dipendenze: usato anche dai componenti client). */
export const TIPI = ["tell", "show", "do", "check"] as const;
export type Tipo = (typeof TIPI)[number];
