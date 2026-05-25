"""
iGreen — Verificador de Status Divergentes
Replica EXATAMENTE a lógica de fatCruzar.js (statusPag, statusRec, ehDivergente, cascadeJoin)
Gera HTML visual com todos os boletos divergentes.
"""

import re
import unicodedata
import pandas as pd
from pathlib import Path
from datetime import datetime

# ─── Configuração ────────────────────────────────────────────────────────────
PAG_FILE = "Boletos - 2026-05-18T133451.521.xlsx"
REC_FILE = "Recebíveis Clientes_21-05-2026_15_05_49.xlsx"
REC_SHEET = "Items"
OUTPUT_HTML = "divergentes_resultado.html"

# ─── Normalização de UC (igual ao normUC do JS) ───────────────────────────────
def norm_uc(v):
    d = re.sub(r'[^0-9]', '', str(v or ''))
    if not d:
        return ''
    stripped = d.lstrip('0')
    return stripped if stripped else '0'

# ─── Normalização de Mês (igual ao normalizarMes do JS) ───────────────────────
def normalizar_mes(v):
    if not v or str(v).strip() in ('', '—', 'nan', 'NaT'):
        return ''
    s = str(v).strip()
    PT = {'JAN':'01','FEV':'02','MAR':'03','ABR':'04','MAI':'05','JUN':'06',
          'JUL':'07','AGO':'08','SET':'09','OUT':'10','NOV':'11','DEZ':'12'}
    # Abreviatura PT: JAN/2025
    m = re.match(r'^([A-Za-z]{3})[/\-.](\d{4})$', s)
    if m:
        k = m.group(1).upper()
        if k in PT:
            return f"{m.group(2)}-{PT[k]}"
    # ISO: 2025-01 ou 2025-01-15
    m = re.match(r'^(\d{4})-(\d{2})(?:-\d{2})?', s)
    if m:
        return f"{m.group(1)}-{m.group(2)}"
    # DD/MM/YYYY
    m = re.match(r'^\d{2}/(\d{2})/(\d{4})', s)
    if m:
        return f"{m.group(2)}-{m.group(1)}"
    # MM/YYYY
    m = re.match(r'^(\d{2})/(\d{4})$', s)
    if m:
        return f"{m.group(2)}-{m.group(1)}"
    return ''

# ─── getField fuzzy (igual ao JS) ─────────────────────────────────────────────
def _norm_key(s):
    return unicodedata.normalize('NFD', str(s or '').lower()).encode('ascii', 'ignore').decode().strip()

def get_field(row, aliases):
    keys = list(row.index) if hasattr(row, 'index') else list(row.keys())
    for alias in aliases:
        n = _norm_key(alias)
        k = next((k for k in keys if _norm_key(k) == n), None)
        if k is None:
            k = next((k for k in keys if n in _norm_key(k)), None)
        if k is not None:
            v = row[k]
            if v is None or (isinstance(v, float) and pd.isna(v)) or str(v).strip() == '':
                return ''
            return str(v).strip()
    return ''

# ─── statusPag (igual ao JS) ──────────────────────────────────────────────────
def status_pag(v):
    u = str(v or '').strip().upper()
    if u in ['PAGO', 'PAGA', 'PAGA JUNTO AO CLIENTE', 'RECEBIDO']:
        return 'PAGO'
    # EDP: Inadimplente / Em atraso = vencido
    if u in ['VENCIDO', 'VENCIDA', 'INADIMPLENTE', 'EM ATRASO']:
        return 'VENCIDO'
    # EDP: Estornada = cancelada
    if u in ['CANCELADO', 'CANCELADA', 'ESTORNADA']:
        return 'CANCELADA'
    # EDP: Regular = boleto em aberto
    if u in ['A VENCER', 'A RECEBER', 'EM ABERTO', 'PENDENTE', 'REGULAR']:
        return 'A RECEBER'
    if u in ['EXPIRADA', 'EXPIRADO']:
        return 'EXPIRADA'
    # EDP: Nao Emitida = calculada
    if u in ['CALCULADA', 'NÃO EMITIDA', 'NAO EMITIDA']:
        return 'CALCULADA'
    # Fallback fuzzy para variações não mapeadas
    u_norm = unicodedata.normalize('NFD', u).encode('ascii', 'ignore').decode()
    if 'PAGA' in u_norm or 'PAGO' in u_norm or 'RECEBIDO' in u_norm:
        return 'PAGO'
    if 'VENCID' in u_norm or 'INADIMPL' in u_norm or 'ATRASO' in u_norm:
        return 'VENCIDO'
    if 'CANCEL' in u_norm or 'ESTORN' in u_norm:
        return 'CANCELADA'
    if 'EXPIR' in u_norm:
        return 'EXPIRADA'
    if 'CALCULAD' in u_norm or 'EMITID' in u_norm:
        return 'CALCULADA'
    if 'VENCER' in u_norm or 'RECEBER' in u_norm or 'ABERTO' in u_norm or 'PENDENTE' in u_norm or 'REGULAR' in u_norm:
        return 'A RECEBER'
    return u or '—'

