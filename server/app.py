from __future__ import annotations

import asyncio
import json
import shutil
import tempfile
import time
import uuid
from contextlib import asynccontextmanager, suppress
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

import polars as pl
from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field

from .excel_io import preview_table, read_table, write_workbook
from .reconciliation import apply_mapping, reconcile_faturamento
from .conciliacao import reconcile_conciliacao
from .inadimplentes import reconcile_inadimplentes
from .atualizacoes import reconcile_atualizacoes
from .qualidade_edp import reconcile_qualidade_edp
from .boletos_faltantes import reconcile_boletos_faltantes


ROOT = Path(tempfile.gettempdir()) / "igreen-polars"
UPLOADS = ROOT / "uploads"
UPLOAD_META = ROOT / "upload-meta"
JOBS = ROOT / "jobs"
UPLOADS.mkdir(parents=True, exist_ok=True)
UPLOAD_META.mkdir(parents=True, exist_ok=True)
JOBS.mkdir(parents=True, exist_ok=True)
MAX_UPLOAD = 1_500_000_000
PREVIEW_ROWS = 500
ENGINE_VERSION = "2.1.0"
ENGINE_NAME = "iGreen Polars Engine"


def cleanup_expired(max_age_hours: int = 24) -> None:
    cutoff = datetime.now(timezone.utc) - timedelta(hours=max_age_hours)
    for folder in (UPLOADS, UPLOAD_META, JOBS):
        if not folder.exists():
            continue
        for path in folder.iterdir():
            modified = datetime.fromtimestamp(path.stat().st_mtime, timezone.utc)
            if modified < cutoff:
                shutil.rmtree(path, ignore_errors=True) if path.is_dir() else path.unlink(missing_ok=True)


async def _periodic_cleanup() -> None:
    while True:
        await asyncio.sleep(3600)
        cleanup_expired()


@asynccontextmanager
async def lifespan(_: FastAPI):
    cleanup_expired()
    cleanup_task = asyncio.create_task(_periodic_cleanup())
    try:
        yield
    finally:
        cleanup_task.cancel()
        with suppress(asyncio.CancelledError):
            await cleanup_task


