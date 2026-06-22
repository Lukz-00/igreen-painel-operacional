from __future__ import annotations

import re
import unicodedata
from dataclasses import dataclass
from typing import Any

import polars as pl


DASH = "—"


PAG_ALIASES = {
    "uc": ["_gmap_instalacao", "Número da Instalação", "Numero da instalacao", "Nº da Instalação", "Número de instalação", "Numero de instalacao", "Instalação (Identificador)", "Instalacao", "Instalação", "num_instalacao", "numinstalacao", "UC"],
    "month": ["_gmap_mes", "Mês de referência", "Mês", "Mes referência", "Mes Referencia", "Data Referencia", "Data Referência", "DataReferencia", "mes_referencia", "mesreferencia", "DATA DO DOCUMENTO"],
    "cpf": ["_gmap_cpf", "CPF/CNPJ", "CPF", "CNPJ", "cpf", "cpf_cliente", "documento"],
    "status": ["_gmap_status", "Situação do recebimento", "Situacao do recebimento", "Status", "Status fatura", "statuspagamentofornecedora"],
    "value": ["_gmap_valor", "Valor total (R$)", "Valor da Fatura", "Valor fatura", "Valor", "valorapagar", "valor_liquido_fatura_fornecedora", "VALOR DO ITEM/SERVIÇO", "VALOR DA NF-E"],
    "paid_value": ["_gmap_valor_pago", "Valor pago pelo cliente (R$)", "Valor Pago", "valor_pago", "VALOR RECEBIDO DO ITEM/SERVIÇO"],
    "due": ["_gmap_vencimento", "Vencimento Fatura Norten", "Data de vencimento", "Data Vencimento", "dtvencimento", "DATA DE VENCIMENTO"],
    "paid_at": ["_gmap_pagto", "Data de recebimento", "Data de pagamento", "Data Pagamento", "dtpagamento", "Pagto fatura"],
    "barcode": ["_gmap_codbar", "Linha Digitável", "Linha Digitavel", "Código de barras", "Codigo de barras", "CodigoBarras", "codigobarra", "Codigo Barra Boleto"],
    "link": ["_gmap_link", "Link de pagamento", "Arquivo do recebimento", "Link Boleto", "link_boleto", "Url Boleto", "url_boleto"],
    "id": ["_gmap_id_rec", "Recebimento (Identificador)", "ID Recebimento", "id_recebimento", "Nº do documento"],
    "name": ["_gmap_cliente", "Nome do Cliente", "Nome Cliente", "nome_cliente", "Nome", "Cliente", "Favorecido", "Consorciado", "NOME DO CLIENTE/FORNECEDOR"],
    "distributor": ["Distribuidora", "DISTRIBUIDORA", "EMPRESA DO FATURAMENTO"],
}

REC_ALIASES = {
    "uc": ["_gmap_instalacao", "Instalacao", "Instalação", "num_instalacao", "numinstalacao", "UC"],
    "customer_no": ["_gmap_num_cliente", "Numero Cliente", "NumeroCliente", "numero_cliente", "Nº Cliente"],
    "month": ["_gmap_mes", "Data Referencia", "Data Referência", "DataReferencia", "mesreferencia", "mes_referencia", "Mês de referência"],
    "cpf": ["_gmap_cpf", "Cpf", "CPF", "cpf", "cpf_cliente", "CPF/CNPJ", "documento"],
    "status": ["_gmap_status", "Status", "status", "Status Financeiro Cliente", "StatusFinanceiroCliente", "StatusFatura", "Status fatura", "statuspagamentofornecedora"],
    "financial_status": ["_gmap_stat_fin", "Status Financeiro Cliente", "StatusFinanceiroCliente"],
    "value": ["_gmap_valor", "Valor A Pagar", "ValorAPagar", "Valor a Pagar", "valorapagar", "valor_liquido_fatura_fornecedora", "valor_liquido", "Valor total (R$)", "Valor"],
    "due": ["_gmap_vencimento", "Data Vencimento", "DataVencimento", "dtvencimento", "Vencimento fatura", "Data de vencimento"],
    "paid_at": ["_gmap_pagto", "Data Pagamento", "DataPagamento", "dtpagamento", "Pagto fatura", "Data de pagamento"],
    "barcode": ["_gmap_codbar", "Codigo Barra Boleto", "CodigoBarraBoleto", "Linha Digitavel", "codigobarra", "Código de barras"],
    "link": ["_gmap_link", "Url Boleto", "URL Boleto", "url_boleto", "Link de pagamento", "Arquivo do recebimento", "link_boleto", "Link Boleto"],
    "id": ["_gmap_id_rcb", "Idrcb", "idrcb", "id_rcb", "Recebimento (Identificador)", "ID Recebimento"],
    "customer_code": ["_gmap_cod_cliente", "Codigo Cliente", "codigo cliente", "cod_cliente", "codcliente", "Código Cliente"],
    "name": ["_gmap_cliente", "Cliente", "nome_cliente", "Nome", "Favorecido", "Consorciado"],
    "provider": ["_gmap_fornecedora", "Fornecedora", "fornecedora", "cfornecedora", "Organização"],
    "concessionaire": ["Concessionaria", "concessionaria", "Concessionária", "Distribuidora", "distribuidora"],
}

