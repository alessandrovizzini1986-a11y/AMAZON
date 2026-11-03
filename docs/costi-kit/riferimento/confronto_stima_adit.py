"""Confronto STD: Stima_Costo_personale (riga 5 TOT. COSTO STD) vs fatture ADIT CDC 5569.
Uso: python confronto_stima_adit.py <cartella con Stima_Costo_personale.xlsx + *Doc._emessi_ADIT*.xlsx> <out.xlsx>
Regole: CDC 5569, esclusa Sara Sacchetti, voce = mappa InvoiceDescription, costo = NoTaxableIncome.
"""
import sys, glob, os, re
import pandas as pd, numpy as np, openpyxl
from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill, Alignment
from openpyxl.utils import get_column_letter as gl, column_index_from_string as ci

src, out = sys.argv[1], sys.argv[2]
MESI = {'01':'Gen','02':'Feb','03':'Mar','04':'Apr','05':'Mag','06':'Giu','07':'Lug','08':'Ago','09':'Set','10':'Ott','11':'Nov','12':'Dic'}
SHEET = {'01':'GEN','02':'FEB','03':'MAR','04':'APR','05':'MAG','06':'GIU','07':'LUG','08':'AUG','09':'SEP','10':'OTT','11':'NOV','12':'DIC'}
STCOL = {'DER1':'G','DER2':'L','DLO2':'Q','DLO4':'V','DLO5':'AA','DLZ2':'AF','DVN1':'AK'}
FEST = {'01':2,'02':0,'03':0,'04':2,'05':1,'06':1,'07':0,'08':1,'09':0,'10':0,'11':0,'12':3}  # festività infrasettimanali 2026
RATE_ADIT = {'STANDARD':20.86,'MAGG50':28.56,'SUPP18':18.25,'STR30':20.11,'STR65':25.52,'SUPP65':25.52}
VM = {'Standard STD':'STANDARD','STR STD 30%':'STR30','SUPP STD 18%':'SUPP18','MAGG STD 50%':'MAGG50','STR STD 65%':'STR65','SUPP 65%':'SUPP65','TRASFERTA ':'TRASFERTA','TRASFERTA DOM':'TRASFERTA'}
CORE = ['STANDARD','MAGG50','SUPP18','STR30','STR65','SUPP65','TRASFERTA']
NM = ['FESTIVITA','FERIE_PERM_GOD','CARENZA','CTRB_DIGNITA','INTEGR_MOG','ALTRO','RIVAL_RATEI']

def voce(s):
    s=str(s); l=s.lower()
    if s=='Stipendio': return 'STANDARD'
    if 'maggiorazion' in l: return 'MAGG50'
    if s=='Supplementare 18%': return 'SUPP18'
    if s=='Straordinario 30%': return 'STR30'
    if 'straordinario' in l and '65' in l: return 'STR65'
    if s=='Trasferta esente': return 'TRASFERTA'
    if 'festivit' in l: return 'FESTIVITA'
    if 'decr. dignit' in l: return 'CTRB_DIGNITA'
    if s.startswith(('FER','PERM','EXFS','MPER')): return 'FERIE_PERM_GOD'
    if 'carenza' in l or '1inf' in l: return 'CARENZA'
    if 'rivalutazione' in l: return 'RIVAL_RATEI'
    if 'mog' in l: return 'INTEGR_MOG'
    return 'ALTRO'

# ---- ADIT
frames=[]
seen=set()
for f in sorted(glob.glob(os.path.join(src,'*Doc._emessi_ADIT*.xlsx'))):
    mk=re.search(r'(\d{2})(\d{2})_Doc', os.path.basename(f))
    key=mk.group(1)+mk.group(2)  # MMAA
    if key in seen: continue  # duplicato stesso mese
    seen.add(key)
    x=pd.ExcelFile(f); sh=[s for s in x.sheet_names if s.lower().startswith('estraz')][0]
    d=x.parse(sh,header=None)
    hr=[i for i in range(10) if 'MeseCompetenza' in d.iloc[i].astype(str).tolist()][0]
    d.columns=[str(c) for c in d.iloc[hr]]; d=d.iloc[hr+1:]
    d=d.loc[:,~d.columns.str.startswith('nan')]
    d['mm']=key[:2]; frames.append(d)
