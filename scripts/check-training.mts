/** Prebuild: valida content/training/piano.json (schema, id unici, moduli, sezioni e ancore del vademecum). */
import { getPiano } from "../src/lib/training/piano";
try {
  const p = getPiano();
  console.log(`Training: piano.json ok (${p.giorni.length} giorni, ${p.giorni.reduce((a, g) => a + g.attivita.length, 0)} attività, ${p.moduli.length} moduli)`);
} catch (e) {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
}