CLI_ALIASES = {
    "inst": ["_gmap_instalacao", "Instalacao", "Instalação", "instalacao"],
    "nc": ["Numero Cliente", "NumeroCliente", "numero_cliente", "Numero_Cliente"],
    "nova": ["Nova Instalacao", "NovaInstalacao", "nova_instalacao"],
    "name": ["_gmap_nome", "Nome", "Cliente", "nome_cliente"],
    "code": ["Codigo", "codigo", "Código"],
    "status": ["Jornada Status", "Status", "status", "Status Financeiro"],
}


def _plain(value: str) -> str:
    return "".join(c for c in unicodedata.normalize("NFD", str(value or "").casefold()) if unicodedata.category(c) != "Mn").strip()


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


def apply_mapping(frame: pl.DataFrame, mapping: dict[str, str] | None, *, uc_mode: str = "uc") -> pl.DataFrame:
    expressions = []
    for key, source in (mapping or {}).items():
        if source and source in frame.columns:
            expressions.append(pl.col(source).alias(f"_gmap_{key}"))
    if expressions:
        frame = frame.with_columns(expressions)
    if uc_mode == "num_cliente":
        frame = frame.with_columns(pl.lit(True).alias("__ucModeNumCliente"))
    return frame


def _digits(expr: pl.Expr) -> pl.Expr:
    return expr.cast(pl.String, strict=False).fill_null("").str.replace_all(r"[^0-9]", "").str.replace(r"^0+", "")


def _norm_text(expr: pl.Expr) -> pl.Expr:
    return (expr.cast(pl.String, strict=False).fill_null("").str.to_lowercase()
        .str.normalize("NFD").str.replace_all(r"\p{M}", "").str.replace_all(r"[^a-z0-9]", ""))


def _month(expr: pl.Expr) -> pl.Expr:
    text = expr.cast(pl.String, strict=False).fill_null("").str.strip_chars().str.to_uppercase()
    months = {"JAN":"01","FEV":"02","MAR":"03","ABR":"04","MAI":"05","JUN":"06","JUL":"07","AGO":"08","SET":"09","OUT":"10","NOV":"11","DEZ":"12"}
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


def _field(frame: pl.DataFrame, aliases: dict[str, list[str]], key: str) -> pl.Expr:
    column = _resolve(frame.columns, aliases[key])
    return pl.col(column).cast(pl.String, strict=False).fill_null("") if column else pl.lit("")


def _prepare(frame: pl.DataFrame, aliases: dict[str, list[str]], prefix: str) -> pl.DataFrame:
    uc = _field(frame, aliases, "uc")
    month = _field(frame, aliases, "month")
    cpf = _field(frame, aliases, "cpf")
    name = _field(frame, aliases, "name")
    columns = [
        pl.int_range(pl.len(), dtype=pl.UInt32).alias(f"{prefix}_id"),
        uc.alias(f"{prefix}_uc_raw"), _digits(uc).alias("_uc_norm"),
        month.alias(f"{prefix}_month_raw"), _month(month).alias("_mes_norm"),
        cpf.alias(f"{prefix}_cpf_raw"), _digits(cpf).alias("_cpf_norm"),
        name.alias(f"{prefix}_name"), _norm_text(name).alias("_name_norm"),
    ]
    for key in aliases:
        if key not in {"uc", "month", "cpf", "name"}:
            output_key = "source_id" if key == "id" else key
            columns.append(_field(frame, aliases, key).alias(f"{prefix}_{output_key}"))
    if prefix == "r":
        nc = _field(frame, aliases, "customer_no")
        columns.append(_digits(nc).alias("_num_cliente_norm"))
        provider = _norm_text(_field(frame, aliases, "provider"))
        columns.append(
            pl.when(provider.str.contains("northen|norten|energisa"))
            .then(pl.lit("northen"))
            .when(provider.str.contains("gv|consorcio|interno"))
            .then(pl.lit("gv_interno"))
            .otherwise(pl.lit("")).alias("_region")
        )
    else:
        northen = any("norten" in _plain(c) or "northen" in _plain(c) for c in frame.columns)
        if "__ucModeNumCliente" in frame.columns:
            northen = northen or bool(frame["__ucModeNumCliente"].any())
        columns.append(pl.lit(northen).alias("_is_northen"))
    return frame.select(columns).filter((pl.col("_uc_norm") != "") & (pl.col("_mes_norm") != ""))


