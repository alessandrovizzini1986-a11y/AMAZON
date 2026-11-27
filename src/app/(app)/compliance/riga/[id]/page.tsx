import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { db } from "@/lib/db";
import { PageHeader } from "@/components/ui";
import { iso, oggiRoma } from "@/lib/compliance/dati";
import { giorniA, it, NOME_REGOLA, nomeMese, type Regola } from "@/domain/compliance/scadenze";
import { COLORE_STATO, NOME_STATO, type Stato } from "@/domain/compliance/stato";
import { FAC_SIMILE } from "@/domain/compliance/seed";
import { nomeEntita } from "@/domain/compliance/mail";
import { ScadenzaForm } from "./ScadenzaForm";

export const dynamic = "force-dynamic";

/** Scheda di un folder in un mese: cosa caricare, come, entro quando, e la storia della riga. */
export default async function RigaPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  if (!can(user, "compliance.view")) redirect("/");
  const r = await db.complianceRiga.findUnique({ where: { id: (await params).id }, include: { template: true, storico: { orderBy: { data: "desc" } } } });
  if (!r) notFound();
  const t = r.template, oggi = oggiRoma(), portale = iso(r.scadenzaPortale), interna = iso(r.scadenzaInterna);
  const quando = (d: Date) => d.toLocaleString("it-IT", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Rome" });
  const gg = (d: string | null) => (d ? ` (${giorniA(d, oggi) < 0 ? `${-giorniA(d, oggi)} giorni fa` : `tra ${giorniA(d, oggi)} giorni`})` : "");
  const lul = /LUL/.test(t.folder);
  return (
    <div className="flex max-w-3xl flex-col gap-4">
      <Link href="/compliance" className="text-sm text-brand hover:underline">← Registro</Link>
      <PageHeader eyebrow={`${nomeEntita(t.entita)} · ${t.area} · ${nomeMese(r.anno, r.mese)}`} title={t.folder} subtitle={t.documento} />
      <section className="card flex flex-col gap-2 p-4 text-sm">
        <div><span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${COLORE_STATO[r.stato as Stato]}`}>{NOME_STATO[r.stato as Stato]}</span>{r.motivoRifiuto && <span className="ml-2 text-red-800">Respinto: {r.motivoRifiuto}</span>}</div>
        <dl className="grid grid-cols-1 gap-x-6 gap-y-1 sm:grid-cols-2">
          <div><dt className="inline text-ink-muted">Formato: </dt><dd className="inline">{t.formato}</dd></div>
          <div><dt className="inline text-ink-muted">Chi lo fornisce: </dt><dd className="inline">{t.owner}</dd></div>
          <div className="sm:col-span-2"><dt className="inline text-ink-muted">Nome file standard: </dt><dd className="inline break-all font-mono text-xs">{t.nomeFileStandard || "—"}</dd></div>
          <div><dt className="inline text-ink-muted">Scadenza interna: </dt><dd className="inline">{interna ? `${it(interna)}${gg(interna)}` : "—"}</dd></div>
          <div><dt className="inline text-ink-muted">Scadenza del portale: </dt><dd className="inline">{portale ? `${it(portale)}${gg(portale)}` : "—"}</dd></div>
          <div><dt className="inline text-ink-muted">Regola: </dt><dd className="inline">{NOME_REGOLA[t.regolaScadenza as Regola] ?? t.regolaScadenza}</dd></div>
          <div><dt className="inline text-ink-muted">Validazione: </dt><dd className="inline">{t.workflow ? "sì, da SD Worx" : "no (No workflow: lo vede solo Amazon)"}</dd></div>
        </dl>
        {r.caricatoDa && r.caricatoIl && <p>✓ Caricato da <b>{r.caricatoDa}</b> il {quando(r.caricatoIl)}{r.nomeFileCaricato ? ` · ${r.nomeFileCaricato}` : ""}</p>}
        {(t.facSimile ? FAC_SIMILE[t.facSimile] ?? [] : []).length > 0 && <p className="flex flex-wrap gap-3">{FAC_SIMILE[t.facSimile!].map((f) => <a key={f.file} className="underline" href={`/api/compliance/fac-simile/${encodeURIComponent(f.file)}`}>Fac-simile: {f.nome}</a>)}</p>}
        <ul className="list-disc pl-5 text-ink-muted">
          <li>File PDF originale (non una scansione, dove possibile), al massimo 2 MB per file.</li>
          <li>Il mese è quello di competenza del documento, non quello in cui lo carichi.</li>
          <li>Alla scadenza il portale chiude il folder e non lo riapre. Considera come ultimo momento utile la sera del giorno prima.</li>
          {lul && <li>Il LUL deve essere vidimato e numerato; per Professional Solutions serve anche il riepilogo paghe (Cedolone). I LUL di agosto e settembre caricati come &quot;redacted&quot; sono stati respinti (FileNonConforme): il motivo esatto è nella chat del portale e non è stato ancora letto.</li>}
        </ul>
        {can(user, "compliance.manage") && <ScadenzaForm id={r.id} scadenza={portale} nota={r.note ?? ""} />}
        {r.note && !can(user, "compliance.manage") && <p>Nota: {r.note}</p>}
      </section>
      <section className="card p-4">
        <h2 className="mb-2 text-base font-semibold">Storia della riga</h2>
        <ul className="flex flex-col gap-1 text-sm">{r.storico.map((s) => <li key={s.id}>{quando(s.data)} · <b>{s.utente}</b>: {s.statoPrecedente ? `${NOME_STATO[s.statoPrecedente as Stato] ?? s.statoPrecedente} → ` : "creata come "}{NOME_STATO[s.statoNuovo as Stato] ?? s.statoNuovo}{s.origine !== "manuale" ? ` (${s.origine === "import" ? "import dal portale" : "dato iniziale"})` : ""}{s.nota ? ` · ${s.nota}` : ""}</li>)}</ul>
      </section>
    </div>
  );
}
