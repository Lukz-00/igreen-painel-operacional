import re
from datetime import datetime

import polars as pl

CANCEL_GV = ['CANCELADO', 'REMOVIDO', 'REPROVADO', 'INSATISF', 'MUDANÇA DE ENDEREÇO', 'MUDANCA DE ENDERECO']
CANCEL_BKO = ['CANCELADO', 'DESIST', 'EXCLUIDO', 'EXCLUÍDO']
REJEICAO = ['CONTRATO NÃO ENCONTRADO', 'CONTRATO NAO ENCONTRADO', 'FALTA LINK', 'FATURA ILEGÍVEL', 'FATURA ILEGIVEL',
            'SEM HISTÓRICO DE CONSUMO', 'SEM HISTORICO DE CONSUMO', 'CONTRATO SEM ASSINATURA']


def norm_cod(v):
    if not v:
        return ""
    return str(v).replace(" ", "").upper()


def tem_termo(texto, termos):
    if not texto:
        return False
    txt = str(texto).upper()
    return any(t in txt for t in termos)


def parse_dias(v):
    if not v or not isinstance(v, str):
        return None
    match = re.match(r"^(\d{2})/(\d{2})/(\d{4})", str(v).strip())
    if not match:
        return None
    try:
        data = datetime(int(match.group(3)), int(match.group(2)), int(match.group(1)))
        diff = (datetime.now() - data).days
        return abs(diff)
    except (TypeError, ValueError, OverflowError):
        return None