def _prepare_cli(frame: pl.DataFrame | None) -> pl.DataFrame:
    if frame is None or frame.is_empty():
        return pl.DataFrame(schema={"_cli_inst":pl.String,"_cli_nc":pl.String,"_cli_nova":pl.String,"_cli_name":pl.String,"_cli_code":pl.String,"_cli_status":pl.String})
    def cli_field(key: str) -> pl.Expr:
        column = _resolve(frame.columns, CLI_ALIASES[key])
        return pl.col(column).cast(pl.String, strict=False).fill_null("") if column else pl.lit("")
    return frame.select(
        _digits(cli_field("inst")).alias("_cli_inst"), _digits(cli_field("nc")).alias("_cli_nc"),
        _digits(cli_field("nova")).alias("_cli_nova"), _norm_text(cli_field("name")).alias("_cli_name"),
        cli_field("code").alias("_cli_code"), cli_field("status").alias("_cli_status"),
    )


PAG_STATUS = {"PAGO":"PAGO","PAGA":"PAGO","PAGA JUNTO AO CLIENTE":"PAGO","RECEBIDO":"PAGO","VENCIDO":"VENCIDO","VENCIDA":"VENCIDO","INADIMPLENTE":"VENCIDO","EM ATRASO":"VENCIDO","CANCELADO":"CANCELADA","CANCELADA":"CANCELADA","ESTORNADA":"CANCELADA","A VENCER":"A RECEBER","A RECEBER":"A RECEBER","EM ABERTO":"A RECEBER","PENDENTE":"A RECEBER","REGULAR":"A RECEBER","EXPIRADA":"EXPIRADA","EXPIRADO":"EXPIRADA","CALCULADA":"CALCULADA","NÃO EMITIDA":"CALCULADA","NAO EMITIDA":"CALCULADA"}
REC_STATUS = {"PAID":"PAGO","PAGO":"PAGO","PAGA":"PAGO","OPEN":"A RECEBER","A VENCER":"A RECEBER","A RECEBER":"A RECEBER","PENDENTE":"A RECEBER","OVERDUE":"VENCIDO","VENCIDO":"VENCIDO","VENCIDA":"VENCIDO","CANCELLED":"CANCELADA","CANCELADO":"CANCELADA","CANCELADA":"CANCELADA","EXPIRED":"EXPIRADA","EXPIRADA":"EXPIRADA","EXPIRADO":"EXPIRADA","CALCULATED":"CALCULADA","CALCULADA":"CALCULADA"}


def _status_expr(column: str, mapping: dict[str, str], alias: str) -> pl.Expr:
    raw = pl.col(column).str.strip_chars().str.to_uppercase()
    return raw.replace_strict(mapping, default=raw).fill_null(DASH).alias(alias)


