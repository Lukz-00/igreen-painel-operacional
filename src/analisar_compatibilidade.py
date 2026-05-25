# -*- coding: utf-8 -*-
"""
Análise de compatibilidade: nova Pagadoria EDP vs React (fatCruzar.js)
Arquivo: Boletos - 2026-05-18T133451.521.xlsx
"""
import sys, unicodedata, re, pandas as pd
from collections import Counter

def norm_key(s):
    return unicodedata.normalize('NFD', str(s or '').lower()).encode('ascii','ignore').decode().strip()

def norm_uc(v):
    d = re.sub(r'[^0-9]', '', str(v or ''))
    if not d: return ''
    stripped = d.lstrip('0')
    return stripped if stripped else '0'

def normalizar_mes(v):
    if not v or str(v).strip() in ('', '—', 'nan', 'NaT', 'None'): return ''
    s = str(v).strip()
    PT = {'JAN':'01','FEV':'02','MAR':'03','ABR':'04','MAI':'05','JUN':'06',
          'JUL':'07','AGO':'08','SET':'09','OUT':'10','NOV':'11','DEZ':'12'}
    m = re.match(r'^([A-Za-z]{3})[/\-.](\d{4})$', s)
    if m:
        k = m.group(1).upper()
        if k in PT: return f"{m.group(2)}-{PT[k]}"
    m = re.match(r'^(\d{4})-(\d{2})(?:-\d{2})?', s)
    if m: return f"{m.group(1)}-{m.group(2)}"
    m = re.match(r'^\d{2}/(\d{2})/(\d{4})', s)
    if m: return f"{m.group(2)}-{m.group(1)}"
    m = re.match(r'^(\d{2})/(\d{4})$', s)
    if m: return f"{m.group(2)}-{m.group(1)}"
    return ''

PAG_FILE = "Boletos - 2026-05-18T133451.521.xlsx"
REC_FILE = "Recebíveis Clientes_21-05-2026_15_05_49.xlsx"

print("=" * 65)
print("ANALISE: Nova Pagadoria EDP vs fatCruzar.js (React)")
print("=" * 65)

df_pag = pd.read_excel(PAG_FILE, sheet_name='Export', dtype=str)
df_rec = pd.read_excel(REC_FILE, sheet_name='Items', dtype=str)
print(f"PAG: {len(df_pag)} linhas | REC: {len(df_rec)} linhas")

# ─── 1. DETECÇÃO DE COLUNAS ───────────────────────────────────────────────────
print("\n" + "─" * 65)
print("1. DETECCAO DE COLUNAS (simula autoDetect do ColumnMapper.jsx)")
print("─" * 65)

# Schema fat_pag conforme ColumnMapper.jsx
SCHEMA_PAG = {
    'instalacao': ['Instalação (Identificador)','Instalação','Instalacao','instalacao','UC','numinstalacao','num_instalacao'],
    'status':     ['Situação do recebimento','Status fatura','StatusFatura','Status','statuspagamentofornecedora'],
    'mes':        ['Mês de referência','Mês','Mes referência','mes_referencia','Data Referencia','mesreferencia'],
    'valor':      ['Valor total (R$)','Valor da Fatura','Valor fatura','Valor','valorapagar'],
    'valor_pago': ['Valor pago pelo cliente (R$)','Valor Pago','valor_pago'],
    'vencimento': ['Vencimento Fatura Norten','Data de vencimento','Vencimento fatura','dtvencimento'],
    'pagto':      ['Data de recebimento','Data de pagamento','Data Pagamento','dtpagamento','Pagto fatura'],
    'codbar':     ['Código de barras','Codigo de barras','CodigoBarras','codigobarra','Codigo Barra Boleto'],
    'link':       ['Link de pagamento','Arquivo do recebimento','Url Boleto','url_boleto','Link Boleto'],
    'id_rec':     ['Recebimento (Identificador)','ID Recebimento','id_recebimento'],
    'cpf':        ['CPF/CNPJ','CPF','cpf','documento'],
    'cliente':    ['Favorecido','Consorciado','Nome','nome_cliente','Cliente'],
}

