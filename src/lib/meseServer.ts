import "server-only";
import { cookies } from "next/headers";
import { COOKIE_MESE, meseDaUsare } from "./mesi";

/** Mese della pagina lato server: ?mese=, poi il mese scelto prima in questa sessione, poi il predefinito. */
export async function meseScelto(q: string | undefined, predefinito: string): Promise<string> {
  const c = await cookies();
  return meseDaUsare(q, c.get(COOKIE_MESE)?.value, predefinito);
}
