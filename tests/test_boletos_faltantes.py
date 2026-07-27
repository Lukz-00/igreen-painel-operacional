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

    def test_erro_interno_indica_se_existe_na_pagadoria_e_origem(self):
        base = pl.DataFrame({
            "Codigo": ["10"],
            "Nome": ["Cliente A"],
            "Instalacao": ["100"],
            "Numero Cliente": ["77"],
        })
        pag = pl.DataFrame({
            "Instalacao": ["100"],
            "Mes": ["01/2026"],
        })
        rec = pl.DataFrame({
            "Instalacao": ["100"],
            "Data Referencia": ["03/2026"],
        })
        fat = pl.DataFrame({
            "UNIDADE CONSUMIDORA (UC)": ["100", "100", "100"],
            "MES DE REFERENCIA": ["2026-01-01 00:00:00", "02/2026", "02/2026"],
            "NOME DO CLIENTE": ["Cliente A", "Cliente A", "Cliente A"],
            "VALOR DA FATURA (R$)": ["120,00", "130,00", "130,00"],
            "CODIGO DE BARRAS": ["111", "222", "222"],
            "ARQUIVO_DE_ORIGEM": ["ENVIO 90.xlsx", "FATURAMENTO IGREEN 19-04.xlsx", "FATURAMENTO IGREEN 19-04.xlsx"],
        })

        result = reconcile_boletos_faltantes(pag, rec, base, fat)
        erro = result.sheets["ERRO INTERNO"]

        self.assertEqual(result.metrics["errosInternos"], 2)
        self.assertEqual(result.metrics["clientesErroInterno"], 1)
        self.assertEqual(result.metrics["errosInternosComPagadoria"], 1)
        self.assertEqual(result.metrics["errosInternosSemPagadoria"], 1)
        self.assertEqual(erro["Mes de referencia"].to_list(), ["01/2026", "02/2026"])
        self.assertEqual(erro["Existe na Pagadoria"].to_list(), ["SIM", "NAO"])
        self.assertEqual(erro["Arquivo de origem"].to_list(), ["ENVIO 90.xlsx", "FATURAMENTO IGREEN 19-04.xlsx"])
        self.assertEqual(erro["Codigo cliente Faturamento"].to_list(), ["-", "-"])
        self.assertEqual(erro["Codigo de barras Faturamento"].to_list(), ["111", "222"])
        self.assertEqual(erro["Qtd. registros Faturamento"].to_list(), [1, 2])
        self.assertEqual(erro["Possivel duplicidade Faturamento"].to_list(), ["NAO", "SIM"])

    def test_faturamento_combina_colunas_de_layouts_diferentes(self):
        base = pl.DataFrame({"Codigo": ["10"], "Nome": ["Cliente A"], "Instalacao": ["100"]})
        pag = pl.DataFrame({"Instalacao": ["100"], "Mes": ["01/2026"]})
        rec = pl.DataFrame({"Instalacao": ["100"], "Data Referencia": ["02/2026"]})
        fat = pl.DataFrame({
            "UNIDADE CONSUMIDORA (UC)": [""],
            "UC.1": ["100"],
            "MES DE REFERENCIA": ["01/2026"],
            "STATUS": ["ATIVO"],
            "ARQUIVO_DE_ORIGEM": ["ENVIO ALTERNATIVO.xlsx"],
        })

        result = reconcile_boletos_faltantes(pag, rec, base, fat)

        self.assertEqual(result.metrics["errosInternos"], 1)
        self.assertEqual(result.sheets["ERRO INTERNO"]["UC Faturamento"].to_list(), ["100"])

    def test_faturamento_cancelado_nao_vira_erro_interno(self):
        base = pl.DataFrame({"Codigo": ["10"], "Nome": ["Cliente A"], "Instalacao": ["100"]})
        pag = pl.DataFrame({"Instalacao": ["100"], "Mes": ["01/2026"]})
        rec = pl.DataFrame({"Instalacao": ["100"], "Data Referencia": ["02/2026"]})
        fat = pl.DataFrame({
            "UNIDADE CONSUMIDORA (UC)": ["100"],
            "MES DE REFERENCIA": ["01/2026"],
            "STATUS": ["AGUARDANDO CANCELADO"],
            "CODIGO DE BARRAS": ["111"],
            "ARQUIVO_DE_ORIGEM": ["ENVIO CANCELADO.xlsx"],
        })

        result = reconcile_boletos_faltantes(pag, rec, base, fat)

        self.assertEqual(result.metrics["errosInternos"], 0)
        self.assertEqual(result.metrics["fatNaoElegiveis"], 1)

    def test_sem_consumo_e_calculada_nao_geram_faltas_ou_erro_interno(self):
        base = pl.DataFrame({"Codigo": ["10"], "Nome": ["Cliente A"], "Instalacao": ["100"]})
        pag = pl.DataFrame({
            "Instalacao": ["100", "100", "100", "100"],
            "Mes": ["12/2025", "01/2026", "02/2026", "03/2026"],
            "Status": ["EMITIDA", "ATIVA", "ATIVA", "EMITIDA"],
            "Legenda": ["", "SEM CONSUMO", "Calculada", ""],
        })
        rec = pl.DataFrame({
            "Instalacao": ["100", "100"],
            "Data Referencia": ["12/2025", "03/2026"],
        })
        fat = pl.DataFrame({
            "UNIDADE CONSUMIDORA (UC)": ["100", "100"],
            "MES DE REFERENCIA": ["01/2026", "02/2026"],
            "STATUS": ["EMITIDA", "EMITIDA"],
            "CODIGO DE BARRAS": ["111", "222"],
            "ARQUIVO_DE_ORIGEM": ["ENVIO JAN.xlsx", "ENVIO FEV.xlsx"],
        })

        result = reconcile_boletos_faltantes(pag, rec, base, fat)

        self.assertEqual(result.metrics["clientesComPendencia"], 0)
        self.assertEqual(result.metrics["mesesFaltamRecebiveis"], 0)
        self.assertEqual(result.metrics["mesesFaltamAmbos"], 0)
        self.assertEqual(result.metrics["errosInternos"], 0)
        self.assertEqual(result.metrics["pagIgnoradasFaltantes"], 2)
        self.assertEqual(result.metrics["competenciasPagIgnoradas"], 2)

    def test_status_ignorado_tambem_nao_gera_falta_na_pagadoria(self):
        base = pl.DataFrame({"Codigo": ["10"], "Nome": ["Cliente A"], "Instalacao": ["100"]})
        pag = pl.DataFrame({
            "Instalacao": ["100", "100", "100", "100"],
            "Mes": ["12/2025", "01/2026", "02/2026", "03/2026"],
            "Status": ["EMITIDA", "SEM CONSUMO", "CALCULADA", "EMITIDA"],
        })
        rec = pl.DataFrame({
            "Instalacao": ["100", "100", "100", "100"],
            "Data Referencia": ["12/2025", "01/2026", "02/2026", "03/2026"],
        })

        result = reconcile_boletos_faltantes(pag, rec, base)

        self.assertEqual(result.metrics["clientesComPendencia"], 0)
        self.assertEqual(result.metrics["mesesFaltamPagadoria"], 0)
        ignored_rows = result.sheets["RESPONSABILIDADE"].filter(
            pl.col("Flag responsabilidade") == "IGNORADO PELA REGRA"
        )
        self.assertEqual(ignored_rows["Existe nos Recebiveis"].to_list(), ["SIM", "SIM"])

    def test_linha_valida_prevalece_sobre_calculada_na_mesma_competencia(self):
        base = pl.DataFrame({"Codigo": ["10"], "Nome": ["Cliente A"], "Instalacao": ["100"]})
        pag = pl.DataFrame({
            "Instalacao": ["100", "100", "100"],
            "Mes": ["01/2026", "01/2026", "02/2026"],
            "Status": ["CALCULADA", "EMITIDA", "EMITIDA"],
        })
        rec = pl.DataFrame({"Instalacao": ["100"], "Data Referencia": ["02/2026"]})

        result = reconcile_boletos_faltantes(pag, rec, base)

        self.assertEqual(result.metrics["mesesFaltamRecebiveis"], 1)
        self.assertEqual(result.sheets["FALTA RECEBIVEIS"]["Falta nos Recebiveis"].to_list(), ["01/2026"])
        self.assertEqual(result.metrics["competenciasPagIgnoradas"], 0)

    def test_competencia_ignorada_fica_visivel_na_auditoria(self):
        base = pl.DataFrame({"Codigo": ["10"], "Nome": ["Cliente A"], "Instalacao": ["100"]})
        pag = pl.DataFrame({
            "Instalacao": ["100", "100", "100"],
            "Mes": ["12/2025", "01/2026", "02/2026"],
            "Status": ["EMITIDA", "SEM CONSUMO", "EMITIDA"],
        })
        rec = pl.DataFrame({"Instalacao": ["100"], "Data Referencia": ["12/2025"]})

        result = reconcile_boletos_faltantes(pag, rec, base)
        row = result.sheets["FALTA RECEBIVEIS"].row(0, named=True)

        self.assertEqual(row["Falta nos Recebiveis"], "02/2026")
        self.assertEqual(row["Meses Pagadoria ignorados"], "01/2026")
        self.assertEqual(row["Qtd. Pagadoria ignorados"], 1)

    def test_rastreia_origem_e_classifica_responsabilidade_por_competencia(self):
        base = pl.DataFrame({
            "Codigo": ["10"],
            "Nome": ["Cliente A"],
            "Instalacao": ["100"],
            "Regiao": ["INTERNA"],
        })
        pag = pl.DataFrame({
            "Instalacao": ["100"] * 5,
            "Mes": ["01/2026", "02/2026", "03/2026", "06/2026", "07/2026"],
            "Status": ["EMITIDA"] * 5,
            "Valor": ["100,00", "200,00", "300,00", "600,00", "700,00"],
        })
        rec = pl.DataFrame({
            "Instalacao": ["100"] * 3,
            "Data Referencia": ["01/2026", "04/2026", "06/2026"],
            "Status": ["OPEN"] * 3,
            "Valor A Pagar": ["110,00", "400,00", "610,00"],
        })
        fat = pl.DataFrame({
            "UNIDADE CONSUMIDORA (UC)": ["100"] * 5,
            "MES DE REFERENCIA": ["01/2026", "02/2026", "04/2026", "05/2026", "07/2026"],
            "STATUS": ["EMITIDA", "EMITIDA", "EMITIDA", "EMITIDA", "CANCELADA"],
            "VALOR DA FATURA (R$)": ["120,00", "220,00", "420,00", "500,00", "720,00"],
            "CODIGO DE BARRAS": ["111", "222", "444", "555", "777"],
            "ARQUIVO_DE_ORIGEM": ["LOTE A.xlsx", "LOTE B.xlsx", "LOTE D.xlsx", "LOTE E.xlsx", "LOTE G.xlsx"],
        })

        result = reconcile_boletos_faltantes(pag, rec, base, fat)
        detail = result.sheets["RESPONSABILIDADE"]
        responsibility = dict(zip(detail["Mes de referencia"], detail["Flag responsabilidade"]))
        origin = dict(zip(detail["Mes de referencia"], detail["Flag origem entrada"]))
        values = dict(zip(detail["Mes de referencia"], detail["Valor"]))

        self.assertEqual(responsibility["01/2026"], "OK")
        self.assertEqual(responsibility["02/2026"], "ERRO INTERNO")
        self.assertEqual(responsibility["03/2026"], "ERRO FORNECEDORA")
        self.assertEqual(responsibility["04/2026"], "ERRO FORNECEDORA")
        self.assertEqual(responsibility["05/2026"], "ERRO INTERNO + FORNECEDORA")
        self.assertEqual(responsibility["06/2026"], "OK")
        self.assertEqual(responsibility["07/2026"], "REVISAR - FATURAMENTO NAO ELEGIVEL")
        self.assertEqual(origin["02/2026"], "ORIGEM IDENTIFICADA")
        self.assertEqual(origin["03/2026"], "NAO LOCALIZADA")
        self.assertEqual(origin["07/2026"], "ORIGEM IDENTIFICADA - NAO ELEGIVEL")
        self.assertEqual(values["01/2026"], "100,00")
        self.assertEqual(values["04/2026"], "400,00")
        self.assertEqual(values["05/2026"], "500,00")
        self.assertEqual(set(detail["Região"].to_list()), {"INTERNA"})

        self.assertEqual(result.sheets["ERRO FORNECEDORA"]["Mes de referencia"].to_list(), ["03/2026", "04/2026", "05/2026"])
        self.assertEqual(set(result.sheets["ERRO FORNECEDORA"]["Região"].to_list()), {"INTERNA"})
        self.assertEqual(result.sheets["ERRO INTERNO"]["Valor"].to_list(), ["200,00", "500,00"])
        self.assertEqual(result.metrics["boletosAuditados"], 7)
        self.assertEqual(result.metrics["errosInternos"], 2)
        self.assertEqual(result.metrics["errosInternosPuros"], 1)
        self.assertEqual(result.metrics["errosFornecedora"], 3)
        self.assertEqual(result.metrics["errosMistos"], 1)
        self.assertEqual(result.metrics["revisaoResponsabilidade"], 1)

    def test_todas_as_abas_de_falta_recebem_origem_e_flag(self):
        base = pl.DataFrame({"Codigo": ["10"], "Nome": ["Cliente A"], "Instalacao": ["100"]})
        pag = pl.DataFrame({
            "Instalacao": ["100", "100", "100"],
            "Mes": ["01/2026", "02/2026", "03/2026"],
        })
        rec = pl.DataFrame({
            "Instalacao": ["100", "100"],
            "Data Referencia": ["01/2026", "04/2026"],
        })
        fat = pl.DataFrame({
            "UNIDADE CONSUMIDORA (UC)": ["100", "999"],
            "MES DE REFERENCIA": ["02/2026", "04/2026"],
            "STATUS": ["EMITIDA", "EMITIDA"],
            "ARQUIVO_DE_ORIGEM": ["ENVIO 90.xlsx", "COBERTURA ABRIL.xlsx"],
        })

        result = reconcile_boletos_faltantes(pag, rec, base, fat)
        falta_rec = result.sheets["FALTA RECEBIVEIS"].row(0, named=True)
        falta_pag = result.sheets["FALTA PAGADORIA"].row(0, named=True)

        self.assertEqual(falta_rec["Existe no Faturamento"], "PARCIAL")
        self.assertEqual(falta_rec["Meses no Faturamento"], "02/2026")
        self.assertEqual(falta_rec["Meses sem Faturamento"], "03/2026")
        self.assertEqual(falta_rec["Arquivo de origem"], "ENVIO 90.xlsx")
        self.assertEqual(falta_rec["Flag responsabilidade"], "MISTA")
        self.assertIn("02/2026: ERRO INTERNO", falta_rec["Responsabilidade por competencia"])
        self.assertIn("03/2026: ERRO FORNECEDORA", falta_rec["Responsabilidade por competencia"])
        self.assertEqual(falta_pag["Existe no Faturamento"], "NAO")
        self.assertEqual(falta_pag["Flag responsabilidade"], "ERRO FORNECEDORA")

    def test_periodo_fora_da_cobertura_nao_vira_erro_da_fornecedora(self):
        base = pl.DataFrame({"Codigo": ["10"], "Nome": ["Cliente A"], "Instalacao": ["100"]})
        pag = pl.DataFrame({
            "Instalacao": ["100", "100"],
            "Mes": ["12/2025", "03/2026"],
        })
        rec = pl.DataFrame({"Instalacao": ["100"], "Data Referencia": ["03/2026"]})
        fat = pl.DataFrame({
            "UNIDADE CONSUMIDORA (UC)": ["100"],
            "MES DE REFERENCIA": ["03/2026"],
            "STATUS": ["EMITIDA"],
            "ARQUIVO_DE_ORIGEM": ["LOTE MAR.xlsx"],
        })

        result = reconcile_boletos_faltantes(pag, rec, base, fat)
        detail = result.sheets["RESPONSABILIDADE"]
        december = detail.filter(pl.col("Mes de referencia") == "12/2025").row(0, named=True)

        self.assertEqual(december["Na cobertura do Faturamento"], "NAO")
        self.assertEqual(december["Flag origem entrada"], "FORA DA COBERTURA DO FATURAMENTO")
        self.assertEqual(december["Flag responsabilidade"], "REVISAR - FORA DA COBERTURA")
        self.assertEqual(result.metrics["errosFornecedora"], 0)
        self.assertEqual(result.metrics["coberturaFaturamentoInicio"], "03/2026")
        self.assertEqual(result.metrics["coberturaFaturamentoFim"], "03/2026")


if __name__ == "__main__":
    unittest.main()
