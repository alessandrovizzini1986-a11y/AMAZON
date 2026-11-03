"""Parser fatture Amazon DSP (PDF scaricati dal portale logistics.amazon.it).

Due template:
  A) "Fattura" settimanale  -> sezione "Dettagli fattura" con righe giornaliere (date dd/mm/yyyy)
  B) "Fattura per conto del fornitore" (incentivi / altri pagamenti) -> "Appendice" (date mm/dd/yyyy)

Ritorna, per ogni PDF, un dict testata + lista righe con le colonne del foglio fatt_2026.
"""
import re
from datetime import date, datetime, timedelta
import pdfplumber
from decimal import Decimal, ROUND_HALF_UP


def r2(x):
    return float(Decimal(str(x)).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP))

RE_NUM = r"-?\s?[\d.]*\d,\d{2}"

RE_A_LINE = re.compile(
    rf"^(\d{{2}}/\d{{2}}/\d{{4}})\s+(.+?)\s+(-?\d+)\s+({RE_NUM})\s+VAT\s*(\d+)\s+(\d+)%\s+({RE_NUM})\s+({RE_NUM})\s*$"
)
RE_B_LINE = re.compile(
    rf"^(\d{{2}}/\d{{2}}/\d{{4}})\s+(\d+)\s+(.+?)\s+(\d+)\s+(\d+)%\s+(-?\d+)\s+({RE_NUM})\s+({RE_NUM})\s*$"
)
RE_DATE_ONLY = re.compile(r"^\d{2}/\d{2}/\d{4}$")
RE_INV = re.compile(r"(INV-[A-Z0-9]+-\d+)")


def to_num(s: str) -> float:
    return float(s.replace(" ", "").replace(".", "").replace(",", "."))


def amazon_week(d: date) -> int:
    """Settimana Amazon (dom-sab) = settimana ISO del lunedì contenuto = ISO week di (d+1g)."""
    return (d + timedelta(days=1)).isocalendar()[1]