# Schema fat_rec conforme ColumnMapper.jsx
SCHEMA_REC = {
    'instalacao':  ['Instalacao','Instalação','instalacao','UC','numinstalacao'],
    'status':      ['Status Financeiro Cliente','Status','statuspagamentofornecedora','Status fatura'],
    'mes':         ['Data Referencia','Data Referência','mesreferencia','Mês de referência'],
    'num_cliente': ['Numero Cliente','NumeroCliente','numero_cliente'],
    'cpf':         ['Cpf','CPF','cpf','CPF/CNPJ'],
}

REQUIRED_PAG = ['instalacao', 'status', 'mes']
REQUIRED_REC = ['instalacao', 'status', 'mes']

def auto_detect(headers, aliases):
    for a in aliases:
        k = next((h for h in headers if norm_key(h) == norm_key(a)), None)
        if k: return k
    for a in aliases:
        k = next((h for h in headers if norm_key(a) in norm_key(h)), None)
        if k: return k
    return None

pag_headers = list(df_pag.columns)
rec_headers = list(df_rec.columns)

pag_map = {k: auto_detect(pag_headers, v) for k, v in SCHEMA_PAG.items()}
rec_map = {k: auto_detect(rec_headers, v) for k, v in SCHEMA_REC.items()}

print("\n  PAG (Boletos EDP):")
for k in SCHEMA_PAG:
    req = ' [OBRIGATORIO]' if k in REQUIRED_PAG else ''
    hit = pag_map[k]
    flag = "OK" if hit else ("ERRO" if k in REQUIRED_PAG else "  --")
    print(f"    [{flag}] {k:15s} -> {repr(hit)}{req}")

print("\n  REC (Recebiveis):")
for k in SCHEMA_REC:
    req = ' [OBRIGATORIO]' if k in REQUIRED_REC else ''
    hit = rec_map[k]
    flag = "OK" if hit else ("ERRO" if k in REQUIRED_REC else "  --")
    print(f"    [{flag}] {k:15s} -> {repr(hit)}{req}")

# ─── 2. EXTRAÇÃO DAS COLUNAS MAPEADAS ────────────────────────────────────────
print("\n" + "─" * 65)
print("2. VALORES DAS COLUNAS MAPEADAS (amostras)")
print("─" * 65)

uc_col_pag  = pag_map['instalacao']
mes_col_pag = pag_map['mes']
st_col_pag  = pag_map['status']
uc_col_rec  = rec_map['instalacao']
mes_col_rec = rec_map['mes']
st_col_rec  = rec_map['status']

print(f"\n  PAG UC  [{uc_col_pag}]:  {df_pag[uc_col_pag].dropna().head(5).tolist() if uc_col_pag else 'NAO MAPEADO'}")
print(f"  PAG Mes [{mes_col_pag}]: {df_pag[mes_col_pag].dropna().head(5).tolist() if mes_col_pag else 'NAO MAPEADO'}")
print(f"  PAG Sta [{st_col_pag}]: {df_pag[st_col_pag].value_counts().head(8).to_dict() if st_col_pag else 'NAO MAPEADO'}")

print(f"\n  REC UC  [{uc_col_rec}]:  {df_rec[uc_col_rec].dropna().head(5).tolist() if uc_col_rec else 'NAO MAPEADO'}")
print(f"  REC Mes [{mes_col_rec}]: {df_rec[mes_col_rec].dropna().head(5).tolist() if mes_col_rec else 'NAO MAPEADO'}")
print(f"  REC Sta [{st_col_rec}]: {df_rec[st_col_rec].value_counts().head(8).to_dict() if st_col_rec else 'NAO MAPEADO'}")

# ─── 3. NORMALIZAÇÃO MÊS ─────────────────────────────────────────────────────
print("\n" + "─" * 65)
print("3. NORMALIZACAO DE MES (normalizarMes)")
print("─" * 65)
if mes_col_pag:
    amostras_pag = df_pag[mes_col_pag].dropna().unique()[:8]
    print("  PAG:")
    for v in amostras_pag:
        print(f"    {repr(str(v)):35s} -> {repr(normalizar_mes(v))}")