app = FastAPI(title="iGreen Polars API", version=ENGINE_VERSION, lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_origin_regex=r"https?://(localhost|127\.0\.0\.1):\d+",
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


class Source(BaseModel):
    upload_id: str
    mapping: dict[str, str] = Field(default_factory=dict)
    uc_mode: str = "uc"
    sheet_name: str | None = None


class ProcessRequest(BaseModel):
    pag: Source
    rec: Source
    cli: Source | None = None

class ConciliacaoProcessRequest(BaseModel):
    base: Source
    fin: Source
    rec: Source
    status: Source


class InadimplentesProcessRequest(BaseModel):
    pag: Source
    rec: Source
    cli: Source
    inc: Source | None = None
    lab: Source | None = None
    pag_cmu: Source | None = None
    pag_northen: Source | None = None
    cli_cmu: Source | None = None
    min_overdue: int = Field(default=2, ge=1, le=24)


class AtualizacoesProcessRequest(BaseModel):
    atualizacao: Source
    faturamento: Source
    rec: Source
    pag_northen: Source
    pag_interna: Source


class QualidadeEdpProcessRequest(BaseModel):
    pag: Source
    rec: Source
    cli: Source


class BoletosFaltantesProcessRequest(BaseModel):
    pag: Source
    rec: Source
    gv: Source
    fat: Source


SHEET_KEYS = {
    "DIVERGENCIA COD": "divergenciasCod", "SEM PAGTO E VALOR": "semPagtoValor",
    "STATUS DIVERGENTES": "divergentes", "FALTA NOS RECEBIVEIS": "faltaRec",
    "SO NO BKO": "faltaRecSoBKO", "UC DIVERGENTE": "faltaRecUCDiv",
    "FALTA NA PAGADORIA": "faltaPag", "CLIENTES SO NA PAG": "clientesSoNaPag",
    "CLIENTES SO NO REC": "clientesSoNoRec", "COINCIDENTES": "coincidentes",
    "DUPLICIDADES": "duplicidadesPag", "NORTHEN NAO EXISTE": "northenNaoExiste",
    "NORTHEN SO NO BKO": "northenExisteNoBKO", "NORTHEN UC DIVERGENTE": "northenUCDivergente",
    "NORTHEN EXISTE EM AMBAS": "northenExisteEmAmbas", "NORTHEN INCLUIR BAIXA": "northenIncluirBaixa",
}


def _engine_label() -> str:
    return f"{ENGINE_NAME} {ENGINE_VERSION}"


def _format_bytes(size_bytes: int | float | None) -> str:
    size = float(size_bytes or 0)
    units = ["B", "KB", "MB", "GB", "TB"]
    unit = units[0]
    for unit in units:
        if size < 1024 or unit == units[-1]:
            break
        size /= 1024
    if unit == "B":
        return f"{int(size)} B"
    return f"{size:.1f} {unit}"


def _upload_meta_path(upload_id: str) -> Path:
    return UPLOAD_META / f"{upload_id}.json"


def _read_upload_meta(upload_id: str, path: Path | None = None) -> dict[str, Any]:
    meta_path = _upload_meta_path(upload_id)
    if meta_path.exists():
        try:
            meta = json.loads(meta_path.read_text(encoding="utf-8"))
        except json.JSONDecodeError:
            meta = {}
    else:
        meta = {}
    if path and not meta.get("file_size_bytes"):
        meta["file_size_bytes"] = path.stat().st_size if path.exists() else 0
    size = int(meta.get("file_size_bytes") or 0)
    meta["file_size_bytes"] = size
    meta["file_size_label"] = _format_bytes(size)
    return meta


def _write_upload_meta(upload_id: str, file_name: str, size: int, suffix: str) -> dict[str, Any]:
    meta = {
        "file_name": file_name,
        "file_size_bytes": size,
        "file_size_label": _format_bytes(size),
        "suffix": suffix,
        "uploaded_at": datetime.now(timezone.utc).isoformat(),
    }
    _upload_meta_path(upload_id).write_text(json.dumps(meta, ensure_ascii=False), encoding="utf-8")
    return meta


def _source_meta(label: str, source: Source | None) -> dict[str, Any] | None:
    if not source:
        return None
    path = _upload_path(source.upload_id)
    meta = _read_upload_meta(source.upload_id, path)
    return {
        "label": label,
        "upload_id": source.upload_id,
        "file_name": meta.get("file_name") or path.name,
        "sheet_name": source.sheet_name or "",
        "file_size_bytes": int(meta.get("file_size_bytes") or 0),
        "file_size_label": meta.get("file_size_label") or _format_bytes(path.stat().st_size),
    }


def _source_meta_list(sources: list[tuple[str, Source | None]]) -> list[dict[str, Any]]:
    return [item for item in (_source_meta(label, source) for label, source in sources) if item]


def _runtime_meta(started_at: float, input_files: list[dict[str, Any]]) -> dict[str, Any]:
    elapsed_ms = int(round((time.perf_counter() - started_at) * 1000))
    total_size = sum(int(item.get("file_size_bytes") or 0) for item in input_files)
    return {
        "engine": _engine_label(),
        "engine_version": ENGINE_VERSION,
        "polars_version": pl.__version__,
        "processing_ms": elapsed_ms,
        "processing_seconds": round(elapsed_ms / 1000, 2),
        "input_files": input_files,
        "input_total_size_bytes": total_size,
        "input_total_size_label": _format_bytes(total_size),
    }


def _summary_rows(title: str, runtime_meta: dict[str, Any], extra: list[tuple[str, Any]] | None = None) -> list[tuple[str, Any]]:
    rows: list[tuple[str, Any]] = [
        (title, ""),
        ("Data", datetime.now().strftime("%d/%m/%Y")),
        ("Versao do motor", runtime_meta["engine"]),
        ("Versao Polars", runtime_meta["polars_version"]),
        ("Tempo de processamento (s)", runtime_meta["processing_seconds"]),
        ("Tamanho total dos arquivos", runtime_meta["input_total_size_label"]),
    ]
    if extra:
        rows.extend(extra)
    for item in runtime_meta["input_files"]:
        sheet = f" | aba: {item['sheet_name']}" if item.get("sheet_name") else ""
        rows.append((f"Arquivo - {item['label']}", f"{item['file_name']} ({item['file_size_label']}){sheet}"))
    return rows


def _write_job_meta(job_dir: Path, counts: dict[str, Any], runtime_meta: dict[str, Any], workbook: dict[str, Any] | None = None) -> None:
    payload = {
        "created": datetime.now(timezone.utc).isoformat(),
        "counts": counts,
        "meta": runtime_meta,
        "workbook": workbook or {},
    }
    (job_dir / "meta.json").write_text(json.dumps(payload, ensure_ascii=False), encoding="utf-8")


def _read_job_payload(job_dir: Path) -> dict[str, Any]:
    path = job_dir / "meta.json"
    if not path.exists():
        raise HTTPException(404, "Metadados do job nao encontrados.")
    return json.loads(path.read_text(encoding="utf-8"))


def _write_sheet_artifacts(job_dir: Path, sheets: dict[str, pl.DataFrame], file_map: dict[str, str] | None = None) -> None:
    manifest: list[dict[str, Any]] = []
    file_map = file_map or {}
    for index, (title, frame) in enumerate(sheets.items(), 1):
        file_name = file_map.get(title) or f"sheet_{index:02d}.parquet"
        if frame.height and not (job_dir / file_name).exists():
            frame.write_parquet(job_dir / file_name, compression="zstd")
        manifest.append({
            "title": title,
            "file": file_name if frame.height else "",
            "height": frame.height,
        })
    (job_dir / "sheets.json").write_text(json.dumps(manifest, ensure_ascii=False), encoding="utf-8")


def _read_sheet_artifacts(job_dir: Path) -> dict[str, pl.DataFrame]:
    manifest_path = job_dir / "sheets.json"
    if not manifest_path.exists():
        return {}
    sheets: dict[str, pl.DataFrame] = {}
    for item in json.loads(manifest_path.read_text(encoding="utf-8")):
        title = item.get("title") or "DADOS"
        file_name = item.get("file") or ""
        if file_name and (job_dir / file_name).exists():
            sheets[title] = pl.read_parquet(job_dir / file_name)
        else:
            sheets[title] = pl.DataFrame({"Resultado": ["Sem registros"]})
    return sheets


def _ensure_workbook(job_dir: Path, workbook_name: str, default_title: str) -> Path:
    output = job_dir / workbook_name
    if output.exists():
        return output
    payload = _read_job_payload(job_dir)
    workbook_info = payload.get("workbook") or {}
    runtime_meta = payload.get("meta") or _runtime_meta(time.perf_counter(), [])
    counts = payload.get("counts") or {}
    summary = _summary_rows(workbook_info.get("title") or default_title, runtime_meta, workbook_info.get("extra") or [])
    summary.extend((key, value) for key, value in counts.items() if isinstance(value, (int, float)))
    write_workbook(output, summary, _read_sheet_artifacts(job_dir))
    return output


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok", "engine": _engine_label(), "version": ENGINE_VERSION, "polars": pl.__version__}


@app.post("/api/faturamento/upload")
def upload(file: UploadFile = File(...)) -> dict:
    suffix = Path(file.filename or "").suffix.lower()
    if suffix not in {".xlsx", ".xlsm", ".csv"}:
        raise HTTPException(400, "Formato inválido. Use XLSX, XLSM ou CSV.")
    upload_id = uuid.uuid4().hex
    destination = UPLOADS / f"{upload_id}{suffix}"
    size = 0
    try:
        with destination.open("wb") as out:
            while chunk := file.file.read(8 << 20):
                size += len(chunk)
                if size > MAX_UPLOAD:
                    raise HTTPException(413, "Arquivo excede 1,5 GB.")
                out.write(chunk)
        preview = preview_table(destination)
        meta = _write_upload_meta(upload_id, Path(file.filename or "planilha").name, size, suffix)
        return {"upload_id": upload_id, **meta, **preview}
    except Exception:
        destination.unlink(missing_ok=True)
        _upload_meta_path(upload_id).unlink(missing_ok=True)
        raise


def _upload_path(upload_id: str) -> Path:
    if not upload_id.isalnum():
        raise HTTPException(400, "Identificador de upload inválido.")
    matches = list(UPLOADS.glob(f"{upload_id}.*"))
    if len(matches) != 1:
        raise HTTPException(404, "Upload expirado ou não encontrado.")
    return matches[0]


@app.get("/api/uploads/{upload_id}/preview")
def upload_preview(upload_id: str, sheet_name: str = "") -> dict:
    path = _upload_path(upload_id)
    return {**_read_upload_meta(upload_id, path), **preview_table(path, sheet_name=sheet_name or None)}


@app.post("/api/faturamento/process")
def process(request: ProcessRequest) -> dict:
    started_at = time.perf_counter()
    job_id = uuid.uuid4().hex
    job_dir = JOBS / job_id
    job_dir.mkdir()
    try:
        input_files = _source_meta_list([
            ("Pagadoria", request.pag),
            ("Recebiveis", request.rec),
            ("Base Clientes", request.cli),
        ])
        pag = apply_mapping(read_table(_upload_path(request.pag.upload_id), request.pag.sheet_name), request.pag.mapping, uc_mode=request.pag.uc_mode)
        rec = apply_mapping(read_table(_upload_path(request.rec.upload_id), request.rec.sheet_name), request.rec.mapping)
        cli = apply_mapping(read_table(_upload_path(request.cli.upload_id), request.cli.sheet_name), request.cli.mapping) if request.cli else None
        result = reconcile_faturamento(pag, rec, cli)
        previews: dict[str, list[dict]] = {}
        counts: dict[str, int] = dict(result.metrics)
        artifact_files: dict[str, str] = {}
        for title, frame in result.sheets.items():
            key = SHEET_KEYS[title]
            counts[key] = frame.height
            previews[key] = frame.head(PREVIEW_ROWS).to_dicts()
            if frame.height:
                artifact_files[title] = f"{key}.parquet"
                frame.write_parquet(job_dir / artifact_files[title], compression="zstd")
        _write_sheet_artifacts(job_dir, result.sheets, artifact_files)
        runtime_meta = _runtime_meta(started_at, input_files)
        _write_job_meta(job_dir, counts, runtime_meta, {"title": "Cruzamento Pagadoria x Recebiveis"})
        return {"job_id": job_id, "counts": counts, "rows": previews, "preview_limit": PREVIEW_ROWS, "logs": result.logs, "meta": runtime_meta, "download_url": f"/api/faturamento/jobs/{job_id}/workbook"}
    except HTTPException:
        shutil.rmtree(job_dir, ignore_errors=True)
        raise
    except Exception as exc:
        shutil.rmtree(job_dir, ignore_errors=True)
        raise HTTPException(500, f"Falha no cruzamento: {type(exc).__name__}: {exc}") from exc


@app.get("/api/faturamento/jobs/{job_id}/workbook")
def workbook(job_id: str) -> FileResponse:
    path = _ensure_workbook(_job_path(job_id), "cruzamento.xlsx", "Cruzamento Pagadoria x Recebiveis")
    if not path.exists():
        raise HTTPException(404, "Resultado não encontrado.")
    return FileResponse(path, media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", filename=f"cruzamento_{datetime.now():%d-%m-%Y}.xlsx")


@app.get("/api/faturamento/jobs/{job_id}/category/{category}")
def category(job_id: str, category: str, years: str = "") -> FileResponse:
    started_at = time.perf_counter()
    if category not in set(SHEET_KEYS.values()):
        raise HTTPException(404, "Categoria inválida.")
    source = _job_path(job_id) / f"{category}.parquet"
    if not source.exists():
        raise HTTPException(404, "Categoria vazia ou expirada.")
    frame = pl.read_parquet(source)
    selected = {year for year in years.split(",") if year.isdigit() and len(year) == 4}
    if selected:
        month_columns = [c for c in frame.columns if "mês" in c.casefold() or "mes" in c.casefold() or "data referencia" in c.casefold()]
        if month_columns:
            predicate = pl.any_horizontal([pl.col(c).cast(pl.String).str.contains("|".join(sorted(selected))) for c in month_columns])
            frame = frame.filter(predicate)
    output = _job_path(job_id) / f"export_{category}_{uuid.uuid4().hex[:8]}.xlsx"
    runtime_meta = _runtime_meta(started_at, [])
    write_workbook(output, _summary_rows("Exportacao de categoria", runtime_meta, [("Categoria", category), ("Registros", frame.height)]), {category: frame})
    return FileResponse(output, media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", filename=f"{category}.xlsx")


def _job_path(job_id: str) -> Path:
    if not job_id.isalnum():
        raise HTTPException(400, "Job inválido.")
    path = JOBS / job_id
    if not path.is_dir():
        raise HTTPException(404, "Job expirado ou não encontrado.")
    return path


@app.get("/api/faturamento/jobs")
def list_jobs() -> dict:
    jobs = []
    cutoff = datetime.now(timezone.utc) - timedelta(hours=24)
    for p in JOBS.iterdir():
        if p.is_dir():
            mtime = datetime.fromtimestamp(p.stat().st_mtime, tz=timezone.utc)
            if mtime > cutoff:
                jobs.append({"id": p.name, "created": mtime.isoformat()})
    return {"jobs": sorted(jobs, key=lambda x: x["created"], reverse=True)}


@app.post("/api/conciliacao/process")
def process_conciliacao(request: ConciliacaoProcessRequest) -> dict:
    started_at = time.perf_counter()
    job_id = uuid.uuid4().hex
    job_dir = JOBS / job_id
    job_dir.mkdir(parents=True, exist_ok=True)
    try:
        input_files = _source_meta_list([
            ("Base Completa", request.base),
            ("Financeiro", request.fin),
            ("Recebiveis", request.rec),
            ("Status", request.status),
        ])
        df_base = read_table(_upload_path(request.base.upload_id), request.base.sheet_name)
        df_fin = read_table(_upload_path(request.fin.upload_id), request.fin.sheet_name)
        df_rec = read_table(_upload_path(request.rec.upload_id), request.rec.sheet_name)
        df_status = read_table(_upload_path(request.status.upload_id), request.status.sheet_name)

        df_base = apply_mapping(df_base, request.base.mapping)
        df_fin = apply_mapping(df_fin, request.fin.mapping)
        df_rec = apply_mapping(df_rec, request.rec.mapping)
        df_status = apply_mapping(df_status, request.status.mapping)

        res_dict, total_base = reconcile_conciliacao(df_base, df_fin, df_rec, df_status)

        counts = {k: len(v) for k, v in res_dict.items()}
        counts["total"] = total_base

        # Mapeamento dos labels para as abas do Excel
        marcas = {
            "m1": "1 - Clientes OK",
            "m2": "2 - Boletando Sem data",
            "m3": "3 - Cancelado GV",
            "m5": "5 - Equipe de Devolutivas",
            "m6": "6 - Cancelado em ambas",
            "m7": "7 - Clientes em atraso",
            "m8": "8 - Represado",
            "m10": "10 - Aguardando retorno",
            "m11": "11 - Cancelado BKO",
            "m13": "13 - Atraso Sem boleto",
            "m15": "15 - Nao encontrado GV",
            "m22": "22 - Clientes Atraso",
            "m0": "0 - Verificacao Manual"
        }

        runtime_meta = _runtime_meta(started_at, input_files)
        export_dict = {}
        
        # O backend Faturamento usa a key exata no dicionario pro nome da aba
        for k, v in marcas.items():
            if len(res_dict[k]) > 0:
                export_dict[v] = pl.DataFrame(res_dict[k])

        _write_sheet_artifacts(job_dir, export_dict)
        extra = [("Total na Base", total_base), *[(v, counts[k]) for k, v in marcas.items()]]
        _write_job_meta(job_dir, counts, runtime_meta, {"title": "Conciliacao de Base", "extra": extra})

        return {
            "job_id": job_id,
            "counts": counts,
            "meta": runtime_meta,
            "download_url": f"/api/conciliacao/jobs/{job_id}/workbook"
        }
    except HTTPException:
        shutil.rmtree(job_dir, ignore_errors=True)
        raise
    except Exception as exc:
        shutil.rmtree(job_dir, ignore_errors=True)
        raise HTTPException(500, f"Falha na conciliação: {type(exc).__name__}: {exc}") from exc


@app.get("/api/conciliacao/jobs/{job_id}/workbook")
def workbook_conciliacao(job_id: str) -> FileResponse:
    path = _ensure_workbook(_job_path(job_id), "conciliacao.xlsx", "Conciliacao de Base")
    if not path.exists():
        raise HTTPException(404, "Resultado não encontrado.")
    return FileResponse(path, media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", filename=f"conciliacao_base_{datetime.now():%d-%m-%Y}.xlsx")


@app.post("/api/inadimplentes/process")
def process_inadimplentes(request: InadimplentesProcessRequest) -> dict:
    started_at = time.perf_counter()
    job_id = uuid.uuid4().hex
    job_dir = JOBS / job_id
    job_dir.mkdir(parents=True, exist_ok=True)
    try:
        input_files = _source_meta_list([
            ("Pagadoria Interna", request.pag),
            ("Recebiveis", request.rec),
            ("Base Clientes", request.cli),
            ("Inclusao Consolidada", request.inc),
            ("GV-Recebiveis", request.lab),
            ("Pagadoria GV-CMU", request.pag_cmu),
            ("Pagadoria GV-Northen", request.pag_northen),
            ("Base Clientes GV-CMU", request.cli_cmu),
        ])
        pag = apply_mapping(read_table(_upload_path(request.pag.upload_id), request.pag.sheet_name), request.pag.mapping)
        rec = apply_mapping(read_table(_upload_path(request.rec.upload_id), request.rec.sheet_name), request.rec.mapping)
        cli = apply_mapping(read_table(_upload_path(request.cli.upload_id), request.cli.sheet_name), request.cli.mapping)
        inc = apply_mapping(read_table(_upload_path(request.inc.upload_id), request.inc.sheet_name), request.inc.mapping) if request.inc else None
        lab = apply_mapping(read_table(_upload_path(request.lab.upload_id), request.lab.sheet_name), request.lab.mapping) if request.lab else None
        pag_cmu = apply_mapping(read_table(_upload_path(request.pag_cmu.upload_id), request.pag_cmu.sheet_name), request.pag_cmu.mapping) if request.pag_cmu else None
        pag_northen = apply_mapping(read_table(_upload_path(request.pag_northen.upload_id), request.pag_northen.sheet_name), request.pag_northen.mapping) if request.pag_northen else None
        cli_cmu = apply_mapping(read_table(_upload_path(request.cli_cmu.upload_id), request.cli_cmu.sheet_name), request.cli_cmu.mapping) if request.cli_cmu else None

        result = reconcile_inadimplentes(
            pag,
            rec,
            cli,
            inc,
            lab,
            df_pag_cmu=pag_cmu,
            df_cli_cmu=cli_cmu,
            df_pag_northen=pag_northen,
            min_overdue=request.min_overdue,
        )
        counts = dict(result.metrics)
        rows = {
            "inadimplentes": result.sheets["INADIMPLENTES"].head(PREVIEW_ROWS).to_dicts(),
            "atrasoFaturamento": result.sheets["ATRASO FATURAMENTO"].head(PREVIEW_ROWS).to_dicts(),
            "erroInterno": result.sheets["ERRO INTERNO"].head(PREVIEW_ROWS).to_dicts(),
            "atrasoBackoffice": result.sheets["ATRASO BACKOFFICE"].head(PREVIEW_ROWS).to_dicts(),
        }
        _write_sheet_artifacts(job_dir, result.sheets)
        runtime_meta = _runtime_meta(started_at, input_files)
        _write_job_meta(
            job_dir,
            counts,
            runtime_meta,
            {"title": "Inadimplentes e Atraso de Faturamento", "extra": [("Minimo de boletos vencidos", request.min_overdue)]},
        )
        return {
            "job_id": job_id,
            "counts": counts,
            "rows": rows,
            "preview_limit": PREVIEW_ROWS,
            "logs": result.logs,
            "meta": runtime_meta,
            "download_url": f"/api/inadimplentes/jobs/{job_id}/workbook",
        }
    except HTTPException:
        shutil.rmtree(job_dir, ignore_errors=True)
        raise
    except Exception as exc:
        shutil.rmtree(job_dir, ignore_errors=True)
        raise HTTPException(500, f"Falha na analise de inadimplentes: {type(exc).__name__}: {exc}") from exc


@app.get("/api/inadimplentes/jobs/{job_id}/workbook")
def workbook_inadimplentes(job_id: str) -> FileResponse:
    path = _ensure_workbook(_job_path(job_id), "inadimplentes.xlsx", "Inadimplentes e Atraso de Faturamento")
    if not path.exists():
        raise HTTPException(404, "Resultado nao encontrado.")
    return FileResponse(path, media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", filename=f"inadimplentes_{datetime.now():%d-%m-%Y}.xlsx")


@app.post("/api/atualizacoes/process")
def process_atualizacoes(request: AtualizacoesProcessRequest) -> dict:
    started_at = time.perf_counter()
    job_id = uuid.uuid4().hex
    job_dir = JOBS / job_id
    job_dir.mkdir(parents=True, exist_ok=True)
    try:
        input_files = _source_meta_list([
            ("Atualizacoes GV", request.atualizacao),
            ("Faturamento Consolidado", request.faturamento),
            ("Recebiveis", request.rec),
            ("Pagadoria Northen", request.pag_northen),
            ("Pagadoria Interna", request.pag_interna),
        ])
        atualizacao = apply_mapping(read_table(_upload_path(request.atualizacao.upload_id), request.atualizacao.sheet_name), request.atualizacao.mapping)
        faturamento = apply_mapping(read_table(_upload_path(request.faturamento.upload_id), request.faturamento.sheet_name), request.faturamento.mapping)
        rec = apply_mapping(read_table(_upload_path(request.rec.upload_id), request.rec.sheet_name), request.rec.mapping)
        pag_northen = apply_mapping(read_table(_upload_path(request.pag_northen.upload_id), request.pag_northen.sheet_name), request.pag_northen.mapping)
        pag_interna = apply_mapping(read_table(_upload_path(request.pag_interna.upload_id), request.pag_interna.sheet_name), request.pag_interna.mapping)

        modo = (
            "parcelamentos"
            if (request.atualizacao.sheet_name or "").strip().casefold() == "com p"
            else "atualizacoes"
        )
        result = reconcile_atualizacoes(
            atualizacao,
            faturamento,
            rec,
            pag_northen,
            pag_interna,
            modo=modo,
        )
        counts = dict(result.metrics)
        if modo == "parcelamentos":
            rows = {
                "parcelamentos": result.sheets["PARCELAMENTOS"].head(PREVIEW_ROWS).to_dicts(),
                "exclusao": result.sheets["EXCLUSÃO"].head(PREVIEW_ROWS).to_dicts(),
            }
        else:
            rows = {
                "atualizacoes": result.sheets["ATUALIZACOES"].head(PREVIEW_ROWS).to_dicts(),
                "pendencias": result.sheets["PENDENCIAS"].head(PREVIEW_ROWS).to_dicts(),
                "auditoria": result.sheets["AUDITORIA"].head(PREVIEW_ROWS).to_dicts(),
            }
        _write_sheet_artifacts(job_dir, result.sheets)
        runtime_meta = _runtime_meta(started_at, input_files)
        workbook_title = "Parcelamentos GV" if modo == "parcelamentos" else "Atualizacoes GV"
        _write_job_meta(job_dir, counts, runtime_meta, {"title": workbook_title})
        return {
            "job_id": job_id,
            "mode": modo,
            "counts": counts,
            "rows": rows,
            "preview_limit": PREVIEW_ROWS,
            "logs": result.logs,
            "meta": runtime_meta,
            "download_url": f"/api/atualizacoes/jobs/{job_id}/workbook",
        }
    except HTTPException:
        shutil.rmtree(job_dir, ignore_errors=True)
        raise
    except Exception as exc:
        shutil.rmtree(job_dir, ignore_errors=True)
        raise HTTPException(500, f"Falha na analise de atualizacoes: {type(exc).__name__}: {exc}") from exc


@app.get("/api/atualizacoes/jobs/{job_id}/workbook")
def workbook_atualizacoes(job_id: str) -> FileResponse:
    path = _ensure_workbook(_job_path(job_id), "atualizacoes.xlsx", "Atualizacoes GV")
    if not path.exists():
        raise HTTPException(404, "Resultado nao encontrado.")
    return FileResponse(path, media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", filename=f"atualizacoes_{datetime.now():%d-%m-%Y}.xlsx")


@app.post("/api/qualidade-edp/process")
def process_qualidade_edp(request: QualidadeEdpProcessRequest) -> dict:
    started_at = time.perf_counter()
    job_id = uuid.uuid4().hex
    job_dir = JOBS / job_id
    job_dir.mkdir(parents=True, exist_ok=True)
    try:
        input_files = _source_meta_list([
            ("Pagadoria EDP", request.pag),
            ("BASE_rcb EDP", request.rec),
            ("Base EDP", request.cli),
        ])
        pag = apply_mapping(read_table(_upload_path(request.pag.upload_id), request.pag.sheet_name), request.pag.mapping)
        rec = apply_mapping(read_table(_upload_path(request.rec.upload_id), request.rec.sheet_name), request.rec.mapping)
        cli = apply_mapping(read_table(_upload_path(request.cli.upload_id), request.cli.sheet_name), request.cli.mapping)

        result = reconcile_qualidade_edp(pag, rec, cli)
        counts = dict(result.metrics)
        rows = {
            "healthscore": result.sheets["HEALTHSCORE EDP"].head(PREVIEW_ROWS).to_dicts(),
            "atencao": result.sheets["ATENCAO"].head(PREVIEW_ROWS).to_dicts(),
            "semDados": result.sheets["SEM DADOS"].head(PREVIEW_ROWS).to_dicts(),
            "resumoCriterios": result.sheets["RESUMO CRITERIOS"].head(PREVIEW_ROWS).to_dicts(),
        }
        _write_sheet_artifacts(job_dir, result.sheets)
        runtime_meta = _runtime_meta(started_at, input_files)
        _write_job_meta(job_dir, counts, runtime_meta, {"title": "Qualidade de Injecao EDP"})
        return {
            "job_id": job_id,
            "counts": counts,
            "rows": rows,
            "preview_limit": PREVIEW_ROWS,
            "logs": result.logs,
            "meta": runtime_meta,
            "download_url": f"/api/qualidade-edp/jobs/{job_id}/workbook",
        }
    except HTTPException:
        shutil.rmtree(job_dir, ignore_errors=True)
        raise
    except Exception as exc:
        shutil.rmtree(job_dir, ignore_errors=True)
        raise HTTPException(500, f"Falha na analise de qualidade EDP: {type(exc).__name__}: {exc}") from exc


@app.get("/api/qualidade-edp/jobs/{job_id}/workbook")
def workbook_qualidade_edp(job_id: str) -> FileResponse:
    path = _ensure_workbook(_job_path(job_id), "qualidade_edp.xlsx", "Qualidade de Injecao EDP")
    if not path.exists():
        raise HTTPException(404, "Resultado nao encontrado.")
    return FileResponse(path, media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", filename=f"qualidade_edp_{datetime.now():%d-%m-%Y}.xlsx")


@app.post("/api/boletos-faltantes/process")
def process_boletos_faltantes(request: BoletosFaltantesProcessRequest) -> dict:
    started_at = time.perf_counter()
    job_id = uuid.uuid4().hex
    job_dir = JOBS / job_id
    job_dir.mkdir(parents=True, exist_ok=True)
    try:
        input_files = _source_meta_list([
            ("Pagadoria", request.pag),
            ("Recebiveis", request.rec),
            ("Base GV", request.gv),
            ("Faturamento Consolidado", request.fat),
        ])
        pag = apply_mapping(read_table(_upload_path(request.pag.upload_id), request.pag.sheet_name), request.pag.mapping)
        rec = apply_mapping(read_table(_upload_path(request.rec.upload_id), request.rec.sheet_name), request.rec.mapping)
        gv = apply_mapping(read_table(_upload_path(request.gv.upload_id), request.gv.sheet_name), request.gv.mapping)
        fat = apply_mapping(read_table(_upload_path(request.fat.upload_id), request.fat.sheet_name), request.fat.mapping)

        result = reconcile_boletos_faltantes(pag, rec, gv, fat)
        counts = dict(result.metrics)
        rows = {
            "todos": result.sheets["TODOS"].head(PREVIEW_ROWS).to_dicts(),
            "faltamRecebiveis": result.sheets["FALTA RECEBIVEIS"].head(PREVIEW_ROWS).to_dicts(),
            "faltamPagadoria": result.sheets["FALTA PAGADORIA"].head(PREVIEW_ROWS).to_dicts(),
            "faltamAmbos": result.sheets["FALTA DOIS LADOS"].head(PREVIEW_ROWS).to_dicts(),
            "erroInterno": result.sheets["ERRO INTERNO"].head(PREVIEW_ROWS).to_dicts(),
            "erroFornecedora": result.sheets["ERRO FORNECEDORA"].head(PREVIEW_ROWS).to_dicts(),
            "responsabilidade": result.sheets["RESPONSABILIDADE"].head(PREVIEW_ROWS).to_dicts(),
        }
        export_sheets = {
            title: frame.select([column for column in frame.columns if not column.startswith("_")])
            for title, frame in result.sheets.items()
        }
        _write_sheet_artifacts(job_dir, export_sheets)
        runtime_meta = _runtime_meta(started_at, input_files)
        _write_job_meta(job_dir, counts, runtime_meta, {"title": "Boletos Faltantes"})
        return {
            "job_id": job_id,
            "counts": counts,
            "rows": rows,
            "preview_limit": PREVIEW_ROWS,
            "logs": result.logs,
            "meta": runtime_meta,
            "download_url": f"/api/boletos-faltantes/jobs/{job_id}/workbook",
        }
    except HTTPException:
        shutil.rmtree(job_dir, ignore_errors=True)
        raise
    except Exception as exc:
        shutil.rmtree(job_dir, ignore_errors=True)
        raise HTTPException(500, f"Falha na analise de boletos faltantes: {type(exc).__name__}: {exc}") from exc


@app.get("/api/boletos-faltantes/jobs/{job_id}/workbook")
def workbook_boletos_faltantes(job_id: str) -> FileResponse:
    path = _ensure_workbook(_job_path(job_id), "boletos_faltantes.xlsx", "Boletos Faltantes")
    if not path.exists():
        raise HTTPException(404, "Resultado nao encontrado.")
    return FileResponse(path, media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", filename=f"boletos_faltantes_{datetime.now():%d-%m-%Y}.xlsx")


if __name__ == "__main__":
    import uvicorn
    cleanup_expired()
    uvicorn.run("server.app:app", host="0.0.0.0", port=8000, reload=False)
