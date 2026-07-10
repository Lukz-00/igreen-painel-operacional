from __future__ import annotations

import unicodedata
from dataclasses import dataclass
from datetime import date
from typing import Any

import polars as pl


DASH = "-"


CLIENT_ALIASES = {
    "code": ["_gmap_codigo", "Codigo", "Código", "codigo", "Codigo Cliente", "codigo cliente", "cod_cliente", "ID"],
    "inst": ["_gmap_instalacao", "Instala", "Instalacao", "Instalação", "instalacao", "UC", "num_instalacao"],
    "new_inst": ["_gmap_nova_instalacao", "Nova Instalacao", "Nova Instalação", "nova_instalacao", "Numero da instalacao", "N da instalacao", "da instalacao", "pré-padronização", "pre-padroniza"],
    "customer_no": ["_gmap_numero_cliente", "Numero Cliente", "Número Cliente", "NumeroCliente", "numero_cliente", "N Cliente", "N do cliente", "Nº do cliente", "do cliente"],
    "phone": ["_gmap_telefone", "Telefone", "telefone", "Celular", "celular", "Numero telefone", "N telefone", "Telefone 1", "celular 1", "celular 2", "WhatsApp", "Whatsapp"],
    "cpf": ["_gmap_cpf", "CPF", "Cpf", "cpf", "CPF/CNPJ", "CNPJ", "documento"],
    "name": ["_gmap_nome", "Nome", "Cliente", "Nome Cliente", "nome_cliente", "Apelido", "Razao social", "Razão social", "Raz"],
    "provider": ["_gmap_fornecedora", "Fornecedora", "fornecedora", "Regiao", "Região", "regiao", "Organizacao", "Organização", "Organiza"],
    "status": ["_gmap_status", "Status", "status", "Jornada Status", "Status Financeiro", "Situacao", "Situação", "Situa"],
    "cancel_date": ["_gmap_data_cancelamento", "Data Cancelamento", "DataCancelamento", "data_cancelamento", "Dt Cancel"],
}

PAG_ALIASES = {
    "uc": ["_gmap_instalacao", "Instala", "Instalacao", "Instalação", "instalacao", "Numero de instalacao", "Número da Instalação", "numinstalacao", "num_instalacao", "UC"],
    "month": ["_gmap_mes", "Refer", "Mes referencia", "Mês referência", "Mes de referencia", "Mês de referência", "Mes", "Mês", "Data Referencia", "Data Referência", "mes_referencia", "mesreferencia", "DATA DO DOCUMENTO"],
    "status": ["_gmap_status", "Situa", "Status fatura", "StatusFatura", "Status", "status", "Situacao do recebimento", "Situação do recebimento", "statuspagamentofornecedora"],
    "due": ["_gmap_vencimento", "Vencimento fatura", "Vencimento Fatura Norten", "Data Vencimento", "Data de vencimento", "dtvencimento", "DATA DE VENCIMENTO"],
    "value": ["_gmap_valor", "Valor fatura", "Valor da Fatura", "Valor total (R$)", "Valor", "valorapagar"],
    "cpf": ["_gmap_cpf", "CPF/CNPJ", "CPF", "cpf", "CNPJ", "documento"],
    "name": ["_gmap_cliente", "Favorecido", "Consorciado", "Nome", "Cliente", "nome_cliente", "Nome do Cliente"],
    "code": ["_gmap_codigo_cliente", "Codigo Cliente", "Código Cliente", "codigo cliente", "cod_cliente", "Codigo", "Código"],
    "provider": ["_gmap_fornecedora", "Fornecedora", "fornecedora", "Distribuidora", "Concessionaria", "Organizacao", "Organização", "Organiza"],
    "issue": ["_gmap_emissao", "Emiss", "Emissao da fatura", "Emissão da fatura", "Data de emissao", "Data de emissão", "DATA DE EMISSÃO", "DATA DE EMISSÃO - FATURA NORTEN", "Data de emissão - Fatura Norten"],
}

REC_ALIASES = {
    "uc": ["_gmap_instalacao", "Instalacao", "Instalação", "instalacao", "UC", "num_instalacao"],
    "customer_no": ["_gmap_numero_cliente", "Numero Cliente", "Número Cliente", "NumeroCliente", "numero_cliente", "N Cliente"],
    "code": ["_gmap_codigo_cliente", "Codigo Cliente", "Código Cliente", "codigo cliente", "cod_cliente", "Codigo", "Código"],
    "month": ["_gmap_mes", "Data Referencia", "Data Referência", "data referencia", "mes_referencia", "Mes", "Mês", "Mes referencia"],
    "status": ["_gmap_status", "Status", "status", "Status fatura", "Status Financeiro Cliente", "StatusFinanceiroCliente"],
    "due": ["_gmap_vencimento", "Data Vencimento", "DataVencimento", "dtvencimento", "Vencimento fatura", "Data de vencimento"],
    "value": ["_gmap_valor", "Valor A Pagar", "Valor a Pagar", "ValorAPagar", "valorapagar", "Valor"],
    "cpf": ["_gmap_cpf", "CPF", "Cpf", "cpf", "CPF/CNPJ", "CNPJ", "cnpj"],
    "name": ["_gmap_cliente", "Cliente", "cliente", "nome_cliente", "Nome"],
    "provider": ["_gmap_fornecedora", "Fornecedora", "fornecedora", "cfornecedora"],
    "issue": ["_gmap_emissao", "Emiss", "Data Emissao", "Data de emissao", "Data de Emissão da Cobrança", "Data de Emissao da Cobranca"],
}

INC_ALIASES = {
    "uc": ["_gmap_instalacao", "UNIDADE CONSUMIDORA", "UNIDADE CONSUMIDORA (UC)", "UC", "UC.1", "INSTALATIONNUMBER", "Instalacao", "Instalacao UC", "num_instalacao"],
    "customer_no": ["_gmap_numero_cliente", "Numero Cliente", "NumeroCliente", "N Cliente", "UC - ID DO PARCEIRO"],
    "code": ["_gmap_codigo_cliente", "Codigo Cliente", "Codigo", "Codigo Parceiro", "CÓDIGO PARCEIRO", "cod_cliente", "IDENTIFICADOR"],
    "cpf": ["_gmap_cpf", "CPF/CNPJ", "CPF", "CNPJ", "UC - CPF/CNPJ"],
    "month": ["_gmap_mes", "Mes referencia", "Mes de referencia", "Mês de referência", "MÊS DE REFERÊNCIA", "REFER"],
    "status": ["_gmap_status", "STATUS", "STATUS.1", "Status", "SITUACAO DO DISPARO", "SITUAÇÃO DO DISPARO"],
    "due": ["_gmap_vencimento", "DATA DE VENCIMENTO", "Data Vencimento", "Vencimento", "VENCIMENTO FATURA NORTEN", "VENCIMENTO CONCESSIONARIA"],
    "value": ["_gmap_valor", "VALOR DA FATURA (R$)", "VALOR DA FATURA", "Valor da Fatura", "VALOR LÍQUIDO (FATURAMENTO)", "VALOR LIQUIDO (FATURAMENTO)", "VALOR LÍQUIDO", "VALOR LIQUIDO", "TOTAL A PAGAR + JUROS E MULTA", "TOTAL A PAGAR", "VALORPARCELA"],
    "barcode": ["_gmap_codbar", "CÓDIGO DE BARRAS", "CODIGO DE BARRAS", "LINHA DIGITÁVEL", "LINHA DIGITAVEL", "PIX COPIA E COLA"],
    "source": ["_gmap_arquivo_origem", "ARQUIVO_DE_ORIGEM", "ARQUIVO DO BOLETO", "ARQUIVO DO RECEBIMENTO"],
    "name": ["_gmap_cliente", "NOME DO CLIENTE", "Cliente", "Nome", "UC - NOME"],
    "provider": ["_gmap_fornecedora", "DISTRIBUIDORA", "Fornecedora", "UC - CONCESSIONÁRIA", "UC - CONCESSIONARIA"],
    "issue": ["_gmap_emissao", "Emiss", "DATA DE EMISSÃO", "DATA DE EMISSÃO - FATURA NORTEN", "Data de emissao", "Data de emissão"],
}

