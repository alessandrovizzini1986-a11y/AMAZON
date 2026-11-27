#!/usr/bin/env python3
"""Toglie dai cedolini (LUL Zucchetti: SIC e STD dell'agenzia) i dati che non servono a chi li riceve.

Il testo viene tolto davvero dal PDF (non solo coperto da un riquadro nero): non si può più copiare né cercare.

Cosa sparisce
  Pagina del calendario: matricola, indirizzo di casa, codice fiscale, P.A.T. INAIL, permessi legge 104 e sindacali.
  Cedolino: codice fiscale, data di nascita, IBAN e banca, contributi e imponibili previdenziali (IPP, INPS, EBILOG,
  imponibile INAIL), addizionali regionale e comunale con il comune, retribuzione utile e quota TFR, TFR versato a un
  fondo pensione, tutte le trattenute sul netto (sindacato, pignoramenti, cessione del quinto, multe, recuperi),
  permessi sindacali, permessi e congedi legge 104, percentuale di part time, e in fondo i totali delle trattenute.
Cosa resta: nome, qualifica, date di assunzione, voci retributive, ore, malattia, ferie e permessi, IRPEF, netto.

Uso
  python3 scripts/pulisci_cedolini.py USCITA.pdf ENTRATA.pdf [--togli-cf CODICEFISCALE ...]
  --togli-cf  elimina tutte le pagine (calendario e cedolino) di quella persona.
Richiede PyMuPDF (pip install pymupdf). Stampa quante righe ha tolto per tipo, per un controllo a occhio.
"""
import re
import sys
import collections

import pymupdf

CF = re.compile(r"^[A-Z]{6}\d{2}[A-Z]\d{2}[A-Z]\d{3}[A-Z]$")
DATA = re.compile(r"^\d\d/\d\d/\d{4}$")
# voci del cedolino da togliere: contributi, addizionali, TFR, trattenute sul netto, legge 104
VOCE_VIA = re.compile(
    r"^(EBI|IPP|001|002|005|035|124|TFR100|TFR200|W0900|W1100|TN\w+|CN\w+|FA\w*|PIH\w+|PXR19[56]|PXH\w+"
    # cedolini dell'agenzia (STD): contributi, TFR, fondi, trattenute, multe e danni, conguagli del 730
    r"|006\w*|152|WRETR|TF140|AD1\w*|750010|706302|703108|090003|00597[56]|00633[45]|007918|704074|80010\d|002010|L\d{4})$")
# voci da togliere per descrizione, qualunque sia il codice: sindacato e fondo pensione scelto
DESCR_VIA = re.compile(r"(?i)sindacal|priamo|pension|fondo previd|\bTFR a \b|fondo arti|^\S+ (TRATTEN|TRATT\.|INFRAZ)|pignor|cessione|FONTE$|FONDO S")
# giustificativi del calendario da togliere: permessi legge 104 (PH, CD = congedo straordinario) e permessi sindacali (PS)
GIUST_VIA = {"PH", "PHG", "PHC", "CD", "PS"}
SEZIONI = re.compile(r"^(VOCI RETRIBUTIVE|TRATTENUTE PREVIDENZIALI|IMPOSTA SUL|ADDIZIONALI|RATEI$|NOTE DESCRIZIONE|FERIE Res|FerAgg|R\.O\.L\.|ExFEST|B\.ORE|SCATTI|Ass\. contr|GG Detr)")


def righe(pagina):
    """Parole della pagina raggruppate per riga (stessa altezza), da sinistra a destra."""
    out = collections.defaultdict(list)
    for x0, y0, x1, y1, t, *_ in pagina.get_text("words"):
        out[round(y0 / 3)].append((x0, y0, x1, y1, t))
    return [sorted(v) for _, v in sorted(out.items())]


def testo(r):
    return " ".join(w[4] for w in r)


def fascia(y0, y1):
    """Fascia verticale stretta al centro della riga: il riquadro non deve toccare le lettere delle righe vicine,
    perché la pulizia toglie ogni carattere che il riquadro sfiora."""
    m = (y0 + y1) / 2
    return m - 2.2, m + 2.2


def box(parole, margine=1.5):
    y0, y1 = fascia(min(w[1] for w in parole), max(w[3] for w in parole)) if max(w[3] for w in parole) - min(w[1] for w in parole) < 16 else (min(w[1] for w in parole), max(w[3] for w in parole))
    return pymupdf.Rect(min(w[0] for w in parole) - margine, y0, max(w[2] for w in parole) + margine, y1)


def riga_intera(r, larghezza):
    y0, y1 = fascia(r[0][1], r[0][3])
    return pymupdf.Rect(20, y0, larghezza - 20, y1)


