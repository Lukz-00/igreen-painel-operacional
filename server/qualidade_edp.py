from __future__ import annotations

import re
import unicodedata
from dataclasses import dataclass
from typing import Any

import polars as pl


DASH = "-"
OK = "OK"
DIVERGENTE = "Divergente"
NA = "N/A"


PAG_ALIASES = {
    "charge": ["_gmap_cobranca", "Cobranca EDP", "Cobranca", "ID da Cobranca", "ID Cobranca"],
    "name": ["_gmap_cliente", "Cliente", "Nome", "Favorecido", "Consorciado"],
    "cpf": ["_gmap_cpf", "CPF / CNPJ", "CPF/CNPJ", "CPF", "CNPJ", "documento"],
    "value": ["_gmap_valor", "Valor do Boleto (R$)", "Valor do Boleto", "Valor da Fatura", "Valor fatura", "valorapagar"],
    "paid_value": ["_gmap_valor_pago", "Valor Pago (R$)", "Valor Pago", "Valor pago pelo cliente (R$)"],
    "issue": ["_gmap_emissao", "Data de Emissao da Cobranca", "Data de Emissao", "Emissao da fatura"],
    "uc": ["_gmap_instalacao", "Numero da Instalacao", "N da Instalacao", "Instalacao", "UC", "numinstalacao"],
    "distributor": ["_gmap_distribuidora", "Distribuidora", "Concessionaria", "Concessionaria"],
    "compensated": ["_gmap_compensado", "Energia Compensada (kWh)", "Energia Compensada", "energiacompensada"],
    "balance": ["_gmap_saldo", "Saldo acumulado (kWh)", "Saldo acumulado", "energiaacumulada"],
    "status": ["_gmap_status", "Status", "Status Boleto", "Status fatura"],
    "month": ["_gmap_mes", "Mes de Referencia", "Mes Referencia", "Mes", "Data Referencia", "mesreferencia"],
    "consumption": ["_gmap_consumo", "Consumo Total (kWh)", "Consumo Total", "Consumo Mes", "Consumo"],
    "due": ["_gmap_vencimento", "Data de Vencimento da Cobranca", "Data de Vencimento", "Vencimento fatura"],
    "paid_at": ["_gmap_pagamento", "Data de Pagamento da Cobranca", "Data de Pagamento", "Data pagamento"],
    "barcode": ["_gmap_codbar", "Linha Digitavel", "Codigo de barras", "Codigo Barra Boleto"],
    "availability": ["_gmap_disponibilidade", "Disponibilidade", "Dosponibilidade"],
}

REC_ALIASES = {
    "provider": ["_gmap_fornecedora", "fornecedora", "Fornecedora"],
    "idcliente": ["_gmap_codigo_cliente", "idcliente", "codigo cliente", "Codigo Cliente", "cod_cliente"],
    "name": ["_gmap_cliente", "cliente", "Cliente", "Nome"],
    "value": ["_gmap_valor", "valor a pagar", "valorapagar", "Valor A Pagar", "Valor"],
    "month": ["_gmap_mes", "data referencia", "Data Referencia", "mesreferencia", "Mes Referencia"],
    "paid_at": ["_gmap_pagamento", "data pagamento", "dtpagamento", "Data Pagamento"],
    "due": ["_gmap_vencimento", "data vencimento", "dtvencimento", "Data Vencimento"],
    "url": ["_gmap_url", "url boleto", "urlboleto", "Url Boleto"],
    "uc": ["_gmap_instalacao", "instalacao", "Instalacao", "numinstalacao", "UC"],
    "distributor": ["_gmap_distribuidora", "Concessionaria", "concessionaria", "Distribuidora"],
    "cpf": ["_gmap_cpf", "cpf", "CPF", "CPF/CNPJ"],
    "cnpj": ["_gmap_cnpj", "cnpj", "CNPJ"],
    "simulated": ["_gmap_valor_distribuidora", "nvalordistribuidora", "Valor Simulado Distribuidora", "Valor Distribuidora"],
    "status": ["_gmap_status", "status", "Status", "status_financeiro"],
    "idrcb": ["_gmap_idrcb", "idrcb", "IDRCB", "Idrcb"],
    "customer_no": ["_gmap_numero_cliente", "numero cliente", "numcliente", "Numero Cliente"],
}