a=pd.concat(frames,ignore_index=True)
for c in ['Quantity','NoTaxableIncome','Cost']: a[c]=pd.to_numeric(a[c],errors='coerce')
a=a[(a.CDC==5569)&~(a.Asurname.astype(str).str.contains('Sacchetti')&a.Aname.astype(str).str.contains('Sara'))].copy()
a['voce']=a.InvoiceDescription.map(voce)
a['st']=a['STATION/PLANT/PV'].astype(str)
a['comp']=a.MeseCompetenza.astype(str).str[5:7]
a['residuo']=a.comp!=a.mm
mesi=sorted(a.mm.unique())

# ---- STIMA
wb=openpyxl.load_workbook(os.path.join(src,'Stima_Costo_personale.xlsx'),data_only=True)
rows=[]
for mm in mesi:
    sn=[s for s in wb.sheetnames if s.strip()==f'AMZ_{SHEET[mm]}_26']
    if not sn: print('manca foglio',mm); continue
    ws=wb[sn[0]]
    for st,c in STCOL.items():
        b=ci(c)
        for r in range(22,30):
            lab=ws.cell(r,2).value
            if lab in VM:
                rows.append(dict(mm=mm,st=st,voce=VM[lab],h_stima=ws.cell(r,b+1).value or 0,c_stima=ws.cell(r,b+3).value or 0))
        rows.append(dict(mm=mm,st=st,voce='_TOT',h_stima=0,c_stima=ws.cell(5,b).value or 0))
e=pd.DataFrame(rows).groupby(['mm','st','voce'])[['h_stima','c_stima']].sum()
ad=a.groupby(['mm','st','voce']).agg(q_adit=('Quantity','sum'),c_adit=('NoTaxableIncome','sum'),teste=('CodFiscale','nunique'))
c=pd.concat([e,ad],axis=1).fillna(0); c['dc']=c.c_stima-c.c_adit
tot_st=c[c.index.get_level_values('voce')=='_TOT'].reset_index()[['mm','st','c_stima']].rename(columns={'c_stima':'stima'}).set_index(['mm','st'])
tot_st['adit']=a.groupby(['mm','st']).NoTaxableIncome.sum()
tot_st=tot_st.fillna(0); tot_st['delta']=tot_st.stima-tot_st.adit
c=c[c.index.get_level_values('voce')!='_TOT'].reset_index()
teste=a[a.voce=='STANDARD'].groupby(['mm','st']).CodFiscale.nunique()

# ---- waterfall
res=a[a.residuo].groupby('mm').NoTaxableIncome.sum()
W=[]
for mm,g in c.groupby('mm'):
    d=dict(mm=mm)
    hv=g[g.voce.isin(RATE_ADIT)].copy()
    hv['rate_stima']=np.where(hv.h_stima>0, hv.c_stima/hv.h_stima.replace(0,np.nan), 0)
    d['tariffe']=(hv.h_stima*(hv.rate_stima-hv.voce.map(RATE_ADIT))).sum()
    hv['eff']=(hv.h_stima-hv.q_adit)*hv.voce.map(RATE_ADIT)
    an=hv[abs(hv.eff)>3000]
    d['ore_anom']=an.eff.sum(); d['ore_resto']=hv.eff.sum()-an.eff.sum()
    tr=g[g.voce=='TRASFERTA']; tre=tr.c_stima-tr.c_adit
    d['tr_anom']=tre[abs(tre)>3000].sum(); d['tr_resto']=tre[abs(tre)<=3000].sum()
    d['non_mod']=-g[~g.voce.isin(CORE)].c_adit.sum()
    d['residui']=float(res.get(mm,0))
    d['anom']='; '.join(f"{r.st} {r.voce} {r.h_stima:.0f}h vs {r.q_adit:.0f}h ({r.eff/1000:+.0f}k€)" for r in an.itertuples())
    d['anom']+=(' | ' if d['anom'] else '')+'; '.join(f"{r.st} trasferta {r.h_stima:.0f}gg {r.c_stima/1000:.0f}k€ vs {r.c_adit/1000:.0f}k€ ({(r.c_stima-r.c_adit)/1000:+.0f}k€)" for r in tr[abs(tr.c_stima-tr.c_adit)>3000].itertuples())
    W.append(d)
W=pd.DataFrame(W).set_index('mm')

