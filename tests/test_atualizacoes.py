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

    def test_com_p_separa_parcelamentos_e_exclusao_e_atualiza_valor_pelo_boleto(self):
        atualizacao = pl.DataFrame({
            "Cod cliente": ["406876", "209785"],
            "Cliente": ["Cliente A", "Cliente B"],
            "Instalação": ["1/1163658-6", "0001127531"],
            "IDRCB": ["", "987"],
            "Valor": ["256.72", "186.42"],
            "Mês de referência": ["2025-10-01", "2025-11-01"],
            "Nova data pagamento": ["2026-07-31", "2026-08-21"],
            "Código de barras": [
                "46191.11000 00000.000042 62367.832011 1 15240000021215",
                "40192.02623 03000.000004 00000.802470 9 15310000015671",
            ],
        })
        recebiveis = pl.DataFrame({
            "Codigo Cliente": ["406876", "209785"],
            "instalacao": ["1/1163658-6", "0001127531"],
            "Data Referencia": ["2025-10-01", "2025-11-01"],
            "idrcb": ["555", "987"],
        })
        empty = pl.DataFrame({"Instalação": [], "Mês": []})

        result = reconcile_atualizacoes(
            atualizacao,
            empty,
            recebiveis,
            empty,
            empty,
            modo="parcelamentos",
        )
        parcelamentos = result.sheets["PARCELAMENTOS"]
        exclusao = result.sheets["EXCLUSÃO"]

        self.assertNotIn("IDRCB", parcelamentos.columns)
        self.assertEqual(
            parcelamentos.get_column("VALOR DA FATURA (R$)").to_list(),
            ["212.15", "156.71"],
        )
        self.assertEqual(
            parcelamentos.get_column("CÓDIGO DE BARRAS").to_list(),
            atualizacao.get_column("Código de barras").to_list(),
        )
        self.assertEqual(exclusao.get_column("IDRCB").to_list(), ["555", "987"])
        self.assertEqual(result.metrics["totalParcelamentos"], 2)
        self.assertEqual(result.metrics["idrcbParaExclusao"], 2)
        self.assertEqual(result.metrics["valoresDerivadosCodigoBarras"], 2)

    def test_com_p_nao_exclui_boleto_antigo_sem_codigo_de_barras_novo(self):
        atualizacao = pl.DataFrame({
            "Cod cliente": ["123"],
            "Cliente": ["Cliente"],
            "Instalação": ["100"],
            "IDRCB": ["555"],
            "Mês de referência": ["2026-01-01"],
            "Código de barras": [""],
        })
        empty = pl.DataFrame({"Instalação": [], "Mês": []})

        result = reconcile_atualizacoes(
            atualizacao,
            empty,
            empty,
            empty,
            empty,
            modo="parcelamentos",
        )

        self.assertEqual(result.sheets["PARCELAMENTOS"].height, 0)
        self.assertEqual(result.sheets["EXCLUSÃO"].height, 0)
        self.assertEqual(result.metrics["solicitacoesSemCodigoBarras"], 1)


if __name__ == "__main__":
    unittest.main()