CLI_ALIASES = {
    "code": ["_gmap_codigo_cliente", "codigo", "Codigo", "codigo cliente", "Codigo Cliente"],
    "name": ["_gmap_nome", "nome", "Nome", "Cliente"],
    "inst": ["_gmap_instalacao", "instalacao", "Instalacao"],
    "new_inst": ["_gmap_nova_instalacao", "Nova instalacao", "Nova Instalacao", "nova_instalacao"],
    "customer_no": ["_gmap_numero_cliente", "numero cliente", "Numero Cliente", "numcliente"],
    "avg_consumption": ["_gmap_media_consumo", "media consumo", "Media Consumo", "media_consumo_contratada"],
    "cpf": ["_gmap_cpf", "cpf", "CPF", "CPF/CNPJ"],
    "cnpj": ["_gmap_cnpj", "cnpj", "CNPJ"],
    "classification": ["_gmap_classificacao", "classificacao", "Classificacao", "Classe"],
    "provider": ["_gmap_fornecedora", "fornecedora", "Fornecedora"],
    "region": ["_gmap_regiao", "regiao", "Regiao", "Distribuidora", "Concessionaria"],
}


@dataclass
class QualidadeEdpResult:
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


def _text_norm_expr(expr: pl.Expr) -> pl.Expr:
    return (
        expr.cast(pl.String, strict=False)
        .fill_null("")
        .str.to_uppercase()
        .str.normalize("NFD")
        .str.replace_all(r"\p{M}", "")
        .str.replace_all(r"[^A-Z0-9]", "")
    )


def _num_expr(expr: pl.Expr) -> pl.Expr:
    text = expr.cast(pl.String, strict=False).fill_null("").str.strip_chars().str.replace_all(r"[^0-9,.\-]", "")
    normalized = pl.when(text.str.contains(",", literal=True)).then(
        text.str.replace_all(r"\.", "").str.replace_all(",", ".")
    ).otherwise(text)
    return normalized.cast(pl.Float64, strict=False)


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


def _prepare_pag(frame: pl.DataFrame) -> pl.DataFrame:
    uc = _field(frame, PAG_ALIASES, "uc")
    cpf = _field(frame, PAG_ALIASES, "cpf")
    name = _field(frame, PAG_ALIASES, "name")
    month = _field(frame, PAG_ALIASES, "month")
    value = _field(frame, PAG_ALIASES, "value")
    paid_value = _field(frame, PAG_ALIASES, "paid_value")
    consumption = _field(frame, PAG_ALIASES, "consumption")
    compensated = _field(frame, PAG_ALIASES, "compensated")
    availability = _field(frame, PAG_ALIASES, "availability")
    return frame.select(
        pl.int_range(pl.len(), dtype=pl.UInt32).alias("_p_row"),
        _field(frame, PAG_ALIASES, "charge").alias("Cobranca"),
        name.alias("Cliente"),
        uc.alias("N Instalacao"),
        _field(frame, PAG_ALIASES, "distributor").alias("Distribuidora"),
        month.alias("Mes Referencia Original"),
        _month_expr(month).alias("_mes_norm"),
        _field(frame, PAG_ALIASES, "status").alias("Status Boleto"),
        value.alias("Valor do Boleto (R$)"),
        _num_expr(value).alias("_valor_boleto"),
        paid_value.alias("Valor Pago (R$)"),
        _num_expr(paid_value).alias("_valor_pago"),
        consumption.alias("Consumo Mes (kWh)"),
        _num_expr(consumption).alias("_consumo"),
        compensated.alias("Energia Compensada (kWh)"),
        _num_expr(compensated).alias("_compensada"),
        availability.alias("Disponibilidade Original"),
        _num_expr(availability).alias("_disponibilidade_pag"),
        _field(frame, PAG_ALIASES, "balance").alias("Saldo acumulado (kWh)"),
        _field(frame, PAG_ALIASES, "issue").alias("Data Emissao"),
        _field(frame, PAG_ALIASES, "due").alias("Data Vencimento"),
        _field(frame, PAG_ALIASES, "paid_at").alias("Data Pagamento"),
        _field(frame, PAG_ALIASES, "barcode").alias("Linha Digitavel"),
        _digits_expr(uc).alias("_uc_norm"),
        _digits_expr(cpf).alias("_cpf_norm"),
        _text_norm_expr(name).alias("_name_norm"),
        _text_norm_expr(_field(frame, PAG_ALIASES, "distributor")).alias("_dist_norm"),
    ).filter((pl.col("_uc_norm") != "") & (pl.col("_mes_norm") != ""))