# ---- Excel
H=Font(bold=True,color='FFFFFF'); HF=PatternFill('solid',fgColor='1F4E78'); Y=PatternFill('solid',fgColor='FFF2CC'); R=PatternFill('solid',fgColor='F8CBAD')
def hdr(ws,row,cols):
    for i,cn in enumerate(cols,1):
        x=ws.cell(row,i,cn); x.font=H; x.fill=HF; x.alignment=Alignment(wrap_text=True,vertical='center')
def autow(ws,w=14):
    for i in range(1,ws.max_column+1): ws.column_dimensions[gl(i)].width=w
out_wb=Workbook()
# DWH
ws=out_wb.active; ws.title='DWH_ADIT'
cols=['mm','MeseCompetenza','st','CodFiscale','Asurname','Aname','Full/Part','Percentuale','InvoiceDescription','voce','Quantity','Cost','NoTaxableIncome','InvoiceNumber','Progetto OF','residuo']
hdr(ws,1,['Mese_fattura','MeseCompetenza','Station','CF','Cognome','Nome','FT/PT','%PT','InvoiceDescription','Voce','Quantity','Cost','NoTaxableIncome','Fattura','Progetto OF','Residuo altro mese'])
d=a[cols].copy(); d['mm']=d.mm.map(MESI); d['residuo']=d.residuo.map({True:'SI',False:''})
for r in d.itertuples(index=False): ws.append([None if (isinstance(v,float) and np.isnan(v)) else v for v in r])
ws.freeze_panes='A2'; ws.auto_filter.ref=ws.dimensions; autow(ws,15); n=ws.max_row
# Tariffe
wt=out_wb.create_sheet('Tariffe_ADIT')
voci=['STANDARD','MAGG50','SUPP18','STR30','STR65','TRASFERTA']+NM
wt['A1']='Tariffe €/unità = SUMIFS(NoTaxableIncome)/SUMIFS(Quantity) su DWH_ADIT. TRASFERTA = € medio per persona/mese (Quantity=1 per persona). Da usare come Parametri del modello invece delle tariffe digitate.'
hdr(wt,3,['Mese']+voci+['TOTALE €'])
for i,mm in enumerate(mesi):
    r=4+i; wt.cell(r,1,MESI[mm])
    for j,v in enumerate(voci,2):
        wt.cell(r,j,f'=IFERROR(SUMIFS(DWH_ADIT!$M$2:$M${n},DWH_ADIT!$A$2:$A${n},$A{r},DWH_ADIT!$J$2:$J${n},{gl(j)}$3)/SUMIFS(DWH_ADIT!$K$2:$K${n},DWH_ADIT!$A$2:$A${n},$A{r},DWH_ADIT!$J$2:$J${n},{gl(j)}$3),"")').number_format='#,##0.00'
    wt.cell(r,len(voci)+2,f'=SUMIFS(DWH_ADIT!$M$2:$M${n},DWH_ADIT!$A$2:$A${n},$A{r})').number_format='#,##0'
b=4+len(mesi)+2
wt.cell(b,1,'Costo € per voce'); hdr(wt,b+1,['Mese']+voci+['TOTALE €'])
for i,mm in enumerate(mesi):
    r=b+2+i; wt.cell(r,1,MESI[mm])
    for j,v in enumerate(voci,2):
        wt.cell(r,j,f'=SUMIFS(DWH_ADIT!$M$2:$M${n},DWH_ADIT!$A$2:$A${n},$A{r},DWH_ADIT!$J$2:$J${n},{gl(j)}${b+1})').number_format='#,##0'
    wt.cell(r,len(voci)+2,f'=SUM(B{r}:{gl(len(voci)+1)}{r})').number_format='#,##0'
b2=b+2+len(mesi)+2
wt.cell(b2,1,'Ore / quantità per voce'); hdr(wt,b2+1,['Mese']+voci)
for i,mm in enumerate(mesi):
    r=b2+2+i; wt.cell(r,1,MESI[mm])
    for j,v in enumerate(voci,2):
        wt.cell(r,j,f'=SUMIFS(DWH_ADIT!$K$2:$K${n},DWH_ADIT!$A$2:$A${n},$A{r},DWH_ADIT!$J$2:$J${n},{gl(j)}${b2+1})').number_format='#,##0'