LAB_ALIASES = {
    "idrcb": ["_gmap_idrcb", "ID RCB", "IDRCB", "idrcb"],
    "code": ["_gmap_codigo_cliente", "ID Cliente", "Codigo Cliente", "Código Cliente", "codigo cliente", "cod_cliente"],
    "uc": ["_gmap_instalacao", "Instala", "N Instala", "Nº Instala", "Numero Instalacao", "Instalacao", "UC", "num_instalacao"],
    "customer_no": ["_gmap_numero_cliente", "Numero Cliente", "N Cliente", "ID Cliente"],
    "cpf": ["_gmap_cpf", "CPF/CNPJ", "CPF", "CNPJ", "cpf"],
    "month": ["_gmap_mes", "Refer", "Mes Refer", "Mês Refer", "Data Referencia", "Data Referência", "Mes referencia"],
    "status": ["_gmap_status", "Status", "Status Fornecedora"],
    "due": ["_gmap_vencimento", "Vencimento", "Venc. Original", "Data Vencimento"],
    "payment": ["_gmap_pagamento", "Data Pagamento", "Data de pagamento"],
    "value": ["_gmap_valor", "Valor a Pagar", "Valor", "Valor Sem Desconto"],
    "barcode": ["_gmap_codbar", "Codigo de Barras", "Código de Barras", "Linha Digitavel", "Linha Digitável"],
    "name": ["_gmap_cliente", "Cliente", "Nome"],
    "provider": ["_gmap_fornecedora", "Fornecedora", "Concessionaria", "Concessionária"],
    "issue": ["_gmap_emissao", "Data Emissao", "Data de Emissao", "Data de Emissão", "Data Emissão"],
    "backoffice_inclusion": ["_gmap_inclusao_backoffice", "Data Inclusao Backoffice", "Data Inclusão Backoffice", "Data Inclus", "Inclusao Backoffice", "Inclusão Backoffice"],
}

LAB_ALIASES["code"].extend(["idcliente"])
LAB_ALIASES["uc"].extend(["numinstalacao"])
LAB_ALIASES["customer_no"].extend(["idcliente", "numcliente"])
LAB_ALIASES["month"].extend(["mesreferencia"])
LAB_ALIASES["status"].extend(["status_financeiro", "status_financeiro_cliente"])
LAB_ALIASES["payment"].extend(["dtpagamento"])
LAB_ALIASES["value"].extend(["valorapagar"])
LAB_ALIASES["barcode"].insert(0, "codigobarra")
LAB_ALIASES["backoffice_inclusion"].extend(["data_inclusao_backoffice"])


@dataclass
class InadimplentesResult:
    sheets: dict[str, pl.DataFrame]
    metrics: dict[str, Any]
    logs: list[dict[str, str]]


def _plain(value: str) -> str:
    return "".join(
        c for c in unicodedata.normalize("NFD", str(value or "").casefold())
        if unicodedata.category(c) != "Mn"
    ).strip()


def _resolve(columns: list[str], aliases: list[str]) -> str | None:
    normalized = {_plain(col): col for col in columns}
    for alias in aliases:
        if _plain(alias) in normalized:
            return normalized[_plain(alias)]
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
    return pl.col(column).cast(pl.String, strict=False).fill_null("") if column else pl.lit("")


def _has_field(frame: pl.DataFrame, aliases: dict[str, list[str]], key: str) -> bool:
    return _resolve(frame.columns, aliases[key]) is not None


def _digits(expr: pl.Expr) -> pl.Expr:
    return expr.cast(pl.String, strict=False).fill_null("").str.replace_all(r"[^0-9]", "").str.replace(r"^0+", "")


def _norm_text(expr: pl.Expr) -> pl.Expr:
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


def _month(expr: pl.Expr) -> pl.Expr:
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


def _date(expr: pl.Expr) -> pl.Expr:
    text = expr.cast(pl.String, strict=False).fill_null("").str.strip_chars()
    iso_date = text.str.extract(r"^(\d{4}-\d{2}-\d{2})", 1)
    br_date = text.str.extract(r"^(\d{2}/\d{2}/\d{4})", 1)
    return pl.coalesce([
        iso_date.str.strptime(pl.Date, "%Y-%m-%d", strict=False),
        text.str.strptime(pl.Date, "%Y-%m-%d", strict=False),
        text.str.strptime(pl.Datetime, "%Y-%m-%d %H:%M:%S", strict=False).dt.date(),
        br_date.str.strptime(pl.Date, "%d/%m/%Y", strict=False),
        text.str.strptime(pl.Date, "%d/%m/%Y", strict=False),
        text.str.strptime(pl.Datetime, "%d/%m/%Y %H:%M:%S", strict=False).dt.date(),
    ])


def _status_group(expr: pl.Expr) -> pl.Expr:
    text = _norm_text(expr)
    return (
        pl.when(text.str.contains("PAGO|PAGA|PAID|QUITAD|RECEBID")).then(pl.lit("PAGO"))
        .when(text.str.contains("CANCEL|ESTORN")).then(pl.lit("CANCELADO"))
        .when(text.str.contains("A RECEBER|A VENCER|OPEN|PENDENTE|REGULAR|EM ABERTO")).then(pl.lit("A RECEBER"))
        .when(text.str.contains("VENCID|OVERDUE|INADIMPL|EM ATRASO|ATRASADO")).then(pl.lit("VENCIDO"))
        .when(text.str.contains("NAO EMITIDA|NAO EMITIDO|CALCULAD")).then(pl.lit("CALCULADA"))
        .when(text == "").then(pl.lit(DASH))
        .otherwise(text)
    )


def _month_index(month: str) -> int | None:
    try:
        year, month_no = str(month).split("-", 1)
        return int(year) * 12 + int(month_no)
    except Exception:
        return None