def _prepare_rec(frame: pl.DataFrame) -> pl.DataFrame:
    uc = _field(frame, REC_ALIASES, "uc")
    cpf = _field(frame, REC_ALIASES, "cpf")
    month = _field(frame, REC_ALIASES, "month")
    value = _field(frame, REC_ALIASES, "value")
    simulated = _field(frame, REC_ALIASES, "simulated")
    return frame.select(
        pl.int_range(pl.len(), dtype=pl.UInt32).alias("_r_row"),
        uc.alias("RCB Instalacao"),
        _digits_expr(uc).alias("_r_uc_norm"),
        month.alias("RCB Mes Original"),
        _month_expr(month).alias("_r_mes_norm"),
        _field(frame, REC_ALIASES, "name").alias("RCB Cliente"),
        cpf.alias("RCB CPF"),
        _digits_expr(cpf).alias("_r_cpf_norm"),
        _field(frame, REC_ALIASES, "cnpj").alias("RCB CNPJ"),
        _field(frame, REC_ALIASES, "status").alias("RCB Status"),
        value.alias("RCB Valor a Pagar"),
        _num_expr(value).alias("_r_valor"),
        simulated.alias("Valor Simulado Distribuidora (R$)"),
        _num_expr(simulated).alias("_r_simulado"),
        _field(frame, REC_ALIASES, "idrcb").alias("IDRCB"),
        _field(frame, REC_ALIASES, "customer_no").alias("Numero Cliente"),
        _field(frame, REC_ALIASES, "idcliente").alias("Codigo Cliente"),
        _field(frame, REC_ALIASES, "distributor").alias("RCB Distribuidora"),
        _field(frame, REC_ALIASES, "due").alias("RCB Vencimento"),
        _field(frame, REC_ALIASES, "paid_at").alias("RCB Pagamento"),
        _field(frame, REC_ALIASES, "url").alias("RCB URL Boleto"),
    ).filter(pl.col("_r_mes_norm") != "")


def _prepare_cli(frame: pl.DataFrame) -> pl.DataFrame:
    inst = _field(frame, CLI_ALIASES, "inst")
    new_inst = _field(frame, CLI_ALIASES, "new_inst")
    customer_no = _field(frame, CLI_ALIASES, "customer_no")
    cpf = _field(frame, CLI_ALIASES, "cpf")
    cnpj = _field(frame, CLI_ALIASES, "cnpj")
    name = _field(frame, CLI_ALIASES, "name")
    classification = _field(frame, CLI_ALIASES, "classification")
    return frame.select(
        pl.int_range(pl.len(), dtype=pl.UInt32).alias("_cli_row"),
        _field(frame, CLI_ALIASES, "code").alias("Codigo Cliente Base"),
        name.alias("Cliente Base"),
        inst.alias("Instalacao Base"),
        new_inst.alias("Nova Instalacao Base"),
        customer_no.alias("Numero Cliente Base"),
        _digits_expr(inst).alias("_cli_inst"),
        _digits_expr(new_inst).alias("_cli_new_inst"),
        _digits_expr(customer_no).alias("_cli_customer_no"),
        cpf.alias("CPF Base"),
        cnpj.alias("CNPJ Base"),
        _digits_expr(cpf).alias("_cli_cpf"),
        _digits_expr(cnpj).alias("_cli_cnpj"),
        _text_norm_expr(name).alias("_cli_name_norm"),
        _field(frame, CLI_ALIASES, "avg_consumption").alias("Media Consumo UC (kWh)"),
        _num_expr(_field(frame, CLI_ALIASES, "avg_consumption")).alias("_media_consumo"),
        classification.alias("Classificacao"),
        _availability_expr(classification).alias("_disponibilidade_cli"),
        _field(frame, CLI_ALIASES, "provider").alias("Fornecedora Base"),
        _field(frame, CLI_ALIASES, "region").alias("Regiao Base"),
    )