autow(wt,13)
# Sintesi
wsn=out_wb.create_sheet('Sintesi',0)
wsn['A1']='STD: stima (Stima_Costo_personale, riga 5 TOT. COSTO STD per station) vs fattura ADIT CDC 5569 (NoTaxableIncome, esclusa Sara Sacchetti)'; wsn['A1'].font=Font(bold=True,size=12)
hdr(wsn,3,['Mese','Stima STD €','ADIT € (fattura)','di cui residui altri mesi €','Delta €','Delta %','Effetto tariffe €','Ore: anomalie trascrizione €','Ore: scarti minori €','Trasferte: anomalie €','Trasferte: scarti minori €','Voci non modellate €','Anomalie principali (ore stima vs ore ADIT)'])
tm=tot_st.groupby('mm')[['stima','adit']].sum()
for i,mm in enumerate(mesi):
    r=4+i; x=W.loc[mm]
    vals=[MESI[mm],tm.loc[mm,'stima'],tm.loc[mm,'adit'],x.residui,None,None,x.tariffe,x.ore_anom,x.ore_resto,x.tr_anom,x.tr_resto,x.non_mod,x.anom]
    for j,v in enumerate(vals,1): wsn.cell(r,j,v)
    wsn.cell(r,5,f'=B{r}-C{r}'); wsn.cell(r,6,f'=E{r}/C{r}'); wsn.cell(r,6).number_format='0.0%'
    for j in [2,3,4,5,7,8,9,10,11,12]: wsn.cell(r,j).number_format='#,##0'
r=4+len(mesi); wsn.cell(r,1,'TOTALE').font=Font(bold=True)
for j in [2,3,4,5,7,8,9,10,11,12]: wsn.cell(r,j,f'=SUM({gl(j)}4:{gl(j)}{r-1})').number_format='#,##0'
wsn.cell(r,6,f'=E{r}/C{r}').number_format='0.0%'
wsn.cell(r+2,1,'Lettura: Delta ≈ G+H+I+J+K+L (quadratura ±100 € per arrotondamenti). Negativo = stima inferiore alla fattura.')
wsn.cell(r+3,1,'Voci non modellate = festività, ferie/permessi/ExF goduti, carenza malattia/infortunio, CTRB Decr. Dignità, integrazione MOG, rivalutazione ratei, clausola costo lavoro, altro: in fattura ma non nel modello (sempre a sfavore).')
autow(wsn,16); wsn.column_dimensions['M'].width=100
# Delta_station
wd=out_wb.create_sheet('Delta_station',1)
hdr(wd,1,['Mese','Station','Stima STD €','ADIT €','Delta €','Delta %','Teste ADIT (Stipendio)'])
i=2
for (mm,st),rr in tot_st.iterrows():
    wd.cell(i,1,MESI[mm]); wd.cell(i,2,st); wd.cell(i,3,rr.stima); wd.cell(i,4,rr.adit); wd.cell(i,5,f'=C{i}-D{i}'); wd.cell(i,6,f'=IF(D{i}>0,E{i}/D{i},"")'); wd.cell(i,7,int(teste.get((mm,st),0)))
    for j in [3,4,5]: wd.cell(i,j).number_format='#,##0'
    wd.cell(i,6).number_format='0.0%'
    if rr.adit and abs(rr.delta/rr.adit)>0.15:
        for j in range(1,8): wd.cell(i,j).fill=R
    elif rr.adit and abs(rr.delta/rr.adit)>0.08:
        for j in range(1,8): wd.cell(i,j).fill=Y
    i+=1
