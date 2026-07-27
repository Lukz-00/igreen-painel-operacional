from __future__ import annotations

import re
import unicodedata
from dataclasses import dataclass
from typing import Any

import polars as pl


DASH = "-"
RESPONSIBILITY_INTERNAL = "ERRO INTERNO"
RESPONSIBILITY_PROVIDER = "ERRO FORNECEDORA"
RESPONSIBILITY_MIXED = "ERRO INTERNO + FORNECEDORA"
RESPONSIBILITY_REVIEW_INELIGIBLE = "REVISAR - FATURAMENTO NAO ELEGIVEL"
RESPONSIBILITY_REVIEW_NO_EVIDENCE = "REVISAR - SEM EVIDENCIA"
RESPONSIBILITY_REVIEW_OUTSIDE_COVERAGE = "REVISAR - FORA DA COBERTURA"
RESPONSIBILITY_IGNORED = "IGNORADO PELA REGRA"
RESPONSIBILITY_OK = "OK"


BASE_ALIASES = {
    "code": ["_gmap_codigo", "codigo", "Codigo", "Codigo Cliente", "codigo cliente", "cod_cliente"],
    "inst": ["_gmap_instalacao", "instalacao", "Instalacao", "Instalacao / UC", "UC", "num_instalacao"],
    "new_inst": ["_gmap_nova_instalacao", "Nova instalacao", "Nova Instalacao", "nova_instalacao"],
    "customer_no": ["_gmap_numero_cliente", "numero cliente", "Numero Cliente", "NumeroCliente", "N Cliente", "UC"],
    "cpf": ["_gmap_cpf", "cpf", "CPF", "CPF/CNPJ", "cnpj", "CNPJ"],
    "name": ["_gmap_nome", "nome", "Nome", "Cliente", "cliente", "Nome Cliente"],
    "provider": ["_gmap_fornecedora", "fornecedora", "Fornecedora", "regiao/fornecedora"],
    "region": ["_gmap_regiao", "Regiao", "Região", "regiao", "Regional", "regional", "regiao/fornecedora"],
    "status": ["_gmap_status", "Status", "status", "Jornada Status", "Status Financeiro"],
}