def _availability_expr(classification: pl.Expr) -> pl.Expr:
    text = _text_norm_expr(classification)
    return (
        pl.when(text.str.contains("TRIF")).then(pl.lit(100.0))
        .when(text.str.contains("BIF")).then(pl.lit(50.0))
        .when(text.str.contains("MONO")).then(pl.lit(30.0))
        .otherwise(None)
    )


def _ensure_columns(frame: pl.DataFrame, columns: list[str]) -> pl.DataFrame:
    missing = [pl.lit(None).alias(column) for column in columns if column not in frame.columns]
    return frame.with_columns(missing) if missing else frame


def _attach_client(pag: pl.DataFrame, cli: pl.DataFrame) -> pl.DataFrame:
    cli_cols = cli.columns
    if pag.is_empty() or cli.is_empty():
        return _ensure_columns(pag, cli_cols).with_columns(pl.lit("").alias("Match Cliente"))

    cli_keys = (
        cli.with_columns(pl.concat_list(["_cli_inst", "_cli_new_inst", "_cli_customer_no"]).alias("_cli_key"))
        .explode("_cli_key")
        .filter(pl.col("_cli_key").fill_null("") != "")
        .unique("_cli_key", keep="first", maintain_order=True)
    )
    key_join = pag.join(cli_keys, left_on="_uc_norm", right_on="_cli_key", how="left")
    matched_key = key_join.filter(pl.col("_cli_row").is_not_null()).with_columns(pl.lit("UC/Base EDP").alias("Match Cliente"))
    unmatched = key_join.filter(pl.col("_cli_row").is_null()).select(pag.columns)

    cli_cpf = cli.filter(pl.col("_cli_cpf") != "").unique("_cli_cpf", keep="first", maintain_order=True)
    cpf_join = unmatched.filter(pl.col("_cpf_norm") != "").join(cli_cpf, left_on="_cpf_norm", right_on="_cli_cpf", how="left")
    matched_cpf = cpf_join.filter(pl.col("_cli_row").is_not_null()).with_columns(pl.lit("CPF/Base EDP").alias("Match Cliente"))
    unmatched = pl.concat([
        cpf_join.filter(pl.col("_cli_row").is_null()).select(pag.columns),
        unmatched.filter(pl.col("_cpf_norm") == ""),
    ], how="vertical_relaxed").unique("_p_row", maintain_order=True)

    cli_name = cli.filter(pl.col("_cli_name_norm") != "").unique("_cli_name_norm", keep="first", maintain_order=True)
    name_join = unmatched.filter(pl.col("_name_norm") != "").join(cli_name, left_on="_name_norm", right_on="_cli_name_norm", how="left")
    matched_name = name_join.filter(pl.col("_cli_row").is_not_null()).with_columns(pl.lit("Nome/Base EDP").alias("Match Cliente"))
    unmatched_final = pl.concat([
        name_join.filter(pl.col("_cli_row").is_null()).select(pag.columns),
        unmatched.filter(pl.col("_name_norm") == ""),
    ], how="vertical_relaxed").unique("_p_row", maintain_order=True)
    unmatched_final = _ensure_columns(unmatched_final, cli_cols).with_columns(pl.lit("").alias("Match Cliente"))

    return pl.concat([matched_key, matched_cpf, matched_name, unmatched_final], how="diagonal_relaxed").unique("_p_row", maintain_order=True)