if mes_col_rec:
    amostras_rec = df_rec[mes_col_rec].dropna().unique()[:5]
    print("  REC:")
    for v in amostras_rec:
        print(f"    {repr(str(v)):35s} -> {repr(normalizar_mes(v))}")

# ─── 4. NORMALIZAÇÃO UC ──────────────────────────────────────────────────────
print("\n" + "─" * 65)
print("4. NORMALIZACAO UC (normUC)")
print("─" * 65)
if uc_col_pag:
    amostras_uc_pag = df_pag[uc_col_pag].dropna().unique()[:5]
    print("  PAG:")
    for v in amostras_uc_pag:
        print(f"    {repr(str(v)):30s} -> {repr(norm_uc(v))}")
if uc_col_rec:
    amostras_uc_rec = df_rec[uc_col_rec].dropna().unique()[:5]
    print("  REC:")
    for v in amostras_uc_rec:
        print(f"    {repr(str(v)):30s} -> {repr(norm_uc(v))}")

# ─── 5. SIMULACAO DO JOIN ─────────────────────────────────────────────────────
print("\n" + "─" * 65)
print("5. SIMULACAO DO CASCADE JOIN")
print("─" * 65)

if uc_col_pag and mes_col_pag and uc_col_rec and mes_col_rec:
    pag_keys = set()
    for _, row in df_pag.iterrows():
        uc = norm_uc(row.get(uc_col_pag, ''))
        mes = normalizar_mes(row.get(mes_col_pag, ''))
        if uc and mes:
            pag_keys.add(f"{uc}|{mes}")

    rec_keys = set()
    for _, row in df_rec.iterrows():
        uc = norm_uc(row.get(uc_col_rec, ''))
        mes = normalizar_mes(row.get(mes_col_rec, ''))
        if uc and mes:
            rec_keys.add(f"{uc}|{mes}")

    matches = pag_keys & rec_keys
    so_pag  = pag_keys - rec_keys
    so_rec  = rec_keys - pag_keys

    print(f"  PAG chaves validas:  {len(pag_keys):>7,}")
    print(f"  REC chaves validas:  {len(rec_keys):>7,}")
    print(f"  MATCHES (UC+Mes):    {len(matches):>7,}")
    print(f"  So na PAG:           {len(so_pag):>7,}")
    print(f"  So no REC:           {len(so_rec):>7,}")

    # Sample dos matches
    if matches:
        sample = list(matches)[:5]
        print(f"\n  Amostra de matches:")
        for k in sample:
            print(f"    {k}")
    if so_pag:
        sample = list(so_pag)[:5]
        print(f"\n  Amostra so na PAG (sem match no REC):")
        for k in sample:
            print(f"    {k}")
else:
    print("  ERRO: colunas obrigatorias nao mapeadas — join impossivel")

# ─── 6. PROBLEMA POTENCIAL: is_northen ───────────────────────────────────────
print("\n" + "─" * 65)
print("6. DETECCAO __ucModeNumCliente (Northen flag no fatCruzar.js)")
print("─" * 65)
# O JS detecta Northen se a coluna contém 'norten' ou 'northen' no nome
northen_cols = [c for c in pag_headers if 'norten' in norm_key(c) or 'northen' in norm_key(c)]
print(f"  Colunas com 'norten/northen' na PAG: {northen_cols}")
print(f"  -> _is_northen sera: {'TRUE - tratamento especial Northen!' if northen_cols else 'FALSE - tratamento padrao'}")

# ─── 7. STATUS VALUES ────────────────────────────────────────────────────────
print("\n" + "─" * 65)
print("7. STATUS VALUES vs statusPag() / statusRec() mapping")
print("─" * 65)
if st_col_pag:
    print(f"\n  PAG status unicos [{st_col_pag}]:")
    for v, cnt in df_pag[st_col_pag].value_counts().items():
        print(f"    {repr(str(v)):35s} x{cnt}")

if st_col_rec:
    print(f"\n  REC status unicos [{st_col_rec}]:")
    for v, cnt in df_rec[st_col_rec].value_counts().items():
        print(f"    {repr(str(v)):35s} x{cnt}")

print("\n" + "=" * 65)
print("ANALISE CONCLUIDA")
print("=" * 65)