def reconcile_conciliacao(df_base: pl.DataFrame, df_fin: pl.DataFrame, df_rec: pl.DataFrame, df_status: pl.DataFrame):
    """
    Executa a lógica síncrona da Conciliação de Base, iterando sobre df_base e
    aplicando as 22 regras de marcação baseadas na presença em finalizados, recebíveis e extrato.
    """
    fin_set = {norm_cod(r.get("_gmap_codigo", "")) for r in df_fin.to_dicts() if norm_cod(r.get("_gmap_codigo", ""))}
    rec_set = {norm_cod(r.get("_gmap_codigo", "")) for r in df_rec.to_dicts() if norm_cod(r.get("_gmap_codigo", ""))}

    map_gv = {}
    for r in df_status.to_dicts():
        cod = norm_cod(r.get("_gmap_codigo", ""))
        if cod:
            map_gv[cod] = {
                "obs": str(r.get("_gmap_obs") or "").strip(),
                "rateio": str(r.get("_gmap_status_rateio") or "").strip()
            }

    map_rec = {}
    for r in df_rec.to_dicts():
        cod = norm_cod(r.get("_gmap_codigo", ""))
        if cod and cod not in map_rec:
            map_rec[cod] = r

    buckets = {
        "m1": [], "m2": [], "m3": [], "m5": [], "m6": [], "m7": [],
        "m8": [], "m10": [], "m11": [], "m13": [], "m15": [], "m22": [], "m0": []
    }

    base_dicts = df_base.to_dicts()

    for row in base_dicts:
        cod = norm_cod(row.get("_gmap_codigo", ""))
        data_ativo = str(row.get("_gmap_data_ativo") or "").strip()
        data_canc = str(row.get("_gmap_data_cancelamento") or "").strip()
        dev_bko = str(row.get("_gmap_devolutiva") or "").strip()
        validado_sucesso = str(row.get("_gmap_validado_sucesso") or "").strip().upper()
        jornada_status = str(row.get("_gmap_jornada_status") or "").strip().upper()
        jornada_etapa = str(row.get("_gmap_jornada_etapa") or "").strip().upper()
        rateio_bko_raw = str(row.get("_gmap_rateio") or "").strip().upper()

        finalizado = cod in fin_set
        boletando = cod in rec_set
        has_gv_status = cod in map_gv
        gv = map_gv.get(cod, {"obs": "", "rateio": ""})
        obs_gv = gv["obs"].upper()
        rateio_gv = gv["rateio"].upper()

        dias = parse_dias(data_ativo)
        meses = round(dias / 30, 1) if dias is not None else None
        tem_data_ativo = dias is not None and dias >= 0
        cancelado_gv = tem_termo(obs_gv, CANCEL_GV) or tem_termo(rateio_gv, CANCEL_GV)
        cancelado_bko = bool(data_canc) or tem_termo(dev_bko, CANCEL_BKO)

        rateio_s = rateio_bko_raw in ("S", "SIM")
        eh_validado = validado_sucesso in ("SIM", "S")
        eh_vazio_gv = not rateio_gv
        is_ativo_gv = eh_vazio_gv or rateio_gv == 'N/A' or rateio_gv == 'ATIVO' or \
                      'CLIENTE ATIVO' in rateio_gv or 'PREVISÃO DE INJEÇÃO' in rateio_gv or 'PREVISAO DE INJECAO' in rateio_gv

        rec = dict(row)
        rec["Finalizado GV"] = "SIM" if finalizado else "NÃO"
        rec["Boletando"] = "SIM" if boletando else "NÃO"
        rec["Observação GV"] = gv["obs"]
        rec["Status Rateio GV"] = gv["rateio"]
        rec["Dias em Atraso"] = dias if dias is not None else "—"
        rec["Meses em Atraso"] = meses if meses is not None else "—"

        def marcar(key, label):
            rec["Marcação"] = label
            buckets[key].append(rec)

        def cancelar_bko():
            if is_ativo_gv:
                marcar("m11", "11 — Cancelado BKO > Ativo Fornecedora")
            else:
                marcar("m6", "6 — Cancelado em ambas partes")

        # ── Prioridade 1: Rejeição GV ───────────────────────────────────────────
        if tem_termo(obs_gv, REJEICAO):
            marcar("m5", "5 — Equipe de Devolutivas")
            continue

        # ── Prioridade 2: Cancelado BKO > Ativo Fornecedora (via Jornada) ───────
        if not tem_data_ativo and dev_bko and ("ATIVO" in jornada_status or "VALIDADO" in jornada_status):
            marcar("m11", "11 — Cancelado BKO > Ativo Fornecedora")
            continue

        # ── Prioridade 3: Cancelado GV > Cancelar BKO (via Jornada) ────────────
        if tem_data_ativo and "SUSPENSO" in jornada_status and "INADIMPLENTE" in jornada_etapa:
            marcar("m3", "3 — Cancelado GV > Cancelar BKO")
            continue

        # ── Prioridade 4: Verificação Manual (data ativo + devolutiva) ──────────
        if tem_data_ativo and dev_bko:
            marcar("m0", "0 — Verificação Manual")
            continue

        # ── Prioridade 5: Represado (validado + não enviado ao rateio) ──────────
        if not dev_bko and eh_validado and not rateio_s:
            marcar("m8", "8 — Represado")
            continue

        # ── Prioridade 6: Clientes OK (finalizado + validado + rateio + GV retorno presente)
        if finalizado and tem_data_ativo and not dev_bko and eh_validado and rateio_s and not eh_vazio_gv:
            marcar("m1", "1 — Clientes OK")
            continue

        # ── Prioridade 7: Não encontrado na GV (validado + rateio S + sem retorno GV)
        if eh_validado and rateio_s and not has_gv_status:
            marcar("m15", "15 — Não encontrado na GV")
            continue

        # ── Prioridade 8: Clientes em Atraso (>90 dias, validado, sem boleto) ────
        if tem_data_ativo and dias > 90 and not dev_bko and eh_validado and rateio_s and not boletando:
            marcar("m22", "22 — Clientes em Atraso")
            continue

        # ── Prioridade 8b: Sem boleto (≤90 dias, validado) ─────────────────────
        if tem_data_ativo and not dev_bko and eh_validado and rateio_s and not boletando:
            marcar("m13", "13 — Clientes em atraso > Sem boleto")
            continue

        # ── Prioridade 9: Aguardando retorno Fornecedora ────────────────────────
        if finalizado and not cancelado_gv and not dev_bko and eh_validado and rateio_s and eh_vazio_gv:
            marcar("m10", "10 — Aguardando retorno Fornecedora")
            continue

        # ── Prioridade 9: Boletando sem data ativo ──────────────────────────────
        if boletando and not tem_data_ativo and not dev_bko and not cancelado_gv:
            rec_row = map_rec.get(cod)
            idrcb = "—"
            if rec_row:
                idrcb = str(rec_row.get("_gmap_idrcb") or rec_row.get("Idrcb") or rec_row.get("idrcb") or "—")
            rec["IDRCB Recebíveis"] = idrcb
            marcar("m2", "2 — Boletando > Sem data ativo")
            continue

        # ── Grupo C: está na base de Finalizados ────────────────────────────────
        if finalizado:
            if cancelado_gv:
                if not tem_data_ativo:
                    marcar("m6", "6 — Cancelado em ambas partes")
                    continue
                if not cancelado_bko and not data_canc and not is_ativo_gv:
                    marcar("m3", "3 — Cancelado GV > Cancelar BKO")
                    continue
            else:
                if cancelado_bko and tem_termo(dev_bko, CANCEL_BKO):
                    cancelar_bko()
                    continue
                if tem_data_ativo and not dev_bko and not boletando:
                    marcar("m7", "7 — Clientes em atraso")
                    continue
                cancelar_bko()
                continue

        marcar("m0", "0 — Verificação Manual")

    # Limpar as colunas de mapeamento (iniciadas com "_gmap_") antes de devolver
    for k, rows in buckets.items():
        cleaned_rows = []
        for r in rows:
            cleaned = {key: ("" if val is None else val) for key, val in r.items() if not key.startswith("_")}
            cleaned_rows.append(cleaned)
        buckets[k] = cleaned_rows

    return buckets, len(base_dicts)