def _month_from_index(index: int) -> str:
    year = (index - 1) // 12
    month_no = ((index - 1) % 12) + 1
    return f"{year}-{month_no:02d}"


def _format_month(month: str) -> str:
    if not month or "-" not in month:
        return month or DASH
    year, month_no = month.split("-", 1)
    return f"{month_no}/{year}"


def _format_months(months: list[str] | set[str]) -> str:
    values = sorted(months)
    return ", ".join(_format_month(month) for month in values) if values else DASH


def _format_date(value: Any) -> str:
    if value in (None, ""):
        return DASH
    if hasattr(value, "strftime"):
        return value.strftime("%d/%m/%Y")
    return str(value) or DASH


def _date_month_index(value: Any) -> int | None:
    if value in (None, ""):
        return None
    if hasattr(value, "year") and hasattr(value, "month"):
        return int(value.year) * 12 + int(value.month)
    text = str(value).strip()
    import re

    iso = re.match(r"^(\d{4})-(\d{2})-\d{2}", text)
    if iso:
        return int(iso.group(1)) * 12 + int(iso.group(2))
    br = re.match(r"^\d{2}/(\d{2})/(\d{4})", text)
    if br:
        return int(br.group(2)) * 12 + int(br.group(1))
    return None


def _tokens_from(frame: pl.DataFrame, specs: list[tuple[str, str, int]], id_col: str) -> pl.DataFrame:
    parts: list[pl.DataFrame] = []
    for token_type, source_col, priority in specs:
        if source_col not in frame.columns:
            continue
        parts.append(
            frame.filter(pl.col(source_col) != "").select(
                pl.col(id_col),
                pl.concat_str([pl.lit(f"{token_type}:"), pl.col(source_col)]).alias("_token"),
                pl.lit(priority).alias("_priority"),
                pl.lit(token_type).alias("_token_type"),
            )
        )
    if not parts:
        return pl.DataFrame(schema={id_col: pl.String, "_token": pl.String, "_priority": pl.Int32, "_token_type": pl.String})
    return pl.concat(parts, how="vertical_relaxed")


def _prepare_client_rows(frame: pl.DataFrame, source: str) -> pl.DataFrame:
    clients = frame.select(
        pl.int_range(pl.len(), dtype=pl.UInt32).cast(pl.String).str.zfill(8).map_elements(lambda v: f"{source}:{v}", return_dtype=pl.String).alias("client_id"),
        pl.lit(source).alias("Origem base cliente"),
        _field(frame, CLIENT_ALIASES, "code").alias("Codigo cliente"),
        _field(frame, CLIENT_ALIASES, "name").alias("Cliente"),
        _field(frame, CLIENT_ALIASES, "cpf").alias("CPF/CNPJ"),
        _field(frame, CLIENT_ALIASES, "inst").alias("Instalacao"),
        _field(frame, CLIENT_ALIASES, "customer_no").alias("Numero cliente"),
        _field(frame, CLIENT_ALIASES, "phone").alias("Numero telefone"),
        _field(frame, CLIENT_ALIASES, "new_inst").alias("Nova instalacao"),
        _field(frame, CLIENT_ALIASES, "provider").alias("Fornecedora"),
        _field(frame, CLIENT_ALIASES, "status").alias("Status base"),
        _field(frame, CLIENT_ALIASES, "cancel_date").alias("Data cancelamento"),
        _digits(_field(frame, CLIENT_ALIASES, "code")).alias("_code_norm"),
        _digits(_field(frame, CLIENT_ALIASES, "inst")).alias("_inst_norm"),
        _digits(_field(frame, CLIENT_ALIASES, "new_inst")).alias("_new_inst_norm"),
        _digits(_field(frame, CLIENT_ALIASES, "customer_no")).alias("_customer_no_norm"),
        _digits(_field(frame, CLIENT_ALIASES, "cpf")).alias("_cpf_norm"),
    )
    return clients


def _build_client_token_map(clients: pl.DataFrame) -> tuple[pl.DataFrame, int]:
    tokens = _tokens_from(
        clients,
        [
            ("codigo", "_code_norm", 0),
            ("uc", "_inst_norm", 1),
            ("uc", "_new_inst_norm", 1),
            ("nc", "_customer_no_norm", 2),
            ("cpf", "_cpf_norm", 3),
        ],
        "client_id",
    )
    if tokens.is_empty():
        return tokens, 0
    grouped = tokens.group_by("_token").agg(
        pl.n_unique("client_id").alias("_client_count"),
        pl.first("client_id").alias("client_id"),
        pl.first("_priority").alias("_priority"),
        pl.first("_token_type").alias("_token_type"),
    )
    unique_tokens = grouped.filter(pl.col("_client_count") == 1).select("_token", "client_id", "_priority", "_token_type")
    ambiguous = grouped.filter(pl.col("_client_count") > 1).height
    return unique_tokens, ambiguous


def _prepare_clients(frame: pl.DataFrame) -> tuple[pl.DataFrame, pl.DataFrame, int]:
    clients = _prepare_client_rows(frame, "cli")
    unique_tokens, ambiguous = _build_client_token_map(clients)
    return clients, unique_tokens, ambiguous


def _prepare_side(frame: pl.DataFrame, aliases: dict[str, list[str]], prefix: str, today: date, source: str = "") -> pl.DataFrame:
    status_raw = _field(frame, aliases, "status")
    due = _date(_field(frame, aliases, "due"))
    issue_raw = _field(frame, aliases, "issue") if "issue" in aliases else pl.lit("")
    issue = _date(issue_raw)
    source_name = source or prefix
    status = _status_group(status_raw)
    overdue = status.is_in(["VENCIDO", "EXPIRADA"]) | (
        due.is_not_null() & (due < today) & status.is_in(["A RECEBER", DASH])
    )
    return frame.select(
        pl.int_range(pl.len(), dtype=pl.UInt32).cast(pl.String).str.zfill(8).map_elements(lambda v: f"{source_name}:{v}", return_dtype=pl.String).alias(f"{prefix}_row_id"),
        pl.lit(source_name).alias(f"Origem {prefix.upper()}"),
        _digits(_field(frame, aliases, "uc")).alias("_uc_norm"),
        _digits(_field(frame, aliases, "customer_no")).alias("_customer_no_norm") if "customer_no" in aliases else pl.lit("").alias("_customer_no_norm"),
        _digits(_field(frame, aliases, "code")).alias("_code_norm"),
        _digits(_field(frame, aliases, "cpf")).alias("_cpf_norm"),
        _month(_field(frame, aliases, "month")).alias("Mes"),
        _field(frame, aliases, "status").alias(f"Status {prefix.upper()}"),
        status.alias(f"Status {prefix.upper()} (grupo)"),
        _field(frame, aliases, "due").alias(f"Vencimento {prefix.upper()}"),
        due.alias(f"_due_{prefix}"),
        issue_raw.alias(f"Data emissao {prefix.upper()}"),
        issue.alias(f"_issue_{prefix}"),
        _field(frame, aliases, "value").alias(f"Valor {prefix.upper()}"),
        _field(frame, aliases, "name").alias(f"Cliente {prefix.upper()}"),
        _field(frame, aliases, "provider").alias(f"Fornecedora {prefix.upper()}"),
        overdue.fill_null(False).alias(f"_vencido_{prefix}"),
    ).filter(pl.col("Mes") != "")