def _cascade(pag: pl.DataFrame, rec: pl.DataFrame, pkey: str, rkey: str, stage: str) -> tuple[pl.DataFrame, pl.DataFrame, pl.DataFrame]:
    if pag.is_empty() or rec.is_empty():
        return pl.DataFrame({"p_id": [], "r_id": [], "stage": []}, schema={"p_id":pl.UInt32,"r_id":pl.UInt32,"stage":pl.String}), pag, rec
    # Caminho dominante em bases grandes: chave composta única. Evita criar
    # 500 mil tuplas Python e deixa todo o pareamento no engine Rust do Polars.
    pag_unique = not pag.select([pkey, "_mes_norm"]).is_duplicated().any()
    rec_unique = not rec.select([rkey, "_mes_norm"]).is_duplicated().any()
    if pag_unique and rec_unique:
        matched = (pag.select("p_id", pkey, "_mes_norm")
            .join(rec.select("r_id", rkey, "_mes_norm"), left_on=[pkey,"_mes_norm"], right_on=[rkey,"_mes_norm"], how="inner")
            .select("p_id", "r_id").with_columns(pl.lit(stage).alias("stage")))
        if matched.is_empty():
            return matched, pag, rec
        return matched, pag.join(matched.select("p_id"), on="p_id", how="anti"), rec.join(matched.select("r_id"), on="r_id", how="anti")

    pag_columns = list(dict.fromkeys(["p_id", pkey, "_mes_norm", "_cpf_norm", "_name_norm", "p_distributor"]))
    rec_projection = rec.select(
        "r_id",
        pl.col(rkey).alias("_r_join_key"),
        pl.col("_mes_norm").alias("_r_join_month"),
        pl.col("_cpf_norm").alias("_cpf_norm_r"),
        pl.col("_name_norm").alias("_name_norm_r"),
        "r_concessionaire",
    )
    candidates = (
        pag.select(pag_columns)
        .join(rec_projection, left_on=[pkey,"_mes_norm"], right_on=["_r_join_key","_r_join_month"], how="inner")
        .with_columns(
            (pl.col("_cpf_norm").ne("") & pl.col("_cpf_norm").eq(pl.col("_cpf_norm_r"))).cast(pl.UInt8).alias("cpf_score"),
            (pl.col("_name_norm").ne("") & pl.col("_name_norm").eq(pl.col("_name_norm_r"))).cast(pl.UInt8).alias("name_score"),
            (pl.col("p_distributor").str.to_lowercase().str.contains(pl.col("r_concessionaire").str.to_lowercase(), literal=True)).fill_null(False).cast(pl.UInt8).alias("dist_score"),
        )
        .sort(["p_id","cpf_score","name_score","dist_score","r_id"], descending=[False,True,True,True,False])
        .select("p_id","r_id")
    )
    used_p: set[int] = set(); used_r: set[int] = set(); pairs: list[tuple[int,int,str]] = []
    for p_id, r_id in candidates.iter_rows():
        if p_id not in used_p and r_id not in used_r:
            used_p.add(p_id); used_r.add(r_id); pairs.append((p_id, r_id, stage))
    matched = pl.DataFrame(pairs, schema={"p_id":pl.UInt32,"r_id":pl.UInt32,"stage":pl.String}, orient="row")
    if not pairs:
        return matched, pag, rec
    return matched, pag.join(matched.select("p_id"), on="p_id", how="anti"), rec.join(matched.select("r_id"), on="r_id", how="anti")


def _output_matches(matches: pl.DataFrame, pag: pl.DataFrame, rec: pl.DataFrame) -> pl.DataFrame:
    if matches.is_empty():
        return pl.DataFrame()
    return (matches.join(pag, on="p_id").join(rec, on="r_id")
        .with_columns(_status_expr("p_status", PAG_STATUS, "Status Pagadoria (Grupo)"), _status_expr("r_status", REC_STATUS, "Status Recebíveis (Grupo)"))
        .select(
            pl.col("stage").alias("Etapa"), pl.col("p_uc_raw").alias("UC (Pagadoria)"), pl.col("r_uc_raw").alias("UC (Recebíveis)"),
            pl.col("p_id").alias("ID Linha Pag."), pl.col("r_id").alias("ID Linha Rec."),
            pl.col("r_customer_code").alias("Cód. Cliente"), pl.col("_num_cliente_norm").alias("Nº Cliente"),
            pl.coalesce([pl.col("r_name"),pl.col("p_name")]).alias("Cliente"), pl.col("r_provider").alias("Fornecedora"),
            pl.col("_mes_norm").alias("Mês Referência"), pl.col("p_status").alias("Status Pagadoria"), pl.col("r_status").alias("Status Recebíveis"),
            "Status Pagadoria (Grupo)", "Status Recebíveis (Grupo)", pl.col("p_value").alias("Valor Pagadoria"), pl.col("r_value").alias("Valor Recebíveis"),
            pl.col("p_paid_at").alias("Data Pagamento Pag."), pl.col("r_paid_at").alias("Data Pagamento Rec."),
            pl.col("p_barcode").alias("Cód. Barras Pag."), pl.col("r_barcode").alias("Cód. Barras Rec."),
            pl.col("p_link").alias("Link Boleto Pag."), pl.col("r_link").alias("Link Boleto Rec."),
        ))