PAG_ALIASES = {
    "uc": ["_gmap_instalacao", "Instalacao", "Instalacao / UC", "Numero de instalacao", "Numero instalacao", "numinstalacao", "num_instalacao", "UC"],
    "month": ["_gmap_mes", "Mes referencia", "Mes de referencia", "Mes", "Data Referencia", "mes_referencia", "mesreferencia", "DATA DO DOCUMENTO"],
    "cpf": ["_gmap_cpf", "CPF/CNPJ", "CPF", "cpf", "CNPJ", "documento"],
    "name": ["_gmap_cliente", "Favorecido", "Consorciado", "Nome", "Cliente", "nome_cliente", "Nome do Cliente"],
    "status": ["_gmap_status", "Status fatura", "StatusFatura", "Status", "status", "Situacao do recebimento"],
    "legend": ["_gmap_legenda", "Legenda", "legenda", "Observacao", "Observacao da fatura"],
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

FAT_ALIASES = {
    "uc": ["_gmap_instalacao", "UNIDADE CONSUMIDORA (UC)", "UNIDADE CONSUMIDORA", "UC", "UC.1", "INSTALATIONNUMBER", "Instalacao", "num_instalacao"],
    "customer_no": ["_gmap_numero_cliente", "Numero Cliente", "NumeroCliente", "N Cliente", "UC - ID DO PARCEIRO"],
    "code": ["_gmap_codigo_cliente", "Codigo Cliente", "Codigo", "Codigo Parceiro", "CODIGO PARCEIRO", "cod_cliente", "IDENTIFICADOR"],
    "month": ["_gmap_mes", "Mes referencia", "Mes de referencia", "MES DE REFERENCIA", "REFER"],
    "cpf": ["_gmap_cpf", "CPF/CNPJ", "CPF", "CNPJ", "UC - CPF/CNPJ"],
    "name": ["_gmap_cliente", "NOME DO CLIENTE", "Cliente", "Nome", "UC - NOME", "NOME PARCEIRO"],
    "status": ["_gmap_status", "STATUS", "STATUS.1", "Status", "SITUACAO DO DISPARO"],
    "value": ["_gmap_valor", "VALOR DA FATURA (R$)", "VALOR DA FATURA", "Valor da Fatura", "VALOR LIQUIDO (FATURAMENTO)", "VALOR LIQUIDO", "TOTAL A PAGAR + JUROS E MULTA", "TOTAL A PAGAR", "VALORPARCELA"],
    "due": ["_gmap_vencimento", "DATA DE VENCIMENTO", "Data Vencimento", "Vencimento", "VENCIMENTO FATURA NORTEN", "VENCIMENTO CONCESSIONARIA"],
    "provider": ["_gmap_fornecedora", "DISTRIBUIDORA", "Fornecedora", "UC - CONCESSIONARIA"],
    "barcode": ["_gmap_codbar", "CODIGO DE BARRAS", "LINHA DIGITAVEL", "PIX COPIA E COLA"],
    "source": ["_gmap_arquivo_origem", "ARQUIVO_DE_ORIGEM", "ARQUIVO DE ORIGEM", "ARQUIVO DO RECEBIMENTO", "ARQUIVO DO BOLETO"],
    "issue": ["_gmap_emissao", "DATA DE EMISSAO", "DATA DE EMISSAO - FATURA NORTEN", "Data de emissao"],
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


def _coalesced_field(frame: pl.DataFrame, aliases: dict[str, list[str]], key: str) -> pl.Expr:
    normalized: dict[str, list[str]] = {}
    for column in frame.columns:
        normalized.setdefault(_plain(column), []).append(column)

    columns: list[str] = []
    for alias in aliases[key]:
        for column in normalized.get(_plain(alias), []):
            if column not in columns:
                columns.append(column)
    if not columns:
        return pl.lit("")

    values = []
    for column in columns:
        value = pl.col(column).cast(pl.String, strict=False).fill_null("").str.strip_chars()
        values.append(pl.when(value != "").then(value))
    return pl.coalesce(values).fill_null("")


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
        _field(frame, BASE_ALIASES, "region").alias("regiao"),
        _field(frame, BASE_ALIASES, "status").alias("status"),
    )


def _prepare_pag(frame: pl.DataFrame) -> pl.DataFrame:
    uc = _field(frame, PAG_ALIASES, "uc")
    month = _field(frame, PAG_ALIASES, "month")
    cpf = _field(frame, PAG_ALIASES, "cpf")
    name = _field(frame, PAG_ALIASES, "name")
    status = _field(frame, PAG_ALIASES, "status")
    legend = _field(frame, PAG_ALIASES, "legend")
    ignored_status = pl.concat_str(
        [_norm_text_expr(status), _norm_text_expr(legend)],
        separator=" ",
    ).str.contains("SEM CONSUMO|CALCULAD")
    return frame.select(
        uc.alias("ucRaw"),
        _digits_expr(uc).alias("uc"),
        month.alias("mesRaw"),
        _month_expr(month).alias("mes"),
        cpf.alias("cpfRaw"),
        _digits_expr(cpf).alias("cpf"),
        name.alias("clienteRaw"),
        _norm_text_expr(name).alias("nomeNorm"),
        status.alias("status"),
        legend.alias("legenda"),
        _field(frame, PAG_ALIASES, "value").alias("valor"),
        _field(frame, PAG_ALIASES, "due").alias("vencimento"),
        _field(frame, PAG_ALIASES, "distributor").alias("distribuidora"),
        ignored_status.fill_null(False).alias("_ignorarFaltantes"),
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


def _prepare_fat(frame: pl.DataFrame) -> pl.DataFrame:
    uc = _coalesced_field(frame, FAT_ALIASES, "uc")
    customer_no = _coalesced_field(frame, FAT_ALIASES, "customer_no")
    code = _coalesced_field(frame, FAT_ALIASES, "code")
    month = _coalesced_field(frame, FAT_ALIASES, "month")
    cpf = _coalesced_field(frame, FAT_ALIASES, "cpf")
    name = _coalesced_field(frame, FAT_ALIASES, "name")
    status = _coalesced_field(frame, FAT_ALIASES, "status")
    barcode = _coalesced_field(frame, FAT_ALIASES, "barcode")
    status_norm = _norm_text_expr(status)
    blocked_status = status_norm.str.contains("CANCEL|SEM FATURAMENTO|SEM COMPENS|NAO FATUR|NAO EMIT|ESTIMATIVA")
    include_status = status_norm.str.contains("ATIVO|EMITID|EXPIRAD|VENCID|PENDENT|NEGOCIAD|PAG")
    should_include = ((_norm_text_expr(barcode) != "") | include_status) & blocked_status.not_()
    return frame.select(
        uc.alias("ucRaw"),
        _digits_expr(uc).alias("uc"),
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
        status.alias("status"),
        _coalesced_field(frame, FAT_ALIASES, "value").alias("valor"),
        _coalesced_field(frame, FAT_ALIASES, "due").alias("vencimento"),
        _coalesced_field(frame, FAT_ALIASES, "provider").alias("fornecedora"),
        barcode.alias("codigoBarras"),
        _coalesced_field(frame, FAT_ALIASES, "source").alias("arquivoOrigem"),
        _coalesced_field(frame, FAT_ALIASES, "issue").alias("dataEmissao"),
        should_include.fill_null(False).alias("_incluiRecebiveis"),
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


def _tokens_fat(row: dict[str, Any]) -> list[dict[str, str]]:
    tokens: list[dict[str, str]] = []
    _push_token(tokens, "codigo", row.get("codigo", ""), "Faturamento: codigo cliente")
    _push_token(tokens, "uc", row.get("uc", ""), "Faturamento: UC")
    _push_token(tokens, "nc", row.get("numero", ""), "Faturamento: numero cliente")
    return tokens


def _create_group(group_id: str, client: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": group_id,
        "origem": "Base GV",
        "cliente": client,
        "pag": [],
        "pagIgnorados": [],
        "rec": [],
        "fat": [],
        "fatTodos": [],
        "pagMeses": set(),
        "pagMesesIgnorados": set(),
        "recMeses": set(),
        "fatMeses": set(),
        "fatMesesTodos": set(),
        "pagPorMes": {},
        "pagIgnoradosPorMes": {},
        "recPorMes": {},
        "fatPorMes": {},
        "fatTodosPorMes": {},
        "fatCoverageStart": None,
        "fatCoverageEnd": None,
        "matchOrigens": {"Base GV"},
    }


def _ignored_pag_months(group: dict[str, Any]) -> set[str]:
    return set(group["pagMesesIgnorados"]) - set(group["pagMeses"])


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
    if not client.get("regiao") and data.get("regiao"):
        client["regiao"] = data["regiao"]


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


def _internal_gaps(months: list[str], ignored_months: set[str] | None = None) -> list[str]:
    indexes = [_month_index(month) for month in _unique_sorted(months)]
    indexes = [index for index in indexes if index is not None]
    if len(indexes) < 2:
        return []
    present = set(indexes)
    ignored_indexes = {
        index
        for index in (_month_index(month) for month in (ignored_months or set()))
        if index is not None
    }
    return [
        _index_month(index)
        for index in range(indexes[0], indexes[-1] + 1)
        if index not in present and index not in ignored_indexes
    ]


def _distinct_values(rows: list[dict[str, Any]], key: str) -> list[str]:
    values: list[str] = []
    for row in rows:
        value = str(row.get(key) or "").strip()
        if value and value not in values:
            values.append(value)
    return values


def _origin_flag(rows: list[dict[str, Any]]) -> str:
    if not rows:
        return "NAO LOCALIZADA"
    sources = _distinct_values(rows, "arquivoOrigem")
    if len(sources) > 1:
        flag = "MULTIPLAS ORIGENS"
    elif sources:
        flag = "ORIGEM IDENTIFICADA"
    else:
        flag = "FATURAMENTO SEM ARQUIVO DE ORIGEM"
    if not any(row.get("_incluiRecebiveis") for row in rows):
        flag += " - NAO ELEGIVEL"
    return flag


def _month_in_fat_coverage(group: dict[str, Any], month: str) -> bool:
    month_index = _month_index(month)
    start = group.get("fatCoverageStart")
    end = group.get("fatCoverageEnd")
    return month_index is not None and start is not None and end is not None and start <= month_index <= end


def _month_responsibility(
    has_pag: bool,
    has_rec: bool,
    has_fat: bool,
    has_eligible_fat: bool,
    ignored_pag: bool,
    in_fat_coverage: bool,
) -> tuple[str, str]:
    if ignored_pag:
        return RESPONSIBILITY_IGNORED, "Competencia excluida por SEM CONSUMO ou CALCULADA na Pagadoria"
    if not has_rec and has_eligible_fat:
        if has_pag:
            return RESPONSIBILITY_INTERNAL, "Existe na Pagadoria e no Faturamento elegivel, mas nao nos Recebiveis"
        return RESPONSIBILITY_MIXED, "Existe no Faturamento elegivel, mas nao existe na Pagadoria nem nos Recebiveis"
    if has_pag and not has_rec:
        if has_fat:
            return RESPONSIBILITY_REVIEW_INELIGIBLE, "Existe na Pagadoria e apenas como registro nao elegivel no Faturamento"
        if not in_fat_coverage:
            return RESPONSIBILITY_REVIEW_OUTSIDE_COVERAGE, "Competencia fora do periodo coberto pelo Faturamento Consolidado"
        return RESPONSIBILITY_PROVIDER, "Existe na Pagadoria, mas nao foi enviado no Faturamento nem localizado nos Recebiveis"
    if has_rec and not has_pag:
        return RESPONSIBILITY_PROVIDER, "Existe nos Recebiveis, mas nao existe na Pagadoria"
    if has_pag and has_rec:
        return RESPONSIBILITY_OK, "Existe na Pagadoria e nos Recebiveis"
    if has_fat:
        return RESPONSIBILITY_REVIEW_INELIGIBLE, "Existe apenas como registro nao elegivel no Faturamento"
    if not in_fat_coverage:
        return RESPONSIBILITY_REVIEW_OUTSIDE_COVERAGE, "Competencia fora do periodo coberto pelo Faturamento Consolidado"
    return RESPONSIBILITY_REVIEW_NO_EVIDENCE, "Competencia esperada sem registro nas tres bases"


def _preferred_value(
    pag_rows: list[dict[str, Any]],
    ignored_pag_rows: list[dict[str, Any]],
    rec_rows: list[dict[str, Any]],
    fat_rows: list[dict[str, Any]],
) -> str:
    pag_value_rows = pag_rows if pag_rows else ignored_pag_rows
    for rows in (pag_value_rows, rec_rows, fat_rows):
        values = _distinct_values(rows, "valor")
        if values:
            return ", ".join(values)
    return DASH


def _month_audit(group: dict[str, Any], month: str) -> dict[str, Any]:
    pag_rows = group["pagPorMes"].get(month, [])
    ignored_pag_rows = group["pagIgnoradosPorMes"].get(month, [])
    rec_rows = group["recPorMes"].get(month, [])
    fat_rows = group["fatTodosPorMes"].get(month, [])
    eligible_fat_rows = group["fatPorMes"].get(month, [])
    ignored_pag = month in _ignored_pag_months(group)
    in_fat_coverage = _month_in_fat_coverage(group, month)
    responsibility, reason = _month_responsibility(
        bool(pag_rows),
        bool(rec_rows),
        bool(fat_rows),
        bool(eligible_fat_rows),
        ignored_pag,
        in_fat_coverage,
    )
    return {
        "Mes de referencia": _format_month(month),
        "Existe na Pagadoria": "SIM" if pag_rows else "NAO",
        "Pagadoria ignorada": "SIM" if ignored_pag else "NAO",
        "Valor": _preferred_value(pag_rows, ignored_pag_rows, rec_rows, fat_rows),
        "Status Pagadoria": _joined_values(pag_rows or ignored_pag_rows, "status"),
        "Legenda Pagadoria": _joined_values(pag_rows or ignored_pag_rows, "legenda"),
        "Existe nos Recebiveis": "SIM" if rec_rows else "NAO",
        "Status Recebiveis": _joined_values(rec_rows, "status"),
        "Existe no Faturamento": "SIM" if fat_rows else "NAO",
        "Na cobertura do Faturamento": "SIM" if in_fat_coverage else "NAO",
        "Faturamento elegivel": "SIM" if eligible_fat_rows else ("NAO" if fat_rows else DASH),
        "Arquivo de origem": _joined_values(fat_rows, "arquivoOrigem"),
        "Status Faturamento": _joined_values(fat_rows, "status"),
        "Valor Faturamento": _joined_values(fat_rows, "valor"),
        "Vencimento Faturamento": _joined_values(fat_rows, "vencimento"),
        "Data emissao Faturamento": _joined_values(fat_rows, "dataEmissao"),
        "Codigo de barras Faturamento": _joined_values(fat_rows, "codigoBarras"),
        "Qtd. registros Pagadoria": len(pag_rows or ignored_pag_rows),
        "Qtd. registros Recebiveis": len(rec_rows),
        "Qtd. registros Faturamento": len(fat_rows),
        "Possivel duplicidade Faturamento": "SIM" if len(fat_rows) > 1 else "NAO",
        "Flag origem entrada": _origin_flag(fat_rows) if fat_rows or in_fat_coverage else "FORA DA COBERTURA DO FATURAMENTO",
        "Flag responsabilidade": responsibility,
        "Motivo responsabilidade": reason,
    }


def _build_responsibility_row(group: dict[str, Any], month: str) -> dict[str, Any]:
    client = group.get("cliente") or {}
    audit = _month_audit(group, month)
    row = {
        "Cliente": _display(client.get("nomeRaw")),
        "Codigo cliente": _display(client.get("codigoRaw") or client.get("codigo")),
        "CPF/CNPJ": _display(client.get("cpfRaw") or client.get("cpf")),
        "Instalacao": _display(client.get("instRaw") or client.get("inst")),
        "Numero cliente": _display(client.get("numeroRaw") or client.get("numero")),
        "Nova instalacao": _display(client.get("novaRaw") or client.get("nova")),
        "Fornecedora": _display(client.get("fornecedora")),
        "Região": _display(client.get("regiao")),
        **audit,
        "Origem do match": ", ".join(sorted(group["matchOrigens"])) or group.get("origem", "Base GV"),
        "_sortKey": f"{client.get('nomeRaw') or ''}{client.get('instRaw') or ''}{month}",
    }
    row["_search"] = _norm_text_value(" ".join(str(value) for value in row.values()))
    return row


def _issue_audit(group: dict[str, Any], months: list[str]) -> dict[str, Any]:
    ordered = _unique_sorted(months)
    if not ordered:
        return {
            "Existe no Faturamento": DASH,
            "Meses no Faturamento": DASH,
            "Meses sem Faturamento": DASH,
            "Arquivo de origem": DASH,
            "Origem por competencia": DASH,
            "Flag origem entrada": DASH,
            "Flag responsabilidade": DASH,
            "Responsabilidade por competencia": DASH,
            "Valor": DASH,
        }
    audits = [(month, _month_audit(group, month)) for month in ordered]
    with_fat = [month for month, audit in audits if audit["Existe no Faturamento"] == "SIM"]
    without_fat = [month for month, audit in audits if audit["Existe no Faturamento"] == "NAO"]
    all_fat_rows = [row for month in ordered for row in group["fatTodosPorMes"].get(month, [])]
    origin_flags = _unique_sorted([audit["Flag origem entrada"] for _, audit in audits])
    responsibilities = _unique_sorted([audit["Flag responsabilidade"] for _, audit in audits])
    exists_fat = "SIM" if len(with_fat) == len(ordered) else ("NAO" if not with_fat else "PARCIAL")
    return {
        "Existe no Faturamento": exists_fat,
        "Meses no Faturamento": _format_month_list(with_fat),
        "Meses sem Faturamento": _format_month_list(without_fat),
        "Arquivo de origem": _joined_values(all_fat_rows, "arquivoOrigem"),
        "Origem por competencia": " | ".join(
            f"{_format_month(month)}: {audit['Arquivo de origem']}" for month, audit in audits
        ),
        "Flag origem entrada": origin_flags[0] if len(origin_flags) == 1 else "MISTA",
        "Flag responsabilidade": responsibilities[0] if len(responsibilities) == 1 else "MISTA",
        "Responsabilidade por competencia": " | ".join(
            f"{_format_month(month)}: {audit['Flag responsabilidade']}" for month, audit in audits
        ),
        "Valor": " | ".join(f"{_format_month(month)}: {audit['Valor']}" for month, audit in audits),
    }


def _build_row(group: dict[str, Any], missing_rec: list[str], missing_pag: list[str], missing_both: list[str], reason: str) -> dict[str, Any]:
    client = group.get("cliente") or {}
    pag_months = _unique_sorted(group["pagMeses"])
    rec_months = _unique_sorted(group["recMeses"])
    ignored_months = _unique_sorted(_ignored_pag_months(group))
    effective_rec_months = [month for month in rec_months if month not in set(ignored_months)]
    all_months = _unique_sorted(pag_months + effective_rec_months)
    issue_audit = _issue_audit(group, missing_rec + missing_pag + missing_both)
    sort_key = f"{client.get('nomeRaw') or ''}{client.get('instRaw') or ''}{client.get('numeroRaw') or ''}"
    return {
        "Cliente": _display(client.get("nomeRaw")),
        "Codigo cliente": _display(client.get("codigoRaw") or client.get("codigo")),
        "CPF/CNPJ": _display(client.get("cpfRaw") or client.get("cpf")),
        "Instalacao": _display(client.get("instRaw") or client.get("inst")),
        "Numero cliente": _display(client.get("numeroRaw") or client.get("numero")),
        "Nova instalacao": _display(client.get("novaRaw") or client.get("nova")),
        "Fornecedora": _display(client.get("fornecedora")),
        "Região": _display(client.get("regiao")),
        "Valor": issue_audit["Valor"],
        "Falta nos Recebiveis": _format_month_list(missing_rec),
        "Falta na Pagadoria": _format_month_list(missing_pag),
        "Falta nos dois lados": _format_month_list(missing_both),
        **issue_audit,
        "Meses Pagadoria": _format_month_list(pag_months),
        "Meses Pagadoria ignorados": _format_month_list(ignored_months),
        "Meses Recebiveis": _format_month_list(rec_months),
        "Qtd. Pagadoria": len(pag_months),
        "Qtd. Pagadoria ignorados": len(ignored_months),
        "Qtd. Recebiveis": len(rec_months),
        "Primeira competencia": _format_month(all_months[0]) if all_months else DASH,
        "Ultima competencia": _format_month(all_months[-1]) if all_months else DASH,
        "Origem do match": ", ".join(sorted(group["matchOrigens"])) or group.get("origem", "Base GV"),
        "Motivo": reason or DASH,
        "_sortKey": sort_key,
        "_search": _norm_text_value(" ".join(str(v) for v in [
            client.get("nomeRaw"), client.get("codigoRaw"), client.get("cpfRaw"), client.get("instRaw"), client.get("numeroRaw"),
            _format_month_list(missing_rec), _format_month_list(missing_pag), _format_month_list(missing_both),
            _format_month_list(ignored_months), *issue_audit.values(),
        ])),
    }


def _joined_values(rows: list[dict[str, Any]], key: str) -> str:
    values = _distinct_values(rows, key)
    return ", ".join(values) if values else DASH


def _build_internal_error_row(group: dict[str, Any], month: str, rows: list[dict[str, Any]]) -> dict[str, Any]:
    client = group.get("cliente") or {}
    exists_pag = month in group["pagMeses"]
    responsibility = _month_audit(group, month)
    sort_key = f"{client.get('nomeRaw') or ''}{client.get('instRaw') or ''}{month}"
    row = {
        "Cliente": _display(client.get("nomeRaw") or _joined_values(rows, "clienteRaw")),
        "Cliente Faturamento": _joined_values(rows, "clienteRaw"),
        "Codigo cliente": _display(client.get("codigoRaw") or client.get("codigo")),
        "Codigo cliente Faturamento": _joined_values(rows, "codigoRaw"),
        "CPF/CNPJ": _display(client.get("cpfRaw") or client.get("cpf") or _joined_values(rows, "cpfRaw")),
        "Instalacao": _display(client.get("instRaw") or client.get("inst")),
        "UC Faturamento": _joined_values(rows, "ucRaw"),
        "Numero cliente": _display(client.get("numeroRaw") or client.get("numero")),
        "Nova instalacao": _display(client.get("novaRaw") or client.get("nova")),
        "Fornecedora": _display(client.get("fornecedora") or _joined_values(rows, "fornecedora")),
        "Região": _display(client.get("regiao")),
        "Mes de referencia": _format_month(month),
        "Valor": responsibility["Valor"],
        "Existe na Pagadoria": "SIM" if exists_pag else "NAO",
        "Existe nos Recebiveis": "NAO",
        "Existe no Faturamento": "SIM",
        "Faturamento elegivel": "SIM",
        "Arquivo de origem": _joined_values(rows, "arquivoOrigem"),
        "Status Faturamento": _joined_values(rows, "status"),
        "Valor Faturamento": _joined_values(rows, "valor"),
        "Vencimento Faturamento": _joined_values(rows, "vencimento"),
        "Data emissao Faturamento": _joined_values(rows, "dataEmissao"),
        "Codigo de barras Faturamento": _joined_values(rows, "codigoBarras"),
        "Qtd. registros Faturamento": len(rows),
        "Possivel duplicidade Faturamento": "SIM" if len(rows) > 1 else "NAO",
        "Flag origem entrada": _origin_flag(rows),
        "Flag responsabilidade": responsibility["Flag responsabilidade"],
        "Motivo responsabilidade": responsibility["Motivo responsabilidade"],
        "Origem do match": ", ".join(sorted(group["matchOrigens"])) or group.get("origem", "Base GV"),
        "Motivo": "Existe no Faturamento e nao existe nos Recebiveis",
        "_sortKey": sort_key,
    }
    row["_search"] = _norm_text_value(" ".join(str(value) for value in row.values()))
    return row


def _sort_frame(rows: list[dict[str, Any]]) -> pl.DataFrame:
    if not rows:
        return pl.DataFrame()
    rows.sort(key=lambda row: str(row.get("_sortKey", "")))
    return pl.DataFrame(rows)


def reconcile_boletos_faltantes(
    df_pag: pl.DataFrame,
    df_rec: pl.DataFrame,
    df_base: pl.DataFrame,
    df_fat: pl.DataFrame | None = None,
) -> BoletosFaltantesResult:
    logs: list[dict[str, str]] = []

    def log(message: str, kind: str = "info") -> None:
        logs.append({"msg": message, "tipo": kind})

    base_rows = _prepare_base(df_base).to_dicts()
    pag_rows = _prepare_pag(df_pag).to_dicts()
    rec_rows = _prepare_rec(df_rec).to_dicts()
    fat_rows = _prepare_fat(df_fat).to_dicts() if df_fat is not None else []
    ctx = _build_context(base_rows)
    fat_month_indexes = [index for index in (_month_index(row.get("mes", "")) for row in fat_rows) if index is not None]
    fat_coverage_start = min(fat_month_indexes) if fat_month_indexes else None
    fat_coverage_end = max(fat_month_indexes) if fat_month_indexes else None
    for group in ctx["groups"].values():
        group["fatCoverageStart"] = fat_coverage_start
        group["fatCoverageEnd"] = fat_coverage_end

    pag_sem_chave = pag_sem_mes = pag_sem_base = pag_validas = pag_ignoradas = 0
    rec_sem_chave = rec_sem_mes = rec_sem_base = rec_validas = 0
    fat_sem_chave = fat_sem_mes = fat_sem_base = fat_validas = fat_nao_elegiveis = 0

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
        if row.get("_ignorarFaltantes"):
            pag_ignoradas += 1
            group["pagIgnorados"].append(row)
            group["pagMesesIgnorados"].add(row["mes"])
            group["pagIgnoradosPorMes"].setdefault(row["mes"], []).append(row)
            continue
        pag_validas += 1
        group["pag"].append(row)
        group["pagMeses"].add(row["mes"])
        group["pagPorMes"].setdefault(row["mes"], []).append(row)

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
        group["recPorMes"].setdefault(row["mes"], []).append(row)

    for row in fat_rows:
        fat_eligible = bool(row.get("_incluiRecebiveis"))
        if not fat_eligible:
            fat_nao_elegiveis += 1
        tokens = _tokens_fat(row)
        if not tokens:
            fat_sem_chave += 1
        if not row.get("mes"):
            fat_sem_mes += 1
        if not tokens or not row.get("mes"):
            continue
        group = _resolve_group(ctx, tokens, row)
        if not group:
            fat_sem_base += 1
            continue
        group["fatTodos"].append(row)
        group["fatMesesTodos"].add(row["mes"])
        group["fatTodosPorMes"].setdefault(row["mes"], []).append(row)
        if not fat_eligible:
            continue
        fat_validas += 1
        group["fat"].append(row)
        group["fatMeses"].add(row["mes"])
        group["fatPorMes"].setdefault(row["mes"], []).append(row)

    todos: list[dict[str, Any]] = []
    faltam_recebiveis: list[dict[str, Any]] = []
    faltam_pagadoria: list[dict[str, Any]] = []
    faltam_ambos: list[dict[str, Any]] = []
    meses_faltam_rec = meses_faltam_pag = meses_faltam_ambos = 0
    clientes_comparados = clientes_so_pagadoria = clientes_so_recebiveis = 0
    erros_internos: list[dict[str, Any]] = []
    responsabilidade: list[dict[str, Any]] = []
    erros_fornecedora: list[dict[str, Any]] = []
    clientes_erro_interno: set[str] = set()
    erros_com_pagadoria = erros_sem_pagadoria = 0
    competencias_pag_ignoradas = sum(len(_ignored_pag_months(group)) for group in ctx["groups"].values())

    for group in ctx["groups"].values():
        ignored_months = _ignored_pag_months(group)
        observed_months = set(group["pagMeses"]) | set(group["pagMesesIgnorados"]) | set(group["recMeses"]) | set(group["fatMesesTodos"])
        expected_gaps = _internal_gaps(
            _unique_sorted(set(group["pagMeses"]) | set(group["recMeses"])),
            ignored_months,
        )
        for month in _unique_sorted(observed_months | set(expected_gaps)):
            row = _build_responsibility_row(group, month)
            responsabilidade.append(row)
            if "FORNECEDORA" in row["Flag responsabilidade"]:
                erros_fornecedora.append(row.copy())

    for group in ctx["groups"].values():
        ignored_months = _ignored_pag_months(group)
        missing_in_receivables = sorted(set(group["fatMeses"]) - set(group["recMeses"]) - ignored_months)
        for month in missing_in_receivables:
            month_rows = [row for row in group["fat"] if row.get("mes") == month]
            if not month_rows:
                continue
            erros_internos.append(_build_internal_error_row(group, month, month_rows))
            clientes_erro_interno.add(group["id"])
            if month in group["pagMeses"]:
                erros_com_pagadoria += 1
            else:
                erros_sem_pagadoria += 1

    for group in ctx["groups"].values():
        pag_months = _unique_sorted(group["pagMeses"])
        ignored_months = _ignored_pag_months(group)
        rec_months = [month for month in _unique_sorted(group["recMeses"]) if month not in ignored_months]
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
        missing_both = _internal_gaps(pag_months + rec_months, ignored_months)

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

    erros_internos_puros = sum(row["Flag responsabilidade"] == RESPONSIBILITY_INTERNAL for row in responsabilidade)
    erros_mistos = sum(row["Flag responsabilidade"] == RESPONSIBILITY_MIXED for row in responsabilidade)
    revisao_responsabilidade = sum(str(row["Flag responsabilidade"]).startswith("REVISAR") for row in responsabilidade)
    origem_identificada = sum(row["Arquivo de origem"] != DASH for row in responsabilidade)
    metrics = {
        "clientesAnalisados": clientes_comparados,
        "clientesEmAmbos": clientes_comparados,
        "clientesComPendencia": len(todos),
        "clientesSoPagadoria": clientes_so_pagadoria,
        "clientesSoRecebiveis": clientes_so_recebiveis,
        "mesesFaltamRecebiveis": meses_faltam_rec,
        "mesesFaltamPagadoria": meses_faltam_pag,
        "mesesFaltamAmbos": meses_faltam_ambos,
        "errosInternos": len(erros_internos),
        "errosInternosPuros": erros_internos_puros,
        "clientesErroInterno": len(clientes_erro_interno),
        "errosInternosComPagadoria": erros_com_pagadoria,
        "errosInternosSemPagadoria": erros_sem_pagadoria,
        "errosFornecedora": len(erros_fornecedora),
        "errosMistos": erros_mistos,
        "revisaoResponsabilidade": revisao_responsabilidade,
        "boletosAuditados": len(responsabilidade),
        "origemIdentificada": origem_identificada,
        "origemNaoIdentificada": len(responsabilidade) - origem_identificada,
        "coberturaFaturamentoInicio": _format_month(_index_month(fat_coverage_start)) if fat_coverage_start is not None else DASH,
        "coberturaFaturamentoFim": _format_month(_index_month(fat_coverage_end)) if fat_coverage_end is not None else DASH,
        "pagSemChave": pag_sem_chave,
        "pagSemMes": pag_sem_mes,
        "pagSemBaseGv": pag_sem_base,
        "pagIgnoradasFaltantes": pag_ignoradas,
        "competenciasPagIgnoradas": competencias_pag_ignoradas,
        "recSemChave": rec_sem_chave,
        "recSemMes": rec_sem_mes,
        "recSemBaseGv": rec_sem_base,
        "fatSemChave": fat_sem_chave,
        "fatSemMes": fat_sem_mes,
        "fatSemBaseGv": fat_sem_base,
        "fatNaoElegiveis": fat_nao_elegiveis,
        "chavesAmbiguasBaseGv": len(ctx["ambiguous_keys"]),
    }

    log(f"Base GV indexada: {len(base_rows):,} clientes".replace(",", "."), "ok")
    log(f"Clientes comparados nos dois lados: {clientes_comparados:,}".replace(",", "."), "ok")
    log(f"Pagadoria considerada na comparacao: {pag_validas:,} linhas".replace(",", "."), "ok")
    log(f"Recebiveis ligados a Base GV: {rec_validas:,} linhas".replace(",", "."), "ok")
    if df_fat is not None:
        log(f"Faturamento ligado a Base GV: {fat_validas:,} linhas".replace(",", "."), "ok")
        if fat_coverage_start is not None and fat_coverage_end is not None:
            log(f"Cobertura do Faturamento Consolidado: {_format_month(_index_month(fat_coverage_start))} a {_format_month(_index_month(fat_coverage_end))}", "ok")
        else:
            log("Cobertura do Faturamento Consolidado nao identificada", "warn")
        log(f"Erros internos encontrados: {len(erros_internos):,} competencias | {erros_com_pagadoria:,} com Pagadoria | {erros_sem_pagadoria:,} sem Pagadoria".replace(",", "."), "warn" if erros_internos else "ok")
        log(f"Responsabilidade auditada: {len(responsabilidade):,} competencias | {erros_internos_puros:,} internas | {len(erros_fornecedora):,} com divergencia da fornecedora | {revisao_responsabilidade:,} para revisar".replace(",", "."), "warn" if erros_internos_puros or erros_fornecedora or revisao_responsabilidade else "ok")
    if ctx["ambiguous_keys"]:
        log(f"Chaves ambiguas na Base GV ignoradas: {len(ctx['ambiguous_keys']):,}".replace(",", "."), "warn")
    if clientes_so_pagadoria or clientes_so_recebiveis:
        log(f"Ignorados na comparacao: {clientes_so_pagadoria:,} clientes so na Pagadoria | {clientes_so_recebiveis:,} clientes so nos Recebiveis".replace(",", "."), "warn")
    if pag_sem_base or rec_sem_base:
        log(f"Sem vinculo com Base GV: {pag_sem_base:,} linhas Pagadoria | {rec_sem_base:,} linhas Recebiveis".replace(",", "."), "warn")
    if pag_sem_chave or pag_sem_mes:
        log(f"Pagadoria ignorada: {pag_sem_chave} sem chave | {pag_sem_mes} sem competencia", "warn")
    if pag_ignoradas:
        log(f"Pagadoria fora da regra de faltantes: {pag_ignoradas:,} linhas em {competencias_pag_ignoradas:,} competencias com SEM CONSUMO ou CALCULADA".replace(",", "."), "warn")
    if rec_sem_chave or rec_sem_mes:
        log(f"Recebiveis ignorados: {rec_sem_chave} sem chave | {rec_sem_mes} sem competencia", "warn")
    if fat_sem_base:
        log(f"Faturamento sem vinculo com Base GV: {fat_sem_base:,} linhas".replace(",", "."), "warn")
    if fat_sem_chave or fat_sem_mes:
        log(f"Faturamento ignorado: {fat_sem_chave} sem chave | {fat_sem_mes} sem competencia", "warn")
    if fat_nao_elegiveis:
        log(f"Faturamento fora da regra de inclusao: {fat_nao_elegiveis:,} linhas canceladas, sem faturamento ou sem evidencia de emissao".replace(",", "."), "warn")

    return BoletosFaltantesResult(
        sheets={
            "TODOS": _sort_frame(todos),
            "FALTA RECEBIVEIS": _sort_frame(faltam_recebiveis),
            "FALTA PAGADORIA": _sort_frame(faltam_pagadoria),
            "FALTA DOIS LADOS": _sort_frame(faltam_ambos),
            "ERRO INTERNO": _sort_frame(erros_internos),
            "ERRO FORNECEDORA": _sort_frame(erros_fornecedora),
            "RESPONSABILIDADE": _sort_frame(responsabilidade),
        },
        metrics=metrics,
        logs=logs,
    )
