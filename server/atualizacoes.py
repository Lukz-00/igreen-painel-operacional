from __future__ import annotations

import re
import unicodedata
from dataclasses import dataclass
from typing import Any

import polars as pl


OUTPUT_HEADERS = [
    "IDRCB",
    "FAVORECIDO",
    "COD. Cliente",
    "DISTRIBUIDORA",
    "NOME DO CLIENTE",
    "UNIDADE CONSUMIDORA (UC)",
    "MÊS DE REFERÊNCIA",
    "CONSUMO (kWh)",
    "ENERGIA COMPENSADA (kWh)",
    "TARIFA SEM DESCONTO (DISTRIBUIDORA)",
    "TARIFA COM DESCONTO (GD)",
    "% DE DESCONTO",
    "VALOR DO DESCONTO (R$)",
    "VALOR DA FATURA (R$)",
    "REPASSE DISTRIBUIDORA",
    "ECONOMIA ACUMULADA",
    "BANDEIRA TARIFÁRIA",
    "DATA DE EMISSÃO",
    "CÓDIGO DE BARRAS",
    "PIX COPIA E COLA",
    "NOVA DATA DE VENCIMENTO",
    "ID Cobrança",
    "IUGU",
]

CRITICAL_HEADERS = [
    "IDRCB",
    "NOME DO CLIENTE",
    "COD. Cliente",
    "UNIDADE CONSUMIDORA (UC)",
    "MÊS DE REFERÊNCIA",
    "VALOR DA FATURA (R$)",
    "CÓDIGO DE BARRAS",
    "NOVA DATA DE VENCIMENTO",
    "ID Cobrança",
    "IUGU",
]


UPDATE_ALIASES = {
    "idrcb": ["_gmap_idrcb", "IDRCB", "Idrcb", "idrcb", "ID RCB"],
    "code": ["_gmap_codigo_cliente", "Cod cliente", "COD. Cliente", "Codigo Cliente", "Código Cliente", "codigo cliente", "cod_cliente"],
    "name": ["_gmap_cliente", "Cliente", "NOME DO CLIENTE", "Nome do Cliente", "Nome"],
    "uc": ["_gmap_instalacao", "Instalação", "Instalacao", "UNIDADE CONSUMIDORA (UC)", "UC", "instalacao"],
    "month": ["_gmap_mes", "Mês de referência", "Mes de referencia", "MÊS DE REFERÊNCIA", "Mes referencia", "Data Referencia"],
    "provider": ["_gmap_fornecedora", "Distribuidora e UF", "DISTRIBUIDORA", "Distribuidora", "Concessionaria"],
    "new_due": ["_gmap_novo_vencimento", "Nova data pagamento", "NOVA DATA DE VENCIMENTO", "Nova data vencimento", "Novo vencimento"],
    "value": ["_gmap_valor", "Valor", "VALOR DA FATURA (R$)", "Valor da Fatura", "Valor fatura", "valor a pagar"],
    "barcode": ["_gmap_codbar", "Código de barras", "CÓDIGO DE BARRAS", "Codigo de barras", "codigo barra boleto", "Linha Digitavel"],
}

REC_ALIASES = {
    "idrcb": ["_gmap_idrcb", "idrcb", "IDRCB", "Idrcb", "ID Rcb", "Recebimento (Identificador)"],
    "code": ["_gmap_codigo_cliente", "codigo cliente", "Codigo Cliente", "Código Cliente", "cod_cliente"],
    "uc": ["_gmap_instalacao", "instalação", "Instalação", "Instalacao", "UC", "num_instalacao"],
    "month": ["_gmap_mes", "data referencia", "Data Referencia", "Mês de referência", "Mes referencia"],
    "name": ["_gmap_cliente", "cliente", "Cliente", "NOME DO CLIENTE", "Nome"],
    "provider": ["_gmap_fornecedora", "fornecedora", "Concessionaria", "concessionaria"],
    "value": ["_gmap_valor", "valor a pagar", "Valor A Pagar", "valorapagar", "Valor"],
    "barcode": ["_gmap_codbar", "codigo barra boleto", "Codigo Barra Boleto", "Código de barras", "Linha Digitavel"],
    "due": ["_gmap_vencimento", "data vencimento", "Data Vencimento", "dtvencimento"],
}

