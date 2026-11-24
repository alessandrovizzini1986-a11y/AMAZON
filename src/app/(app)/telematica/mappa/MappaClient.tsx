"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CircleMarker, Map as MappaLeaflet } from "leaflet";
import "leaflet/dist/leaflet.css";

type Posizione = { fonte: "TARGA" | "FLOTTAWEB"; targa: string; nome: string; lat: number; lon: number; velocita: number; quando: string | null; stato: string; station: string | null; autista: string | null };
type Esito = { posizioni: Posizione[]; errori: { fonte: string; messaggio: string }[]; lettoIl: string };

const FONTE = { TARGA: "Targa", FLOTTAWEB: "FlottaWeb" } as const;
const ora = (iso: string | null) => (iso ? new Date(iso).toLocaleString("it-IT", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "—");
/** in movimento = verde, fermo = grigio, senza segnale da più di un giorno = rosso */
const vecchio = (p: Posizione) => !p.quando || Date.now() - new Date(p.quando).getTime() > 24 * 3600 * 1000;
const colore = (p: Posizione) => (vecchio(p) ? "#dc2626" : p.velocita > 3 ? "#059669" : "#64748b");
const testo = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] ?? c);

export function MappaClient() {
  const [dati, setDati] = useState<Esito | null>(null);
  const [errore, setErrore] = useState<string | null>(null);
  const [station, setStation] = useState("TUTTE");
  const [cerca, setCerca] = useState("");
  const div = useRef<HTMLDivElement>(null);
  const mappa = useRef<MappaLeaflet | null>(null);
  const segni = useRef<Map<string, CircleMarker>>(new Map());
  const inquadrata = useRef("");

  const carica = useCallback(async () => {
    try {
      const r = await fetch("/api/telematica/posizioni", { cache: "no-store" });
      if (!r.ok) throw new Error();
      setDati(await r.json()); setErrore(null);
    } catch { setErrore("Non riesco a leggere le posizioni. Riprovo tra un minuto."); }
  }, []);
  useEffect(() => { carica(); const t = setInterval(carica, 60000); return () => clearInterval(t); }, [carica]);

  const stations = useMemo(() => [...new Set((dati?.posizioni ?? []).map((p) => p.station ?? "Senza station"))].sort(), [dati]);
  const visibili = useMemo(() => {
    const q = cerca.trim().toUpperCase();
    return (dati?.posizioni ?? []).filter((p) => (station === "TUTTE" || (p.station ?? "Senza station") === station) && (!q || p.targa.includes(q) || p.nome.toUpperCase().includes(q)));
  }, [dati, station, cerca]);

  useEffect(() => {
    let vivo = true;
    (async () => {
      const L = (await import("leaflet")).default;
      if (!vivo || !div.current) return;
      if (!mappa.current) {
        mappa.current = L.map(div.current).setView([44.5, 11.3], 8);
        L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: "© OpenStreetMap" }).addTo(mappa.current);
      }
      const m = mappa.current, tenuti = new Set<string>();
      for (const p of visibili) {
        const k = `${p.fonte}|${p.targa}`; tenuti.add(k);
        const scheda = `<b>${testo(p.targa)}</b>${p.station ? ` · ${testo(p.station)}` : ""}<br>${p.velocita > 3 ? `In movimento, ${Math.round(p.velocita)} km/h` : "Fermo"}<br>Ultimo segnale: ${ora(p.quando)}${p.autista ? `<br>Autista: ${testo(p.autista)}` : ""}<br><span style="color:#64748b">${FONTE[p.fonte]}</span><br><a href="https://www.google.com/maps?q=${p.lat},${p.lon}" target="_blank" rel="noreferrer">Apri in Google Maps</a>`;
        const s = segni.current.get(k);
        if (s) { s.setLatLng([p.lat, p.lon]).setStyle({ fillColor: colore(p) }).setPopupContent(scheda).setTooltipContent(p.targa); }
        else segni.current.set(k, L.circleMarker([p.lat, p.lon], { radius: 8, color: "#fff", weight: 2, fillColor: colore(p), fillOpacity: 1 }).bindPopup(scheda).bindTooltip(p.targa, { direction: "top", offset: [0, -6] }).addTo(m));
      }
      for (const [k, s] of segni.current) if (!tenuti.has(k)) { s.remove(); segni.current.delete(k); }
      // inquadro i mezzi solo quando cambia il filtro, non a ogni aggiornamento (altrimenti la mappa salta mentre la guardi)
      const chiave = `${station}|${cerca}|${visibili.length > 0}`;
      if (visibili.length && inquadrata.current !== chiave) { inquadrata.current = chiave; m.fitBounds(L.latLngBounds(visibili.map((p) => [p.lat, p.lon] as [number, number])).pad(0.15), { maxZoom: 15 }); }
    })();
    return () => { vivo = false; };
  }, [visibili, station, cerca]);
  useEffect(() => () => { mappa.current?.remove(); mappa.current = null; }, []);

  const vai = (p: Posizione) => { mappa.current?.setView([p.lat, p.lon], 16); segni.current.get(`${p.fonte}|${p.targa}`)?.openPopup(); };
  const inMoto = visibili.filter((p) => p.velocita > 3 && !vecchio(p)).length, muti = visibili.filter(vecchio).length;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <select className="input w-auto" value={station} onChange={(e) => setStation(e.target.value)} aria-label="Station">
          <option value="TUTTE">Tutte le station</option>
          {stations.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <input className="input w-40" placeholder="Cerca targa" value={cerca} onChange={(e) => setCerca(e.target.value)} aria-label="Cerca targa" />
        <span className="text-slate-600">{visibili.length} mezzi · <span className="text-emerald-700">{inMoto} in movimento</span> · {visibili.length - inMoto - muti} fermi{muti ? <> · <span className="text-red-700">{muti} senza segnale da oltre un giorno</span></> : null}</span>
        <span className="ml-auto text-slate-500">{dati ? `Aggiornata alle ${new Date(dati.lettoIl).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" })}` : "Carico…"}</span>
        <button className="btn-secondary" onClick={carica}>Aggiorna</button>
      </div>
      {errore && <p className="text-sm text-red-700">{errore}</p>}
      {dati?.errori.map((e) => <p key={e.fonte} className="text-sm text-amber-700">{FONTE[e.fonte as keyof typeof FONTE] ?? e.fonte}: {e.messaggio}</p>)}
      <div className="grid gap-3 lg:grid-cols-[1fr_20rem]">
        <div ref={div} className="h-[60vh] min-h-[22rem] w-full overflow-hidden rounded-lg border border-slate-200 lg:h-[72vh]" />
        <div className="card max-h-[40vh] overflow-y-auto p-0 lg:max-h-[72vh]">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-white"><tr className="text-left text-slate-500"><th className="px-3 py-2">Targa</th><th className="px-2 py-2">Station</th><th className="px-2 py-2">Stato</th></tr></thead>
            <tbody>
              {visibili.map((p) => (
                <tr key={`${p.fonte}|${p.targa}`} className="cursor-pointer border-t border-slate-100 hover:bg-slate-50" onClick={() => vai(p)}>
                  <td className="px-3 py-1.5 font-medium">{p.targa}</td>
                  <td className="px-2 py-1.5">{p.station ?? "—"}</td>
                  <td className="px-2 py-1.5" style={{ color: colore(p) }}>{vecchio(p) ? `Muto dal ${ora(p.quando)}` : p.velocita > 3 ? `${Math.round(p.velocita)} km/h` : "Fermo"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
