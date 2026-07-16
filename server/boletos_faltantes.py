from __future__ import annotations

import re
import unicodedata
from dataclasses import dataclass
from typing import Any

import polars as pl


DASH = "-"


BASE_ALIASES = {
    "code": ["_gmap_codigo", "codigo", "Codigo", "Codigo Cliente", "codigo cliente", "cod_cliente"],
    "inst": ["_gmap_instalacao", "instalacao", "Instalacao", "Instalacao / UC", "UC", "num_instalacao"],
    "new_inst": ["_gmap_nova_instalacao", "Nova instalacao", "Nova Instalacao", "nova_instalacao"],
    "customer_no": ["_gmap_numero_cliente", "numero cliente", "Numero Cliente", "NumeroCliente", "N Cliente", "UC"],
    "cpf": ["_gmap_cpf", "cpf", "CPF", "CPF/CNPJ", "cnpj", "CNPJ"],
    "name": ["_gmap_nome", "nome", "Nome", "Cliente", "cliente", "Nome Cliente"],
    "provider": ["_gmap_fornecedora", "fornecedora", "Fornecedora", "regiao", "Regiao", "regiao/fornecedora"],
    "status": ["_gmap_status", "Status", "status", "Jornada Status", "Status Financeiro"],
}

PAG_ALIASES = {
    "uc": ["_gmap_instalacao", "Instalacao", "Instalacao / UC", "Numero de instalacao", "Numero instalacao", "numinstalacao", "num_instalacao", "UC"],
    "month": ["_gmap_mes", "Mes referencia", "Mes de referencia", "Mes", "Data Referencia", "mes_referencia", "mesreferencia", "DATA DO DOCUMENTO"],
    "cpf": ["_gmap_cpf", "CPF/CNPJ", "CPF", "cpf", "CNPJ", "documento"],
    "name": ["_gmap_cliente", "Favorecido", "Consorciado", "Nome", "Cliente", "nome_cliente", "Nome do Cliente"],
    "status": ["_gmap_status", "Status fatura", "StatusFatura", "Status", "status", "Situacao do recebimento"],
    "value": ["_gmap_valor", "Valor fatura", "Valor da Fatura", "Valor total (R$)", "Valor", "valorapagar"],
    "due": ["_gmap_vencimento", "Vencimento fatura", "Data Vencimento", "Data de vencimento", "dtvencimento"],
    "distributor": ["_gmap_distribuidora", "Distribuidora", "Concessionaria", "Fornecedora"],
}

REC_ALIASES = {
    "inst": ["_gmap_instalacao", "instalacao", "Instalacao", "Instalacao / UC", "UC", "num_instalacao"],
    "customer_no": ["_gmap_numero_cliente", "numero cliente", "Numero Cliente", "NumeroCliente", "N Cliente"],
    "code": ["_gmap_codigo_cliente", "codigo cliente", "Codigo Cliente", "cod_cliente", "Codigo"],
    "month": ["_gmap_mes", "data referencia", "Data Referencia", "mes_referencia", "Mes", "Mes referencia"],
    "cpf": ["_gmap_cpf", "cpf", "CPF", "CPF/CNPJ", "cnpj", "CNPJ"],
    "name": ["_gmap_cliente", "cliente", "Cliente", "nome_cliente", "Nome"],
    "status": ["_gmap_status", "status", "Status", "Status fatura", "Status Financeiro Cliente"],
    "value": ["_gmap_valor", "valor a pagar", "Valor A Pagar", "valorapagar", "Valor"],
    "due": ["_gmap_vencimento", "data vencimento", "Data Vencimento", "dtvencimento", "Vencimento fatura"],
    "provider": ["_gmap_fornecedora", "fornecedora", "Fornecedora", "cfornecedora"],
    "concessionaire": ["_gmap_concessionaria", "Concessionaria", "concessionaria", "Distribuidora"],
}


@dataclass
class BoletosFaltantesResult:
    sheets: dict[str, pl.DataFrame]
    metrics: dict[str, Any]
    logs: list[dict[str, str]]


def _plain(value: Any) -> str:
    text = "".join(
        c
        for c in unicodedata.normalize("NFD", str(value or "").casefold())
        if unicodedata.category(c) != "Mn"
    )
    return re.sub(r"\s+", " ", text).strip()


def _norm_text_value(value: Any) -> str:
    text = "".join(
        c
        for c in unicodedata.normalize("NFD", str(value or "").upper())
        if unicodedata.category(c) != "Mn"
    )
    return re.sub(r"\s+", " ", re.sub(r"[^A-Z0-9\s]", " ", text)).strip()