def parse_pdf(path: str) -> dict:
    with pdfplumber.open(path) as pdf:
        pages = [p.extract_text() or "" for p in pdf.pages]
    text = "\n".join(pages)
    lines = [l.rstrip() for l in text.splitlines() if l.strip()]

    inv = RE_INV.search(text)
    numero = inv.group(1) if inv else None
    template = "A" if "Dettagli fattura" in text else ("B" if "Appendice" in text else "?")
    tipo_doc = "Nota di credito" if text.lstrip().startswith("Nota di credito") else "Fattura"
    rif_nc = re.search(r"Credit Note for (INV-[A-Z0-9]+-\d+)", text)
    rif_nc = rif_nc.group(1) if rif_nc else None

    # DS: riga successiva a "Indirizzo di consegna:" (A) o a "Fattura a" (B)
    ds = None
    if template == "A":
        for i, l in enumerate(lines):
            if "Indirizzo di consegna" in l:
                ds = lines[i + 1].split()[-1]
                break
    else:
        for i, l in enumerate(lines):
            if l.startswith("Fattura a"):
                ds = lines[i + 1].split()[-1]
                break

    # periodo e data fattura
    per = re.search(r"(\d{2}/\d{2}/\d{4}) a (\d{2}/\d{2}/\d{4})", text)
    datefmt = "%d/%m/%Y" if template == "A" else "%m/%d/%Y"
    periodo_da = datetime.strptime(per.group(1), datefmt).date() if per else None
    periodo_a = datetime.strptime(per.group(2), datefmt).date() if per else None
    df = re.search(r"Data fattura:?\s*\n?\s*(\d{2}/\d{2}/\d{4})", text)
    if not df:  # template B: la data è a fianco della P.IVA
        df = re.search(r"Numero di partita IVA: IT\d+\s+(\d{2}/\d{2}/\d{4})", text)
    data_fattura = datetime.strptime(df.group(1), datefmt).date() if df else None
    tot = re.search(r"Importo dovuto:?\s*({})".format(RE_NUM), text) or re.search(
        r"Importo\s+({})\s*€".format(RE_NUM), text
    )

    importo_dovuto = to_num(tot.group(1)) if tot else None

    righe = []
    if template == "A":
        in_det = False
        cur = None
        for l in lines:
            s = l.strip()
            if s.startswith("Dettagli fattura"):
                in_det = True
                continue
            if not in_det:
                continue
            if s.startswith("Fattura emessa"):
                break
            m = RE_A_LINE.match(s)
            if m:
                d = datetime.strptime(m.group(1), "%d/%m/%Y").date()
                cur = dict(
                    Data=d, Descrizione=m.group(2).strip(), Quantita=int(m.group(3)),
                    Prezzo=to_num(m.group(4)), Tasse=f"VAT {m.group(5)}", Rateo=int(m.group(6)) / 100,
                    ImportoIVA=to_num(m.group(7)), Totale=to_num(m.group(8)),
                )
                righe.append(cur)
                continue
            # righe da ignorare: header tabella, footer pagina
            if (s.startswith("Data ") or s == "IVA" or RE_DATE_ONLY.match(s) or s.startswith("INV-")
                    or s.startswith("Pagina") or s.startswith("Questo documento") or s.startswith("Disclaimer")):
                continue
            # continuazione descrizione
            if cur is not None:
                cur["Descrizione"] = (cur["Descrizione"] + " " + s).strip()
    elif template == "B":
        in_app = False
        for l in lines:
            s = l.strip()
            if s.startswith("Appendice"):
                in_app = True
                continue
            if not in_app:
                continue
            if s.startswith("Totale parziale"):
                break
            m = RE_B_LINE.match(s)
            if not m and righe and not s.startswith("Data "):
                righe[-1]["Descrizione"] = (righe[-1]["Descrizione"] + " " + s).strip()
                continue
            if m:
                d = datetime.strptime(m.group(1), "%m/%d/%Y").date()
                imponibile = to_num(m.group(8))
                iva = r2(imponibile * int(m.group(5)) / 100)
                righe.append(dict(
                    Data=d, Descrizione=m.group(3).strip(), Quantita=int(m.group(6)),
                    Prezzo=to_num(m.group(7)), Tasse=f"VAT {m.group(5)}", Rateo=int(m.group(5)) / 100,
                    ImportoIVA=iva, Totale=round(imponibile + iva, 2), SettimanaPDF=int(m.group(2)),
                ))

    for r in righe:
        r["AVERE"] = round(r["Totale"] - r["ImportoIVA"], 2)
        r["WEEK"] = amazon_week(r["Data"])
        r["MESE"] = r["Data"].month
        r["ANNO"] = r["Data"].year
        r["Numero"] = numero
        r["DS"] = ds

    return dict(
        file=path, numero=numero, template=template, tipo_doc=tipo_doc, rif_nota_credito=rif_nc, ds=ds, data_fattura=data_fattura,
        periodo_da=periodo_da, periodo_a=periodo_a, importo_dovuto=importo_dovuto,
        righe=righe, somma_totale=round(sum(r["Totale"] for r in righe), 2),
        somma_avere=round(sum(r["AVERE"] for r in righe), 2),
    )


if __name__ == "__main__":
    import sys, glob, os
    for f in sorted(glob.glob(os.path.join(sys.argv[1], "*.pdf"))):
        r = parse_pdf(f)
        delta = round((r["importo_dovuto"] or 0) - r["somma_totale"], 2)
        print(f'{os.path.basename(f):42s} {r["template"]} {r["tipo_doc"][:5]} {r["numero"]} {r["ds"]:5s} {r["data_fattura"]} '
              f'{r["periodo_da"]}..{r["periodo_a"]} righe={len(r["righe"]):3d} '
              f'dovuto={r["importo_dovuto"]:>11,.2f} somma={r["somma_totale"]:>11,.2f} delta={delta}')
