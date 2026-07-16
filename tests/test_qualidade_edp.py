import unittest

import polars as pl

from server.qualidade_edp import reconcile_qualidade_edp


class QualidadeEdpTests(unittest.TestCase):
    def test_healthscore_edp_calcula_criterios_aplicaveis(self):
        pag = pl.DataFrame(
            [
                {
                    "Cobranca EDP": "COB-1",
                    "Cliente": "Cliente A",
                    "CPF / CNPJ": "111.111.111-11",
                    "Valor do Boleto (R$)": "80",
                    "Valor Pago (R$)": "80",
                    "Numero da Instalacao": "000123",
                    "Distribuidora": "EDP ES",
                    "Energia Compensada (kWh)": "90",
                    "Status": "Paga",
                    "Mes de Referencia": "01/2026",
                    "Consumo Total (kWh)": "150",
                }
            ]
        )
        rec = pl.DataFrame(
            [
                {
                    "Concessionaria": "EDP ES",
                    "instalacao": "123",
                    "cliente": "Cliente A",
                    "data referencia": "2026-01-01",
                    "cpf": "11111111111",
                    "status": "PAGO",
                    "valor a pagar": "80",
                    "idrcb": "900",
                    "numero cliente": "700",
                    "codigo cliente": "100",
                    "fornecedora": "EDP",
                    "nvalordistribuidora": "100",
                },
                {
                    "Concessionaria": "EDP ES",
                    "instalacao": "123",
                    "cliente": "Cliente A",
                    "data referencia": "2025-12-01",
                    "cpf": "11111111111",
                    "status": "PAGO",
                    "valor a pagar": "70",
                    "idrcb": "899",
                    "numero cliente": "700",
                    "codigo cliente": "100",
                    "fornecedora": "EDP",
                    "nvalordistribuidora": "90",
                },
            ]
        )
        cli = pl.DataFrame(
            [
                {
                    "codigo": "100",
                    "nome": "Cliente A",
                    "instalacao": "123",
                    "cpf": "11111111111",
                    "media consumo": "160",
                    "classificacao": "Residencial - Bifasico",
                    "fornecedora": "EDP",
                }
            ]
        )

        result = reconcile_qualidade_edp(pag, rec, cli)
        row = result.sheets["HEALTHSCORE EDP"].to_dicts()[0]

        self.assertEqual(row["C1: Simulado >= Boleto"], "OK")
        self.assertEqual(row["C2: Consumo vs Media (+/-40%)"], "OK")
        self.assertEqual(row["C9: Consumo > Disponibilidade"], "OK")
        self.assertEqual(row["C13: Compensada <= Integral"], "OK")
        self.assertEqual(row["N criterios aplicaveis"], 7)
        self.assertGreaterEqual(row["HealthScore (%)"], 85)
        self.assertEqual(result.metrics["matchesCliente"], 1)
        self.assertEqual(result.metrics["matchesRecebiveis"], 1)


if __name__ == "__main__":
    unittest.main()