@dataclass
class ReconciliationResult:
    sheets: dict[str, pl.DataFrame]
    metrics: dict[str, Any]
    logs: list[dict[str, str]]


def reconcile_faturamento(df_pag: pl.DataFrame, df_rec: pl.DataFrame, df_cli: pl.DataFrame | None = None) -> ReconciliationResult:
    logs: list[dict[str,str]] = []
    def log(message: str, kind: str = "info") -> None: logs.append({"msg": message, "tipo": kind})
    pag = _prepare(df_pag, PAG_ALIASES, "p")
    rec = _prepare(df_rec, REC_ALIASES, "r")
    pag_status_upper = pl.col("p_status").str.strip_chars().str.to_uppercase()
    rec_status_upper = pl.col("r_status").str.strip_chars().str.to_uppercase()
    pag = (pag.with_columns(
        pl.when(pag_status_upper == "PAGO").then(0)
        .when(pag_status_upper.is_in(["A RECEBER","PENDENTE","REGULAR"])).then(1)
        .when(pag_status_upper == "VENCIDO").then(2).otherwise(3).alias("_priority"))
        .sort("_priority", maintain_order=True).drop("p_id").with_row_index("p_id").drop("_priority"))
    rec = (rec.with_columns(
        pl.when(rec_status_upper == "PAGO").then(0)
        .when(rec_status_upper.is_in(["A RECEBER","OPEN","PENDENTE"])).then(1)
        .when(rec_status_upper.is_in(["VENCIDO","OVERDUE"])).then(2).otherwise(3).alias("_priority"))
        .sort("_priority", maintain_order=True).drop("r_id").with_row_index("r_id").drop("_priority"))
    log(f"Pagadoria: {df_pag.height:,} | Recebíveis: {df_rec.height:,}")
    log(f"Linhas válidas por UC + mês: PAG {pag.height:,} | REC {rec.height:,}")

    header_text = " ".join(_plain(c) for c in df_pag.columns)
    provider = "outros"
    if ("norten" in header_text or "northen" in header_text) and "cobranca" not in header_text and "cob." not in header_text:
        provider = "northen"
    elif "repasse distribuidora" in header_text or "repasse_distribuidora" in header_text:
        provider = "gv_interno"
    if provider == "northen" and rec.filter(pl.col("_region") == "northen").height:
        ignored = rec.filter(pl.col("_region") != "northen").height
        rec = rec.filter(pl.col("_region") == "northen")
        log(f"Região Northen: {rec.height:,} recebíveis usados; {ignored:,} ignorados")
    elif provider == "gv_interno" and rec.filter(pl.col("_region") == "northen").height:
        ignored = rec.filter(pl.col("_region") == "northen").height
        rec = rec.filter(pl.col("_region") != "northen")
        log(f"Região GV-Interno: {ignored:,} recebíveis Northen ignorados")

    north_pag = pag.filter("_is_northen")
    other_pag = pag.filter(~pl.col("_is_northen"))
    north_matches, north_orphans, rec_after_north = _cascade(north_pag, rec, "_uc_norm", "_num_cliente_norm", "N")
    m1, p1, r1 = _cascade(other_pag, rec_after_north, "_uc_norm", "_uc_norm", "1")
    m2, p2, r2 = _cascade(p1, r1, "_uc_norm", "_num_cliente_norm", "2")
    m3, p3, r3 = _cascade(p2.filter(pl.col("_cpf_norm") != ""), r2.filter(pl.col("_cpf_norm") != ""), "_cpf_norm", "_cpf_norm", "3")
    # Linhas sem CPF não podem desaparecer da lista de órfãos na terceira etapa.
    p3 = pl.concat([p3, p2.filter(pl.col("_cpf_norm") == "")], how="vertical_relaxed")
    r3 = pl.concat([r3, r2.filter(pl.col("_cpf_norm") == "")], how="vertical_relaxed")
    cli = _prepare_cli(df_cli)
    cli_matches = pl.DataFrame(schema={"p_id":pl.UInt32,"r_id":pl.UInt32,"stage":pl.String})
    if not cli.is_empty() and not p3.is_empty() and not r3.is_empty():
        cli_keys = (cli.with_columns(pl.concat_list(["_cli_inst","_cli_nc","_cli_nova"]).alias("_cli_key"))
            .explode("_cli_key").filter(pl.col("_cli_key") != "").unique("_cli_key", keep="first"))
        bridged = (p3.join(cli_keys, left_on="_uc_norm", right_on="_cli_key", how="left")
            .unique("p_id", keep="first", maintain_order=True))
        c1, cp1, cr1 = _cascade(bridged.filter(pl.col("_cli_nc").fill_null("") != ""), r3, "_cli_nc", "_num_cliente_norm", "CLI")
        # Reanexa órfãos sem ponte, removidos apenas do subconjunto acima.
        no_bridge = bridged.filter(pl.col("_cli_nc").fill_null("") == "")
        cp1 = pl.concat([cp1, no_bridge], how="diagonal_relaxed").unique("p_id", maintain_order=True)
        c2, cp2, cr2 = _cascade(cp1.filter(pl.col("_cli_nova").fill_null("") != ""), cr1, "_cli_nova", "_uc_norm", "CLI")
        cp2 = pl.concat([cp2, cp1.filter(pl.col("_cli_nova").fill_null("") == "")], how="diagonal_relaxed").unique("p_id", maintain_order=True)
        c3, cp3, cr3 = _cascade(cp2.filter(pl.col("_cli_inst").fill_null("") != ""), cr2, "_cli_inst", "_uc_norm", "CLI")
        cp3 = pl.concat([cp3, cp2.filter(pl.col("_cli_inst").fill_null("") == "")], how="diagonal_relaxed").unique("p_id", maintain_order=True)
        cli_matches = pl.concat([c1,c2,c3], how="vertical_relaxed")
        p3 = pag.join(cp3.select("p_id"), on="p_id", how="semi")
        r3 = cr3
        log(f"Matches adicionais via Clientes GV: {cli_matches.height:,}", "ok")
    all_matches = pl.concat([m1,m2,m3,cli_matches], how="vertical_relaxed")
    matched_cpf_month = (all_matches.join(pag.select("p_id","_cpf_norm","_mes_norm"), on="p_id")
        .filter(pl.col("_cpf_norm") != "").select("_cpf_norm","_mes_norm").unique())
    logical_duplicates = (p3.join(matched_cpf_month, on=["_cpf_norm","_mes_norm"], how="inner")
        if not matched_cpf_month.is_empty() else p3.head(0))
    if not logical_duplicates.is_empty():
        p3 = p3.join(logical_duplicates.select("p_id"), on="p_id", how="anti")
    matched_rows = _output_matches(all_matches, pag, rec)
    north_rows = _output_matches(north_matches, pag, rec)
    if matched_rows.is_empty():
        divergentes = coincidentes = pl.DataFrame()
        divergencia_cod = sem_pagto_valor = pl.DataFrame()
    else:
        known = ["PAGO","VENCIDO","A RECEBER","CANCELADA","EXPIRADA","CALCULADA"]
        comparable = pl.col("Status Pagadoria (Grupo)").is_in(known) & pl.col("Status Recebíveis (Grupo)").is_in(known)
        divergentes = matched_rows.filter(comparable & (pl.col("Status Pagadoria (Grupo)") != pl.col("Status Recebíveis (Grupo)")))
        coincidentes = matched_rows.filter(~(comparable & (pl.col("Status Pagadoria (Grupo)") != pl.col("Status Recebíveis (Grupo)"))))
        digits_p = pl.col("Cód. Barras Pag.").str.replace_all(r"\D", "")
        digits_r = pl.col("Cód. Barras Rec.").str.replace_all(r"\D", "")
        divergencia_cod = matched_rows.filter((digits_p.str.len_chars() >= 20) & (digits_r.str.len_chars() >= 20) & (digits_p != digits_r))
        sem_pagto_valor = matched_rows.filter(pl.col("Data Pagamento Pag.").is_in(["",DASH]) & pl.col("Valor Pagadoria").is_in(["",DASH]))

    pag_keys = pag.select(pl.concat_list(["_uc_norm","_cpf_norm"]).alias("key")).explode("key").filter(pl.col("key") != "").unique()
    rec_keys = rec.select(pl.concat_list(["_uc_norm","_num_cliente_norm","_cpf_norm"]).alias("key")).explode("key").filter(pl.col("key") != "").unique()
    common_keys = pag_keys.join(rec_keys, on="key", how="inner")
    def has_common(frame: pl.DataFrame, prefix: str) -> pl.Expr:
        cols = ["_uc_norm","_cpf_norm"] + (["_num_cliente_norm"] if prefix == "r" else [])
        common = set(common_keys["key"].to_list())
        return pl.any_horizontal([pl.col(c).is_in(common) for c in cols])
    only_pag_raw = p3.filter(~has_common(p3,"p"))
    only_rec_raw = r3.filter(~has_common(r3,"r"))
    missing_rec_raw = p3.filter(has_common(p3,"p"))
    missing_pag_raw = r3.filter(has_common(r3,"r"))

    cli_uc_keys: set[str] = set()
    cli_name_keys: set[str] = set()
    if not cli.is_empty():
        for column in ("_cli_inst","_cli_nc","_cli_nova"):
            cli_uc_keys.update(v for v in cli[column].to_list() if v)
        cli_name_keys.update(v for v in cli["_cli_name"].to_list() if v)
    missing_bko = missing_rec_raw.filter(pl.col("_uc_norm").is_in(cli_uc_keys)) if cli_uc_keys else missing_rec_raw.head(0)
    missing_name = (missing_rec_raw.filter(~pl.col("_uc_norm").is_in(cli_uc_keys) & pl.col("_name_norm").is_in(cli_name_keys))
                    if cli_name_keys else missing_rec_raw.head(0))
    missing_general = missing_rec_raw.join(
        pl.concat([missing_bko.select("p_id"), missing_name.select("p_id")], how="vertical_relaxed").unique(),
        on="p_id", how="anti",
    )

    missing_columns = [pl.col("p_uc_raw").alias("UC (Pagadoria)"), pl.col("p_id").alias("ID Linha Pag."), pl.col("p_name").alias("Consorciado/Nome"), pl.col("p_status").alias("Status Pagadoria"), pl.col("_mes_norm").alias("Mês Normalizado"), pl.col("p_value").alias("Valor"), pl.col("p_link").alias("Link Boleto")]
    falta_rec = missing_general.select(*missing_columns, pl.lit("Cliente em ambos — boleto do mês ausente nos Recebíveis").alias("Motivo"))
    falta_rec_bko = missing_bko.select(*missing_columns, pl.lit("Cliente cadastrado no BKO — boleto do mês não gerado nos Recebíveis").alias("Motivo"))
    falta_rec_uc = missing_name.select(*missing_columns, pl.lit("Nome encontrado no BKO, mas UC divergente").alias("Motivo"))
    falta_pag = missing_pag_raw.select(pl.col("r_uc_raw").alias("UC (Recebíveis)"), pl.col("r_id").alias("ID Linha Rec."), pl.col("r_customer_code").alias("Cód. Cliente"), pl.col("_num_cliente_norm").alias("Nº Cliente"), pl.col("r_name").alias("Cliente"), pl.col("r_provider").alias("Fornecedora"), pl.col("r_status").alias("Status Recebíveis"), pl.col("_mes_norm").alias("Mês Normalizado"), pl.col("r_value").alias("Valor"), pl.col("r_link").alias("Link Boleto"), pl.lit("Cliente em ambos — boleto do mês ausente na Pagadoria").alias("Motivo"))
    only_pag = only_pag_raw.group_by("_uc_norm", maintain_order=True).agg(pl.first("p_uc_raw").alias("UC (Pagadoria)"),pl.first("p_name").alias("Consorciado/Nome"),pl.col("_mes_norm").unique().sort().str.join(", ").alias("Mês Referência"),pl.len().alias("Qtd Faturas Faltantes"))
    only_rec = only_rec_raw.group_by("_uc_norm", maintain_order=True).agg(pl.first("r_uc_raw").alias("UC (Recebíveis)"),pl.first("r_name").alias("Cliente"),pl.col("_mes_norm").unique().sort().str.join(", ").alias("Mês Referência"),pl.len().alias("Qtd Faturas Faltantes"))

    # Duplicidade física: todas as colunas de entrada, exceto mapeamentos internos.
    fp_cols = [c for c in df_pag.columns if not c.startswith("_")]
    physical_duplicates = df_pag.filter(pl.struct(fp_cols).is_duplicated()) if fp_cols else pl.DataFrame()
    logical_duplicates_out = logical_duplicates.select(
        pl.col("p_uc_raw").alias("UC (Pagadoria)"), pl.col("p_name").alias("Cliente"),
        pl.col("_mes_norm").alias("Mês Referência"), pl.col("p_status").alias("Status"),
        pl.col("p_value").alias("Valor"),
        pl.lit("Boleto extra no mesmo CPF + mês; outro boleto já foi reconciliado").alias("Motivo"),
    )
    duplicates = pl.concat([physical_duplicates, logical_duplicates_out], how="diagonal_relaxed")
    north_include = north_rows.filter((pl.col("Status Pagadoria (Grupo)") == "PAGO") & (pl.col("Status Recebíveis (Grupo)") != "PAGO")) if not north_rows.is_empty() else pl.DataFrame()
    north_bko_raw = north_orphans.filter(pl.col("_uc_norm").is_in(cli_uc_keys)) if cli_uc_keys else north_orphans.head(0)
    north_uc_raw = (north_orphans.filter(~pl.col("_uc_norm").is_in(cli_uc_keys) & pl.col("_name_norm").is_in(cli_name_keys)) if cli_name_keys else north_orphans.head(0))
    north_general_raw = north_orphans.join(pl.concat([north_bko_raw.select("p_id"),north_uc_raw.select("p_id")], how="vertical_relaxed").unique(), on="p_id", how="anti")
    north_cols = [pl.col("p_uc_raw").alias("UC (Pagadoria)"),pl.col("p_name").alias("Cliente"),pl.col("p_status").alias("Status Pagadoria"),pl.col("_mes_norm").alias("Mês Referência"),pl.col("p_value").alias("Valor")]
    north_missing = north_general_raw.select(*north_cols)
    north_bko = north_bko_raw.select(*north_cols, pl.lit("Cliente cadastrado no BKO — boleto não gerado").alias("Motivo"))
    north_uc = north_uc_raw.select(*north_cols, pl.lit("Nome encontrado no BKO, mas UC/Nº Cliente divergente").alias("Motivo"))

    sheets = {
        "DIVERGENCIA COD": divergencia_cod, "SEM PAGTO E VALOR": sem_pagto_valor,
        "STATUS DIVERGENTES": divergentes, "FALTA NOS RECEBIVEIS": falta_rec,
        "SO NO BKO": falta_rec_bko, "UC DIVERGENTE": falta_rec_uc,
        "FALTA NA PAGADORIA": falta_pag, "CLIENTES SO NA PAG": only_pag,
        "CLIENTES SO NO REC": only_rec, "COINCIDENTES": coincidentes,
        "DUPLICIDADES": duplicates, "NORTHEN NAO EXISTE": north_missing,
        "NORTHEN SO NO BKO": north_bko, "NORTHEN UC DIVERGENTE": north_uc,
        "NORTHEN EXISTE EM AMBAS": north_rows, "NORTHEN INCLUIR BAIXA": north_include,
    }
    metrics = {
        "totalPag": df_pag.height, "totalRec": df_rec.height,
        "emAmbos": all_matches.height + north_matches.height,
        "divergenciasCod": divergencia_cod.height, "semPagtoValor": sem_pagto_valor.height,
        "divergentes": divergentes.height, "faltaRec": falta_rec.height,
        "faltaRecSoBKO": falta_rec_bko.height, "faltaRecUCDiv": falta_rec_uc.height, "faltaPag": falta_pag.height,
        "clientesSoNaPag": only_pag.height, "clientesSoNoRec": only_rec.height,
        "coincidentes": coincidentes.height, "duplicidadesPag": duplicates.height,
        "northenNaoExiste": north_missing.height, "northenExisteNoBKO": north_bko.height,
        "northenUCDivergente": north_uc.height, "northenExisteEmAmbas": north_rows.height,
        "northenIncluirBaixa": north_include.height,
    }
    log(f"Matches: {metrics['emAmbos']:,} | divergentes: {metrics['divergentes']:,} | faltantes PAG/REC: {metrics['faltaPag']:,}/{metrics['faltaRec']:,}", "ok")
    return ReconciliationResult(sheets=sheets, metrics=metrics, logs=logs)