def _attach_rec(frame: pl.DataFrame, rec: pl.DataFrame) -> pl.DataFrame:
    rec_cols = rec.columns
    if frame.is_empty() or rec.is_empty():
        return _ensure_columns(frame, rec_cols).with_columns(pl.lit("").alias("Match RCB"))

    rec_uc = rec.filter(pl.col("_r_uc_norm") != "").unique(["_r_uc_norm", "_r_mes_norm"], keep="first", maintain_order=True)
    uc_join = frame.join(rec_uc, left_on=["_uc_norm", "_mes_norm"], right_on=["_r_uc_norm", "_r_mes_norm"], how="left")
    matched_uc = uc_join.filter(pl.col("_r_row").is_not_null()).with_columns(pl.lit("Instalacao+mes").alias("Match RCB"))
    unmatched = uc_join.filter(pl.col("_r_row").is_null()).select(frame.columns)

    rec_cpf = rec.filter(pl.col("_r_cpf_norm") != "").unique(["_r_cpf_norm", "_r_mes_norm"], keep="first", maintain_order=True)
    cpf_join = unmatched.filter(pl.col("_cpf_norm") != "").join(rec_cpf, left_on=["_cpf_norm", "_mes_norm"], right_on=["_r_cpf_norm", "_r_mes_norm"], how="left")
    matched_cpf = cpf_join.filter(pl.col("_r_row").is_not_null()).with_columns(pl.lit("CPF+mes").alias("Match RCB"))
    unmatched_final = pl.concat([
        cpf_join.filter(pl.col("_r_row").is_null()).select(frame.columns),
        unmatched.filter(pl.col("_cpf_norm") == ""),
    ], how="vertical_relaxed").unique("_p_row", maintain_order=True)
    unmatched_final = _ensure_columns(unmatched_final, rec_cols).with_columns(pl.lit("").alias("Match RCB"))
    return pl.concat([matched_uc, matched_cpf, unmatched_final], how="diagonal_relaxed").unique("_p_row", maintain_order=True)


def _status_when(condition: pl.Expr, available: pl.Expr) -> pl.Expr:
    return pl.when(~available).then(pl.lit(NA)).when(condition).then(pl.lit(OK)).otherwise(pl.lit(DIVERGENTE))


def _legend() -> pl.DataFrame:
    rows = [
        ("C1", "Valor simulado distribuidora >= valor do boleto", "BASE_rcb.nvalordistribuidora + Pagadoria_EDP.Valor do Boleto", "N/A quando nvalordistribuidora nao existe ou vem zerado."),
        ("C2", "Consumo do mes vs media historica da UC", "Pagadoria_EDP.Consumo Total / Base_edp.media consumo", "OK entre 0,6x e 1,4x."),
        ("C3", "Economia do mes vs economia media da UC", "nvalordistribuidora - valor do boleto, comparado com historico BASE_rcb", "OK entre 0,7x e 1,3x; depende de nvalordistribuidora."),
        ("C5", "Tarifa da fatura vs tarifa media da distribuidora/mes", "Valor Pago / Consumo Total", "OK entre 0,9x e 1,1x."),
        ("C6", "Sem outra fatura da mesma UC no mes com consumo diferente", "Pagadoria_EDP agrupada por instalacao + mes", "Divergente quando ha mais de um consumo no mesmo grupo."),
        ("C9", "Consumo > disponibilidade", "Consumo Total > disponibilidade derivada da classificacao", "Mono=30, Bi=50, Tri=100."),
        ("C13", "Energia compensada <= compensacao integral possivel", "Energia Compensada <= Consumo Total - Disponibilidade", "Mesma base conceitual do indice de injecao."),
    ]
    return pl.DataFrame(rows, schema=["Criterio", "Logica", "Fonte", "Observacao"], orient="row")


