from __future__ import annotations

import json
import shutil
import tempfile
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path

import polars as pl
from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field

from .excel_io import preview_table, read_table, write_workbook
from .reconciliation import apply_mapping, reconcile_faturamento
from .conciliacao import reconcile_conciliacao


ROOT = Path(tempfile.gettempdir()) / "igreen-polars"
UPLOADS = ROOT / "uploads"
JOBS = ROOT / "jobs"
UPLOADS.mkdir(parents=True, exist_ok=True)
JOBS.mkdir(parents=True, exist_ok=True)
MAX_UPLOAD = 1_500_000_000
PREVIEW_ROWS = 500

app = FastAPI(title="iGreen Polars API", version="2.0.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


class Source(BaseModel):
    upload_id: str
    mapping: dict[str, str] = Field(default_factory=dict)
    uc_mode: str = "uc"


class ProcessRequest(BaseModel):
    pag: Source
    rec: Source
    cli: Source | None = None

class ConciliacaoProcessRequest(BaseModel):
    base: Source
    fin: Source
    rec: Source
    status: Source


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


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok", "engine": f"polars-{pl.__version__}"}


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
        return {"upload_id": upload_id, "file_name": Path(file.filename or "planilha").name, **preview}
    except Exception:
        destination.unlink(missing_ok=True)
        raise


def _upload_path(upload_id: str) -> Path:
    if not upload_id.isalnum():
        raise HTTPException(400, "Identificador de upload inválido.")
    matches = list(UPLOADS.glob(f"{upload_id}.*"))
    if len(matches) != 1:
        raise HTTPException(404, "Upload expirado ou não encontrado.")
    return matches[0]


@app.post("/api/faturamento/process")
def process(request: ProcessRequest) -> dict:
    job_id = uuid.uuid4().hex
    job_dir = JOBS / job_id
    job_dir.mkdir()
    try:
        pag = apply_mapping(read_table(_upload_path(request.pag.upload_id)), request.pag.mapping, uc_mode=request.pag.uc_mode)
        rec = apply_mapping(read_table(_upload_path(request.rec.upload_id)), request.rec.mapping)
        cli = apply_mapping(read_table(_upload_path(request.cli.upload_id)), request.cli.mapping) if request.cli else None
        result = reconcile_faturamento(pag, rec, cli)
        previews: dict[str, list[dict]] = {}
        counts: dict[str, int] = dict(result.metrics)
        workbook_sheets: dict[str, pl.DataFrame] = {}
        for title, frame in result.sheets.items():
            key = SHEET_KEYS[title]
            counts[key] = frame.height
            previews[key] = frame.head(PREVIEW_ROWS).to_dicts()
            workbook_sheets[title] = frame
            if frame.height:
                frame.write_parquet(job_dir / f"{key}.parquet", compression="zstd")
        workbook = job_dir / "cruzamento.xlsx"
        summary = [("Cruzamento Pagadoria x Recebíveis", ""), ("Data", datetime.now().strftime("%d/%m/%Y"))]
        summary.extend((key, value) for key, value in counts.items() if isinstance(value, (int, float)))
        write_workbook(workbook, summary, workbook_sheets)
        (job_dir / "meta.json").write_text(json.dumps({"created": datetime.now(timezone.utc).isoformat(), "counts": counts}), encoding="utf-8")
        return {"job_id": job_id, "counts": counts, "rows": previews, "preview_limit": PREVIEW_ROWS, "logs": result.logs, "download_url": f"/api/faturamento/jobs/{job_id}/workbook"}
    except HTTPException:
        shutil.rmtree(job_dir, ignore_errors=True)
        raise
    except Exception as exc:
        shutil.rmtree(job_dir, ignore_errors=True)
        raise HTTPException(500, f"Falha no cruzamento: {type(exc).__name__}: {exc}") from exc


@app.get("/api/faturamento/jobs/{job_id}/workbook")
def workbook(job_id: str) -> FileResponse:
    path = _job_path(job_id) / "cruzamento.xlsx"
    if not path.exists():
        raise HTTPException(404, "Resultado não encontrado.")
    return FileResponse(path, media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", filename=f"cruzamento_{datetime.now():%d-%m-%Y}.xlsx")


@app.get("/api/faturamento/jobs/{job_id}/category/{category}")
def category(job_id: str, category: str, years: str = "") -> FileResponse:
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
    write_workbook(output, [("Categoria", category), ("Registros", frame.height)], {category: frame})
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
    job_id = uuid.uuid4().hex
    job_dir = JOBS / job_id
    job_dir.mkdir(parents=True, exist_ok=True)
    try:
        df_base = read_table(_upload_path(request.base.upload_id))
        df_fin = read_table(_upload_path(request.fin.upload_id))
        df_rec = read_table(_upload_path(request.rec.upload_id))
        df_status = read_table(_upload_path(request.status.upload_id))

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

        # Criar a aba RESUMO (o write_workbook espera list[tuple[str, Any]])
        resumo_rows = [
            ("Total na Base", total_base)
        ]
        for k, v in marcas.items():
            resumo_rows.append((v, counts[k]))

        export_dict = {}
        
        # O backend Faturamento usa a key exata no dicionario pro nome da aba
        for k, v in marcas.items():
            if len(res_dict[k]) > 0:
                export_dict[v] = pl.DataFrame(res_dict[k])

        write_workbook(job_dir / "conciliacao.xlsx", resumo_rows, export_dict)

        return {
            "job_id": job_id,
            "counts": counts,
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
    path = _job_path(job_id) / "conciliacao.xlsx"
    if not path.exists():
        raise HTTPException(404, "Resultado não encontrado.")
    return FileResponse(path, media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", filename=f"conciliacao_base_{datetime.now():%d-%m-%Y}.xlsx")


def cleanup_expired(max_age_hours: int = 24) -> None:
    cutoff = datetime.now(timezone.utc) - timedelta(hours=max_age_hours)
    for folder in (UPLOADS, JOBS):
        for path in folder.iterdir():
            modified = datetime.fromtimestamp(path.stat().st_mtime, timezone.utc)
            if modified < cutoff:
                shutil.rmtree(path, ignore_errors=True) if path.is_dir() else path.unlink(missing_ok=True)


if __name__ == "__main__":
    import uvicorn
    cleanup_expired()
    uvicorn.run("server.app:app", host="0.0.0.0", port=8000, reload=False)