# ─── statusRec (igual ao JS + extensão para textos GV) ───────────────────────
def status_rec(v):
    u = str(v or '').strip().upper()
    # Mapeamento exato (JS original)
    MAP_EXACT = {
        'PAID': 'PAGO', 'PAGO': 'PAGO', 'PAGA': 'PAGO',
        'BOLETO PAGO': 'PAGO', 'RECEBIDO': 'PAGO',
        'OPEN': 'A RECEBER', 'A VENCER': 'A RECEBER', 'A RECEBER': 'A RECEBER',
        'PENDENTE': 'A RECEBER', 'EM ABERTO': 'A RECEBER',
        'BOLETO DISPONIVEL': 'A RECEBER', 'BOLETO DISPONÍVEL': 'A RECEBER',
        'OVERDUE': 'VENCIDO', 'VENCIDO': 'VENCIDO', 'VENCIDA': 'VENCIDO',
        'CANCELLED': 'CANCELADA', 'CANCELADO': 'CANCELADA', 'CANCELADA': 'CANCELADA',
        'EXPIRED': 'EXPIRADA', 'EXPIRADA': 'EXPIRADA', 'EXPIRADO': 'EXPIRADA',
        'CALCULATED': 'CALCULADA', 'CALCULADA': 'CALCULADA',
    }
    if u in MAP_EXACT:
        return MAP_EXACT[u]
    # Mapeamento por substrings para textos descritivos do GV
    # Normaliza retirando acentos para comparação
    u_norm = unicodedata.normalize('NFD', u).encode('ascii', 'ignore').decode()
    if 'PAGO' in u_norm or 'PAID' in u_norm or 'RECEBIDO' in u_norm:
        return 'PAGO'
    if 'VENCEU' in u_norm or 'VENCIDO' in u_norm or 'VENCIDA' in u_norm or 'OVERDUE' in u_norm:
        return 'VENCIDO'
    if 'DISPONIVEL' in u_norm or 'DISPONÍVEL' in u_norm or 'A VENCER' in u_norm or 'OPEN' in u_norm:
        return 'A RECEBER'
    if 'CANCEL' in u_norm:
        return 'CANCELADA'
    if 'EXPIR' in u_norm:
        return 'EXPIRADA'
    if 'CALCULAD' in u_norm:
        return 'CALCULADA'
    return u or '—'

# ─── ehDivergente (igual ao JS) ───────────────────────────────────────────────
GRUPOS = [
    {'PAGO'},
    {'VENCIDO', 'VENCIDA', 'OVERDUE'},
    {'A RECEBER', 'A VENCER', 'OPEN', 'PENDENTE'},
    {'CANCELADA', 'CANCELLED'},
    {'EXPIRADA', 'EXPIRED'},
    {'CALCULADA'},
]

def eh_divergente(sp, sr):
    if not sp or not sr or sp == '—' or sr == '—':
        return False
    ga = next((i for i, g in enumerate(GRUPOS) if sp in g), -1)
    gb = next((i for i, g in enumerate(GRUPOS) if sr in g), -1)
    return ga != -1 and gb != -1 and ga != gb

# ─── Extrair Pagadoria ────────────────────────────────────────────────────────
def extrair_pag(row):
    uc_raw = get_field(row, [
        'Instalacao', 'Instalação', 'instalacao', 'instalação',
        'Instalação (Identificador)', 'num_instalacao', 'NumInstalacao',
        'numinstalacao', 'UC',
    ])
    mes_raw = get_field(row, [
        'Mes referência', 'Mês de referência', 'Mês', 'Mes Referencia',
        'Data Referencia', 'Data Referência', 'DataReferencia',
        'mes_referencia', 'MesReferencia', 'mesreferencia',
    ])
    return {
        '_uc_norm': norm_uc(uc_raw),
        '_mes_norm': normalizar_mes(mes_raw),
        'uc_raw': uc_raw,
        'mes_raw': mes_raw,
        'status_raw': get_field(row, [
            'Status fatura', 'Situação do recebimento', 'Situacao do recebimento',
            'Status', 'StatusFatura', 'statuspagamentofornecedora',
        ]),
        'favorecido': get_field(row, ['Favorecido', 'nome_cliente', 'Nome', 'Cliente']),
        'consorciado': get_field(row, ['Consorciado', 'nome_cliente', 'Nome', 'Cliente']),
        'valor': get_field(row, ['Valor fatura', 'Valor total (R$)', 'Valor da Fatura', 'Valor', 'valorapagar']),
        'venc': get_field(row, ['Vencimento fatura', 'Data de vencimento', 'Data Vencimento']),
        'pagto': get_field(row, ['Pagto fatura', 'Data de pagamento', 'Data Pagamento']),
        'cpf_raw': get_field(row, ['CPF/CNPJ', 'CPF', 'CNPJ', 'cpf', 'cpf_cliente', 'documento']),
        'distribuidora': get_field(row, ['Distribuidora', 'distribuidora']),
        'id_cobranca': get_field(row, ['ID Cobrança', 'ID Cobrana', 'id_cobranca', 'Recebimento (Identificador)']),
    }

