(async () => {
  if (!location.hostname.endsWith('logistics.amazon.it')) { alert('Apri prima la pagina Performance > Addetti alla consegna su logistics.amazon.it'); return; }
  const iso = d => d.toISOString().slice(0, 10);
  const ieri = iso(new Date(Date.now() - 86400000));
  const TUTTE = ['DER1','DER2','DLO2','DLO4','DLO5','DLZ2','DVN1'];
  const KEY = 'flexcsv_ultimo_giorno';
  let ultimo = ''; try { ultimo = localStorage.getItem(KEY) || ''; } catch (e) {}
  let daDef = ieri;
  if (ultimo) { const n = new Date(ultimo); n.setDate(n.getDate() + 1); daDef = iso(n) <= ieri ? iso(n) : ieri; }
  const fmt = d => d ? d.split('-').reverse().join('/') : '';
  const scelta = await new Promise(res => {
    const ov = document.createElement('div');
    ov.style.cssText = 'position:fixed;inset:0;z-index:99998;background:rgba(0,0,0,.45);display:flex;align-items:center;justify-content:center;font:14px system-ui,sans-serif';
    ov.innerHTML = `<div style="background:#fff;color:#111;padding:20px 24px;border-radius:10px;min-width:340px;box-shadow:0 10px 30px rgba(0,0,0,.3)">
      <div style="font-size:16px;font-weight:600;margin-bottom:4px">Scarica CSV Addetti alla consegna</div><div style="color:#666;margin-bottom:10px">${ultimo ? 'Ultimo giorno già scaricato: ' + fmt(ultimo) + ' → ti propongo di ripartire dal ' + fmt(daDef) : 'Primo utilizzo: scegli le date'}</div>
      <label style="display:block;margin:6px 0">Dal giorno <input type="date" id="bmDa" value="${daDef}" max="${ieri}" style="margin-left:8px;padding:4px"></label>
      <label style="display:block;margin:6px 0">Al giorno &nbsp;<input type="date" id="bmA" value="${ieri}" max="${ieri}" style="margin-left:8px;padding:4px"></label>
      <div style="margin:10px 0 4px">Station</div>
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:4px 10px">${TUTTE.map(x => `<label><input type="checkbox" class="bmSt" value="${x}" checked> ${x}</label>`).join('')}</div>
      <div style="margin-top:14px;display:flex;gap:8px;justify-content:flex-end"><button id="bmNo" style="padding:6px 12px">Annulla</button><button id="bmOk" style="padding:6px 14px;background:#1d4ed8;color:#fff;border:0;border-radius:6px;font-weight:600">Scarica</button></div>
      <div id="bmErr" style="color:#b00;margin-top:8px"></div></div>`;
    document.body.appendChild(ov);
    ov.querySelector('#bmNo').onclick = () => { ov.remove(); res(null); };
    ov.querySelector('#bmOk').onclick = () => {
      const da = ov.querySelector('#bmDa').value, a = ov.querySelector('#bmA').value;
      const st = [...ov.querySelectorAll('.bmSt:checked')].map(c => c.value);
      if (!da || !a || da > a) { ov.querySelector('#bmErr').textContent = 'Controlla le date (dal <= al)'; return; }
      if (!st.length) { ov.querySelector('#bmErr').textContent = 'Scegli almeno una station'; return; }
      ov.remove(); res({ da, a, st });
    };
  });
  if (!scelta) return;
  const da = scelta.da, a_ = scelta.a, STATIONS = scelta.st;
  const giorni = []; for (let d = new Date(da); iso(d) <= a_; d.setDate(d.getDate() + 1)) giorni.push(iso(d));
  const box = document.createElement('div');
  box.style.cssText = 'position:fixed;top:10px;right:10px;z-index:99999;background:#111;color:#fff;padding:12px 16px;font:14px sans-serif;border-radius:8px;max-width:380px;white-space:pre-line';
  document.body.appendChild(box); const say = t => { box.textContent = t; };
  const H = 'Data,Nome dell’addetto alla consegna,ID addetto alle consegne,Pacchi consegnati,Pacchi spediti,DCR,Pacchi restituiti alla stazione (RTS),Pacchi consegnati non ricevuti (DNR),DPMO DNR,Pacchi restituiti alla stazione (RTS) %,DPMO per restituzione alla stazione';
  async function get(id, st, d) {
    const r = await fetch(`/performance/api/v1/getData?dataSetId=${id}&dsp=PROF&from=${d}&station=${st}&timeFrame=Daily&to=${d}`, { credentials: 'include' });
    if (r.status === 401 || r.status === 403 || r.redirected) throw new Error('SESSIONE');
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const j = await r.json(); const td = j.tableData || {}; const k = Object.keys(td)[0];
    return k ? td[k].rows.map(s => JSON.parse(s)) : [];
  }
  const pct = (v, dec) => (v == null || isNaN(v)) ? '' : (v * 100).toFixed(dec) + '%';
  const num = v => (v == null) ? '' : String(v);
  const q = s => (s == null) ? '' : (/[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s);
  async function csv(st, d) {
    const qual = await get('da_dsp_station_daily_supplemental_quality', st, d);
    if (!qual.length) return null;
    const rts = await get('da_dsp_daily_rts', st, d), psb = await get('da_dsp_daily_psb', st, d);
    const by = new Map();
    for (const o of qual) by.set(o.da_id || o.transporter_id, { ...o });
    for (const o of rts) { const id = o.transporter_id; if (!by.has(id)) by.set(id, { da_id: id, da_name: '' }); by.get(id).rts_csv = o.rts_all; }
    for (const o of psb) { const id = o.transporter_id; if (!by.has(id)) by.set(id, { da_id: id, da_name: '' }); }
    const lines = [H];
    for (const o of by.values()) lines.push([d, q(o.da_name || ''), o.da_id, num(o.delivered), num(o.dispatched), pct(o.delivery_success ?? 0, 2), num(o.rts_csv ?? 0), num(o.dnr), num(o.dnr_dpmo), pct(o.rts_all_percent ?? 0, 2), num(o.rts_dpmo)].join(','));
    return { testo: lines.join('\r\n'), n: qual.length };
  }
  const files = [], vuoti = [], errori = []; let ultimoOk = ''; const tot = STATIONS.length * giorni.length; let k = 0, stop = false;
  for (const st of STATIONS) { if (stop) break; for (const d of giorni) {
    const [y, m, g] = d.split('-'); const nome = `${st}_${g}_${m}_${y.slice(2)}.csv`;
    say(`Scarico ${++k}/${tot}: ${nome}`);
    try {
      const r = await csv(st, d);
      if (!r) { vuoti.push(nome); continue; }
      files.push({ name: nome, data: new TextEncoder().encode('﻿' + r.testo) });
    } catch (e) { if (e.message === 'SESSIONE') { say('Sessione scaduta: rifai il login e rilancia'); stop = true; break; } errori.push(nome + ' (' + e.message + ')'); }
    await new Promise(r => setTimeout(r, 300));
  } }
  if (!files.length) { say('Nessun file scaricato.' + (vuoti.length ? '\nGiorni non ancora pubblicati: ' + vuoti.length : '') + (errori.length ? '\nErrori: ' + errori.join(', ') : '')); return; }
  // --- zip (store) ---
  const crcT = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let j = 0; j < 8; j++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; crcT[n] = c >>> 0; }
  const crc32 = d => { let c = 0xFFFFFFFF; for (let i = 0; i < d.length; i++) c = crcT[(c ^ d[i]) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; };
  const enc = new TextEncoder(), parts = [], cd = []; let off = 0;
  const u16 = v => [v & 255, (v >> 8) & 255], u32 = v => [v & 255, (v >> 8) & 255, (v >> 16) & 255, (v >>> 24) & 255];
  for (const f of files) {
    const n = enc.encode(f.name), c = crc32(f.data), L = f.data.length;
    const lh = new Uint8Array([...u32(0x04034b50), ...u16(20), ...u16(0x0800), ...u16(0), ...u16(0), ...u16(0x5421), ...u32(c), ...u32(L), ...u32(L), ...u16(n.length), ...u16(0)]);
    parts.push(lh, n, f.data);
    cd.push(new Uint8Array([...u32(0x02014b50), ...u16(20), ...u16(20), ...u16(0x0800), ...u16(0), ...u16(0), ...u16(0x5421), ...u32(c), ...u32(L), ...u32(L), ...u16(n.length), ...u16(0), ...u16(0), ...u16(0), ...u16(0), ...u32(0), ...u32(off)]), n);
    off += lh.length + n.length + L;
  }
  const cdStart = off; let cdLen = 0; for (const p of cd) { parts.push(p); cdLen += p.length; }
  parts.push(new Uint8Array([...u32(0x06054b50), ...u16(0), ...u16(0), ...u16(files.length), ...u16(files.length), ...u32(cdLen), ...u32(cdStart), ...u16(0)]));
  const blob = new Blob(parts, { type: 'application/zip' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
  a.download = `flex_${da.replace(/-/g, '')}_${a_.replace(/-/g, '')}.zip`;
  document.body.appendChild(a); a.click(); a.remove();
  try { if (ultimoOk && ultimoOk > ultimo) localStorage.setItem(KEY, ultimoOk); } catch (e) {}
  say(`Fatto: ${files.length} CSV nello zip ${a.download}` + (vuoti.length ? `\nNon ancora pubblicati (${vuoti.length}): ${vuoti.join(', ')}` : '') + (errori.length ? `\nErrori: ${errori.join(', ')}` : '') + `\nProssima volta ti proporrò di partire dal ${fmt((()=>{const n=new Date(ultimoOk||ultimo);n.setDate(n.getDate()+1);return iso(n);})())}.\nChiudi questo riquadro ricaricando la pagina.`);
})();
