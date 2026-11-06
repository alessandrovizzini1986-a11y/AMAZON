/**
 * Flotta su Neon (via HTTP): 1) uniforma compagnia di noleggio e marca/modello di TUTTI i veicoli con
 * src/domain/vehicleNames.ts; 2) stima il canone dei mezzi attivi senza canone (sostitutivi esclusi: non si pagano)
 * con la mediana dei mezzi uguali (stessa società, modello e tipo contratto; poi società e tipo), scrivendolo
 * nella nota. La prima fattura lo sostituisce (riconcilia-flotta-neon: fattura > Lista > sito).
 *
 * Uso: NEON_URL=... npx tsx scripts/flotta-nomi-canoni-neon.mts [--tariffa Arval=400] [--applica]
 */
import { neon } from "@neondatabase/serverless";
import { ProxyAgent, setGlobalDispatcher } from "undici";
import { normalizeLeasingCompany, normalizeModello } from "../src/domain/vehicleNames";
import { stimaCanone, type MezzoCanone } from "../src/domain/flotta/canoni";

if (process.env.HTTPS_PROXY) setGlobalDispatcher(new ProxyAgent(process.env.HTTPS_PROXY));
const sql = neon(process.env.NEON_URL!);
const APPLICA = process.argv.includes("--applica");
const oggi = new Date().toISOString().slice(0, 10).split("-").reverse().join("/");

const v = (await sql`select v.id, v.targa, s.code station, v.stato::text stato, v.modello, v."leasingCompany", v."tipoContratto"::text tipo, v."canoneMese"::float canone, v.note
  from "Vehicle" v join "Station" s on s.id = v."stationId"`) as { id: string; targa: string; station: string; stato: string; modello: string; leasingCompany: string | null; tipo: string | null; canone: number | null; note: string | null }[];

// 1) nomi
const nomi = v.map((x) => ({ x, modello: normalizeModello(x.modello), societa: normalizeLeasingCompany(x.leasingCompany) }))
  .filter((y) => y.modello !== y.x.modello || y.societa !== y.x.leasingCompany);
const conta = new Map<string, number>();
for (const y of nomi) {
  if (y.modello !== y.x.modello) conta.set(`modello: ${y.x.modello} → ${y.modello}`, (conta.get(`modello: ${y.x.modello} → ${y.modello}`) ?? 0) + 1);
  if (y.societa !== y.x.leasingCompany) conta.set(`società: ${y.x.leasingCompany} → ${y.societa}`, (conta.get(`società: ${y.x.leasingCompany} → ${y.societa}`) ?? 0) + 1);
}
console.log(`nomi da uniformare: ${nomi.length} veicoli`);
for (const [k, n] of [...conta].sort()) console.log(`  ${k} (${n})`);

// 2) canoni stimati, sui nomi già uniformati
const dopo: MezzoCanone[] = v.map((x) => ({ targa: x.targa, stato: x.stato, societa: normalizeLeasingCompany(x.leasingCompany), modello: normalizeModello(x.modello), tipo: x.tipo, canone: x.canone }));
// --tariffa Arval=400: tariffa del foglio Tariffe della Lista per le società senza mezzi simili
const tariffe = new Map(process.argv.flatMap((a, i) => (process.argv[i - 1] === "--tariffa" ? [a.split("=") as [string, string]] : [])).map(([k, n]) => [k, Number(n)]));
const stime = stimaCanone(dopo).map((s) => (s.canone === null && s.societa && tariffe.has(s.societa) ? { ...s, canone: tariffe.get(s.societa)!, base: `tariffa ${s.societa} del foglio Tariffe della Lista Targhe` } : s));
console.log(`\nattivi senza canone: ${stime.length}`);
for (const s of stime) console.log(`  ${s.targa} ${s.societa} ${s.modello} ${s.tipo}: ${s.canone ?? "nessun mezzo simile"} (${s.base})`);

if (!APPLICA) { console.log("\ndry-run: nessuna scrittura (aggiungi --applica)"); process.exit(0); }
const q: ReturnType<typeof sql>[] = [];
for (const y of nomi) q.push(sql`update "Vehicle" set modello = ${y.modello}, "leasingCompany" = ${y.societa}, "updatedAt" = now() where id = ${y.x.id}`);
const byTarga = new Map(v.filter((x) => x.stato !== "DISMESSO").map((x) => [x.targa, x]));
for (const s of stime) {
  if (s.canone === null) continue;
  const x = byTarga.get(s.targa)!;
  const nota = `canone stimato il ${oggi}: ${s.base}; da sostituire con la prima fattura`;
  q.push(sql`update "Vehicle" set "canoneMese" = ${s.canone}, note = ${x.note ? `${x.note} · ${nota}` : nota}, "updatedAt" = now() where id = ${x.id}`);
}
await sql.transaction(q);
await sql`insert into "AuditLog" (id, "userId", action, entity, meta, "createdAt") select ${"c" + crypto.randomUUID().replace(/-/g, "").slice(0, 24)}, id, 'flotta.nomi-canoni', 'Vehicle', ${JSON.stringify({ nomi: nomi.length, canoniStimati: stime.filter((s) => s.canone !== null).map((s) => [s.targa, s.canone]) })}::jsonb, now() from "User" where role = 'ADMIN' order by "createdAt" limit 1`;
console.log(`\nscritto: ${q.length} aggiornamenti in una transazione`);