def _prepare_inclusion(frame: pl.DataFrame) -> pl.DataFrame:
    status_raw = _field(frame, INC_ALIASES, "status")
    status_norm = _norm_text(status_raw)
    barcode = _field(frame, INC_ALIASES, "barcode")
    issue_raw = _field(frame, INC_ALIASES, "issue")
    issue = _date(issue_raw)
    has_barcode = _norm_text(barcode) != ""
    blocked_status = status_norm.str.contains("CANCEL|SEM FATURAMENTO|SEM COMPENS|NAO FATUR|NAO EMIT|ESTIMATIVA")
    include_status = status_norm.str.contains("ATIVO|EMITID|EXPIRAD|VENCID|PENDENT|NEGOCIAD|PAG")
    return frame.select(
        pl.int_range(pl.len(), dtype=pl.UInt32).alias("inc_row_id"),
        _digits(_field(frame, INC_ALIASES, "uc")).alias("_uc_norm"),
        _digits(_field(frame, INC_ALIASES, "customer_no")).alias("_customer_no_norm"),
        _digits(_field(frame, INC_ALIASES, "code")).alias("_code_norm"),
        _digits(_field(frame, INC_ALIASES, "cpf")).alias("_cpf_norm"),
        _month(_field(frame, INC_ALIASES, "month")).alias("Mes"),
        status_raw.alias("Status Inclusao"),
        _field(frame, INC_ALIASES, "due").alias("Vencimento Inclusao"),
        _field(frame, INC_ALIASES, "value").alias("Valor Inclusao"),
        barcode.alias("Codigo barras Inclusao"),
        issue_raw.alias("Data emissao Inclusao"),
        issue.alias("_issue_inc"),
        _field(frame, INC_ALIASES, "source").alias("Arquivo origem"),
        _field(frame, INC_ALIASES, "name").alias("Cliente Inclusao"),
        _field(frame, INC_ALIASES, "provider").alias("Fornecedora Inclusao"),
        ((has_barcode | include_status) & blocked_status.not_()).fill_null(False).alias("_inclui_recebiveis"),
    ).filter(pl.col("Mes") != "")


def _prepare_lab(frame: pl.DataFrame) -> pl.DataFrame:
    issue_raw = _field(frame, LAB_ALIASES, "issue")
    inclusion_raw = _field(frame, LAB_ALIASES, "backoffice_inclusion")
    return frame.select(
        pl.int_range(pl.len(), dtype=pl.UInt32).alias("lab_row_id"),
        _digits(_field(frame, LAB_ALIASES, "uc")).alias("_uc_norm"),
        _digits(_field(frame, LAB_ALIASES, "customer_no")).alias("_customer_no_norm"),
        _digits(_field(frame, LAB_ALIASES, "code")).alias("_code_norm"),
        _digits(_field(frame, LAB_ALIASES, "cpf")).alias("_cpf_norm"),
        _month(_field(frame, LAB_ALIASES, "month")).alias("Mes"),
        _field(frame, LAB_ALIASES, "idrcb").alias("ID RCB LAB"),
        _field(frame, LAB_ALIASES, "status").alias("Status LAB"),
        _field(frame, LAB_ALIASES, "due").alias("Vencimento LAB"),
        _field(frame, LAB_ALIASES, "payment").alias("Data pagamento LAB"),
        _field(frame, LAB_ALIASES, "value").alias("Valor LAB"),
        _field(frame, LAB_ALIASES, "barcode").alias("Codigo barras LAB"),
        _field(frame, LAB_ALIASES, "name").alias("Cliente LAB"),
        _field(frame, LAB_ALIASES, "provider").alias("Fornecedora LAB"),
        issue_raw.alias("Data emissao LAB"),
        _date(issue_raw).alias("_issue_lab"),
        inclusion_raw.alias("Data Inclusao Backoffice"),
        _date(inclusion_raw).alias("_inclusion_lab"),
    ).filter(pl.col("Mes") != "")


def _match_side(side: pl.DataFrame, token_map: pl.DataFrame, prefix: str) -> tuple[pl.DataFrame, int]:
    if side.is_empty() or token_map.is_empty():
        return side.with_columns(pl.lit(None, dtype=pl.String).alias("client_id"), pl.lit("").alias("Origem do match")), side.height
    row_col = f"{prefix}_row_id"
    specs = [
        ("codigo", "_code_norm", 0),
        ("uc", "_uc_norm", 1),
        ("nc", "_uc_norm", 2),
        ("nc", "_customer_no_norm", 2),
        ("cpf", "_cpf_norm", 3),
    ]
    tokens = _tokens_from(side, specs, row_col)
    matched = (
        tokens.join(token_map, on="_token", how="inner", suffix="_base")
        .sort([row_col, "_priority", "_priority_base"])
        .unique(row_col, keep="first", maintain_order=True)
        .select(row_col, "client_id", pl.col("_token_type").alias("Origem do match"))
    )
    out = side.join(matched, on=row_col, how="left")
    unmatched = out.filter(pl.col("client_id").is_null()).height
    return out, unmatched


def _match_side_fallback(side: pl.DataFrame, token_maps: list[pl.DataFrame], prefix: str) -> tuple[pl.DataFrame, int]:
    if side.is_empty():
        return side.with_columns(pl.lit(None, dtype=pl.String).alias("client_id"), pl.lit("").alias("Origem do match")), 0
    matched_parts: list[pl.DataFrame] = []
    remaining = side
    for token_map in token_maps:
        if token_map.is_empty() or remaining.is_empty():
            continue
        matched, _ = _match_side(remaining, token_map, prefix)
        found = matched.filter(pl.col("client_id").is_not_null())
        if not found.is_empty():
            matched_parts.append(found)
        remaining = matched.filter(pl.col("client_id").is_null()).drop("client_id", "Origem do match")
    if not remaining.is_empty():
        remaining = remaining.with_columns(pl.lit(None, dtype=pl.String).alias("client_id"), pl.lit("").alias("Origem do match"))
        matched_parts.append(remaining)
    if not matched_parts:
        out = side.with_columns(pl.lit(None, dtype=pl.String).alias("client_id"), pl.lit("").alias("Origem do match"))
    else:
        out = pl.concat(matched_parts, how="diagonal_relaxed")
    return out, out.filter(pl.col("client_id").is_null()).height