# ─── Extrair Recebíveis ───────────────────────────────────────────────────────
def extrair_rec(row):
    uc_raw = get_field(row, [
        'Instalacao', 'Instalação', 'instalacao', 'instalação',
        'Instalação (Identificador)', 'num_instalacao', 'NumInstalacao', 'numinstalacao', 'UC',
    ])
    nc_raw = get_field(row, ['Numero Cliente', 'NumeroCliente', 'numero_cliente', 'Nº Cliente'])
    mes_raw = get_field(row, [
        'Data Referencia', 'Data Referência', 'DataReferencia',
        'mesreferencia', 'mes_referencia', 'Mês de referência',
    ])
    return {
        '_uc_norm': norm_uc(uc_raw) or norm_uc(nc_raw),
        '_num_cliente_norm': norm_uc(nc_raw),
        '_mes_norm': normalizar_mes(mes_raw),
        'uc_raw': uc_raw or nc_raw,
        'mes_raw': mes_raw,
        'num_cliente': nc_raw,
        'status_raw': get_field(row, [
            'Status',  # coluna normalizada (PAGO/VENCIDO/A RECEBER) — prioridade máxima
            'status',
            'StatusFatura', 'Status fatura',
            'Status Financeiro Cliente', 'StatusFinanceiroCliente',
        ]),
        'cliente': get_field(row, ['Cliente', 'nome_cliente', 'Nome', 'Favorecido']),
        'valor': get_field(row, ['Valor A Pagar', 'Valor a Pagar', 'ValorAPagar', 'Valor total (R$)', 'Valor']),
        'venc': get_field(row, ['Data Vencimento', 'DataVencimento', 'Data de vencimento']),
        'pagto': get_field(row, ['Data Pagamento', 'DataPagamento', 'Data de pagamento']),
        'id_rcb': get_field(row, ['Idrcb', 'idrcb', 'id_rcb', 'ID Recebimento']),
        'cod_cliente': get_field(row, ['Codigo Cliente', 'Código Cliente', 'cod_cliente', 'codigo_cliente']),
        'cpf_raw': get_field(row, ['Cpf', 'CPF', 'cpf', 'CPF/CNPJ']),
        'fornecedora': get_field(row, ['Fornecedora', 'fornecedora', 'Organização']),
    }

# ─── Cascade Join ─────────────────────────────────────────────────────────────
def cascade_join(pag_rows, rec_rows, pag_key, rec_key, etapa):
    idx_rec = {}
    for i, r in enumerate(rec_rows):
        k = (r.get(rec_key) or '') + '|' + (r.get('_mes_norm') or '')
        idx_rec.setdefault(k, []).append((i, r))

    pag_orfaos = []
    rec_usados = set()
    matches = []

    for rp in pag_rows:
        k = (rp.get(pag_key) or '') + '|' + (rp.get('_mes_norm') or '')
        cands = idx_rec.get(k, [])
        if not cands:
            pag_orfaos.append(rp)
            continue
        cand = next(((i, r) for i, r in cands if i not in rec_usados), cands[0])
        rec_usados.add(cand[0])
        matches.append({'pag': rp, 'rec': cand[1], 'etapa': etapa})

    rec_orfaos = [r for i, r in enumerate(rec_rows) if i not in rec_usados]
    print(f"  Etapa {etapa} ({pag_key}×{rec_key}): {len(matches)} matches | {len(pag_orfaos)} órfãos Pag | {len(rec_orfaos)} órfãos Rec")
    return {'matches': matches, 'pag_orfaos': pag_orfaos, 'rec_orfaos': rec_orfaos}

