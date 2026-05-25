# -*- coding: utf-8 -*-
import sys
import pandas as pd
import unicodedata

def norm(s):
    return unicodedata.normalize('NFD', str(s or '').lower()).encode('ascii','ignore').decode().strip()

PAG_FILE = "Boletos - 2026-05-18T133451.521.xlsx"
REC_FILE = "Recebíveis Clientes_21-05-2026_15_05_49.xlsx"

KEY_TERMS = ['instal','uc','mes','refer','status','situa','vencim','valor','pagto','receb','cpf','nome','cliente','codigo']

print("=" * 60)
print("=== NOVA PAGADORIA:", PAG_FILE)
print("=" * 60)
wb = pd.read_excel(PAG_FILE, sheet_name=None, nrows=0)
print("Abas:", list(wb.keys()))
for sh in wb.keys():
    df = pd.read_excel(PAG_FILE, sheet_name=sh, dtype=str)
    print(f"\n  [{sh}] {len(df)} linhas | {len(df.columns)} colunas")
    print(f"  Todas as colunas: {list(df.columns)}")
    print("  --- Amostras de colunas-chave ---")
    for col in df.columns:
        nc = norm(col)
        if any(x in nc for x in KEY_TERMS):
            vals = df[col].dropna().head(3).tolist()
            print(f"    {repr(col):45s} -> {vals}")

print()
print("=" * 60)
print("=== NOVO RECEBÍVEIS:", REC_FILE)
print("=" * 60)
wb2 = pd.read_excel(REC_FILE, sheet_name=None, nrows=0)
print("Abas:", list(wb2.keys()))
for sh in wb2.keys():
    df2 = pd.read_excel(REC_FILE, sheet_name=sh, dtype=str)
    print(f"\n  [{sh}] {len(df2)} linhas | {len(df2.columns)} colunas")
    print(f"  Todas as colunas: {list(df2.columns)}")
    print("  --- Amostras de colunas-chave ---")
    for col in df2.columns:
        nc = norm(col)
        if any(x in nc for x in KEY_TERMS):
            vals = df2[col].dropna().head(3).tolist()
            print(f"    {repr(col):45s} -> {vals}")
    # Mostrar status
    for col in df2.columns:
        if 'status' in norm(col):
            print(f"\n  Status [{col}]:", df2[col].value_counts().head(8).to_dict())