def norm(t):
    """Solo lettere e cifre: le etichette del modulo hanno spazi speciali o lettere spaziate."""
    return re.sub(r"[^A-Za-z0-9]", "", t)


def etichetta(rr, *parole):
    """Prima riga che contiene in sequenza le parole date (anche unite in una parola sola con spazi speciali):
    restituisce (riga, indice della prima parola)."""
    cerca = re.compile(".{0,2}".join(re.escape(x) for x in parole))  # nel calendario le parole sono unite da un carattere speciale
    for r in rr:
        t = [w[4] for w in r]
        for i in range(len(t) - len(parole) + 1):
            if t[i:i + len(parole)] == list(parole):
                return r, i
        for i, w in enumerate(t):
            if cerca.match(w):
                return r, i
    return None, None


def calendario(pagina, rr, conta):
    via = []
    lab, ilab = etichetta(rr, "COGNOME", "NOME")
    per, _ = etichetta(rr, "PERIODO", "DI", "RIFERIMENTO")
    if lab and per:
        x_min = lab[ilab][0] - 12
        blocco = [r for r in rr if lab[0][1] + 5 < r[0][1] < per[0][1] - 5 and any(w[0] >= x_min for w in r)]
        blocco = [[w for w in r if w[0] >= x_min] for r in blocco]
        for i, r in enumerate(blocco):
            if i == 1 and "/" not in testo(r):
                continue  # la seconda riga è il nome: resta
            via.append(box(r)); conta["calendario: matricola e indirizzo"] += 1
    cf, i = etichetta(rr, "CODICE", "FISCALE")
    if cf:
        y = cf[i][3]
        for r in rr:
            p = [w for w in r if y - 2 < w[1] < y + 16 and w[0] >= cf[i][0] - 5 and (CF.match(w[4]) or re.match(r"^\d{6,}/\d\d$", w[4]))]
            p = p or [w for w in r if CF.match(w[4])]
            if p:
                via.append(box(p)); conta["calendario: codice fiscale e PAT"] += 1
    for r in rr:
        for j, w in enumerate(r):
            if w[4] in GIUST_VIA:
                # nella griglia: sigla + ore; nella legenda: sigla + descrizione + quantità (fino alla sigla dopo)
                fine = j + 1
                while fine < len(r) and not re.fullmatch(r"[A-Z]{2,4}\d?", r[fine][4]) and r[fine][0] - r[fine - 1][2] < 60:
                    fine += 1
                via.append(box(r[j:fine])); conta["calendario: permessi 104"] += 1
    return via