def _monthly(side: pl.DataFrame, prefix: str) -> pl.DataFrame:
    if side.is_empty() or "client_id" not in side.columns:
        return pl.DataFrame(schema={"client_id": pl.String, "Mes": pl.String})
    return (
        side.filter(pl.col("client_id").is_not_null())
        .group_by("client_id", "Mes", maintain_order=True)
        .agg(
            pl.len().alias(f"Qtd. {prefix.upper()}"),
            pl.col(f"_vencido_{prefix}").sum().cast(pl.Int64).alias(f"Vencidos {prefix.upper()}"),
            pl.col(f"Status {prefix.upper()} (grupo)").unique().sort().str.join(", ").alias(f"Status {prefix.upper()} (grupo)"),
            pl.col(f"Status {prefix.upper()}").unique().sort().str.join(", ").alias(f"Status {prefix.upper()}"),
            pl.col(f"Vencimento {prefix.upper()}").drop_nulls().unique().sort().str.join(", ").alias(f"Vencimento {prefix.upper()}"),
            pl.col(f"Data emissao {prefix.upper()}").drop_nulls().unique().sort().str.join(", ").alias(f"Data emissao {prefix.upper()}"),
            pl.col(f"_issue_{prefix}").min().alias(f"_first_issue_{prefix}"),
            pl.col(f"Valor {prefix.upper()}").drop_nulls().unique().sort().str.join(", ").alias(f"Valor {prefix.upper()}"),
            pl.col("Origem do match").drop_nulls().unique().sort().str.join(", ").alias(f"Match {prefix.upper()}"),
            pl.col(f"Origem {prefix.upper()}").drop_nulls().unique().sort().str.join(", ").alias(f"Origem {prefix.upper()}"),
        )
        .with_columns((pl.col(f"Vencidos {prefix.upper()}") > 0).alias(f"Tem vencido {prefix.upper()}"))
    )


def _monthly_inclusion(side: pl.DataFrame) -> pl.DataFrame:
    if side.is_empty() or "client_id" not in side.columns:
        return pl.DataFrame(schema={"client_id": pl.String, "Mes": pl.String})
    return (
        side.filter(pl.col("client_id").is_not_null())
        .group_by("client_id", "Mes", maintain_order=True)
        .agg(
            pl.len().alias("Qtd. Inclusao"),
            pl.col("Status Inclusao").drop_nulls().unique().sort().str.join(", ").alias("Status Inclusao"),
            pl.col("Vencimento Inclusao").drop_nulls().unique().sort().str.join(", ").alias("Vencimento Inclusao"),
            pl.col("Valor Inclusao").drop_nulls().unique().sort().str.join(", ").alias("Valor Inclusao"),
            pl.col("Codigo barras Inclusao").drop_nulls().unique().sort().str.join(", ").alias("Codigo barras Inclusao"),
            pl.col("Data emissao Inclusao").drop_nulls().unique().sort().str.join(", ").alias("Data emissao Inclusao"),
            pl.col("_issue_inc").min().alias("_first_issue_inc"),
            pl.col("Arquivo origem").drop_nulls().unique().sort().str.join(", ").alias("Arquivo origem"),
            pl.col("Cliente Inclusao").drop_nulls().unique().sort().str.join(", ").alias("Cliente Inclusao"),
            pl.col("Fornecedora Inclusao").drop_nulls().unique().sort().str.join(", ").alias("Fornecedora Inclusao"),
            pl.col("Origem do match").drop_nulls().unique().sort().str.join(", ").alias("Match Inclusao"),
            pl.col("_inclui_recebiveis").max().alias("Inclui Recebiveis"),
        )
    )


def _monthly_lab(side: pl.DataFrame) -> pl.DataFrame:
    if side.is_empty() or "client_id" not in side.columns:
        return pl.DataFrame(schema={"client_id": pl.String, "Mes": pl.String})
    return (
        side.filter(pl.col("client_id").is_not_null())
        .group_by("client_id", "Mes", maintain_order=True)
        .agg(
            pl.len().alias("Qtd. LAB"),
            pl.col("ID RCB LAB").drop_nulls().unique().sort().str.join(", ").alias("ID RCB LAB"),
            pl.col("Status LAB").drop_nulls().unique().sort().str.join(", ").alias("Status LAB"),
            pl.col("Vencimento LAB").drop_nulls().unique().sort().str.join(", ").alias("Vencimento LAB"),
            pl.col("Data pagamento LAB").drop_nulls().unique().sort().str.join(", ").alias("Data pagamento LAB"),
            pl.col("Valor LAB").drop_nulls().unique().sort().str.join(", ").alias("Valor LAB"),
            pl.col("Codigo barras LAB").drop_nulls().unique().sort().str.join(", ").alias("Codigo barras LAB"),
            pl.col("Cliente LAB").drop_nulls().unique().sort().str.join(", ").alias("Cliente LAB"),
            pl.col("Fornecedora LAB").drop_nulls().unique().sort().str.join(", ").alias("Fornecedora LAB"),
            pl.col("Data emissao LAB").drop_nulls().unique().sort().str.join(", ").alias("Data emissao LAB"),
            pl.col("_issue_lab").min().alias("_first_issue_lab"),
            pl.col("Data Inclusao Backoffice").drop_nulls().unique().sort().str.join(", ").alias("Data Inclusao Backoffice"),
            pl.col("_inclusion_lab").min().alias("_first_inclusion_lab"),
            pl.col("Origem do match").drop_nulls().unique().sort().str.join(", ").alias("Match LAB"),
        )
    )


def _client_row(client: dict[str, Any]) -> dict[str, Any]:
    return {
        "Cliente": client.get("Cliente") or DASH,
        "Codigo cliente": client.get("Codigo cliente") or DASH,
        "CPF/CNPJ": client.get("CPF/CNPJ") or DASH,
        "Instalacao": client.get("Instalacao") or DASH,
        "Numero cliente": client.get("Numero cliente") or DASH,
        "Numero telefone": client.get("Numero telefone") or DASH,
        "Nova instalacao": client.get("Nova instalacao") or DASH,
        "Fornecedora": client.get("Fornecedora") or DASH,
        "Origem GV": DASH,
        "Origem base cliente": client.get("Origem base cliente") or DASH,
        "Status base": client.get("Status base") or DASH,
        "Data cancelamento": client.get("Data cancelamento") or DASH,
    }


def _format_gv_origins(origins: set[str]) -> str:
    labels = {
        "pag": "Interna",
        "pag_interna": "Interna",
        "pag_cmu": "CMU",
        "pag_northen": "Northen",
    }
    order = {"Interna": 0, "CMU": 1, "Northen": 2}
    values = {
        labels.get(origin.strip(), origin.strip())
        for origin in origins
        if origin and origin.strip()
    }
    if not values:
        return DASH
    return ", ".join(sorted(values, key=lambda value: (order.get(value, 99), value)))


def _sort_key(client: dict[str, Any]) -> str:
    return f"{client.get('Cliente') or ''}{client.get('Instalacao') or ''}{client.get('Numero cliente') or ''}"