FAT_ALIASES = {
    "favorecido": ["_gmap_favorecido", "FAVORECIDO", "Favorecido"],
    "provider": ["_gmap_fornecedora", "DISTRIBUIDORA", "Distribuidora", "Concessionaria", "UC - CONCESSIONÁRIA"],
    "name": ["_gmap_cliente", "NOME DO CLIENTE", "Cliente", "Nome", "UC - NOME"],
    "code": ["_gmap_codigo_cliente", "CÓDIGO PARCEIRO", "CODIGO PARCEIRO", "Codigo Cliente", "Cod cliente", "IDENTIFICADOR"],
    "uc": ["_gmap_instalacao", "UNIDADE CONSUMIDORA (UC)", "UNIDADE CONSUMIDORA", "UC", "UC.1", "INSTALATIONNUMBER", "Instalacao"],
    "month": ["_gmap_mes", "MÊS DE REFERÊNCIA", "MES DE REFERENCIA", "Mês de referência", "Mes referencia", "Mês Faturamento"],
    "consumption": ["_gmap_consumo", "CONSUMO (kWh)", "Consumo", "consumo"],
    "compensated": ["_gmap_energia_compensada", "ENERGIA COMPENSADA (kWh)", "Energia Compensada", "Energia compensada"],
    "tariff_no_discount": ["_gmap_tarifa_sem_desconto", "TARIFA SEM DESCONTO (DISTRIBUIDORA)", "Tarifa sem desconto"],
    "tariff_discount": ["_gmap_tarifa_com_desconto", "TARIFA COM DESCONTO (GD)", "Tarifa GD", "TARIFA GD"],
    "discount_pct": ["_gmap_percentual_desconto", "% DE DESCONTO", "% - Desconto", "Percentual desconto"],
    "discount_value": ["_gmap_valor_desconto", "VALOR DO DESCONTO (R$)", "Desconto", "Valor desconto"],
    "value": ["_gmap_valor", "VALOR DA FATURA (R$)", "VALOR DA FATURA", "Valor da Fatura", "Valor fatura"],
    "repasse": ["_gmap_repasse", "REPASSE DISTRIBUIDORA", "Repasse Distribuidora", "Repasse energisa"],
    "economy": ["_gmap_economia", "ECONOMIA ACUMULADA", "Economia Acumulada"],
    "flag": ["_gmap_bandeira", "BANDEIRA TARIFÁRIA", "Bandeira Tarifária"],
    "issue_date": ["_gmap_emissao", "DATA DE EMISSÃO", "Data de emissão - Fatura GV", "Data de emissão - Fatura Norten", "Emissão da fatura"],
    "barcode": ["_gmap_codbar", "CÓDIGO DE BARRAS", "CODIGO DE BARRAS", "código de barras", "Código de barras"],
    "pix": ["_gmap_pix", "PIX COPIA E COLA", "pix copia e cola"],
}

PAG_ALIASES = {
    **FAT_ALIASES,
    "id_charge": ["_gmap_id_cobranca", "ID Cobrança", "ID Cobranca", "ID Cobrança", "ID cobrança"],
    "iugu": ["_gmap_iugu", "IUGU", "iugu"],
    "uc": ["_gmap_instalacao", "Instalação", "Instalacao", "UC", "UNIDADE CONSUMIDORA (UC)", "num_instalacao"],
    "month": ["_gmap_mes", "MÊS NORMALIZADO", "Mes referência", "Mes referencia", "Mês", "Mes", "Data Referencia"],
    "name": ["_gmap_cliente", "Consorciado", "Cliente", "NOME DO CLIENTE", "Nome"],
    "favorecido": ["_gmap_favorecido", "Favorecido", "FAVORECIDO"],
    "provider": ["_gmap_fornecedora", "Distribuidora", "DISTRIBUIDORA"],
    "issue_date": ["_gmap_emissao", "Emissão da fatura", "Data de emissão - Fatura Norten", "DATA DE EMISSÃO"],
    "value": ["_gmap_valor", "Valor fatura", "Valor da Fatura", "VALOR DA FATURA (R$)"],
    "barcode": ["_gmap_codbar", "Código de barras", "CÓDIGO DE BARRAS", "Codigo de barras"],
    "due": ["_gmap_vencimento", "Vencimento fatura", "Vencimento Fatura Norten", "DATA DE VENCIMENTO"],
}


@dataclass
class AtualizacoesResult:
    sheets: dict[str, pl.DataFrame]
    metrics: dict[str, Any]
    logs: list[dict[str, str]]


def _plain(value: Any) -> str:
    return "".join(
        c for c in unicodedata.normalize("NFD", str(value or "").casefold())
        if unicodedata.category(c) != "Mn"
    ).strip()


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