def cedolino(pagina, rr, conta, aperta=False):
    """`aperta`: la pagina prima finiva con una voce da togliere, le prime righe rientrate ne sono il seguito
    (es. il comune dell'addizionale finito a pagina nuova). Restituisce anche lo stato a fine pagina."""
    via = []
    larghezza = pagina.rect.width
    for r in rr:
        for w in r:
            if CF.match(w[4]):
                via.append(box([w])); conta["cedolino: codice fiscale"] += 1
    nas, i = etichetta(rr, "DATA", "NASCITA")
    ass, j = etichetta(rr, "DATA", "ASSUNZIONE")
    if nas and ass:
        for r in rr:
            p = [w for w in r if nas[i][3] - 2 < w[1] < nas[i][3] + 16 and w[2] < ass[j][0] + 2 and DATA.match(w[4])]
            if p:
                via.append(box(p)); conta["cedolino: data di nascita"] += 1
    for r in rr:
        t = [w[4] for w in r]
        if "P-T" in t:
            k = t.index("P-T")
            p = r[max(0, k - 1):k + 3]
            via.append(box(p)); conta["cedolino: percentuale part time"] += 1
    # voci: la riga con il codice e le righe di continuazione senza codice (es. il comune dell'addizionale)
    note, _ = etichetta(rr, "NOTE", "DESCRIZIONE")
    y_note = note[0][1] if note else 1e9
    elem = next((r for r in rr if "ELEMENTIDELLARETRIBUZIONE" in norm(testo(r))), None)
    y_voci = elem[0][1] if elem else 0
    for r in rr:
        y = r[0][1]
        if not (y_voci + 56 < y < y_note - 3):  # sopra c'è ancora il riquadro TOTALE degli elementi della retribuzione
            continue
        t = testo(r)
        primo = r[0][4]
        if SEZIONI.match(t) or r[0][0] > 200:
            aperta = False
            continue
        codice = r[0][0] < 40  # i codici voce stanno nella prima colonna; le righe di continuazione sono rientrate
        if codice and re.fullmatch(r"[A-Z0-9]{3,7}", primo):
            aperta = bool(VOCE_VIA.match(primo) or DESCR_VIA.search(t))
        elif t.startswith("Imponibile Inail"):
            via.append(riga_intera(r, larghezza)); conta["cedolino: imponibile INAIL"] += 1
            aperta = False
            continue
        elif codice:
            aperta = bool(DESCR_VIA.search(t))
        if aperta:
            via.append(riga_intera(r, larghezza)); conta["cedolino: voci (contributi, addizionali, TFR, trattenute, 104)"] += 1
    aperta_fine = aperta
    # riquadro NOTE: IBAN, banca, filiale
    tfr, _ = etichetta(rr, "T.F.R.", "IMPORTO")
    desc = next((w for w in (note or []) if norm(w[4]).startswith("DESCRIZIONE")), None)
    if note and tfr and desc:
        for r in rr:
            p = [w for w in r if note[0][1] + 4 < w[1] < tfr[0][1] - 2 and w[2] < desc[0] - 3]
            if p:
                via.append(box(p)); conta["cedolino: IBAN e banca"] += 1
    # totali delle trattenute in fondo
    tot, _ = etichetta(rr, "TOT", "TRATTENUTE", "PREV./FISC.")
    if tot:
        t = [w[4] for w in tot]
        inizio = []  # x di inizio di ogni casella della riga dei totali
        for k, w in enumerate(tot):
            if w[4] == "TOT" or (w[4] == "TRATTENUTE" and (k == 0 or t[k - 1] != "TOT")) or w[4] == "ARROT.":
                inizio.append((w[0], " ".join(t[k:k + 3])))
        inizio.sort()
        celle = [(x, inizio[n + 1][0] if n + 1 < len(inizio) else larghezza, nome) for n, (x, nome) in enumerate(inizio)]
        da_togliere = [(a, b) for a, b, nome in celle if nome.startswith("TOT TRATTENUTE") or nome.startswith("TRATTENUTE SUL NETTO")]
        for r in rr:
            p = [w for w in r if tot[0][3] + 1 < w[1] < tot[0][3] + 14 and re.fullmatch(r"-?[\d.]+,\d\d-?", w[4]) and any(a - 4 <= (w[0] + w[2]) / 2 < b - 4 for a, b in da_togliere)]
            if p:
                for w in p:
                    via.append(box([w]))
                conta["cedolino: totali trattenute"] += 1
    return via, aperta_fine


def pulisci(entrata, uscita, togli_cf=()):
    doc = pymupdf.open(entrata)
    conta = collections.Counter()
    togli = {c.upper() for c in togli_cf}
    da_eliminare = []
    stato, cf_prima = False, None
    for n, pagina in enumerate(doc):
        rr = righe(pagina)
        parole = {w[4] for r in rr for w in r}
        if togli and parole & togli:
            da_eliminare.append(n); continue
        if not rr:
            continue
        if "GIUSTIFICATIVI" in parole and "TIMBRATURE" in parole:
            via = calendario(pagina, rr, conta)
        elif any("ELEMENTIDELLARETRIBUZIONE" in norm(testo(r)) for r in rr):
            cf_pagina = next((w for w in parole if CF.match(w)), None)
            via, stato = cedolino(pagina, rr, conta, stato if cf_pagina == cf_prima else False)
            cf_prima = cf_pagina
        else:
            conta["pagine non riconosciute (lasciate come sono)"] += 1
            continue
        for rett in via:
            pagina.add_redact_annot(rett & pagina.rect)
        # toglie il testo sotto i riquadri; la grafica del modulo resta
        pagina.apply_redactions(images=pymupdf.PDF_REDACT_IMAGE_NONE, graphics=pymupdf.PDF_REDACT_LINE_ART_NONE)
        # poi il riquadro nero, alto quanto la riga, così si vede dove è stato tolto qualcosa
        for rett in via:
            pagina.draw_rect(pymupdf.Rect(rett.x0, rett.y0 - 3.2, rett.x1, rett.y1 + 3.2) & pagina.rect, color=None, fill=(0, 0, 0))
    if da_eliminare:
        doc.delete_pages(da_eliminare)
        conta["pagine eliminate (--togli-cf)"] = len(da_eliminare)
    doc.set_metadata({})
    doc.save(uscita, garbage=4, deflate=True)
    return conta, len(doc)


if __name__ == "__main__":
    arg = sys.argv[1:]
    cf = []
    while "--togli-cf" in arg:
        i = arg.index("--togli-cf"); cf.append(arg[i + 1]); del arg[i:i + 2]
    if len(arg) != 2:
        sys.exit(__doc__)
    conta, pagine = pulisci(arg[1], arg[0], cf)
    print(f"{arg[1].split('/')[-1]}: {pagine} pagine")
    for k, v in sorted(conta.items()):
        print(f"  {v:5d}  {k}")
