import type { Station, Vehicle } from "@prisma/client";

const FUEL_LABELS: Record<string, string> = {
  DIESEL: "Diesel",
  DIESEL_HVO: "Diesel HVO (EN 15940)",
  BENZINA: "Benzina",
  ELETTRICO: "Elettrico",
  METANO: "Metano",
  GPL: "GPL",
  IBRIDO: "Ibrido",
};

const STATUS_LABELS: Record<string, string> = {
  ATTIVO: "Attivo",
  IN_OFFICINA: "In officina",
  SOSTITUTIVO: "Sostitutivo",
  UFFICIO: "Ufficio",
  DISMESSO: "Dismesso",
};

const CONTRACT_TYPE_LABELS: Record<string, string> = {
  MT: "Medio termine (MT)",
  LT: "Lungo termine (LT)",
  BT: "Breve termine (BT)",
  SOST: "Sostitutivo (SOST)",
  UFFICIO: "Ufficio",
};

function d(v: Date | null | undefined) {
  return v ? new Date(v).toISOString().slice(0, 10) : "";
}

export function VehicleForm({
  action,
  stations,
  vehicle,
  lockStation,
}: {
  action: (formData: FormData) => Promise<void>;
  stations: Station[];
  vehicle?: Vehicle;
  lockStation?: string; // stationId imposto (resp. mezzi)
}) {
  return (
    <form action={action} className="card p-5 grid grid-cols-1 md:grid-cols-3 gap-4">
      <div>
        <label className="label">Targa *</label>
        <input className="input font-mono uppercase" name="targa" defaultValue={vehicle?.targa} required minLength={5} />
      </div>
      <div>
        <label className="label">Modello *</label>
        <input className="input" name="modello" defaultValue={vehicle?.modello} required placeholder="es. Fiat Ducato L2H2" />
      </div>
      <div>
        <label className="label">Allestimento</label>
        <input className="input" name="allestimento" defaultValue={vehicle?.allestimento ?? ""} />
      </div>
      <div>
        <label className="label">Alimentazione *</label>
        <select className="input" name="alimentazione" defaultValue={vehicle?.alimentazione ?? "DIESEL"} required>
          {Object.entries(FUEL_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
      </div>
      <div>
        <label className="label">Data immatricolazione</label>
        <input className="input" type="date" name="immatricolazione" defaultValue={d(vehicle?.immatricolazione)} />
      </div>
      <div>
        <label className="label">Stazione *</label>
        <select className="input" name="stationId" defaultValue={vehicle?.stationId ?? lockStation ?? ""} required disabled={!!vehicle}>
          {stations
            .filter((s) => (lockStation && !vehicle ? s.id === lockStation : true))
            .map((s) => <option key={s.id} value={s.id}>{s.code} — {s.name}</option>)}
        </select>
        {vehicle ? (
          <p className="text-[11px] text-ink-faint mt-1">Il cambio stazione passa dal modulo Movimentazione.</p>
        ) : null}
        {vehicle && <input type="hidden" name="stationId" value={vehicle.stationId} />}
      </div>
      <div>
        <label className="label">Stato</label>
        <select className="input" name="stato" defaultValue={vehicle?.stato ?? "ATTIVO"}>
          {Object.entries(STATUS_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
      </div>
      <div>
        <label className="label">Km attuali</label>
        <input className="input" type="number" name="kmAttuali" min={0} defaultValue={vehicle?.kmAttuali ?? 0} />
      </div>
      <div>
        <label className="label">Canone €/mese</label>
        <input className="input" type="number" step="0.01" min={0} name="canoneMese" defaultValue={vehicle?.canoneMese ? String(vehicle.canoneMese) : ""} />
      </div>
      <div>
        <label className="label">Franchigia danni €</label>
        <input className="input" type="number" step="0.01" min={0} name="franchigiaDanni" defaultValue={vehicle?.franchigiaDanni ? String(vehicle.franchigiaDanni) : ""} />
      </div>
      <div>
        <label className="label">Società noleggio</label>
        <input className="input" name="leasingCompany" defaultValue={vehicle?.leasingCompany ?? ""} placeholder="es. ALD, Europcar, Hertz" />
      </div>
      <div>
        <label className="label">N. contratto (N° RA)</label>
        <input className="input" name="contrattoLeasingNo" defaultValue={vehicle?.contrattoLeasingNo ?? ""} />
      </div>
      <div>
        <label className="label">Tipo contratto</label>
        <select className="input" name="tipoContratto" defaultValue={vehicle?.tipoContratto ?? ""}>
          <option value="">— non specificato —</option>
          {Object.entries(CONTRACT_TYPE_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
      </div>
      <div>
        <label className="label">Data inizio contratto</label>
        <input className="input" type="date" name="contrattoDataInizio" defaultValue={d(vehicle?.contrattoDataInizio)} />
      </div>
      <div>
        <label className="label">Data fine contratto</label>
        <input className="input" type="date" name="contrattoDataFine" defaultValue={d(vehicle?.contrattoDataFine)} />
      </div>
      <div className="md:col-span-3">
        <label className="label">Note</label>
        <input className="input" name="note" defaultValue={vehicle?.note ?? ""} placeholder="es. spostamenti tra stazioni, riferimenti mezzo sostituito" />
      </div>
      <div>
        <label className="label">Prossimo tagliando (data)</label>
        <input className="input" type="date" name="prossimoTagliandoData" defaultValue={d(vehicle?.prossimoTagliandoData)} />
      </div>
      <div>
        <label className="label">Prossimo tagliando (km)</label>
        <input className="input" type="number" name="prossimoTagliandoKm" defaultValue={vehicle?.prossimoTagliandoKm ?? ""} />
      </div>
      <div>
        <label className="label">Scadenza revisione</label>
        <input className="input" type="date" name="prossimaRevisione" defaultValue={d(vehicle?.prossimaRevisione)} />
      </div>
      <div className="md:col-span-3">
        <button className="btn-primary">{vehicle ? "Salva modifiche" : "Aggiungi veicolo"}</button>
      </div>
    </form>
  );
}

export { FUEL_LABELS, STATUS_LABELS, CONTRACT_TYPE_LABELS };
