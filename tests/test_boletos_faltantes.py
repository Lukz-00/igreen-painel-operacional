import unittest

import polars as pl

from server.boletos_faltantes import reconcile_boletos_faltantes


class BoletosFaltantesTests(unittest.TestCase):
    def test_cruza_por_base_gv_e_separa_faltas(self):
        base = pl.DataFrame({
            "Codigo": ["10"],
            "Nome": ["Cliente A"],
            "Instalacao": ["100"],
            "Nova Instalacao": ["900"],
            "Numero Cliente": ["77"],
        })
        pag = pl.DataFrame({
            "Instalacao": ["900", "900", "900"],
            "Mes": ["01/2026", "02/2026", "03/2026"],
        })
        rec = pl.DataFrame({
            "Instalacao": ["100", "100", "100"],
            "Data Referencia": ["2026-01", "2026-03", "2026-04"],
        })

        result = reconcile_boletos_faltantes(pag, rec, base)

        self.assertEqual(result.metrics["clientesAnalisados"], 1)
        self.assertEqual(result.metrics["clientesComPendencia"], 1)
        self.assertEqual(result.metrics["mesesFaltamRecebiveis"], 1)
        self.assertEqual(result.metrics["mesesFaltamPagadoria"], 1)
        self.assertEqual(result.sheets["FALTA RECEBIVEIS"]["Falta nos Recebiveis"].to_list(), ["02/2026"])
        self.assertEqual(result.sheets["FALTA PAGADORIA"]["Falta na Pagadoria"].to_list(), ["04/2026"])


if __name__ == "__main__":
    unittest.main()