def _resolve(columns: list[str], aliases: list[str]) -> str | None:
    normalized = {_plain(col): col for col in columns}
    for alias in aliases:
        found = normalized.get(_plain(alias))
        if found:
            return found
    for alias in aliases:
        needle = _plain(alias)
        if not needle:
            continue
        for col in columns:
            if needle in _plain(col):
                return col
    return None


def _field(frame: pl.DataFrame, aliases: dict[str, list[str]], key: str) -> pl.Expr:
    column = _resolve(frame.columns, aliases[key])
    return pl.col(column).cast(pl.String, strict=False).fill_null("").str.strip_chars() if column else pl.lit("")


def _digits_expr(expr: pl.Expr) -> pl.Expr:
    return expr.cast(pl.String, strict=False).fill_null("").str.replace_all(r"[^0-9]", "").str.replace(r"^0+", "")


def _base_identifier_expr(expr: pl.Expr) -> pl.Expr:
    text = (
        expr.cast(pl.String, strict=False)
        .fill_null("")
        .str.to_uppercase()
        .str.normalize("NFD")
        .str.replace_all(r"\p{M}", "")
    )
    return pl.when(text.str.contains("CANCELAD")).then(pl.lit("")).otherwise(_digits_expr(expr))


def _norm_text_expr(expr: pl.Expr) -> pl.Expr:
    return (
        expr.cast(pl.String, strict=False)
        .fill_null("")
        .str.to_uppercase()
        .str.normalize("NFD")
        .str.replace_all(r"\p{M}", "")
        .str.replace_all(r"[^A-Z0-9\s]", " ")
        .str.replace_all(r"\s+", " ")
        .str.strip_chars()
    )


def _month_expr(expr: pl.Expr) -> pl.Expr:
    text = expr.cast(pl.String, strict=False).fill_null("").str.strip_chars().str.to_uppercase()
    months = {"JAN": "01", "FEV": "02", "MAR": "03", "ABR": "04", "MAI": "05", "JUN": "06", "JUL": "07", "AGO": "08", "SET": "09", "OUT": "10", "NOV": "11", "DEZ": "12"}
    pt = text.str.extract(r"^([A-Z]{3})[/\-.](\d{4})$", 1).replace(months)
    pt_year = text.str.extract(r"^[A-Z]{3}[/\-.](\d{4})$", 1)
    iso_y = text.str.extract(r"^(\d{4})-(\d{2})", 1)
    iso_m = text.str.extract(r"^(\d{4})-(\d{2})", 2)
    br_m = text.str.extract(r"^\d{2}/(\d{2})/(\d{4})", 1)
    br_y = text.str.extract(r"^\d{2}/(\d{2})/(\d{4})", 2)
    my_m = text.str.extract(r"^(\d{2})/(\d{4})$", 1)
    my_y = text.str.extract(r"^(\d{2})/(\d{4})$", 2)
    return pl.coalesce([
        pl.when(pt.is_not_null()).then(pt_year + pl.lit("-") + pt),
        pl.when(iso_y.is_not_null()).then(iso_y + pl.lit("-") + iso_m),
        pl.when(br_y.is_not_null()).then(br_y + pl.lit("-") + br_m),
        pl.when(my_y.is_not_null()).then(my_y + pl.lit("-") + my_m),
        pl.lit(""),
    ])


def _prepare_base(frame: pl.DataFrame) -> pl.DataFrame:
    code = _field(frame, BASE_ALIASES, "code")
    inst = _field(frame, BASE_ALIASES, "inst")
    new_inst = _field(frame, BASE_ALIASES, "new_inst")
    customer_no = _field(frame, BASE_ALIASES, "customer_no")
    cpf = _field(frame, BASE_ALIASES, "cpf")
    name = _field(frame, BASE_ALIASES, "name")
    return frame.select(
        pl.int_range(pl.len(), dtype=pl.UInt32).alias("_row"),
        code.alias("codigoRaw"),
        _digits_expr(code).alias("codigo"),
        inst.alias("instRaw"),
        _base_identifier_expr(inst).alias("inst"),
        new_inst.alias("novaRaw"),
        _base_identifier_expr(new_inst).alias("nova"),
        customer_no.alias("numeroRaw"),
        _base_identifier_expr(customer_no).alias("numero"),
        cpf.alias("cpfRaw"),
        _digits_expr(cpf).alias("cpf"),
        name.alias("nomeRaw"),
        _norm_text_expr(name).alias("nomeNorm"),
        _field(frame, BASE_ALIASES, "provider").alias("fornecedora"),
        _field(frame, BASE_ALIASES, "status").alias("status"),
    )


