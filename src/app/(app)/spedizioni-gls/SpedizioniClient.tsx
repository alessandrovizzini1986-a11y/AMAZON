"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Aiuto } from "@/components/Aiuto";
import { AZIONI_GLS, SERVIZI, bollettinoVuoto, cercaStorico, compilaBollettino, controlla, nomeFile, parteVuota, type AzioneGls, type Bollettino, type Parte, type RigaStoricoGls, type Servizio } from "@/domain/gls/bollettino";
import { passwordGls, registraBollettino, salvaAccessoGls, storicoBollettini } from "./actions";

type Accesso = { url: string; username: string; sede: string; haPassword: boolean };
const K_MITTENTE = "gls:mittente", K_RUBRICA = "gls:rubrica";
const oggiIso = () => new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Rome" });
const leggi = <T,>(k: string, vuoto: T): T => { try { const v = localStorage.getItem(k); return v ? (JSON.parse(v) as T) : vuoto; } catch { return vuoto; } };
const scrivi = (k: string, v: unknown) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* ok */ } };

let modulo: Promise<ArrayBuffer> | null = null;
const caricaModulo = () => (modulo ??= fetch("/gls/bollettino.pdf").then((r) => { if (!r.ok) throw new Error("modulo"); return r.arrayBuffer(); }).catch((e) => { modulo = null; throw e; }));

/** Copia negli appunti; il testo passa da una Promise così Safari lo accetta anche dopo una chiamata al server. */
async function copia(testo: string | Promise<string>) {
  if (typeof ClipboardItem !== "undefined" && navigator.clipboard?.write) {
    await navigator.clipboard.write([new ClipboardItem({ "text/plain": Promise.resolve(testo).then((t) => new Blob([t], { type: "text/plain" })) })]);
  } else await navigator.clipboard.writeText(await testo);
}

function Campo({ etichetta, valore, onChange, className = "", ...rest }: { etichetta: string; valore: string; onChange: (v: string) => void; className?: string } & Omit<React.InputHTMLAttributes<HTMLInputElement>, "onChange" | "value" | "className">) {
  return <label className={`flex flex-col gap-1 text-xs font-semibold text-ink-muted ${className}`}>{etichetta}<input className="input h-10 font-normal text-ink" value={valore} onChange={(e) => onChange(e.target.value)} {...rest} /></label>;
}

