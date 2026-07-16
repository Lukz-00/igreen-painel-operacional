import tempfile
import time
import unittest
from pathlib import Path

import polars as pl
from openpyxl import load_workbook

from server.app import ENGINE_VERSION, _format_bytes, _runtime_meta, _summary_rows, health
from server.excel_io import write_workbook


class AppMetadataTests(unittest.TestCase):
    def test_health_and_summary_rows_expose_engine_metadata(self):
        status = health()
        self.assertEqual(status["version"], ENGINE_VERSION)
        self.assertEqual(status["engine"], f"iGreen Polars Engine {ENGINE_VERSION}")

        meta = _runtime_meta(
            time.perf_counter(),
            [
                {
                    "label": "Pagadoria EDP",
                    "file_name": "pagadoria_edp.csv",
                    "sheet_name": "Export",
                    "file_size_bytes": 2048,
                    "file_size_label": _format_bytes(2048),
                }
            ],
        )

        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "metadata.xlsx"
            write_workbook(path, _summary_rows("Qualidade de Injecao EDP", meta), {"DADOS": pl.DataFrame({"A": ["1"]})})
            wb = load_workbook(path, read_only=True, data_only=True)
            try:
                resumo = wb["RESUMO"]
                values = {resumo[f"A{row}"].value: resumo[f"B{row}"].value for row in range(1, 12)}
                self.assertEqual(values["Versao do motor"], f"iGreen Polars Engine {ENGINE_VERSION}")
                self.assertEqual(values["Versao Polars"], pl.__version__)
                self.assertEqual(values["Tamanho total dos arquivos"], "2.0 KB")
                self.assertEqual(values["Arquivo - Pagadoria EDP"], "pagadoria_edp.csv (2.0 KB) | aba: Export")
            finally:
                wb.close()


if __name__ == "__main__":
    unittest.main()