def _prepare_pag(frame: pl.DataFrame) -> pl.DataFrame:
    uc = _field(frame, PAG_ALIASES, "uc")
    month = _field(frame, PAG_ALIASES, "month")
    cpf = _field(frame, PAG_ALIASES, "cpf")
    name = _field(frame, PAG_ALIASES, "name")
    return frame.select(
        uc.alias("ucRaw"),
        _digits_expr(uc).alias("uc"),
        month.alias("mesRaw"),
        _month_expr(month).alias("mes"),
        cpf.alias("cpfRaw"),
        _digits_expr(cpf).alias("cpf"),
        name.alias("clienteRaw"),
        _norm_text_expr(name).alias("nomeNorm"),
        _field(frame, PAG_ALIASES, "status").alias("status"),
        _field(frame, PAG_ALIASES, "value").alias("valor"),
        _field(frame, PAG_ALIASES, "due").alias("vencimento"),
        _field(frame, PAG_ALIASES, "distributor").alias("distribuidora"),
    )


def _prepare_rec(frame: pl.DataFrame) -> pl.DataFrame:
    inst = _field(frame, REC_ALIASES, "inst")
    customer_no = _field(frame, REC_ALIASES, "customer_no")
    code = _field(frame, REC_ALIASES, "code")
    month = _field(frame, REC_ALIASES, "month")
    cpf = _field(frame, REC_ALIASES, "cpf")
    name = _field(frame, REC_ALIASES, "name")
    return frame.select(
        inst.alias("instRaw"),
        _digits_expr(inst).alias("inst"),
        customer_no.alias("numeroRaw"),
        _digits_expr(customer_no).alias("numero"),
        code.alias("codigoRaw"),
        _digits_expr(code).alias("codigo"),
        month.alias("mesRaw"),
        _month_expr(month).alias("mes"),
        cpf.alias("cpfRaw"),
        _digits_expr(cpf).alias("cpf"),
        name.alias("clienteRaw"),
        _norm_text_expr(name).alias("nomeNorm"),
        _field(frame, REC_ALIASES, "status").alias("status"),
        _field(frame, REC_ALIASES, "value").alias("valor"),
        _field(frame, REC_ALIASES, "due").alias("vencimento"),
        _field(frame, REC_ALIASES, "provider").alias("fornecedora"),
        _field(frame, REC_ALIASES, "concessionaire").alias("concessionaria"),
    )


def _display(value: Any) -> str:
    return DASH if value is None or value == "" else str(value)


def _unique_sorted(values: list[str] | set[str]) -> list[str]:
    return sorted({value for value in values if value})


def _month_index(month: str) -> int | None:
    match = re.match(r"^(\d{4})-(\d{2})$", str(month or ""))
    if not match:
        return None
    return int(match.group(1)) * 12 + int(match.group(2))


def _index_month(index: int) -> str:
    year = (index - 1) // 12
    month = ((index - 1) % 12) + 1
    return f"{year}-{month:02d}"


def _format_month(month: str) -> str:
    match = re.match(r"^(\d{4})-(\d{2})$", str(month or ""))
    if not match:
        return month or DASH
    return f"{match.group(2)}/{match.group(1)}"


def _format_month_list(months: list[str]) -> str:
    return ", ".join(_format_month(month) for month in months) if months else DASH


def _token(kind: str, value: str, origin: str) -> dict[str, str] | None:
    return {"key": f"{kind}:{value}", "origem": origin} if value else None


def _push_token(tokens: list[dict[str, str]], kind: str, value: str, origin: str) -> None:
    item = _token(kind, value, origin)
    if item and not any(token["key"] == item["key"] for token in tokens):
        tokens.append(item)


def _tokens_base(client: dict[str, Any]) -> list[dict[str, str]]:
    tokens: list[dict[str, str]] = []
    _push_token(tokens, "codigo", client.get("codigo", ""), "Base GV: codigo")
    _push_token(tokens, "uc", client.get("inst", ""), "Base GV: instalacao")
    _push_token(tokens, "uc", client.get("nova", ""), "Base GV: nova instalacao")
    _push_token(tokens, "nc", client.get("numero", ""), "Base GV: numero cliente")
    return tokens