function Accesso({ accesso }: { accesso: Accesso }) {
  const router = useRouter();
  const [msg, setMsg] = useState<{ testo: string; ok: boolean } | null>(null);
  const [visibile, setVisibile] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [modifica, setModifica] = useState(!accesso.haPassword || !accesso.username);
  const [f, setF] = useState({ username: accesso.username, sede: accesso.sede || "MILANO - M1", password: "" });
  const dopo = (testo: string, ok = true) => { setMsg({ testo, ok }); setTimeout(() => setMsg(null), 6000); };

  const leggiPassword = async () => { const r = await passwordGls(); if (r.errore || !r.password) throw new Error(r.errore ?? "Password non disponibile."); return r.password; };
  const copiaPassword = async () => { setBusy(true); try { await copia(leggiPassword()); dopo("Password copiata: incollala nel campo Password del portale."); } catch (e) { dopo(e instanceof Error && e.message ? e.message : "Non riesco a copiare: usa Mostra.", false); } finally { setBusy(false); } };
  const mostra = async () => { if (visibile) { setVisibile(null); return; } setBusy(true); try { setVisibile(await leggiPassword()); setTimeout(() => setVisibile(null), 20000); } catch (e) { dopo(e instanceof Error ? e.message : "Errore", false); } finally { setBusy(false); } };
  const salva = async () => { setBusy(true); try { await salvaAccessoGls(f); setF({ ...f, password: "" }); setModifica(false); dopo("Accesso salvato."); router.refresh(); } catch { dopo("Non salvato: controlla nome utente e sede.", false); } finally { setBusy(false); } };

  return (
    <section className="card p-4 md:p-5" aria-labelledby="gls-accesso">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="gls-accesso" className="text-[19px] font-semibold">1. Entra nel portale GLS</h2>
          <p className="mt-1 max-w-2xl text-sm text-ink-muted">Il portale GLS non accetta dati già compilati da un altro sito: apri la pagina, copia da qui nome utente e password e scegli la sede nella tendina.</p>
        </div>
        <a href={accesso.url} target="_blank" rel="noopener noreferrer" className="btn-primary">Apri il portale GLS ↗</a>
      </div>

      <dl className="mt-4 grid gap-3 md:grid-cols-3">
        <div className="rounded-control border border-line p-3">
          <dt className="text-xs font-semibold uppercase tracking-wide text-ink-muted">Nome utente</dt>
          <dd className="mt-1 flex items-center justify-between gap-2"><span className="font-mono text-lg font-semibold">{accesso.username || "—"}</span>
            {accesso.username && <button type="button" className="btn-secondary px-3 py-1 text-xs" onClick={async () => { try { await copia(accesso.username); dopo("Nome utente copiato."); } catch { dopo("Non riesco a copiare.", false); } }}>Copia</button>}</dd>
        </div>
        <div className="rounded-control border border-line p-3">
          <dt className="text-xs font-semibold uppercase tracking-wide text-ink-muted">Password</dt>
          <dd className="mt-1 flex items-center justify-between gap-2">
            <span className="font-mono text-lg font-semibold" aria-live="polite">{accesso.haPassword ? (visibile ?? "••••••••••••") : "non salvata"}</span>
            {accesso.haPassword && <span className="flex items-center gap-1.5">
              <button type="button" className="btn-secondary px-3 py-1 text-xs" disabled={busy} onClick={copiaPassword}>Copia</button>
              <button type="button" className="btn-secondary px-3 py-1 text-xs" disabled={busy} onClick={mostra}>{visibile ? "Nascondi" : "Mostra"}</button>
              <Aiuto k="gls.password" />
            </span>}
          </dd>
        </div>
        <div className="rounded-control border border-line p-3">
          <dt className="text-xs font-semibold uppercase tracking-wide text-ink-muted">Sede (da scegliere nella tendina)</dt>
          <dd className="mt-1 text-lg font-semibold">{accesso.sede || "—"}</dd>
        </div>
      </dl>
      {msg && <p role="status" className={`mt-3 rounded-control px-3 py-2 text-sm ${msg.ok ? "bg-ok-soft text-ok" : "bg-danger-soft text-danger"}`}>{msg.testo}</p>}

      {!modifica ? (
        <button type="button" className="mt-3 text-sm text-ink-muted underline hover:text-ink" onClick={() => setModifica(true)}>Modifica accesso</button>
      ) : (
        <div className="mt-4 rounded-control bg-surface p-3">
          {!accesso.haPassword && <p className="mb-2 text-sm font-semibold text-warn">La password non è ancora salvata: scrivila qui una volta sola. Viene salvata cifrata e non compare più in chiaro.</p>}
          <div className="grid gap-3 md:grid-cols-4">
            <Campo etichetta="Nome utente" valore={f.username} onChange={(v) => setF({ ...f, username: v })} autoComplete="off" />
            <Campo etichetta="Sede" valore={f.sede} onChange={(v) => setF({ ...f, sede: v })} autoComplete="off" />
            <Campo etichetta={accesso.haPassword ? "Nuova password (vuota = non cambia)" : "Password"} valore={f.password} onChange={(v) => setF({ ...f, password: v })} type="password" autoComplete="new-password" />
            <div className="flex items-end gap-2">
              <button type="button" className="btn-primary" disabled={busy || !f.username.trim() || !f.sede.trim() || (!accesso.haPassword && !f.password)} onClick={salva}>Salva</button>
              {accesso.haPassword && <button type="button" className="btn-secondary" onClick={() => setModifica(false)}>Annulla</button>}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

/** Anteprima della prima pagina del PDF, disegnata con pdf.js (funziona anche su telefono). */
function Anteprima({ pdf }: { pdf: Uint8Array | null }) {
  const tela = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (!pdf) return;
    let annullato = false;
    (async () => {
      const lib = (await import("pdfjs-dist/legacy/build/pdf")) as unknown as typeof import("pdfjs-dist");
      lib.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.js";
      const doc = await lib.getDocument({ data: pdf.slice(), verbosity: 0 }).promise;
      const pagina = await doc.getPage(1), c = tela.current;
      if (annullato || !c) { await doc.destroy(); return; }
      const vp = pagina.getViewport({ scale: 2.2 });
      const buffer = document.createElement("canvas"); buffer.width = vp.width; buffer.height = vp.height;
      await pagina.render({ canvasContext: buffer.getContext("2d")!, viewport: vp }).promise;
      if (!annullato) { c.width = vp.width; c.height = vp.height; c.getContext("2d")!.drawImage(buffer, 0, 0); }
      await doc.destroy();
    })().catch(() => { /* l'anteprima è un aiuto: il PDF si scarica comunque */ });
    return () => { annullato = true; };
  }, [pdf]);
  return <canvas ref={tela} width={1310} height={948} aria-label="Anteprima del bollettino compilato" className="w-full rounded-control border border-line bg-white" />;
}

export function SpedizioniClient({ accesso, storico: storicoIniziale }: { accesso: Accesso; storico: RigaStoricoGls[] }) {
  const [b, setB] = useState<Bollettino>(() => bollettinoVuoto());
  const [storico, setStorico] = useState(storicoIniziale);
  const [cerca, setCerca] = useState("");
  const [nonSalvato, setNonSalvato] = useState(false);
  const cima = useRef<HTMLElement>(null);
  /** Dopo ogni PDF: salva il bollettino nello storico del sito. Se non riesce il PDF c'è comunque, ma lo si dice. */
  const registra = async (azione: AzioneGls) => {
    try { await registraBollettino({ dati: b, azione }); setNonSalvato(false); setStorico(await storicoBollettini()); }
    catch { setNonSalvato(true); }
  };
  const riapri = (r: RigaStoricoGls) => { setB({ ...bollettinoVuoto(), ...r.dati }); setProvato(false); setMsg({ testo: `Bollettino del ${r.dataSpedizione.split("-").reverse().join("/")} per ${r.destinatario} riaperto: i dati sono quelli salvati, il PDF esce identico.`, ok: true }); cima.current?.scrollIntoView({ behavior: "smooth", block: "start" }); };
  const trovati = useMemo(() => cercaStorico(storico, cerca), [storico, cerca]);
  const [rubrica, setRubrica] = useState<Parte[]>([]);
  const [pdf, setPdf] = useState<Uint8Array | null>(null);
  const [msg, setMsg] = useState<{ testo: string; ok: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const [provato, setProvato] = useState(false);

  // dati di questo PC: mittente dell'ultima volta e destinatari già usati
  useEffect(() => { setB((x) => ({ ...x, data: oggiIso(), mittente: leggi(K_MITTENTE, parteVuota()) })); setRubrica(leggi<Parte[]>(K_RUBRICA, [])); }, []);
  // anteprima: si rifà poco dopo l'ultima modifica
  useEffect(() => {
    let vivo = true;
    const t = setTimeout(() => { caricaModulo().then((m) => compilaBollettino(m, b)).then((x) => { if (vivo) setPdf(x); }).catch(() => { if (vivo) setMsg({ testo: "Non riesco a leggere il modulo GLS: ricarica la pagina.", ok: false }); }); }, 350);
    return () => { vivo = false; clearTimeout(t); };
  }, [b]);

  /** Destinatari già usati: prima quelli di questo PC, poi quelli dello storico del sito (così ci sono su ogni PC), senza doppioni. */
  const recenti = useMemo(() => {
    const visti = new Set<string>(), out: Parte[] = [];
    for (const r of [...rubrica, ...storico.map((x) => x.dati.destinatario)]) { const k = `${r.nome.trim().toLowerCase()}|${r.cap.trim()}`; if (!r.nome.trim() || visti.has(k)) continue; visti.add(k); out.push(r); }
    return out.slice(0, 60);
  }, [rubrica, storico]);
  const errori = useMemo(() => controlla(b), [b]);
  const set = <K extends keyof Bollettino>(k: K, v: Bollettino[K]) => setB((x) => ({ ...x, [k]: v }));
  const setParte = (chi: "mittente" | "destinatario", k: keyof Parte, v: string) => setB((x) => ({ ...x, [chi]: { ...x[chi], [k]: v } }));
  const accessori = [...b.accessori, "", "", "", "", ""].slice(0, 5);

  const pronto = async (): Promise<File | null> => {
    setProvato(true);
    if (errori.length) { setMsg({ testo: `Prima sistema: ${errori[0]}`, ok: false }); return null; }
    const bytes = await compilaBollettino(await caricaModulo(), b);
    scrivi(K_MITTENTE, b.mittente);
    const nuova = [b.destinatario, ...rubrica.filter((r) => !(r.nome.trim().toLowerCase() === b.destinatario.nome.trim().toLowerCase() && r.cap === b.destinatario.cap))].slice(0, 30);
    setRubrica(nuova); scrivi(K_RUBRICA, nuova);
    return new File([bytes.slice().buffer], nomeFile(b), { type: "application/pdf" });
  };
  const salvaFile = (f: File) => { const u = URL.createObjectURL(f), a = document.createElement("a"); a.href = u; a.download = f.name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(u), 30000); };
  const esegui = async (cosa: "scarica" | "stampa" | "invia") => {
    setBusy(true);
    // la scheda per la stampa va aperta subito, dentro il clic, o il browser la blocca
    const scheda = cosa === "stampa" ? window.open("", "_blank") : null;
    try {
      const f = await pronto();
      if (!f) { scheda?.close(); return; }
      void registra(cosa);
      if (cosa === "scarica") { salvaFile(f); setMsg({ testo: `Scaricato ${f.name}: lo trovi nella cartella Download.`, ok: true }); }
      if (cosa === "stampa") { const u = URL.createObjectURL(f); if (scheda) scheda.location.href = u; else salvaFile(f); setMsg({ testo: scheda ? "Bollettino aperto in una nuova scheda: da lì lo stampi." : "Il browser ha bloccato la nuova scheda: ho scaricato il PDF.", ok: true }); }
      if (cosa === "invia") {
        if (navigator.canShare?.({ files: [f] })) { try { await navigator.share({ files: [f], title: "Bollettino di spedizione GLS", text: `Bollettino di spedizione GLS per ${b.destinatario.nome}` }); setMsg({ testo: "Bollettino condiviso.", ok: true }); } catch { /* condivisione annullata */ } }
        else {
          salvaFile(f);
          window.location.href = `mailto:?subject=${encodeURIComponent(`Bollettino di spedizione GLS - ${b.destinatario.nome}`)}&body=${encodeURIComponent(`Ciao,\nin allegato il bollettino di spedizione GLS per ${b.destinatario.nome} (${b.colli} ${b.colli === "1" ? "collo" : "colli"}).\n\n`)}`;
          setMsg({ testo: `Ho scaricato ${f.name} e aperto una mail: allega il file dalla cartella Download.`, ok: true });
        }
      }
    } catch { scheda?.close(); setMsg({ testo: "Non sono riuscito a creare il PDF: riprova.", ok: false }); } finally { setBusy(false); }
  };

  const parte = (chi: "mittente" | "destinatario", titolo: string) => (
    <fieldset className="rounded-control border border-line p-3">
      <legend className="px-1 text-sm font-semibold">{titolo}</legend>
      {chi === "destinatario" && recenti.length > 0 && (
        <label className="mb-2 flex flex-col gap-1 text-xs font-semibold text-ink-muted">Destinatari già usati
          <select className="input h-10 font-normal text-ink" value="" onChange={(e) => { const r = recenti[Number(e.target.value)]; if (r) set("destinatario", { ...r }); }}>
            <option value="">— scegli un destinatario —</option>
            {recenti.map((r, i) => <option key={`${r.nome}${r.cap}${i}`} value={i}>{r.nome} · {r.citta}</option>)}
          </select>
        </label>
      )}
      <div className="grid grid-cols-6 gap-2">
        <Campo className="col-span-6" etichetta="Nome / ragione sociale *" valore={b[chi].nome} onChange={(v) => setParte(chi, "nome", v)} maxLength={90} autoComplete="off" />
        <Campo className="col-span-6" etichetta="Via e numero *" valore={b[chi].via} onChange={(v) => setParte(chi, "via", v)} maxLength={90} autoComplete="off" />
        <Campo className="col-span-4" etichetta="Città (provincia) *" valore={b[chi].citta} onChange={(v) => setParte(chi, "citta", v)} maxLength={50} autoComplete="off" />
        <Campo className="col-span-2" etichetta="CAP *" valore={b[chi].cap} onChange={(v) => setParte(chi, "cap", v.replace(/\D/g, "").slice(0, 5))} inputMode="numeric" autoComplete="off" />
        <Campo className="col-span-3" etichetta={`Telefono${chi === "destinatario" && b.fermoDeposito ? " *" : ""}`} valore={b[chi].telefono} onChange={(v) => setParte(chi, "telefono", v)} maxLength={25} inputMode="tel" autoComplete="off" />
        <Campo className="col-span-3" etichetta="E-mail" valore={b[chi].email} onChange={(v) => setParte(chi, "email", v)} maxLength={70} type="email" autoComplete="off" />
      </div>
      {chi === "mittente" && <Campo className="mt-2" etichetta="Rif. mittente (ordine, pratica…)" valore={b.rifMittente} onChange={(v) => set("rifMittente", v)} maxLength={60} />}
      {chi === "destinatario" && <label className="mt-3 flex items-center gap-2 text-sm"><input type="checkbox" checked={b.fermoDeposito} onChange={(e) => set("fermoDeposito", e.target.checked)} />Fermo deposito (ritira in sede GLS)</label>}
    </fieldset>
  );

  return (
    <>
      <Accesso accesso={accesso} />

      <section ref={cima} className="card scroll-mt-24 p-4 md:p-5" aria-labelledby="gls-bollettino">
        <h2 id="gls-bollettino" className="text-[19px] font-semibold">2. Compila il bollettino di spedizione</h2>
        <p className="mt-1 max-w-3xl text-sm text-ink-muted">Scrivi i dati qui: finiscono sul modulo GLS originale (Mod. 04), con le condizioni di trasporto in seconda pagina. Firma e timbro si mettono a mano sulla stampa. Il mittente e i destinatari usati restano su questo PC per la prossima volta.</p>

        <div className="mt-4 grid gap-5 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
          <div className="flex flex-col gap-4">
            <label className={`flex flex-col gap-1 rounded-control border-2 p-3 text-sm font-semibold ${provato && !b.numero.trim() ? "border-danger bg-danger-soft" : "border-brand bg-brand-light"}`}>
              Numero del bollettino *
              <input className="input h-12 max-w-sm text-lg font-bold tracking-wide text-ink" value={b.numero} onChange={(e) => set("numero", e.target.value)} maxLength={20} autoComplete="off" placeholder="es. M1 123456789" />
              <span className="text-xs font-normal text-ink-muted">È il numero della spedizione: viene stampato in grande in alto sul modulo, accanto a «Bollettino di spedizione N.». Senza numero il PDF non si crea.</span>
            </label>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-1">{parte("mittente", "Mittente")}{parte("destinatario", "Destinatario")}</div>

            <fieldset className="rounded-control border border-line p-3">
              <legend className="px-1 text-sm font-semibold">Colli e contenuto</legend>
              <div className="grid grid-cols-6 gap-2">
                <Campo className="col-span-3 md:col-span-1" etichetta="N. colli *" valore={b.colli} onChange={(v) => set("colli", v.replace(/\D/g, "").slice(0, 4))} inputMode="numeric" />
                <Campo className="col-span-3 md:col-span-1" etichetta="Peso kg" valore={b.pesoKg} onChange={(v) => set("pesoKg", v.replace(/[^\d.,]/g, "").slice(0, 7))} inputMode="decimal" />
                {(["Lato 1 cm", "Lato 2 cm", "Lato 3 cm"] as const).map((e, i) => <Campo key={e} className="col-span-2 md:col-span-1" etichetta={e} valore={b.dimensioni[i]} onChange={(v) => set("dimensioni", b.dimensioni.map((d, k) => (k === i ? v.replace(/[^\d.,]/g, "").slice(0, 5) : d)) as [string, string, string])} inputMode="decimal" />)}
                <Campo className="col-span-6" etichetta="Contenuto" valore={b.contenuto} onChange={(v) => set("contenuto", v)} maxLength={45} />
              </div>
            </fieldset>

            <fieldset className="rounded-control border border-line p-3">
              <legend className="px-1 text-sm font-semibold">Servizio, porto, contrassegno e assicurazione</legend>
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
                {(Object.keys(SERVIZI) as Servizio[]).map((s) => <label key={s} className="flex items-center gap-2"><input type="checkbox" checked={b.servizi.includes(s)} onChange={(e) => set("servizi", e.target.checked ? [...b.servizi, s] : b.servizi.filter((x) => x !== s))} />{SERVIZI[s]}</label>)}
              </div>
              <div className="mt-3 grid grid-cols-6 gap-2">
                <label className="col-span-6 flex flex-col gap-1 text-xs font-semibold text-ink-muted md:col-span-2">Porto
                  <select className="input h-10 font-normal text-ink" value={b.porto} onChange={(e) => set("porto", e.target.value as Bollettino["porto"])}>
                    <option value="">non indicato</option><option value="franco">Porto Franco (paga il mittente)</option><option value="assegnato">Porto Assegnato (paga il destinatario)</option><option value="afm">AFM o AFM/I</option>
                  </select>
                </label>
                {b.porto === "afm" && <Campo className="col-span-6 md:col-span-2" etichetta="Cod. cliente AFM *" valore={b.afmCodice} onChange={(v) => set("afmCodice", v)} maxLength={20} />}
                <label className="col-span-6 flex flex-col gap-1 text-xs font-semibold text-ink-muted md:col-span-2">Assicurazione
                  <select className="input h-10 font-normal text-ink" value={b.assicurazione} onChange={(e) => set("assicurazione", e.target.value as Bollettino["assicurazione"])}>
                    <option value="">non indicata</option><option value="no">No</option><option value="si">Sì, con valore</option><option value="1010">Assicurazione 10/10</option>
                  </select>
                </label>
                {b.assicurazione === "si" && <Campo className="col-span-6 md:col-span-2" etichetta="Valore in € *" valore={b.valore} onChange={(v) => set("valore", v.replace(/[^\d.,]/g, "").slice(0, 10))} inputMode="decimal" />}
                <Campo className="col-span-3 md:col-span-2" etichetta="Contrassegno €" valore={b.contrassegno} onChange={(v) => set("contrassegno", v.replace(/[^\d.,]/g, "").slice(0, 10))} inputMode="decimal" placeholder="vuoto = nessuno" />
                <Campo className="col-span-3 md:col-span-2" etichetta={`Modalità incasso${b.contrassegno.trim() ? " *" : ""}`} valore={b.modalitaIncasso} onChange={(v) => set("modalitaIncasso", v)} maxLength={22} placeholder="es. contanti" />
              </div>
            </fieldset>

            <fieldset className="rounded-control border border-line p-3">
              <legend className="px-1 text-sm font-semibold">Servizi accessori, note, data</legend>
              <div className="grid grid-cols-2 gap-2 md:grid-cols-5">
                {accessori.map((a, i) => <Campo key={i} etichetta={`Accessorio ${i + 1}`} valore={a} onChange={(v) => set("accessori", accessori.map((x, k) => (k === i ? v : x)))} maxLength={22} />)}
              </div>
              <label className="mt-2 flex flex-col gap-1 text-xs font-semibold text-ink-muted">Note (2 righe sul modulo)
                <textarea className="input min-h-[64px] py-2 font-normal text-ink" value={b.note} onChange={(e) => set("note", e.target.value)} maxLength={230} rows={2} />
              </label>
              <div className="mt-2 grid grid-cols-2 gap-2 md:grid-cols-4">
                <Campo etichetta="Data" valore={b.data} onChange={(v) => set("data", v)} type="date" />
                <Campo etichetta="Ora" valore={b.ora} onChange={(v) => set("ora", v)} type="time" />
              </div>
            </fieldset>
          </div>

          <div className="flex flex-col gap-3 xl:sticky xl:top-24 xl:self-start">
            <Anteprima pdf={pdf} />
            {provato && errori.length > 0 && <ul className="rounded-control bg-warn-soft px-4 py-3 text-sm text-warn">{errori.map((e) => <li key={e}>• {e}</li>)}</ul>}
            {msg && <p role="status" className={`rounded-control px-3 py-2 text-sm ${msg.ok ? "bg-ok-soft text-ok" : "bg-danger-soft text-danger"}`}>{msg.testo}</p>}
            {nonSalvato && <p role="alert" className="rounded-control bg-warn-soft px-3 py-2 text-sm text-warn">Il PDF è pronto, ma non sono riuscito a salvarlo nello storico del sito. Riprova con Scarica il PDF.</p>}
            <div className="flex flex-wrap items-center gap-2">
              <button type="button" className="btn-primary" disabled={busy} onClick={() => esegui("scarica")}>Scarica il PDF</button><Aiuto k="gls.scarica" />
              <button type="button" className="btn-secondary" disabled={busy} onClick={() => esegui("stampa")}>Apri per stampare</button>
              <button type="button" className="btn-secondary" disabled={busy} onClick={() => esegui("invia")}>Invia…</button><Aiuto k="gls.invia" />
              <button type="button" className="ml-auto text-sm text-ink-muted underline hover:text-ink" onClick={() => { setB({ ...bollettinoVuoto(oggiIso()), mittente: b.mittente }); setProvato(false); setMsg(null); }}>Nuovo bollettino</button>
            </div>
          </div>
        </div>
      </section>

      <section className="card p-4 md:p-5" aria-labelledby="gls-storico">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 id="gls-storico" className="text-[19px] font-semibold">Storico dei bollettini</h2>
            <p className="mt-1 max-w-3xl text-sm text-ink-muted">Ogni bollettino scaricato, stampato o inviato resta qui con tutti i suoi dati, chi l&apos;ha fatto e quando. Con <b>Riapri</b> i dati tornano nel modulo qui sopra e il PDF si rifà identico.</p>
          </div>
          <label className="flex flex-col gap-1 text-xs font-semibold text-ink-muted">Cerca (numero bollettino, destinatario, città, CAP, data…)
            <input className="input h-10 w-72 max-w-full font-normal text-ink" value={cerca} onChange={(e) => setCerca(e.target.value)} placeholder="es. rossi milano" />
          </label>
        </div>
        {storico.length === 0 ? <p className="mt-3 text-sm text-ink-muted">Ancora nessun bollettino nello storico: il primo che scarichi comparirà qui.</p> : (
          <div className="mt-3 overflow-x-auto">
            <table className="table-base text-sm">
              <thead><tr><th>Fatto il</th><th>Da</th><th>Data sped.</th><th>Destinatario</th><th>Città</th><th className="text-right">Colli</th><th className="text-right">Kg</th><th className="text-right">Contrassegno €</th><th>N. bollettino</th><th>Cosa</th><th /></tr></thead>
              <tbody>
                {trovati.slice(0, 100).map((r) => (
                  <tr key={r.id}>
                    <td className="whitespace-nowrap font-mono text-xs">{new Date(r.quando).toLocaleString("it-IT", { timeZone: "Europe/Rome", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })}</td>
                    <td>{r.chi}</td><td className="whitespace-nowrap font-mono text-xs">{r.dataSpedizione.split("-").reverse().join("/")}</td>
                    <td className="font-medium">{r.destinatario}</td><td>{r.citta} {r.cap}</td>
                    <td className="text-right">{r.colli}</td><td className="text-right">{r.pesoKg || "—"}</td><td className="text-right">{r.contrassegno || "—"}</td><td>{r.numero || "—"}</td>
                    <td>{r.azioni.map((a) => AZIONI_GLS[a as AzioneGls] ?? a).join(", ")}</td>
                    <td><button type="button" className="btn-secondary px-3 py-1 text-xs" onClick={() => riapri(r)}>Riapri</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-2 text-xs text-ink-muted">{trovati.length === storico.length ? `${storico.length} bollettini` : `${trovati.length} trovati su ${storico.length}`}{trovati.length > 100 ? " (mostro i primi 100: stringi la ricerca)" : ""}.</p>
          </div>
        )}
      </section>
    </>
  );
}