def _alnum_expr(expr: pl.Expr) -> pl.Expr:
    return (
        expr.cast(pl.String, strict=False)
        .fill_null("")
        .str.to_uppercase()
        .str.normalize("NFD")
        .str.replace_all(r"\p{M}", "")
        .str.replace_all(r"[^A-Z0-9]", "")
        .str.replace(r"^0+", "")
    )


def _text_norm_expr(expr: pl.Expr) -> pl.Expr:
    return (
        expr.cast(pl.String, strict=False)
        .fill_null("")
        .str.to_uppercase()
        .str.normalize("NFD")
        .str.replace_all(r"\p{M}", "")
        .str.replace_all(r"[^A-Z0-9]", "")
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


def _month_to_date_text(month: Any) -> str:
    value = str(month or "").strip()
    if re.fullmatch(r"\d{4}-\d{2}", value):
        return f"{value}-01"
    return value


def _date_text(value: Any) -> str:
    text = str(value or "").strip()
    if not text:
        return ""
    match = re.match(r"^(\d{4}-\d{2}-\d{2})", text)
    if match:
        return match.group(1)
    return text


def _digits(value: Any) -> str:
    return re.sub(r"^0+", "", re.sub(r"[^0-9]", "", str(value or "")))


def _alnum(value: Any) -> str:
    text = "".join(
        c for c in unicodedata.normalize("NFD", str(value or "").upper())
        if unicodedata.category(c) != "Mn"
    )
    return re.sub(r"^0+", "", re.sub(r"[^A-Z0-9]", "", text))


def _text_norm(value: Any) -> str:
    text = "".join(
        c for c in unicodedata.normalize("NFD", str(value or "").upper())
        if unicodedata.category(c) != "Mn"
    )
    return re.sub(r"[^A-Z0-9]", "", text)


def _clean(value: Any) -> str:
    text = str(value or "").strip()
    return re.sub(r"\s+", " ", text)


def _prepare(frame: pl.DataFrame, aliases: dict[str, list[str]], source: str) -> pl.DataFrame:
    fields = {
        "IDRCB": _field(frame, aliases, "idrcb") if "idrcb" in aliases else pl.lit(""),
        "FAVORECIDO": _field(frame, aliases, "favorecido") if "favorecido" in aliases else pl.lit(""),
        "COD. Cliente": _field(frame, aliases, "code") if "code" in aliases else pl.lit(""),
        "DISTRIBUIDORA": _field(frame, aliases, "provider") if "provider" in aliases else pl.lit(""),
        "NOME DO CLIENTE": _field(frame, aliases, "name") if "name" in aliases else pl.lit(""),
        "UNIDADE CONSUMIDORA (UC)": _field(frame, aliases, "uc") if "uc" in aliases else pl.lit(""),
        "MÊS DE REFERÊNCIA": _field(frame, aliases, "month") if "month" in aliases else pl.lit(""),
        "CONSUMO (kWh)": _field(frame, aliases, "consumption") if "consumption" in aliases else pl.lit(""),
        "ENERGIA COMPENSADA (kWh)": _field(frame, aliases, "compensated") if "compensated" in aliases else pl.lit(""),
        "TARIFA SEM DESCONTO (DISTRIBUIDORA)": _field(frame, aliases, "tariff_no_discount") if "tariff_no_discount" in aliases else pl.lit(""),
        "TARIFA COM DESCONTO (GD)": _field(frame, aliases, "tariff_discount") if "tariff_discount" in aliases else pl.lit(""),
        "% DE DESCONTO": _field(frame, aliases, "discount_pct") if "discount_pct" in aliases else pl.lit(""),
        "VALOR DO DESCONTO (R$)": _field(frame, aliases, "discount_value") if "discount_value" in aliases else pl.lit(""),
        "VALOR DA FATURA (R$)": _field(frame, aliases, "value") if "value" in aliases else pl.lit(""),
        "REPASSE DISTRIBUIDORA": _field(frame, aliases, "repasse") if "repasse" in aliases else pl.lit(""),
        "ECONOMIA ACUMULADA": _field(frame, aliases, "economy") if "economy" in aliases else pl.lit(""),
        "BANDEIRA TARIFÁRIA": _field(frame, aliases, "flag") if "flag" in aliases else pl.lit(""),
        "DATA DE EMISSÃO": _field(frame, aliases, "issue_date") if "issue_date" in aliases else pl.lit(""),
        "CÓDIGO DE BARRAS": _field(frame, aliases, "barcode") if "barcode" in aliases else pl.lit(""),
        "PIX COPIA E COLA": _field(frame, aliases, "pix") if "pix" in aliases else pl.lit(""),
        "NOVA DATA DE VENCIMENTO": _field(frame, aliases, "new_due") if "new_due" in aliases else pl.lit(""),
        "ID Cobrança": _field(frame, aliases, "id_charge") if "id_charge" in aliases else pl.lit(""),
        "IUGU": _field(frame, aliases, "iugu") if "iugu" in aliases else pl.lit(""),
    }
    selected = frame.select(
        pl.int_range(pl.len(), dtype=pl.UInt32).alias("_row"),
        pl.lit(source).alias("_source"),
        *[expr.alias(name) for name, expr in fields.items()],
    )
    return selected.with_columns(
        _digits_expr(pl.col("IDRCB")).alias("_idrcb_norm"),
        _digits_expr(pl.col("COD. Cliente")).alias("_code_norm"),
        _digits_expr(pl.col("UNIDADE CONSUMIDORA (UC)")).alias("_uc_digits"),
        _alnum_expr(pl.col("UNIDADE CONSUMIDORA (UC)")).alias("_uc_alnum"),
        _text_norm_expr(pl.col("NOME DO CLIENTE")).alias("_name_norm"),
        _digits_expr(pl.col("CÓDIGO DE BARRAS")).alias("_barcode_norm"),
        _month_expr(pl.col("MÊS DE REFERÊNCIA")).alias("_month_norm"),
    )


def _first_nonempty(rows: list[dict[str, Any]]) -> dict[str, Any]:
    out: dict[str, Any] = {header: "" for header in OUTPUT_HEADERS}
    out["_sources"] = []
    for row in rows:
        if not row:
            continue
        source = row.get("_source")
        if source and source not in out["_sources"]:
            out["_sources"].append(source)
        for header in OUTPUT_HEADERS:
            if not out.get(header) and _clean(row.get(header)):
                out[header] = _clean(row.get(header))
    return out


def _build_indexes(rows: list[dict[str, Any]]) -> dict[str, dict[tuple[str, str], dict[str, Any]]]:
    index: dict[str, dict[tuple[str, str], dict[str, Any]]] = {
        "idrcb": {},
        "code_month": {},
        "uc_alnum_month": {},
        "uc_digits_month": {},
        "name_month": {},
        "barcode": {},
    }
    for row in rows:
        month = str(row.get("_month_norm") or "")
        if row.get("_idrcb_norm"):
            index["idrcb"].setdefault((row["_idrcb_norm"], ""), row)
        if row.get("_code_norm") and month:
            index["code_month"].setdefault((row["_code_norm"], month), row)
        if row.get("_uc_alnum") and month:
            index["uc_alnum_month"].setdefault((row["_uc_alnum"], month), row)
        if row.get("_uc_digits") and month:
            index["uc_digits_month"].setdefault((row["_uc_digits"], month), row)
        if row.get("_name_norm") and month:
            index["name_month"].setdefault((row["_name_norm"], month), row)
        if row.get("_barcode_norm"):
            index["barcode"].setdefault((row["_barcode_norm"], ""), row)
    return index


def _lookup(index: dict[str, dict[tuple[str, str], dict[str, Any]]], update: dict[str, Any], *, allow_barcode: bool = False) -> dict[str, Any] | None:
    month = str(update.get("_month_norm") or "")
    attempts = [
        ("idrcb", update.get("_idrcb_norm"), ""),
        ("code_month", update.get("_code_norm"), month),
        ("uc_alnum_month", update.get("_uc_alnum"), month),
        ("uc_digits_month", update.get("_uc_digits"), month),
        ("name_month", update.get("_name_norm"), month),
    ]
    if allow_barcode:
        attempts.insert(1, ("barcode", update.get("_barcode_norm"), ""))
    for key, value, match_month in attempts:
        if not value:
            continue
        found = index[key].get((str(value), match_month))
        if found:
            return found
    return None


def _merge_output(update: dict[str, Any], matches: list[dict[str, Any] | None]) -> dict[str, Any]:
    merged = _first_nonempty([update] + [row for row in matches if row])
    merged["MÊS DE REFERÊNCIA"] = _month_to_date_text(update.get("_month_norm") or merged.get("MÊS DE REFERÊNCIA"))
    merged["NOVA DATA DE VENCIMENTO"] = _date_text(update.get("NOVA DATA DE VENCIMENTO") or merged.get("NOVA DATA DE VENCIMENTO"))
    # O IDRCB deve ser o boleto antigo de referencia; se a planilha de atualizacao nao trouxe, usa Recebiveis.
    if not _clean(update.get("IDRCB")):
        for row in matches:
            if row and row.get("_source") == "Recebiveis" and _clean(row.get("IDRCB")):
                merged["IDRCB"] = _clean(row.get("IDRCB"))
                break
    return {header: merged.get(header, "") for header in OUTPUT_HEADERS}


def _missing_critical(row: dict[str, Any]) -> list[str]:
    return [header for header in CRITICAL_HEADERS if not _clean(row.get(header))]


def reconcile_atualizacoes(
    df_update: pl.DataFrame,
    df_faturamento: pl.DataFrame,
    df_rec: pl.DataFrame,
    df_pag_northen: pl.DataFrame,
    df_pag_interna: pl.DataFrame,
) -> AtualizacoesResult:
    logs: list[dict[str, str]] = []

    def log(message: str, kind: str = "info") -> None:
        logs.append({"msg": message, "tipo": kind})

    updates = _prepare(df_update, UPDATE_ALIASES, "Atualizacao").filter(
        (pl.col("_code_norm") != "")
        | (pl.col("_uc_alnum") != "")
        | (pl.col("_idrcb_norm") != "")
        | (pl.col("_barcode_norm") != "")
    )
    faturamento = _prepare(df_faturamento, FAT_ALIASES, "Faturamento")
    recebiveis = _prepare(df_rec, REC_ALIASES, "Recebiveis")
    pag_northen = _prepare(df_pag_northen, PAG_ALIASES, "Pagadoria Northen")
    pag_interna = _prepare(df_pag_interna, PAG_ALIASES, "Pagadoria Interna")

    fat_idx = _build_indexes(faturamento.to_dicts())
    rec_idx = _build_indexes(recebiveis.to_dicts())
    north_idx = _build_indexes(pag_northen.to_dicts())
    int_idx = _build_indexes(pag_interna.to_dicts())

    output_rows: list[dict[str, Any]] = []
    audit_rows: list[dict[str, Any]] = []
    pending_rows: list[dict[str, Any]] = []
    found_rec = found_fat = found_north = found_int = 0

    for update in updates.to_dicts():
        rec = _lookup(rec_idx, update)
        fat = _lookup(fat_idx, update, allow_barcode=True)
        north = _lookup(north_idx, update)
        internal = _lookup(int_idx, update)
        found_rec += int(rec is not None)
        found_fat += int(fat is not None)
        found_north += int(north is not None)
        found_int += int(internal is not None)

        row = _merge_output(update, [fat, north, internal, rec])
        missing = _missing_critical(row)
        output_rows.append(row)
        audit = {
            **row,
            "Ticket": update.get("TICKET", ""),
            "Fonte IDRCB": "Atualizacao" if _clean(update.get("IDRCB")) else ("Recebiveis" if rec else ""),
            "Match Recebiveis": "SIM" if rec else "NAO",
            "Match Faturamento": "SIM" if fat else "NAO",
            "Match Pagadoria Northen": "SIM" if north else "NAO",
            "Match Pagadoria Interna": "SIM" if internal else "NAO",
            "Criticos faltantes": ", ".join(missing),
        }
        audit_rows.append(audit)
        if missing:
            pending_rows.append(audit)

    result = pl.DataFrame(output_rows, schema=OUTPUT_HEADERS) if output_rows else pl.DataFrame(schema={header: pl.String for header in OUTPUT_HEADERS})
    audit = pl.DataFrame(audit_rows) if audit_rows else pl.DataFrame()
    pending = pl.DataFrame(pending_rows) if pending_rows else pl.DataFrame({"Resultado": ["Sem pendencias criticas"]})
    metrics = {
        "totalAtualizacoes": updates.height,
        "encontradasRecebiveis": found_rec,
        "encontradasFaturamento": found_fat,
        "encontradasPagadoriaNorthen": found_north,
        "encontradasPagadoriaInterna": found_int,
        "linhasComPendencias": len(pending_rows),
        "linhasProntas": updates.height - len(pending_rows),
    }

    log(f"Atualizacoes analisadas: {updates.height:,}", "ok")
    log(f"Matches: Recebiveis {found_rec:,} | Faturamento {found_fat:,} | Northen {found_north:,} | Interna {found_int:,}", "ok")
    if pending_rows:
        log(f"Linhas com campos criticos faltantes: {len(pending_rows):,}", "warn")
    else:
        log("Todas as linhas ficaram com os campos criticos preenchidos.", "ok")

    return AtualizacoesResult(
        sheets={"ATUALIZACOES": result, "PENDENCIAS": pending, "AUDITORIA": audit},
        metrics=metrics,
        logs=logs,
    )