def _tokens_pag(row: dict[str, Any]) -> list[dict[str, str]]:
    tokens: list[dict[str, str]] = []
    _push_token(tokens, "uc", row.get("uc", ""), "Pagadoria: UC")
    _push_token(tokens, "nc", row.get("uc", ""), "Pagadoria: UC como numero cliente")
    return tokens


def _tokens_rec(row: dict[str, Any]) -> list[dict[str, str]]:
    tokens: list[dict[str, str]] = []
    _push_token(tokens, "codigo", row.get("codigo", ""), "Recebiveis: codigo cliente")
    _push_token(tokens, "uc", row.get("inst", ""), "Recebiveis: instalacao")
    _push_token(tokens, "nc", row.get("numero", ""), "Recebiveis: numero cliente")
    return tokens


def _create_group(group_id: str, client: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": group_id,
        "origem": "Base GV",
        "cliente": client,
        "pag": [],
        "rec": [],
        "pagMeses": set(),
        "recMeses": set(),
        "matchOrigens": {"Base GV"},
    }


def _merge_client(group: dict[str, Any], data: dict[str, Any]) -> None:
    client = group["cliente"]
    if not client.get("nomeRaw") and data.get("clienteRaw"):
        client["nomeRaw"] = data["clienteRaw"]
    if not client.get("instRaw") and (data.get("instRaw") or data.get("ucRaw")):
        client["instRaw"] = data.get("instRaw") or data.get("ucRaw")
    if not client.get("inst") and (data.get("inst") or data.get("uc")):
        client["inst"] = data.get("inst") or data.get("uc")
    if not client.get("numeroRaw") and data.get("numeroRaw"):
        client["numeroRaw"] = data["numeroRaw"]
    if not client.get("numero") and data.get("numero"):
        client["numero"] = data["numero"]
    if not client.get("codigoRaw") and data.get("codigoRaw"):
        client["codigoRaw"] = data["codigoRaw"]
    if not client.get("codigo") and data.get("codigo"):
        client["codigo"] = data["codigo"]
    if not client.get("cpfRaw") and data.get("cpfRaw"):
        client["cpfRaw"] = data["cpfRaw"]
    if not client.get("cpf") and data.get("cpf"):
        client["cpf"] = data["cpf"]
    if not client.get("fornecedora") and (data.get("fornecedora") or data.get("distribuidora") or data.get("concessionaria")):
        client["fornecedora"] = data.get("fornecedora") or data.get("distribuidora") or data.get("concessionaria")


def _build_context(rows_base: list[dict[str, Any]]) -> dict[str, Any]:
    groups: dict[str, dict[str, Any]] = {}
    base_lookup: dict[str, dict[str, str]] = {}
    ambiguous_keys: set[str] = set()

    for row in rows_base:
        row_id = row.get("codigo") or row.get("inst") or row.get("numero") or str(row.get("_row", len(groups)))
        group_id = f"gv:{row_id}"
        group = _create_group(group_id, row)
        groups[group_id] = group
        for item in _tokens_base(row):
            current = base_lookup.get(item["key"])
            if current and current["id"] != group_id:
                ambiguous_keys.add(item["key"])
                base_lookup.pop(item["key"], None)
                continue
            if item["key"] not in ambiguous_keys:
                base_lookup[item["key"]] = {"id": group_id, "origem": item["origem"]}

    return {"groups": groups, "base_lookup": base_lookup, "ambiguous_keys": ambiguous_keys}


def _resolve_group(ctx: dict[str, Any], tokens: list[dict[str, str]], data: dict[str, Any]) -> dict[str, Any] | None:
    for item in tokens:
        found = ctx["base_lookup"].get(item["key"])
        if found:
            group = ctx["groups"][found["id"]]
            group["matchOrigens"].add(found["origem"])
            _merge_client(group, data)
            return group
    return None


def _internal_gaps(months: list[str]) -> list[str]:
    indexes = [_month_index(month) for month in _unique_sorted(months)]
    indexes = [index for index in indexes if index is not None]
    if len(indexes) < 2:
        return []
    present = set(indexes)
    return [_index_month(index) for index in range(indexes[0], indexes[-1] + 1) if index not in present]