def reconcile_qualidade_edp(df_pag: pl.DataFrame, df_rec: pl.DataFrame, df_cli: pl.DataFrame) -> QualidadeEdpResult:
    logs: list[dict[str, str]] = []

    def log(message: str, kind: str = "info") -> None:
        logs.append({"msg": message, "tipo": kind})

    pag = _prepare_pag(df_pag)
    rec = _prepare_rec(df_rec)
    cli = _prepare_cli(df_cli)
    log(f"Pagadoria EDP: {df_pag.height:,} linhas | validas por instalacao+mes: {pag.height:,}", "ok")
    log(f"BASE_rcb EDP: {df_rec.height:,} linhas | Base_edp: {df_cli.height:,} clientes", "ok")

    if rec.select((pl.col("_r_simulado").fill_null(0) > 0).sum()).item() == 0:
        log("BASE_rcb nao trouxe nvalordistribuidora preenchido; C1 e C3 ficarao N/A na maioria dos casos.", "warn")

    enriched = _attach_rec(_attach_client(pag, cli), rec)

    rec_hist = rec.with_columns((pl.col("_r_simulado") - pl.col("_r_valor")).alias("_r_economia")).filter(
        (pl.col("_r_uc_norm") != "") & (pl.col("_r_simulado").fill_null(0) > 0) & pl.col("_r_economia").is_not_null()
    )
    hist_total = rec_hist.group_by("_r_uc_norm").agg(
        pl.sum("_r_economia").alias("_econ_total"),
        pl.len().alias("_econ_count"),
    )
    hist_month = rec_hist.group_by(["_r_uc_norm", "_r_mes_norm"]).agg(
        pl.sum("_r_economia").alias("_econ_mes"),
        pl.len().alias("_econ_mes_count"),
    )
    if not hist_total.is_empty():
        enriched = enriched.join(hist_total, left_on="_uc_norm", right_on="_r_uc_norm", how="left")
        enriched = enriched.join(hist_month, left_on=["_uc_norm", "_mes_norm"], right_on=["_r_uc_norm", "_r_mes_norm"], how="left")
    else:
        enriched = enriched.with_columns(
            pl.lit(None).cast(pl.Float64).alias("_econ_total"),
            pl.lit(None).cast(pl.UInt32).alias("_econ_count"),
            pl.lit(None).cast(pl.Float64).alias("_econ_mes"),
            pl.lit(None).cast(pl.UInt32).alias("_econ_mes_count"),
        )

    tariff = pag.with_columns(
        pl.when((pl.col("_valor_pago").fill_null(0) > 0) & (pl.col("_consumo").fill_null(0) > 0))
        .then(pl.col("_valor_pago") / pl.col("_consumo"))
        .otherwise(None)
        .alias("_tarifa_fatura")
    )
    tariff_avg = tariff.filter(pl.col("_tarifa_fatura").is_not_null()).group_by("_dist_norm", "_mes_norm").agg(
        pl.mean("_tarifa_fatura").alias("_tarifa_media_dist_mes")
    )
    dup = pag.filter(pl.col("_consumo").is_not_null()).group_by("_uc_norm", "_mes_norm").agg(
        pl.col("_consumo").round(6).n_unique().alias("_consumos_distintos"),
        pl.len().alias("_qtd_faturas_grupo"),
    )

    enriched = (
        enriched.join(tariff.select("_p_row", "_tarifa_fatura"), on="_p_row", how="left")
        .join(tariff_avg, on=["_dist_norm", "_mes_norm"], how="left")
        .join(dup, on=["_uc_norm", "_mes_norm"], how="left")
        .with_columns(
            pl.coalesce([pl.col("_disponibilidade_pag"), pl.col("_disponibilidade_cli")]).alias("_disponibilidade"),
            (pl.col("_r_simulado") - pl.col("_valor_boleto")).alias("_economia_mes"),
            pl.when((pl.col("_econ_count").fill_null(0) - pl.col("_econ_mes_count").fill_null(0)) > 0)
            .then((pl.col("_econ_total").fill_null(0) - pl.col("_econ_mes").fill_null(0)) / (pl.col("_econ_count").fill_null(0) - pl.col("_econ_mes_count").fill_null(0)))
            .otherwise(None)
            .alias("_economia_media_uc"),
        )
    )

    enriched = enriched.with_columns(
        _status_when(pl.col("_r_simulado") >= pl.col("_valor_boleto"), (pl.col("_r_simulado").fill_null(0) > 0) & (pl.col("_valor_boleto").fill_null(0) > 0)).alias("C1: Simulado >= Boleto"),
        _status_when((pl.col("_consumo") / pl.col("_media_consumo")).is_between(0.6, 1.4, closed="both"), (pl.col("_consumo").fill_null(0) > 0) & (pl.col("_media_consumo").fill_null(0) > 0)).alias("C2: Consumo vs Media (+/-40%)"),
        _status_when((pl.col("_economia_mes") / pl.col("_economia_media_uc")).is_between(0.7, 1.3, closed="both"), pl.col("_economia_mes").is_not_null() & (pl.col("_economia_media_uc").abs().fill_null(0) > 0)).alias("C3: Economia vs Media (+/-30%)"),
        _status_when((pl.col("_tarifa_fatura") / pl.col("_tarifa_media_dist_mes")).is_between(0.9, 1.1, closed="both"), (pl.col("_tarifa_fatura").fill_null(0) > 0) & (pl.col("_tarifa_media_dist_mes").fill_null(0) > 0)).alias("C5: Tarifa vs Media (+/-10%)"),
        _status_when(pl.col("_consumos_distintos").fill_null(0) <= 1, pl.col("_consumo").fill_null(0) > 0).alias("C6: Sem leitura divergente no mes"),
        _status_when(pl.col("_consumo") > pl.col("_disponibilidade"), (pl.col("_consumo").fill_null(0) > 0) & (pl.col("_disponibilidade").fill_null(0) > 0)).alias("C9: Consumo > Disponibilidade"),
        _status_when(pl.col("_compensada") <= (pl.col("_consumo") - pl.col("_disponibilidade")).clip(0), (pl.col("_compensada").fill_null(-1) >= 0) & (pl.col("_consumo").fill_null(0) > 0) & (pl.col("_disponibilidade").fill_null(0) > 0)).alias("C13: Compensada <= Integral"),
    )

    criteria = [
        "C1: Simulado >= Boleto",
        "C2: Consumo vs Media (+/-40%)",
        "C3: Economia vs Media (+/-30%)",
        "C5: Tarifa vs Media (+/-10%)",
        "C6: Sem leitura divergente no mes",
        "C9: Consumo > Disponibilidade",
        "C13: Compensada <= Integral",
    ]
    applicable_exprs = [(pl.col(c) != NA).cast(pl.UInt8) for c in criteria]
    ok_exprs = [(pl.col(c) == OK).cast(pl.UInt8) for c in criteria]

    result = (
        enriched.with_columns(
            pl.sum_horizontal(applicable_exprs).alias("N criterios aplicaveis"),
            pl.sum_horizontal(ok_exprs).alias("_ok_count"),
            (pl.col("_consumo") - pl.col("_disponibilidade")).clip(0).alias("Compensacao Integral Possivel (kWh)"),
        )
        .with_columns(
            pl.when(pl.col("N criterios aplicaveis") > 0)
            .then((pl.col("_ok_count") / pl.col("N criterios aplicaveis") * 100).round(1))
            .otherwise(None)
            .alias("HealthScore (%)"),
            pl.when(pl.col("N criterios aplicaveis") == 0).then(pl.lit("Sem criterios aplicaveis"))
            .when(pl.any_horizontal([(pl.col(c) == DIVERGENTE) for c in criteria])).then(pl.lit("Revisar divergencias"))
            .otherwise(pl.lit("OK")).alias("Diagnostico"),
        )
        .select(
            "Cobranca",
            "Cliente",
            "N Instalacao",
            "Distribuidora",
            pl.col("_mes_norm").alias("Mes Referencia"),
            "Status Boleto",
            "Valor do Boleto (R$)",
            "Valor Simulado Distribuidora (R$)",
            *criteria,
            pl.col("Consumo Mes (kWh)"),
            "Media Consumo UC (kWh)",
            pl.col("_economia_mes").round(2).alias("Economia Mes (R$)"),
            pl.col("_economia_media_uc").round(2).alias("Economia Media UC (R$)"),
            pl.col("_tarifa_fatura").round(6).alias("Tarifa Fatura (R$/kWh)"),
            pl.col("_tarifa_media_dist_mes").round(6).alias("Tarifa Media Distribuidora/Mes (R$/kWh)"),
            pl.col("_disponibilidade").alias("Disponibilidade (kWh)"),
            "Energia Compensada (kWh)",
            "Compensacao Integral Possivel (kWh)",
            "N criterios aplicaveis",
            "HealthScore (%)",
            "Diagnostico",
            "Match Cliente",
            "Match RCB",
            "IDRCB",
            "Codigo Cliente",
            "Numero Cliente",
            "Classificacao",
            "Data Emissao",
            "Data Vencimento",
            "Data Pagamento",
            "Linha Digitavel",
        )
        .sort(["HealthScore (%)", "N Instalacao"], descending=[False, False], nulls_last=True)
    )

    atencao = result.filter((pl.col("HealthScore (%)").fill_null(0) < 80) | (pl.col("Diagnostico") != "OK"))
    sem_dados = result.filter(pl.col("N criterios aplicaveis") == 0)
    resumo_criterios = pl.DataFrame(
        [
            {
                "Criterio": c,
                "Aplicaveis": int(result.filter(pl.col(c) != NA).height),
                "OK": int(result.filter(pl.col(c) == OK).height),
                "Divergentes": int(result.filter(pl.col(c) == DIVERGENTE).height),
                "N/A": int(result.filter(pl.col(c) == NA).height),
            }
            for c in criteria
        ]
    )

    scores = result.filter(pl.col("HealthScore (%)").is_not_null())
    avg_score = float(scores.select(pl.mean("HealthScore (%)")).item() or 0) if not scores.is_empty() else 0.0
    metrics = {
        "totalPagadoria": df_pag.height,
        "totalAnalisado": result.height,
        "mediaHealthScore": round(avg_score, 1),
        "excelentes": result.filter(pl.col("HealthScore (%)") >= 95).height,
        "bons": result.filter((pl.col("HealthScore (%)") >= 80) & (pl.col("HealthScore (%)") < 95)).height,
        "atencao": atencao.height,
        "semDados": sem_dados.height,
        "matchesCliente": result.filter(pl.col("Match Cliente") != "").height,
        "matchesRecebiveis": result.filter(pl.col("Match RCB") != "").height,
        "criteriosAplicaveisMedia": round(float(result.select(pl.mean("N criterios aplicaveis")).item() or 0), 2) if result.height else 0,
    }

    log(f"HealthScore calculado: {result.height:,} boletos | media {metrics['mediaHealthScore']}%", "ok")
    log(f"Matches: Base EDP {metrics['matchesCliente']:,} | BASE_rcb {metrics['matchesRecebiveis']:,}", "ok")
    log(f"Atencao: {metrics['atencao']:,} | Sem dados: {metrics['semDados']:,}", "warn" if metrics["atencao"] else "ok")

    return QualidadeEdpResult(
        sheets={
            "HEALTHSCORE EDP": result,
            "ATENCAO": atencao,
            "SEM DADOS": sem_dados,
            "RESUMO CRITERIOS": resumo_criterios,
            "LEGENDA": _legend(),
        },
        metrics=metrics,
        logs=logs,
    )