wd.auto_filter.ref=wd.dimensions; wd.freeze_panes='A2'; autow(wd,14)
# Dettaglio_voce
wv=out_wb.create_sheet('Dettaglio_voce',2)
hdr(wv,1,['Mese','Station','Voce','Ore/gg stima','€ stima','Ore/qtà ADIT','€ ADIT','Teste ADIT','Delta €','Ore stima / ore ADIT','Flag'])
i=2
for rr in c.sort_values(['mm','st','voce']).itertuples():
    vals=[MESI[rr.mm],rr.st,rr.voce,rr.h_stima,rr.c_stima,rr.q_adit,rr.c_adit,rr.teste]
    for j,v in enumerate(vals,1): wv.cell(i,j,v)
    wv.cell(i,9,f'=E{i}-G{i}'); wv.cell(i,10,f'=IF(F{i}>0,D{i}/F{i},"")'); wv.cell(i,10).number_format='0.00'
    flag=''
    if rr.voce in RATE_ADIT and rr.voce!='SUPP65' and rr.q_adit>0 and (rr.h_stima/rr.q_adit>1.15 or rr.h_stima/rr.q_adit<0.85) and abs(rr.dc)>2000: flag='ORE ANOMALE'
    if rr.voce=='TRASFERTA' and abs(rr.dc)>3000: flag='TRASFERTA ANOMALA'
    if rr.voce=='SUPP65' and rr.h_stima>0: flag='voce inesistente in fattura (tutto il 65% è Straordinario a 25,52)'
    if rr.voce not in CORE: flag='non modellata'
    wv.cell(i,11,flag)
    if flag.startswith(('ORE','TRASFERTA')):
        for j in range(1,12): wv.cell(i,j).fill=R
    for j in [4,5,6,7,9]: wv.cell(i,j).number_format='#,##0'
    i+=1
wv.auto_filter.ref=wv.dimensions; wv.freeze_panes='A2'; autow(wv,14); wv.column_dimensions['K'].width=45
# Coeff
wc=out_wb.create_sheet('Coeff_non_modellato',3)
wc['A1']='Voci in fattura assenti dal modello: % sul costo ore ADIT (Standard+Magg50+Supp18+Str30+Str65). Coefficienti di stima finché non si modellano da tracking.'
p=a.pivot_table(index='mm',columns='voce',values='NoTaxableIncome',aggfunc='sum').fillna(0)
for v in NM:
    if v not in p: p[v]=0
base=p[['STANDARD','MAGG50','SUPP18','STR30','STR65']].sum(axis=1)
hdr(wc,3,['Mese','Festività infrasett.','Costo ore ADIT €']+[f'{v} €' for v in NM]+[f'{v} %' for v in NM]+['Tot non modellato %'])
for i,mm in enumerate(mesi):
    r=4+i; wc.cell(r,1,MESI[mm]); wc.cell(r,2,FEST.get(mm,0)); wc.cell(r,3,base[mm]).number_format='#,##0'
    for j,v in enumerate(NM):
        wc.cell(r,4+j,p.loc[mm,v]).number_format='#,##0'
        wc.cell(r,4+len(NM)+j,f'={gl(4+j)}{r}/$C{r}').number_format='0.00%'
    wc.cell(r,4+2*len(NM),f'=SUM({gl(4)}{r}:{gl(3+len(NM))}{r})/C{r}').number_format='0.00%'
r=4+len(mesi)+2; wc.cell(r,1,'Proposta coefficienti / formule').font=Font(bold=True)
props=[('FESTIVITA','≈ 2,3% del costo ore per ogni festività infrasettimanale + ~0,6% base (N-FS non godute). Meglio da tracking: Σ teste × ore giornaliere contrattuali × 20,86 per ogni festività.'),
('FERIE_PERM_GOD','≈ 0,65% del costo ore. Meglio: (ore FERIE + ROL + ExF godute da tracking STD) × 4,63 €/h (è il differenziale rateo, non la paga piena).'),
('CARENZA','≈ 0,9% medio (0,3%-1,9%). Meglio: ore MALATTIA dei primi 3 giorni di ogni evento (da tracking) × 20,84 €/h.'),
('CTRB_DIGNITA','0,13% del costo ore = 0,10 €/h su tutte le ore (Standard+Magg+Supp+Str).'),
('INTEGR_MOG','0,05% medio: deriva dal controllo MOG (teste sotto MOG × ore mancanti × 20,86).'),
('ALTRO','0,2%: clausola costo lavoro (31 righe/mese ≈ 226 €), ASRE, congedi, corsi.'),
('RIVAL_RATEI','una tantum gennaio 2026 (rinnovo CCNL): 0,5%.')]
for i,(v,t) in enumerate(props): wc.cell(r+1+i,1,v); wc.cell(r+1+i,2,t)
autow(wc,14); wc.column_dimensions['B'].width=100
out_wb.save(out); print('scritto',out,'righe DWH',n-1)
print(W.drop(columns='anom').round(0)); print(W.drop(columns='anom').sum().round(0))
print(tm.assign(delta=tm.stima-tm.adit).round(0))
