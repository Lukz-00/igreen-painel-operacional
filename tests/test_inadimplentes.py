import unittest
from datetime import date

import polars as pl

from server.inadimplentes import reconcile_inadimplentes


class InadimplentesTests(unittest.TestCase):
    def test_cliente_com_duas_competencias_vencidas_eh_inadimplente(self):
        cli = pl.DataFrame({"Codigo": ["1"], "Nome": ["Ana"], "Instalacao": ["100"], "celular": ["11999999999"]})
        pag = pl.DataFrame({
            "Instalacao": ["100"] * 4,
            "Mes": ["01/2026", "02/2026", "03/2026", "04/2026"],
            "Status": ["PAGO", "PAGO", "PAGO", "PAGO"],
        })
        rec = pl.DataFrame({
            "Instalacao": ["100"] * 4,
            "Data Referencia": ["2026-01", "2026-02", "2026-03", "2026-04"],
            "Status": ["VENCIDO", "PAGO", "VENCIDO", "PAGO"],
        })

        result = reconcile_inadimplentes(pag, rec, cli, today=date(2026, 7, 8))

        self.assertEqual(result.metrics["inadimplentes"], 1)
        self.assertEqual(result.metrics["atrasoFaturamento"], 0)
        self.assertEqual(result.sheets["INADIMPLENTES"]["Boletos vencidos"].to_list(), [2])
        self.assertEqual(result.sheets["INADIMPLENTES"]["Numero telefone"].to_list(), ["11999999999"])

    def test_mes_faltando_em_um_lado_vira_atraso_faturamento(self):
        cli = pl.DataFrame({"Codigo": ["1"], "Nome": ["Ana"], "Instalacao": ["100"], "celular": ["11999999999"]})
        pag = pl.DataFrame({
            "Instalacao": ["100"] * 4,
            "Mes": ["01/2026", "02/2026", "03/2026", "04/2026"],
            "Status": ["PAGO", "PAGO", "PAGO", "PAGO"],
        })
        rec = pl.DataFrame({
            "Instalacao": ["100"] * 3,
            "Data Referencia": ["2026-01", "2026-02", "2026-03"],
            "Status": ["VENCIDO", "PAGO", "VENCIDO"],
        })

        result = reconcile_inadimplentes(pag, rec, cli, today=date(2026, 7, 8))

        self.assertEqual(result.metrics["inadimplentes"], 0)
        self.assertEqual(result.metrics["atrasoFaturamento"], 1)
        atraso = result.sheets["ATRASO FATURAMENTO"].to_dicts()[0]
        self.assertEqual(atraso["Falta nos Recebiveis"], "04/2026")
        self.assertEqual(atraso["Numero telefone"], "11999999999")

    def test_falta_no_recebivel_presente_na_inclusao_vira_erro_interno(self):
        cli = pl.DataFrame({"Codigo": ["1"], "Nome": ["Ana"], "Instalacao": ["100"], "celular": ["11999999999"]})
        pag = pl.DataFrame({
            "Instalacao": ["100"] * 4,
            "Mes": ["01/2026", "02/2026", "03/2026", "04/2026"],
            "Status": ["PAGO", "PAGO", "PAGO", "PAGO"],
        })
        rec = pl.DataFrame({
            "Instalacao": ["100"] * 3,
            "Data Referencia": ["2026-01", "2026-02", "2026-03"],
            "Status": ["PAGO", "PAGO", "PAGO"],
        })
        inc = pl.DataFrame({
            "UNIDADE CONSUMIDORA (UC)": ["100"],
            "MES DE REFERENCIA": ["04/2026"],
            "STATUS": ["ATIVO"],
            "ARQUIVO_DE_ORIGEM": ["ENVIO_ABRIL.xlsx"],
            "CODIGO DE BARRAS": ["123456"],
        })

        result = reconcile_inadimplentes(pag, rec, cli, inc, today=date(2026, 7, 8))

        self.assertEqual(result.metrics["atrasoFaturamento"], 0)
        self.assertEqual(result.metrics["erroInterno"], 1)
        erro = result.sheets["ERRO INTERNO"].to_dicts()[0]
        self.assertEqual(erro["Meses Erro Interno"], "04/2026")
        self.assertEqual(erro["Arquivo origem"], "04/2026: ENVIO_ABRIL.xlsx")

    def test_mes_atual_e_esperado_quando_ultimos_tres_meses_existiram(self):
        cli = pl.DataFrame({"Codigo": ["1"], "Nome": ["Ana"], "Instalacao": ["100"]})
        pag = pl.DataFrame({
            "Instalacao": ["100"] * 3,
            "Mes": ["04/2026", "05/2026", "06/2026"],
            "Status": ["PAGO", "PAGO", "PAGO"],
        })
        rec = pl.DataFrame({
            "Instalacao": ["100"] * 3,
            "Data Referencia": ["2026-04", "2026-05", "2026-06"],
            "Status": ["PAGO", "PAGO", "PAGO"],
        })

        result = reconcile_inadimplentes(pag, rec, cli, today=date(2026, 7, 8))

        self.assertEqual(result.metrics["atrasoFaturamento"], 1)
        atraso = result.sheets["ATRASO FATURAMENTO"].to_dicts()[0]
        self.assertEqual(atraso["Falta nos dois lados"], "07/2026")
        self.assertIn("Mes atual esperado", atraso["Motivo"])

    def test_calculada_na_pagadoria_e_pago_no_recebivel_nao_e_inadimplente(self):
        cli = pl.DataFrame({"Codigo": ["1"], "Nome": ["Ana"], "Instalacao": ["100"]})
        pag = pl.DataFrame({
            "Instalacao": ["100", "100"],
            "Mes": ["03/2025", "04/2025"],
            "Status": ["CALCULADA", "CALCULADA"],
            "Vencimento": ["10/04/2025", "10/05/2025"],
        })
        rec = pl.DataFrame({
            "Instalacao": ["100", "100"],
            "Data Referencia": ["2025-03", "2025-04"],
            "Status": ["PAGO", "PAGO"],
            "Data Vencimento": ["2025-04-10", "2025-05-10"],
        })

        result = reconcile_inadimplentes(pag, rec, cli, today=date(2026, 7, 8))

        self.assertEqual(result.metrics["inadimplentes"], 0)
        self.assertEqual(result.metrics["clientesCompletosOk"], 1)

    def test_lab_aponta_boleto_incluido_com_atraso_no_backoffice(self):
        cli = pl.DataFrame({"Codigo": ["1"], "Nome": ["Ana"], "Instalacao": ["100"]})
        pag = pl.DataFrame({
            "Instalacao": ["100"],
            "Mes": ["04/2026"],
            "Status": ["PAGO"],
            "Emissao da fatura": ["10/06/2026"],
        })
        rec = pl.DataFrame({
            "Instalacao": ["100"],
            "Data Referencia": ["2026-04"],
            "Status": ["PAGO"],
        })
        lab = pl.DataFrame({
            "ID RCB": ["1369816"],
            "Instalacao": ["100"],
            "Mes Referencia": ["2026-04-01"],
            "Data Inclusao Backoffice": ["2026-07-03"],
            "Status": ["PAGO"],
            "Valor a Pagar": ["100.00"],
        })

        result = reconcile_inadimplentes(pag, rec, cli, None, lab, today=date(2026, 7, 8))

        self.assertEqual(result.metrics["atrasoBackoffice"], 1)
        atraso = result.sheets["ATRASO BACKOFFICE"].to_dicts()[0]
        self.assertEqual(atraso["Mes referencia"], "04/2026")
        self.assertEqual(atraso["Mes esperado emissao/inclusao"], "05/2026")
        self.assertEqual(atraso["Atraso emissao (meses)"], 1)
        self.assertEqual(atraso["Atraso inclusao (meses)"], 2)
        self.assertEqual(atraso["Fonte emissao"], "Pagadoria")

    def test_lab_dentro_do_mes_esperado_nao_vira_atraso_backoffice(self):
        cli = pl.DataFrame({"Codigo": ["1"], "Nome": ["Ana"], "Instalacao": ["100"]})
        pag = pl.DataFrame({
            "Instalacao": ["100"],
            "Mes": ["04/2026"],
            "Status": ["PAGO"],
            "Emissao da fatura": ["10/05/2026"],
        })
        rec = pl.DataFrame({
            "Instalacao": ["100"],
            "Data Referencia": ["2026-04"],
            "Status": ["PAGO"],
        })
        lab = pl.DataFrame({
            "ID RCB": ["1369816"],
            "Instalacao": ["100"],
            "Mes Referencia": ["2026-04-01"],
            "Data Inclusao Backoffice": ["2026-05-28"],
            "Status": ["PAGO"],
        })

        result = reconcile_inadimplentes(pag, rec, cli, None, lab, today=date(2026, 7, 8))

        self.assertEqual(result.metrics["atrasoBackoffice"], 0)
        self.assertTrue(result.sheets["ATRASO BACKOFFICE"].is_empty())

    def test_bases_cmu_entram_no_mesmo_cruzamento(self):
        cli = pl.DataFrame({"Codigo": ["1"], "Nome": ["Cliente GV"], "Instalacao": ["999"]})
        cli_cmu = pl.DataFrame({
            "Instalação (Identificador)": ["211429"],
            "Apelido": ["Cliente CMU"],
            "CPF/CNPJ": ["12345678900"],
            "Nº do cliente": ["5823994"],
            "Nº da instalação": ["7007653780"],
            "Organização": ["GV-CMU"],
            "Situação": ["Ativa"],
        })
        pag = pl.DataFrame({"Instalacao": ["999"], "Mes": ["04/2026"], "Status": ["PAGO"]})
        pag_cmu = pl.DataFrame({
            "Instalação (Identificador)": ["211429", "211429"],
            "Mês de referência": ["04/2026", "05/2026"],
            "Situação do recebimento": ["PAGO", "PAGO"],
        })
        rec = pl.DataFrame({
            "Instalacao": ["7007653780", "7007653780"],
            "Data Referencia": ["2026-04", "2026-05"],
            "Status": ["VENCIDO", "VENCIDO"],
        })

        result = reconcile_inadimplentes(pag, rec, cli, None, None, pag_cmu, cli_cmu, today=date(2026, 7, 8))

        self.assertEqual(result.metrics["totalPagCmu"], 2)
        self.assertEqual(result.metrics["totalClientesBaseCmu"], 1)
        self.assertEqual(result.metrics["inadimplentes"], 1)
        row = result.sheets["INADIMPLENTES"].to_dicts()[0]
        self.assertEqual(row["Cliente"], "Cliente CMU")
        self.assertEqual(row["Origem base cliente"], "cli_cmu")
        self.assertEqual(row["Origem GV"], "CMU")


    def test_pagadoria_cmu_entra_sem_base_clientes_cmu(self):
        cli = pl.DataFrame({
            "Codigo": ["1", "2"],
            "Nome": ["Cliente GV", "Cliente CMU"],
            "Instalacao": ["999", "7007653780"],
            "CPF": ["", "12345678900"],
        })
        pag = pl.DataFrame({"Instalacao": ["999"], "Mes": ["04/2026"], "Status": ["PAGO"]})
        pag_cmu = pl.DataFrame({
            "Instalacao": ["211429", "211429"],
            "Mes": ["04/2026", "05/2026"],
            "Status": ["PAGO", "PAGO"],
            "CPF/CNPJ": ["12345678900", "12345678900"],
        })
        rec = pl.DataFrame({
            "Instalacao": ["7007653780", "7007653780"],
            "Data Referencia": ["2026-04", "2026-05"],
            "Status": ["VENCIDO", "VENCIDO"],
        })

        result = reconcile_inadimplentes(pag, rec, cli, None, None, pag_cmu, today=date(2026, 7, 8))

        self.assertEqual(result.metrics["totalPagCmu"], 2)
        self.assertEqual(result.metrics["totalClientesBaseCmu"], 0)
        self.assertEqual(result.metrics["inadimplentes"], 1)
        row = result.sheets["INADIMPLENTES"].to_dicts()[0]
        self.assertEqual(row["Cliente"], "Cliente CMU")
        self.assertEqual(row["Origem base cliente"], "cli")
        self.assertEqual(row["Origem GV"], "CMU")

    def test_pagadoria_northen_entra_no_mesmo_cruzamento(self):
        cli = pl.DataFrame({"Codigo": ["1"], "Nome": ["Cliente Northen"], "Instalacao": ["100"]})
        pag = pl.DataFrame({"Instalacao": [], "Mes": [], "Status": []})
        pag_northen = pl.DataFrame({
            "UC": ["100", "100"],
            "Mes": ["04/2026", "05/2026"],
            "Status": ["RECEBIDO", "RECEBIDO"],
        })
        rec = pl.DataFrame({
            "Instalacao": ["100", "100"],
            "Data Referencia": ["2026-04", "2026-05"],
            "Status": ["VENCIDO", "VENCIDO"],
        })

        result = reconcile_inadimplentes(pag, rec, cli, df_pag_northen=pag_northen, today=date(2026, 7, 8))

        self.assertEqual(result.metrics["totalPagNorthen"], 2)
        self.assertEqual(result.metrics["inadimplentes"], 1)
        row = result.sheets["INADIMPLENTES"].to_dicts()[0]
        self.assertEqual(row["Cliente"], "Cliente Northen")
        self.assertEqual(row["Origem GV"], "Northen")


if __name__ == "__main__":
    unittest.main()