# ─── Main ─────────────────────────────────────────────────────────────────────
def main():
    print("=" * 60)
    print("iGreen — Verificador de Status Divergentes")
    print("=" * 60)

    print(f"\n[LENDO] Pagadoria: {PAG_FILE}")
    df_pag_raw = pd.read_excel(PAG_FILE, sheet_name='Export', dtype=str)
    print(f"   {len(df_pag_raw)} linhas | {len(df_pag_raw.columns)} colunas")

    print(f"\n[LENDO] Recebiveis: {REC_FILE} (aba: {REC_SHEET})")
    df_rec_raw = pd.read_excel(REC_FILE, sheet_name=REC_SHEET, dtype=str)
    print(f"   {len(df_rec_raw)} linhas | {len(df_rec_raw.columns)} colunas")

    # Extrair
    print("\n🔄 Extraindo e normalizando...")
    rows_pag = [extrair_pag(row) for _, row in df_pag_raw.iterrows()]
    rows_rec = [extrair_rec(row) for _, row in df_rec_raw.iterrows()]

    # Filtrar sem UC/mês
    rows_pag_ok = [r for r in rows_pag if r['_uc_norm'] and r['_mes_norm']]
    rows_rec_ok = [r for r in rows_rec if r['_uc_norm'] and r['_mes_norm']]
    print(f"   PAG válidos: {len(rows_pag_ok)} / {len(rows_pag)}")
    print(f"   REC válidos: {len(rows_rec_ok)} / {len(rows_rec)}")

    if rows_pag_ok:
        p0 = rows_pag_ok[0]
        print(f"   Amostra PAG: UC={p0['_uc_norm']} | Mês={p0['_mes_norm']} | Status={p0['status_raw']}")
    if rows_rec_ok:
        r0 = rows_rec_ok[0]
        print(f"   Amostra REC: UC={r0['_uc_norm']} | Mês={r0['_mes_norm']} | Status={r0['status_raw']}")

    # Cascade Join (sem Northen — planilha é GV/Solatio)
    print("\n🔗 Cascade Join...")
    e1 = cascade_join(rows_pag_ok, rows_rec_ok, '_uc_norm', '_uc_norm', 1)
    e2 = cascade_join(e1['pag_orfaos'], e1['rec_orfaos'], '_uc_norm', '_num_cliente_norm', 2)
    e3 = cascade_join(e2['pag_orfaos'], e2['rec_orfaos'], '_uc_norm', '_cpf_norm', 3)

    all_matches = e1['matches'] + e2['matches'] + e3['matches']
    print(f"\n   Total matches: {len(all_matches)}")

    # Classificar divergentes
    divergentes = []
    coincidentes = []

    for m in all_matches:
        pag = m['pag']
        rec = m['rec']
        sp = status_pag(pag['status_raw'])
        sr = status_rec(rec['status_raw'])

        row = {
            'UC (Pagadoria)': pag['uc_raw'],
            'UC (Recebíveis)': rec['uc_raw'],
            'Cliente': rec['cliente'] or pag['favorecido'] or pag['consorciado'] or '—',
            'Mês Referência': pag['_mes_norm'] or '—',
            'Status PAG (original)': pag['status_raw'] or '—',
            'Status REC (original)': rec['status_raw'] or '—',
            'Status PAG (norm.)': sp,
            'Status REC (norm.)': sr,
            'Valor PAG': pag['valor'] or '—',
            'Valor REC': rec['valor'] or '—',
            'Vencimento PAG': pag['venc'] or '—',
            'Data Pgto PAG': pag['pagto'] or '—',
            'Data Pgto REC': rec['pagto'] or '—',
            'Distribuidora': pag['distribuidora'] or '—',
            'ID Cobrança': pag['id_cobranca'] or rec['id_rcb'] or '—',
            'Etapa Join': m['etapa'],
            '_divergente': eh_divergente(sp, sr),
        }
        if row['_divergente']:
            divergentes.append(row)
        else:
            coincidentes.append(row)

    print(f"\n{'=' * 60}")
    print(f"✅ COINCIDENTES: {len(coincidentes)}")
    print(f"⚠️  DIVERGENTES:  {len(divergentes)}")
    print(f"{'=' * 60}")

    # Distribuição dos divergentes
    if divergentes:
        from collections import Counter
        combo = Counter((r['Status PAG (norm.)'], r['Status REC (norm.)']) for r in divergentes)
        print("\nDistribuição dos divergentes:")
        for (sp, sr), cnt in combo.most_common():
            print(f"   PAG={sp:15s} × REC={sr:15s} → {cnt} boletos")

    # Gerar HTML
    gerar_html(divergentes, len(all_matches), len(coincidentes))
    print(f"\n🎉 HTML gerado: {OUTPUT_HTML}")
    print(f"   Abra no navegador para visualizar os divergentes.")

