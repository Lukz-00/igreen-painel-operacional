import unittest

import polars as pl

from server.atualizacoes import reconcile_atualizacoes


class AtualizacoesTests(unittest.TestCase):
    def test_preenche_priorizando_atualizacao_e_completa_com_fontes(self):
        atualizacao = pl.DataFrame({
            "Cod cliente": ["123"],
            "Cliente": ["Cliente Novo"],
            "Instalação": ["100"],
            "IDRCB": [""],
            "Valor": ["150.00"],
            "Mês de referência": ["2026-01-01"],
            "Distribuidora e UF": ["EDP-ES"],
            "Nova data pagamento": ["2026-08-15"],
            "Código de barras": ["BAR-NOVO"],
        })
        faturamento = pl.DataFrame({
            "NOME DO CLIENTE": ["Cliente Antigo"],
            "UNIDADE CONSUMIDORA (UC)": ["100"],
            "MÊS DE REFERÊNCIA": ["2026-01-01"],
            "CONSUMO (kWh)": ["200"],
            "ENERGIA COMPENSADA (kWh)": ["180"],
            "VALOR DA FATURA (R$)": ["999.00"],
            "PIX COPIA E COLA": ["PIX123"],
        })
        recebiveis = pl.DataFrame({
            "codigo cliente": ["123"],
            "instalação": ["100"],
            "data referencia": ["2026-01-01"],
            "idrcb": ["555"],
            "valor a pagar": ["10.00"],
        })
        pag_northen = pl.DataFrame({
            "UC": ["100"],
            "Mês": ["2026-01-01"],
            "Energia Compensada": ["181"],
        })
        pag_interna = pl.DataFrame({
            "Instalação": ["100"],
            "MÊS NORMALIZADO": ["2026-01-01"],
            "ID Cobrança": ["COB1"],
            "IUGU": ["IUGU1"],
        })

        result = reconcile_atualizacoes(atualizacao, faturamento, recebiveis, pag_northen, pag_interna)
        row = result.sheets["ATUALIZACOES"].to_dicts()[0]

        self.assertEqual(row["IDRCB"], "555")
        self.assertEqual(row["NOME DO CLIENTE"], "Cliente Novo")
        self.assertEqual(row["VALOR DA FATURA (R$)"], "150.00")
        self.assertEqual(row["CÓDIGO DE BARRAS"], "BAR-NOVO")
        self.assertEqual(row["CONSUMO (kWh)"], "200")
        self.assertEqual(row["PIX COPIA E COLA"], "PIX123")
        self.assertEqual(row["ID Cobrança"], "COB1")
        self.assertEqual(row["IUGU"], "IUGU1")
        self.assertEqual(result.metrics["linhasProntas"], 1)

    def test_quando_idrcb_vem_da_atualizacao_ele_nao_e_sobrescrito(self):
        atualizacao = pl.DataFrame({
            "Cod cliente": ["123"],
            "Cliente": ["Cliente"],
            "Instalação": ["100"],
            "IDRCB": ["777"],
            "Valor": ["150.00"],
            "Mês de referência": ["2026-01-01"],
            "Nova data pagamento": ["2026-08-15"],
            "Código de barras": ["BAR-NOVO"],
        })
        recebiveis = pl.DataFrame({
            "codigo cliente": ["123"],
            "instalação": ["100"],
            "data referencia": ["2026-01-01"],
            "idrcb": ["555"],
        })
        empty = pl.DataFrame({"Instalação": [], "Mês": []})
        pag_interna = pl.DataFrame({
            "Instalação": ["100"],
            "MÊS NORMALIZADO": ["2026-01-01"],
            "ID Cobrança": ["COB1"],
            "IUGU": ["IUGU1"],
        })

        result = reconcile_atualizacoes(atualizacao, empty, recebiveis, empty, pag_interna)
        row = result.sheets["ATUALIZACOES"].to_dicts()[0]

        self.assertEqual(row["IDRCB"], "777")
        self.assertEqual(result.sheets["AUDITORIA"].to_dicts()[0]["Fonte IDRCB"], "Atualizacao")


if __name__ == "__main__":
    unittest.main()
