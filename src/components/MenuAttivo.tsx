"use client";

import { usePathname } from "next/navigation";
import { MenuMobile } from "./MenuMobile";
import { gruppoAttivo, type NavGroup } from "./navModel";

/** "Menu" della barra in basso: è attivo quando la pagina non è in uno dei gruppi della barra. */
export function MenuAttivoBarra({ gruppi, inBarra, utente }: { gruppi: NavGroup[]; inBarra: string[]; utente: { nome: string; ruolo: string } }) {
  const g = gruppoAttivo(usePathname(), gruppi);
  return <MenuMobile gruppi={gruppi} attivo={!g || !inBarra.includes(g.id)} utente={utente} />;
}