# ─── Gerador HTML ─────────────────────────────────────────────────────────────
STATUS_COLORS = {
    'PAGO':      ('#10b981', '#d1fae5', '✅'),  # verde
    'VENCIDO':   ('#ef4444', '#fee2e2', '🔴'),  # vermelho
    'A RECEBER': ('#f59e0b', '#fef3c7', '🟡'),  # amarelo
    'CANCELADA': ('#6b7280', '#f3f4f6', '⛔'),  # cinza
    'EXPIRADA':  ('#8b5cf6', '#ede9fe', '🟣'),  # roxo
    'CALCULADA': ('#3b82f6', '#dbeafe', '🔵'),  # azul
}

def badge(status, source=''):
    color, bg, icon = STATUS_COLORS.get(status, ('#64748b', '#f1f5f9', '❓'))
    label = status or '—'
    return f'<span class="badge" style="background:{bg};color:{color};border:1.5px solid {color}">{icon} {label}</span>'

def gerar_html(divergentes, total_matches, total_coincidentes):
    from collections import Counter, defaultdict

    # Stats por combinação de status
    combo_count = Counter((r['Status PAG (norm.)'], r['Status REC (norm.)']) for r in divergentes)

    # Agrupar por Mês
    por_mes = defaultdict(list)
    for r in divergentes:
        por_mes[r['Mês Referência']].append(r)

    agora = datetime.now().strftime('%d/%m/%Y %H:%M')

    rows_html = ''
    for i, r in enumerate(divergentes):
        sp = r['Status PAG (norm.)']
        sr = r['Status REC (norm.)']
        rows_html += f"""
        <tr>
          <td class="idx">{i+1}</td>
          <td><b>{r['UC (Pagadoria)']}</b></td>
          <td>{r['Cliente']}</td>
          <td class="mes">{r['Mês Referência']}</td>
          <td>{badge(sp)} <small style="color:#94a3b8;display:block;margin-top:2px">{r['Status PAG (original)']}</small></td>
          <td>{badge(sr)} <small style="color:#94a3b8;display:block;margin-top:2px">{r['Status REC (original)']}</small></td>
          <td class="valor">{r['Valor PAG']}</td>
          <td class="valor">{r['Valor REC']}</td>
          <td>{r['Vencimento PAG']}</td>
          <td>{r['Data Pgto PAG']}</td>
          <td>{r['Distribuidora']}</td>
          <td class="etapa">E{r['Etapa Join']}</td>
        </tr>"""

    # Cards por combinação
    combo_cards = ''
    for (sp, sr), cnt in combo_count.most_common():
        c1, b1, i1 = STATUS_COLORS.get(sp, ('#64748b', '#f1f5f9', '❓'))
        c2, b2, i2 = STATUS_COLORS.get(sr, ('#64748b', '#f1f5f9', '❓'))
        pct = round(cnt / len(divergentes) * 100, 1) if divergentes else 0
        combo_cards += f"""
        <div class="combo-card">
          <div class="combo-badges">
            <span class="badge lg" style="background:{b1};color:{c1};border:2px solid {c1}">{i1} PAG: {sp}</span>
            <span class="arrow">→</span>
            <span class="badge lg" style="background:{b2};color:{c2};border:2px solid {c2}">{i2} REC: {sr}</span>
          </div>
          <div class="combo-count">{cnt} boletos</div>
          <div class="combo-pct">{pct}% dos divergentes</div>
        </div>"""

    # Grafico por mes (barras simples)
    meses_sorted = sorted(por_mes.keys())
    max_mes = max((len(v) for v in por_mes.values()), default=1)
    bars_html = ''
    for mes in meses_sorted:
        cnt = len(por_mes[mes])
        w = round(cnt / max_mes * 100)
        bars_html += f"""
        <div class="bar-row">
          <div class="bar-label">{mes}</div>
          <div class="bar-wrap"><div class="bar-fill" style="width:{w}%"><span>{cnt}</span></div></div>
        </div>"""

    html = f"""<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1.0"/>
<title>iGreen — Status Divergentes | Faturamento</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap');

  :root {{
    --bg: #0f172a;
    --surface: #1e293b;
    --surface2: #273548;
    --border: #334155;
    --accent: #6366f1;
    --accent2: #818cf8;
    --text: #e2e8f0;
    --muted: #94a3b8;
    --danger: #ef4444;
    --success: #10b981;
    --warning: #f59e0b;
  }}

  * {{ box-sizing: border-box; margin: 0; padding: 0; }}
  body {{
    font-family: 'Inter', sans-serif;
    background: var(--bg);
    color: var(--text);
    min-height: 100vh;
    padding: 0 0 60px;
  }}

  /* HEADER */
  .header {{
    background: linear-gradient(135deg, #1e293b 0%, #0f172a 50%, #1a1040 100%);
    border-bottom: 1px solid var(--border);
    padding: 32px 40px 24px;
    display: flex;
    align-items: center;
    gap: 20px;
    position: sticky; top: 0; z-index: 100;
    box-shadow: 0 4px 24px #0008;
  }}
  .header-logo {{
    width: 48px; height: 48px;
    background: linear-gradient(135deg, var(--accent), #a855f7);
    border-radius: 14px;
    display: flex; align-items: center; justify-content: center;
    font-size: 24px; flex-shrink: 0;
    box-shadow: 0 0 20px #6366f155;
  }}
  .header-titles h1 {{ font-size: 22px; font-weight: 700; letter-spacing: -0.5px; }}
  .header-titles p {{ font-size: 13px; color: var(--muted); margin-top: 2px; }}
  .header-meta {{
    margin-left: auto;
    text-align: right;
    font-size: 12px;
    color: var(--muted);
  }}

  .container {{ max-width: 1600px; margin: 0 auto; padding: 32px 40px; }}

  /* KPI CARDS */
  .kpi-grid {{
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: 16px;
    margin-bottom: 32px;
  }}
  .kpi {{
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 16px;
    padding: 20px 24px;
    position: relative;
    overflow: hidden;
    transition: transform 0.2s;
  }}
  .kpi:hover {{ transform: translateY(-2px); }}
  .kpi::before {{
    content: '';
    position: absolute; top: 0; left: 0; right: 0; height: 3px;
  }}
  .kpi.danger::before {{ background: var(--danger); }}
  .kpi.success::before {{ background: var(--success); }}
  .kpi.info::before {{ background: var(--accent); }}
  .kpi.warn::before {{ background: var(--warning); }}
  .kpi-icon {{ font-size: 28px; margin-bottom: 8px; }}
  .kpi-value {{ font-size: 36px; font-weight: 800; letter-spacing: -1px; }}
  .kpi-label {{ font-size: 13px; color: var(--muted); margin-top: 4px; }}
  .kpi.danger .kpi-value {{ color: var(--danger); }}
  .kpi.success .kpi-value {{ color: var(--success); }}
  .kpi.info .kpi-value {{ color: var(--accent2); }}
  .kpi.warn .kpi-value {{ color: var(--warning); }}

  /* SECTION TITLES */
  .section-title {{
    font-size: 16px; font-weight: 600;
    color: var(--text);
    margin-bottom: 16px;
    display: flex; align-items: center; gap: 8px;
  }}
  .section-title::after {{
    content: '';
    flex: 1; height: 1px;
    background: var(--border);
  }}

  /* COMBO CARDS */
  .combo-grid {{
    display: flex; flex-wrap: wrap; gap: 12px;
    margin-bottom: 32px;
  }}
  .combo-card {{
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 12px;
    padding: 16px 20px;
    display: flex; flex-direction: column; gap: 8px;
    min-width: 260px;
    transition: border-color 0.2s, transform 0.2s;
  }}
  .combo-card:hover {{ border-color: var(--accent); transform: translateY(-1px); }}
  .combo-badges {{ display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }}
  .arrow {{ color: var(--muted); font-size: 18px; }}
  .combo-count {{ font-size: 22px; font-weight: 700; }}
  .combo-pct {{ font-size: 12px; color: var(--muted); }}

  /* CHART */
  .chart-section {{
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 16px;
    padding: 24px;
    margin-bottom: 32px;
  }}
  .bar-row {{
    display: flex; align-items: center; gap: 12px;
    margin-bottom: 10px;
  }}
  .bar-label {{ width: 80px; text-align: right; font-size: 12px; color: var(--muted); flex-shrink: 0; }}
  .bar-wrap {{ flex: 1; background: var(--surface2); border-radius: 6px; height: 28px; overflow: hidden; }}
  .bar-fill {{
    height: 100%;
    background: linear-gradient(90deg, #6366f1, #a855f7);
    border-radius: 6px;
    display: flex; align-items: center; justify-content: flex-end;
    padding-right: 10px;
    font-size: 12px; font-weight: 600;
    transition: width 0.6s ease;
    min-width: 40px;
  }}

  /* CONTROLS */
  .controls {{
    display: flex; gap: 12px; flex-wrap: wrap;
    margin-bottom: 16px;
    align-items: center;
  }}
  .search-box {{
    flex: 1; min-width: 220px;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 10px;
    padding: 10px 14px;
    color: var(--text);
    font-size: 14px;
    font-family: inherit;
    outline: none;
    transition: border-color 0.2s;
  }}
  .search-box:focus {{ border-color: var(--accent); }}
  .search-box::placeholder {{ color: var(--muted); }}
  select.filter-select {{
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 10px;
    padding: 10px 14px;
    color: var(--text);
    font-size: 14px;
    font-family: inherit;
    outline: none;
    cursor: pointer;
  }}
  .count-badge {{
    background: var(--surface2);
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 8px 14px;
    font-size: 13px;
    color: var(--muted);
  }}
  #rowCount {{ color: var(--danger); font-weight: 700; }}

  /* TABLE */
  .table-wrap {{
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 16px;
    overflow: hidden;
    box-shadow: 0 4px 24px #0006;
  }}
  table {{
    width: 100%;
    border-collapse: collapse;
    font-size: 13px;
  }}
  thead th {{
    background: var(--surface2);
    padding: 12px 14px;
    text-align: left;
    font-weight: 600;
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: var(--muted);
    border-bottom: 1px solid var(--border);
    white-space: nowrap;
    cursor: pointer;
    user-select: none;
    transition: background 0.15s;
  }}
  thead th:hover {{ background: #2d3f5a; }}
  thead th.sorted {{ color: var(--accent2); }}
  tbody tr {{
    border-bottom: 1px solid var(--border);
    transition: background 0.12s;
  }}
  tbody tr:hover {{ background: var(--surface2); }}
  tbody tr:last-child {{ border-bottom: none; }}
  td {{ padding: 11px 14px; vertical-align: middle; }}
  td.idx {{ color: var(--muted); font-size: 11px; width: 40px; text-align: center; }}
  td.mes {{ color: var(--accent2); font-weight: 600; white-space: nowrap; }}
  td.valor {{ font-variant-numeric: tabular-nums; white-space: nowrap; }}
  td.etapa {{
    text-align: center;
    font-size: 10px;
    color: var(--muted);
    font-weight: 600;
  }}

  .badge {{
    display: inline-block;
    padding: 3px 10px;
    border-radius: 20px;
    font-size: 11px;
    font-weight: 600;
    white-space: nowrap;
  }}
  .badge.lg {{ padding: 5px 12px; font-size: 13px; }}

  /* FOOTER */
  .footer {{
    text-align: center;
    margin-top: 40px;
    color: var(--muted);
    font-size: 12px;
  }}

  /* Zebra */
  tbody tr:nth-child(even) {{ background: #1a2538; }}
  tbody tr:nth-child(even):hover {{ background: var(--surface2); }}

  .no-results {{
    text-align: center;
    padding: 48px;
    color: var(--muted);
    font-size: 15px;
    display: none;
  }}
</style>
</head>
<body>

<div class="header">
  <div class="header-logo">⚡</div>
  <div class="header-titles">
    <h1>Status Divergentes — Faturamento</h1>
    <p>Cruzamento Pagadoria × Recebíveis | iGreen</p>
  </div>
  <div class="header-meta">
    Gerado em {agora}<br>
    BASE PAGADORIA IGREEN - 19.05.xlsx × Recebiveis_GV_19-05.xlsx
  </div>
</div>

<div class="container">

  <!-- KPI Cards -->
  <div class="kpi-grid">
    <div class="kpi danger">
      <div class="kpi-icon">⚠️</div>
      <div class="kpi-value">{len(divergentes):,}</div>
      <div class="kpi-label">Boletos Divergentes</div>
    </div>
    <div class="kpi success">
      <div class="kpi-icon">✅</div>
      <div class="kpi-value">{total_coincidentes:,}</div>
      <div class="kpi-label">Coincidentes</div>
    </div>
    <div class="kpi info">
      <div class="kpi-icon">🔗</div>
      <div class="kpi-value">{total_matches:,}</div>
      <div class="kpi-label">Total com Match</div>
    </div>
    <div class="kpi warn">
      <div class="kpi-icon">📊</div>
      <div class="kpi-value">{round(len(divergentes)/total_matches*100,1) if total_matches else 0}%</div>
      <div class="kpi-label">Taxa de Divergência</div>
    </div>
    <div class="kpi info">
      <div class="kpi-icon">📋</div>
      <div class="kpi-value">{len(por_mes)}</div>
      <div class="kpi-label">Meses com Divergência</div>
    </div>
    <div class="kpi info">
      <div class="kpi-icon">🔀</div>
      <div class="kpi-value">{len(combo_count)}</div>
      <div class="kpi-label">Combinações de Status</div>
    </div>
  </div>

  <!-- Combinações -->
  <div class="section-title">⚡ Combinações de Status Divergentes</div>
  <div class="combo-grid">
    {combo_cards}
  </div>

  <!-- Gráfico por mês -->
  <div class="section-title">📅 Divergentes por Mês de Referência</div>
  <div class="chart-section">
    {bars_html}
  </div>

  <!-- Tabela -->
  <div class="section-title">📋 Todos os Boletos Divergentes</div>
  <div class="controls">
    <input class="search-box" type="text" id="searchInput" placeholder="🔍  Buscar por UC, cliente, mês, status..." oninput="filtrarTabela()"/>
    <select class="filter-select" id="filterStatusPag" onchange="filtrarTabela()">
      <option value="">Todos Status PAG</option>
      <option>PAGO</option><option>VENCIDO</option><option>A RECEBER</option>
      <option>CANCELADA</option><option>EXPIRADA</option><option>CALCULADA</option>
    </select>
    <select class="filter-select" id="filterStatusRec" onchange="filtrarTabela()">
      <option value="">Todos Status REC</option>
      <option>PAGO</option><option>VENCIDO</option><option>A RECEBER</option>
      <option>CANCELADA</option><option>EXPIRADA</option><option>CALCULADA</option>
    </select>
    <select class="filter-select" id="filterMes" onchange="filtrarTabela()">
      <option value="">Todos os Meses</option>
      {''.join(f'<option>{m}</option>' for m in sorted(por_mes.keys()))}
    </select>
    <div class="count-badge">Exibindo <span id="rowCount">{len(divergentes)}</span> de {len(divergentes)}</div>
  </div>

  <div class="table-wrap">
    <table id="mainTable">
      <thead>
        <tr>
          <th>#</th>
          <th onclick="sortTable(1)">UC (PAG)</th>
          <th onclick="sortTable(2)">Cliente</th>
          <th onclick="sortTable(3)">Mês Ref.</th>
          <th onclick="sortTable(4)">Status Pagadoria</th>
          <th onclick="sortTable(5)">Status Recebíveis</th>
          <th onclick="sortTable(6)">Valor PAG</th>
          <th onclick="sortTable(7)">Valor REC</th>
          <th onclick="sortTable(8)">Vencimento</th>
          <th onclick="sortTable(9)">Data Pgto PAG</th>
          <th onclick="sortTable(10)">Distribuidora</th>
          <th>Join</th>
        </tr>
      </thead>
      <tbody id="tableBody">
        {rows_html}
      </tbody>
    </table>
    <div class="no-results" id="noResults">Nenhum resultado encontrado para os filtros aplicados.</div>
  </div>

</div>

<div class="footer">
  iGreen — Verificação de Status Divergentes gerada automaticamente em {agora} &nbsp;|&nbsp;
  Lógica: <code>ehDivergente(statusPag, statusRec)</code> — fatCruzar.js
</div>

<script>
  let sortCol = -1, sortAsc = true;

  function filtrarTabela() {{
    const q = document.getElementById('searchInput').value.toLowerCase();
    const fSP = document.getElementById('filterStatusPag').value.toUpperCase();
    const fSR = document.getElementById('filterStatusRec').value.toUpperCase();
    const fM  = document.getElementById('filterMes').value;
    const rows = document.querySelectorAll('#tableBody tr');
    let vis = 0;
    rows.forEach(tr => {{
      const cells = tr.querySelectorAll('td');
      const uc     = cells[1]?.textContent || '';
      const cli    = cells[2]?.textContent || '';
      const mes    = cells[3]?.textContent || '';
      const spTxt  = cells[4]?.textContent || '';
      const srTxt  = cells[5]?.textContent || '';
      const matchQ  = !q || [uc,cli,mes,spTxt,srTxt].some(t => t.toLowerCase().includes(q));
      const matchSP = !fSP || spTxt.toUpperCase().includes(fSP);
      const matchSR = !fSR || srTxt.toUpperCase().includes(fSR);
      const matchM  = !fM  || mes.trim() === fM;
      const show = matchQ && matchSP && matchSR && matchM;
      tr.style.display = show ? '' : 'none';
      if (show) vis++;
    }});
    document.getElementById('rowCount').textContent = vis;
    document.getElementById('noResults').style.display = vis === 0 ? 'block' : 'none';
  }}

  function sortTable(col) {{
    if (sortCol === col) sortAsc = !sortAsc;
    else {{ sortCol = col; sortAsc = true; }}
    document.querySelectorAll('thead th').forEach((th,i) => th.classList.toggle('sorted', i===col));
    const tbody = document.getElementById('tableBody');
    const rows = Array.from(tbody.querySelectorAll('tr'));
    rows.sort((a,b) => {{
      const ta = a.querySelectorAll('td')[col]?.textContent.trim() || '';
      const tb = b.querySelectorAll('td')[col]?.textContent.trim() || '';
      return sortAsc ? ta.localeCompare(tb,'pt-BR',{{numeric:true}}) : tb.localeCompare(ta,'pt-BR',{{numeric:true}});
    }});
    rows.forEach(r => tbody.appendChild(r));
  }}
</script>
</body>
</html>"""

    with open(OUTPUT_HTML, 'w', encoding='utf-8') as f:
        f.write(html)

if __name__ == '__main__':
    main()
