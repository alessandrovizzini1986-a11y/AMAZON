import type { Corso } from "@/domain/corsi/corsi";
import { CORSO_TRACKING } from "./tracking";

/** Tutti i corsi, nell'ordine in cui compaiono in Aiuto → Corsi. Per aggiungerne uno: nuovo file qui accanto e una riga in questo elenco. */
export const CORSI: Corso[] = [CORSO_TRACKING];
export const corso = (id: string) => CORSI.find((c) => c.id === id) ?? null;