def _build_row(group: dict[str, Any], missing_rec: list[str], missing_pag: list[str], missing_both: list[str], reason: str) -> dict[str, Any]:
    client = group.get("cliente") or {}
    pag_months = _unique_sorted(group["pagMeses"])
    rec_months = _unique_sorted(group["recMeses"])
    all_months = _unique_sorted(pag_months + rec_months)
    sort_key = f"{client.get('nomeRaw') or ''}{client.get('instRaw') or ''}{client.get('numeroRaw') or ''}"
    return {
        "Cliente": _display(client.get("nomeRaw")),
        "Codigo cliente": _display(client.get("codigoRaw") or client.get("codigo")),
        "CPF/CNPJ": _display(client.get("cpfRaw") or client.get("cpf")),
        "Instalacao": _display(client.get("instRaw") or client.get("inst")),
        "Numero cliente": _display(client.get("numeroRaw") or client.get("numero")),
        "Nova instalacao": _display(client.get("novaRaw") or client.get("nova")),
        "Fornecedora": _display(client.get("fornecedora")),
        "Falta nos Recebiveis": _format_month_list(missing_rec),
        "Falta na Pagadoria": _format_month_list(missing_pag),
        "Falta nos dois lados": _format_month_list(missing_both),
        "Meses Pagadoria": _format_month_list(pag_months),
        "Meses Recebiveis": _format_month_list(rec_months),
        "Qtd. Pagadoria": len(pag_months),
        "Qtd. Recebiveis": len(rec_months),
        "Primeira competencia": _format_month(all_months[0]) if all_months else DASH,
        "Ultima competencia": _format_month(all_months[-1]) if all_months else DASH,
        "Origem do match": ", ".join(sorted(group["matchOrigens"])) or group.get("origem", "Base GV"),
        "Motivo": reason or DASH,
        "_sortKey": sort_key,
        "_search": _norm_text_value(" ".join(str(v) for v in [
            client.get("nomeRaw"), client.get("codigoRaw"), client.get("cpfRaw"), client.get("instRaw"), client.get("numeroRaw"),
            _format_month_list(missing_rec), _format_month_list(missing_pag), _format_month_list(missing_both),
        ])),
    }


def _sort_frame(rows: list[dict[str, Any]]) -> pl.DataFrame:
    if not rows:
        return pl.DataFrame()
    rows.sort(key=lambda row: str(row.get("_sortKey", "")))
    return pl.DataFrame(rows)