def reconcile_inadimplentes(
    df_pag: pl.DataFrame,
    df_rec: pl.DataFrame,
    df_cli: pl.DataFrame,
    df_inc: pl.DataFrame | None = None,
    df_lab: pl.DataFrame | None = None,
    df_pag_cmu: pl.DataFrame | None = None,
    df_cli_cmu: pl.DataFrame | None = None,
    df_pag_northen: pl.DataFrame | None = None,
    *,
    min_overdue: int = 2,
    today: date | None = None,
) -> InadimplentesResult:
    today = today or date.today()
    min_overdue = max(int(min_overdue or 2), 1)
    logs: list[dict[str, str]] = []

    def log(message: str, kind: str = "info") -> None:
        logs.append({"msg": message, "tipo": kind})

    clients_main = _prepare_client_rows(df_cli, "cli")
    token_map_main, ambiguous_main = _build_client_token_map(clients_main)
    client_parts = [clients_main]
    token_maps_fallback = [token_map_main]
    token_map_cmu = pl.DataFrame(schema=token_map_main.schema)
    ambiguous_cmu = 0
    if df_cli_cmu is not None:
        clients_cmu = _prepare_client_rows(df_cli_cmu, "cli_cmu")
        token_map_cmu, ambiguous_cmu = _build_client_token_map(clients_cmu)
        client_parts.append(clients_cmu)
        token_maps_fallback.append(token_map_cmu)
    clients = pl.concat(client_parts, how="diagonal_relaxed") if len(client_parts) > 1 else client_parts[0]
    ambiguous_keys = ambiguous_main + ambiguous_cmu

    pag_main, pag_main_unmatched = _match_side(_prepare_side(df_pag, PAG_ALIASES, "pag", today, "pag_interna"), token_map_main, "pag")
    pag_parts = [pag_main]
    pag_cmu_unmatched = 0
    if df_pag_cmu is not None:
        cmu_token_maps = [token_map_cmu, token_map_main] if df_cli_cmu is not None else [token_map_main]
        pag_cmu, pag_cmu_unmatched = _match_side_fallback(_prepare_side(df_pag_cmu, PAG_ALIASES, "pag", today, "pag_cmu"), cmu_token_maps, "pag")
        pag_parts.append(pag_cmu)
    pag_northen_unmatched = 0
    if df_pag_northen is not None:
        pag_northen, pag_northen_unmatched = _match_side_fallback(_prepare_side(df_pag_northen, PAG_ALIASES, "pag", today, "pag_northen"), token_maps_fallback, "pag")
        pag_parts.append(pag_northen)
    pag = pl.concat(pag_parts, how="diagonal_relaxed") if len(pag_parts) > 1 else pag_parts[0]
    rec = _prepare_side(df_rec, REC_ALIASES, "rec", today)
    rec, rec_unmatched = _match_side_fallback(rec, token_maps_fallback, "rec")
    pag_unmatched = pag_main_unmatched + pag_cmu_unmatched + pag_northen_unmatched
    pag_monthly = _monthly(pag, "pag")
    rec_monthly = _monthly(rec, "rec")
    if df_inc is not None:
        inc = _prepare_inclusion(df_inc)
        inc, inc_unmatched = _match_side_fallback(inc, token_maps_fallback, "inc")
        inc_monthly = _monthly_inclusion(inc)
    else:
        inc_unmatched = 0
        inc_monthly = pl.DataFrame(schema={"client_id": pl.String, "Mes": pl.String})
    if df_lab is not None:
        lab = _prepare_lab(df_lab)
        lab, lab_unmatched = _match_side_fallback(lab, token_maps_fallback, "lab")
        lab_monthly = _monthly_lab(lab)
    else:
        lab_unmatched = 0
        lab_monthly = pl.DataFrame(schema={"client_id": pl.String, "Mes": pl.String})

    client_info = {row["client_id"]: row for row in clients.to_dicts()}
    pag_by_key = {(row["client_id"], row["Mes"]): row for row in pag_monthly.to_dicts()}
    rec_by_key = {(row["client_id"], row["Mes"]): row for row in rec_monthly.to_dicts()}
    inc_by_key = {(row["client_id"], row["Mes"]): row for row in inc_monthly.to_dicts()}
    lab_by_key = {(row["client_id"], row["Mes"]): row for row in lab_monthly.to_dicts()}
    months_by_client: dict[str, dict[str, set[str]]] = {}
    for client_id, month in pag_by_key:
        months_by_client.setdefault(client_id, {"pag": set(), "rec": set()})["pag"].add(month)
    for client_id, month in rec_by_key:
        months_by_client.setdefault(client_id, {"pag": set(), "rec": set()})["rec"].add(month)
    pag_origins_by_client: dict[str, set[str]] = {}
    for (client_id, _month_value), row in pag_by_key.items():
        for origin in str(row.get("Origem PAG") or "").split(","):
            origin = origin.strip()
            if origin:
                pag_origins_by_client.setdefault(client_id, set()).add(origin)

    def gv_origin(client_id: str, months: set[str] | list[str] | None = None) -> str:
        origins: set[str] = set()
        for month in months or []:
            row = pag_by_key.get((client_id, month), {})
            for origin in str(row.get("Origem PAG") or "").split(","):
                origin = origin.strip()
                if origin:
                    origins.add(origin)
        if not origins:
            origins = pag_origins_by_client.get(client_id, set())
        return _format_gv_origins(origins)

    current_month = today.strftime("%Y-%m")
    current_index = _month_index(current_month) or 0
    previous_three = {_month_from_index(current_index - offset) for offset in (1, 2, 3)}

    inadimplentes: list[dict[str, Any]] = []
    atraso: list[dict[str, Any]] = []
    erro_interno: list[dict[str, Any]] = []
    atraso_backoffice: list[dict[str, Any]] = []
    completos_ok = 0
    clientes_sem_dois_lados = 0
    clientes_mes_atual_esperado = 0

    for client_id, sides in months_by_client.items():
        client = client_info.get(client_id, {"client_id": client_id})
        pag_months = sides["pag"]
        rec_months = sides["rec"]
        if not pag_months or not rec_months:
            clientes_sem_dois_lados += 1
            continue

        observed = set(pag_months) | set(rec_months)
        indices = sorted(index for index in (_month_index(month) for month in observed) if index is not None)
        if not indices:
            continue
        expected = {_month_from_index(index) for index in range(indices[0], indices[-1] + 1)}
        if previous_three.issubset(observed):
            expected.add(current_month)
            clientes_mes_atual_esperado += 1

        missing_pag = sorted(expected - pag_months)
        missing_rec = sorted(expected - rec_months)
        missing_both = sorted(set(missing_pag) & set(missing_rec))
        internal_months = sorted(
            month
            for month in missing_rec
            if bool(inc_by_key.get((client_id, month), {}).get("Inclui Recebiveis"))
        )
        if internal_months:
            internal_set = set(internal_months)

            def inc_details(field: str) -> str:
                values = [
                    f"{_format_month(month)}: {inc_by_key.get((client_id, month), {}).get(field) or DASH}"
                    for month in internal_months
                ]
                return " | ".join(values) if values else DASH

            erro_interno.append({
                **_client_row(client),
                "Origem GV": gv_origin(client_id, internal_months),
                "Boletos esperados": len(expected),
                "Qtd. Pagadoria": len(pag_months),
                "Qtd. Recebiveis": len(rec_months),
                "Qtd. Inclusao": sum(int(inc_by_key.get((client_id, month), {}).get("Qtd. Inclusao") or 0) for month in internal_months),
                "Meses Erro Interno": _format_months(internal_months),
                "Falta nos Recebiveis": _format_months(internal_months),
                "Tambem falta na Pagadoria": _format_months(internal_set & set(missing_pag)),
                "Status Inclusao": inc_details("Status Inclusao"),
                "Vencimento Inclusao": inc_details("Vencimento Inclusao"),
                "Valor Inclusao": inc_details("Valor Inclusao"),
                "Codigo barras Inclusao": inc_details("Codigo barras Inclusao"),
                "Arquivo origem": inc_details("Arquivo origem"),
                "Criterio Inclusao": inc_details("Inclui Recebiveis"),
                "Match Inclusao": inc_details("Match Inclusao"),
                "Meses Pagadoria": _format_months(pag_months),
                "Meses Recebiveis": _format_months(rec_months),
                "Competencias esperadas": _format_months(expected),
                "Motivo": "Consta na planilha consolidada de inclusao, mas nao existe nos Recebiveis",
                "_sortKey": _sort_key(client),
            })
            missing_rec = sorted(set(missing_rec) - internal_set)
            missing_pag = sorted(set(missing_pag) - internal_set)
            missing_both = sorted(set(missing_pag) & set(missing_rec))

        if internal_months and not missing_pag and not missing_rec:
            continue

        if missing_pag or missing_rec:
            reasons = []
            if missing_pag:
                reasons.append("Existe/era esperado no Recebiveis e falta na Pagadoria")
            if missing_rec:
                reasons.append("Existe/era esperado na Pagadoria e falta nos Recebiveis")
            if current_month in missing_pag or current_month in missing_rec:
                reasons.append("Mes atual esperado porque os 3 meses anteriores existem no historico")
            row = {
                **_client_row(client),
                "Origem GV": gv_origin(client_id, pag_months),
                "Boletos esperados": len(expected),
                "Qtd. Pagadoria": len(pag_months),
                "Qtd. Recebiveis": len(rec_months),
                "Qtd. faltas faturamento": len(missing_pag) + len(missing_rec),
                "Qtd. meses com atraso": len(set(missing_pag) | set(missing_rec)),
                "Falta na Pagadoria": _format_months(missing_pag),
                "Falta nos Recebiveis": _format_months(missing_rec),
                "Falta nos dois lados": _format_months(missing_both),
                "Meses Pagadoria": _format_months(pag_months),
                "Meses Recebiveis": _format_months(rec_months),
                "Competencias esperadas": _format_months(expected),
                "Motivo": " | ".join(reasons),
                "_sortKey": _sort_key(client),
            }
            atraso.append(row)
            continue

        overdue_months: list[str] = []
        status_details: list[str] = []
        for month in sorted(expected):
            pag_row = pag_by_key.get((client_id, month), {})
            rec_row = rec_by_key.get((client_id, month), {})
            pag_overdue = bool(pag_row.get("Tem vencido PAG"))
            rec_overdue = bool(rec_row.get("Tem vencido REC"))
            if pag_overdue or rec_overdue:
                overdue_months.append(month)
                status_details.append(
                    f"{_format_month(month)} PAG:{pag_row.get('Status PAG (grupo)', DASH)} REC:{rec_row.get('Status REC (grupo)', DASH)}"
                )

        if len(overdue_months) >= min_overdue:
            row = {
                **_client_row(client),
                "Origem GV": gv_origin(client_id, expected),
                "Boletos esperados": len(expected),
                "Boletos vencidos": len(overdue_months),
                "Meses vencidos": _format_months(overdue_months),
                "Meses analisados": _format_months(expected),
                "Status vencidos": " | ".join(status_details) or DASH,
                "Qtd. Pagadoria": len(pag_months),
                "Qtd. Recebiveis": len(rec_months),
                "Motivo": f"{len(overdue_months)} boleto(s) vencido(s) com todas as competencias presentes nos dois lados",
                "_sortKey": _sort_key(client),
            }
            inadimplentes.append(row)
        else:
            completos_ok += 1

    for (client_id, month), lab_row in lab_by_key.items():
        month_idx = _month_index(month)
        if month_idx is None:
            continue
        expected_idx = month_idx + 1
        expected_month = _month_from_index(expected_idx)
        issue_date = None
        issue_source = DASH
        for source, row, field in [
            ("GV-Recebiveis", lab_row, "_first_issue_lab"),
            ("Pagadoria", pag_by_key.get((client_id, month), {}), "_first_issue_pag"),
            ("Recebiveis", rec_by_key.get((client_id, month), {}), "_first_issue_rec"),
            ("Inclusao Consolidada", inc_by_key.get((client_id, month), {}), "_first_issue_inc"),
        ]:
            candidate = row.get(field) if row else None
            if candidate:
                issue_date = candidate
                issue_source = source
                break
        inclusion_date = lab_row.get("_first_inclusion_lab")
        issue_idx = _date_month_index(issue_date)
        inclusion_idx = _date_month_index(inclusion_date)
        issue_delay = max(issue_idx - expected_idx, 0) if issue_idx is not None else None
        inclusion_delay = max(inclusion_idx - expected_idx, 0) if inclusion_idx is not None else None
        issue_late = bool(issue_delay and issue_delay > 0)
        inclusion_late = bool(inclusion_delay and inclusion_delay > 0)
        if not issue_late and not inclusion_late:
            continue

        reasons = []
        if issue_late:
            reasons.append("Emissao apos mes esperado")
        if inclusion_late:
            reasons.append("Inclusao backoffice apos mes esperado")
        client = client_info.get(client_id, {"client_id": client_id})
        atraso_backoffice.append({
            **_client_row(client),
            "Origem GV": gv_origin(client_id, [month]),
            "Mes referencia": _format_month(month),
            "Mes esperado emissao/inclusao": _format_month(expected_month),
            "Data emissao boleto": _format_date(issue_date),
            "Fonte emissao": issue_source,
            "Data inclusao backoffice": _format_date(inclusion_date),
            "Atraso emissao (meses)": issue_delay if issue_idx is not None else DASH,
            "Atraso inclusao (meses)": inclusion_delay if inclusion_idx is not None else DASH,
            "Qtd. LAB": int(lab_row.get("Qtd. LAB") or 0),
            "ID RCB LAB": lab_row.get("ID RCB LAB") or DASH,
            "Status LAB": lab_row.get("Status LAB") or DASH,
            "Vencimento LAB": lab_row.get("Vencimento LAB") or DASH,
            "Valor LAB": lab_row.get("Valor LAB") or DASH,
            "Codigo barras LAB": lab_row.get("Codigo barras LAB") or DASH,
            "Data pagamento LAB": lab_row.get("Data pagamento LAB") or DASH,
            "Match LAB": lab_row.get("Match LAB") or DASH,
            "Motivo": " | ".join(reasons),
            "_sortKey": f"{_sort_key(client)}{month}",
        })

    inadimplentes.sort(key=lambda row: str(row.get("_sortKey", "")))
    atraso.sort(key=lambda row: str(row.get("_sortKey", "")))
    erro_interno.sort(key=lambda row: str(row.get("_sortKey", "")))
    atraso_backoffice.sort(key=lambda row: str(row.get("_sortKey", "")))

    inad_frame = pl.DataFrame(inadimplentes, infer_schema_length=None) if inadimplentes else pl.DataFrame()
    atraso_frame = pl.DataFrame(atraso, infer_schema_length=None) if atraso else pl.DataFrame()
    erro_frame = pl.DataFrame(erro_interno, infer_schema_length=None) if erro_interno else pl.DataFrame()
    atraso_backoffice_frame = pl.DataFrame(atraso_backoffice, infer_schema_length=None) if atraso_backoffice else pl.DataFrame()
    total_pag_cmu = df_pag_cmu.height if df_pag_cmu is not None else 0
    total_pag_northen = df_pag_northen.height if df_pag_northen is not None else 0
    total_clientes_cmu = df_cli_cmu.height if df_cli_cmu is not None else 0
    lab_missing_issue = df_lab is not None and not _has_field(df_lab, LAB_ALIASES, "issue")
    lab_missing_inclusion = df_lab is not None and not _has_field(df_lab, LAB_ALIASES, "backoffice_inclusion")
    metrics = {
        "totalPag": df_pag.height + total_pag_cmu + total_pag_northen,
        "totalPagPrincipal": df_pag.height,
        "totalPagInterna": df_pag.height,
        "totalPagCmu": total_pag_cmu,
        "totalPagNorthen": total_pag_northen,
        "totalRec": df_rec.height,
        "totalClientesBase": df_cli.height + total_clientes_cmu,
        "totalClientesBasePrincipal": df_cli.height,
        "totalClientesBaseCmu": total_clientes_cmu,
        "totalInclusao": df_inc.height if df_inc is not None else 0,
        "totalLab": df_lab.height if df_lab is not None else 0,
        "totalGvRecebiveis": df_lab.height if df_lab is not None else 0,
        "clientesComBoletosNosDoisLados": len(months_by_client) - clientes_sem_dois_lados,
        "clientesSemDoisLados": clientes_sem_dois_lados,
        "inadimplentes": len(inadimplentes),
        "atrasoFaturamento": len(atraso),
        "erroInterno": len(erro_interno),
        "atrasoBackoffice": len(atraso_backoffice),
        "clientesCompletosOk": completos_ok,
        "minBoletosVencidos": min_overdue,
        "clientesMesAtualEsperado": clientes_mes_atual_esperado,
        "chavesAmbiguasBase": ambiguous_keys,
        "pagSemBase": pag_unmatched,
        "pagInternaSemBase": pag_main_unmatched,
        "pagCmuSemBase": pag_cmu_unmatched,
        "pagNorthenSemBase": pag_northen_unmatched,
        "recSemBase": rec_unmatched,
        "inclusaoSemBase": inc_unmatched,
        "labSemBase": lab_unmatched,
        "gvRecebiveisSemBase": lab_unmatched,
    }

    log(f"Base clientes: {metrics['totalClientesBase']:,} | Pagadorias: {metrics['totalPag']:,} | Recebiveis: {df_rec.height:,}")
    log(f"Pagadorias: Interna {metrics['totalPagInterna']:,} | GV-CMU {metrics['totalPagCmu']:,} | GV-Northen {metrics['totalPagNorthen']:,}", "ok")
    if df_cli_cmu is not None:
        log(f"Base Clientes GV-CMU recebida por compatibilidade: {metrics['totalClientesBaseCmu']:,} linhas.", "warn")
    log(f"Clientes com boletos nos dois lados: {metrics['clientesComBoletosNosDoisLados']:,}", "ok")
    if df_inc is not None:
        log(f"Planilha consolidada de inclusao: {df_inc.height:,} linhas | Erro interno: {len(erro_interno):,}", "ok")
    if df_lab is not None:
        log(f"GV-Recebiveis: {df_lab.height:,} linhas | Atraso backoffice: {len(atraso_backoffice):,}", "ok")
        if lab_missing_issue:
            log("GV-Recebiveis nao trouxe data de emissao; a aba Atraso Backoffice usou emissao da Pagadoria/Recebiveis/Inclusao quando disponivel.", "warn")
        if lab_missing_inclusion:
            log("GV-Recebiveis nao trouxe Data Inclusao Backoffice; atraso por inclusao so aparece quando essa coluna existir.", "warn")
    log(f"Inadimplentes: {len(inadimplentes):,} | Atraso de faturamento: {len(atraso):,} | Erro interno: {len(erro_interno):,} | Atraso backoffice: {len(atraso_backoffice):,}", "ok")
    if ambiguous_keys:
        log(f"Chaves repetidas na base de clientes ignoradas no match: {ambiguous_keys:,}", "warn")
    if pag_unmatched or rec_unmatched or inc_unmatched or lab_unmatched:
        log(f"Linhas sem vinculo com Base Clientes: PAG Interna {pag_main_unmatched:,} | PAG CMU {pag_cmu_unmatched:,} | PAG Northen {pag_northen_unmatched:,} | REC {rec_unmatched:,} | INC {inc_unmatched:,} | GV-Recebiveis {lab_unmatched:,}", "warn")
    pag_due_mapped = any(_has_field(frame, PAG_ALIASES, "due") for frame in [df_pag, df_pag_cmu, df_pag_northen] if frame is not None)
    if not _has_field(df_rec, REC_ALIASES, "due") and not pag_due_mapped:
        log("Coluna de vencimento nao mapeada; vencidos foram identificados apenas pelo status.", "warn")
    elif not _has_field(df_rec, REC_ALIASES, "due"):
        log("Mapear vencimento dos Recebiveis melhora a deteccao de boletos vencidos.", "warn")
    if not _has_field(df_cli, CLIENT_ALIASES, "status") and not _has_field(df_cli, CLIENT_ALIASES, "cancel_date"):
        log("A Base Clientes nao trouxe status/cancelamento; clientes cancelados nao foram filtrados automaticamente.", "warn")

    return InadimplentesResult(
        sheets={
            "INADIMPLENTES": inad_frame,
            "ATRASO FATURAMENTO": atraso_frame,
            "ERRO INTERNO": erro_frame,
            "ATRASO BACKOFFICE": atraso_backoffice_frame,
        },
        metrics=metrics,
        logs=logs,
    )