def reconcile_boletos_faltantes(df_pag: pl.DataFrame, df_rec: pl.DataFrame, df_base: pl.DataFrame) -> BoletosFaltantesResult:
    logs: list[dict[str, str]] = []

    def log(message: str, kind: str = "info") -> None:
        logs.append({"msg": message, "tipo": kind})

    base_rows = _prepare_base(df_base).to_dicts()
    pag_rows = _prepare_pag(df_pag).to_dicts()
    rec_rows = _prepare_rec(df_rec).to_dicts()
    ctx = _build_context(base_rows)

    pag_sem_chave = pag_sem_mes = pag_sem_base = pag_validas = 0
    rec_sem_chave = rec_sem_mes = rec_sem_base = rec_validas = 0

    for row in pag_rows:
        tokens = _tokens_pag(row)
        if not tokens:
            pag_sem_chave += 1
        if not row.get("mes"):
            pag_sem_mes += 1
        if not tokens or not row.get("mes"):
            continue
        group = _resolve_group(ctx, tokens, row)
        if not group:
            pag_sem_base += 1
            continue
        pag_validas += 1
        group["pag"].append(row)
        group["pagMeses"].add(row["mes"])

    for row in rec_rows:
        tokens = _tokens_rec(row)
        if not tokens:
            rec_sem_chave += 1
        if not row.get("mes"):
            rec_sem_mes += 1
        if not tokens or not row.get("mes"):
            continue
        group = _resolve_group(ctx, tokens, row)
        if not group:
            rec_sem_base += 1
            continue
        rec_validas += 1
        group["rec"].append(row)
        group["recMeses"].add(row["mes"])

    todos: list[dict[str, Any]] = []
    faltam_recebiveis: list[dict[str, Any]] = []
    faltam_pagadoria: list[dict[str, Any]] = []
    faltam_ambos: list[dict[str, Any]] = []
    meses_faltam_rec = meses_faltam_pag = meses_faltam_ambos = 0
    clientes_comparados = clientes_so_pagadoria = clientes_so_recebiveis = 0

    for group in ctx["groups"].values():
        pag_months = _unique_sorted(group["pagMeses"])
        rec_months = _unique_sorted(group["recMeses"])
        if not pag_months and not rec_months:
            continue
        if not pag_months:
            clientes_so_recebiveis += 1
            continue
        if not rec_months:
            clientes_so_pagadoria += 1
            continue

        clientes_comparados += 1
        pag_set = set(pag_months)
        rec_set = set(rec_months)
        missing_rec = [month for month in pag_months if month not in rec_set]
        missing_pag = [month for month in rec_months if month not in pag_set]
        missing_both = _internal_gaps(pag_months + rec_months)

        meses_faltam_rec += len(missing_rec)
        meses_faltam_pag += len(missing_pag)
        meses_faltam_ambos += len(missing_both)

        if not missing_rec and not missing_pag and not missing_both:
            continue

        reasons: list[str] = []
        if missing_rec:
            reasons.append("Existe na Pagadoria e nao existe nos Recebiveis")
        if missing_pag:
            reasons.append("Existe nos Recebiveis e nao existe na Pagadoria")
        if missing_both:
            reasons.append("Lacuna na sequencia entre primeira e ultima competencia emitida")

        row = _build_row(group, missing_rec, missing_pag, missing_both, " | ".join(reasons))
        todos.append(row)
        if missing_rec:
            faltam_recebiveis.append(_build_row(group, missing_rec, [], [], "Existe na Pagadoria e nao existe nos Recebiveis"))
        if missing_pag:
            faltam_pagadoria.append(_build_row(group, [], missing_pag, [], "Existe nos Recebiveis e nao existe na Pagadoria"))
        if missing_both:
            faltam_ambos.append(_build_row(group, [], [], missing_both, "Lacuna na sequencia entre primeira e ultima competencia emitida"))

    metrics = {
        "clientesAnalisados": clientes_comparados,
        "clientesEmAmbos": clientes_comparados,
        "clientesComPendencia": len(todos),
        "clientesSoPagadoria": clientes_so_pagadoria,
        "clientesSoRecebiveis": clientes_so_recebiveis,
        "mesesFaltamRecebiveis": meses_faltam_rec,
        "mesesFaltamPagadoria": meses_faltam_pag,
        "mesesFaltamAmbos": meses_faltam_ambos,
        "pagSemChave": pag_sem_chave,
        "pagSemMes": pag_sem_mes,
        "pagSemBaseGv": pag_sem_base,
        "recSemChave": rec_sem_chave,
        "recSemMes": rec_sem_mes,
        "recSemBaseGv": rec_sem_base,
        "chavesAmbiguasBaseGv": len(ctx["ambiguous_keys"]),
    }

    log(f"Base GV indexada: {len(base_rows):,} clientes".replace(",", "."), "ok")
    log(f"Clientes comparados nos dois lados: {clientes_comparados:,}".replace(",", "."), "ok")
    log(f"Pagadoria ligada a Base GV: {pag_validas:,} linhas".replace(",", "."), "ok")
    log(f"Recebiveis ligados a Base GV: {rec_validas:,} linhas".replace(",", "."), "ok")
    if ctx["ambiguous_keys"]:
        log(f"Chaves ambiguas na Base GV ignoradas: {len(ctx['ambiguous_keys']):,}".replace(",", "."), "warn")
    if clientes_so_pagadoria or clientes_so_recebiveis:
        log(f"Ignorados na comparacao: {clientes_so_pagadoria:,} clientes so na Pagadoria | {clientes_so_recebiveis:,} clientes so nos Recebiveis".replace(",", "."), "warn")
    if pag_sem_base or rec_sem_base:
        log(f"Sem vinculo com Base GV: {pag_sem_base:,} linhas Pagadoria | {rec_sem_base:,} linhas Recebiveis".replace(",", "."), "warn")
    if pag_sem_chave or pag_sem_mes:
        log(f"Pagadoria ignorada: {pag_sem_chave} sem chave | {pag_sem_mes} sem competencia", "warn")
    if rec_sem_chave or rec_sem_mes:
        log(f"Recebiveis ignorados: {rec_sem_chave} sem chave | {rec_sem_mes} sem competencia", "warn")

    return BoletosFaltantesResult(
        sheets={
            "TODOS": _sort_frame(todos),
            "FALTA RECEBIVEIS": _sort_frame(faltam_recebiveis),
            "FALTA PAGADORIA": _sort_frame(faltam_pagadoria),
            "FALTA DOIS LADOS": _sort_frame(faltam_ambos),
        },
        metrics=metrics,
        logs=logs,
    )
