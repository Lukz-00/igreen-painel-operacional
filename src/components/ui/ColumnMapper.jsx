import { useState, useEffect, useRef } from 'react'
import { X, Check, AlertTriangle, Eye, ArrowLeftRight } from 'lucide-react'

// Schemas de campos por contexto
const SCHEMAS = {
  fat_pag: [
    { key:'instalacao',  label:'Instalação / UC',         required:true,  aliases:['Instalação (Identificador)','Instalação','Instalacao','instalacao','UC','numinstalacao','num_instalacao'] },
    { key:'status',      label:'Status da Fatura',         required:true,  aliases:['Situação do recebimento','Status fatura','StatusFatura','Status','statuspagamentofornecedora'] },
    { key:'mes',         label:'Mês de Referência',        required:true,  aliases:['Mês de referência','Mês','Mes referência','mes_referencia','Data Referencia','mesreferencia'] },
    { key:'valor',       label:'Valor da Fatura',          required:false, aliases:['Valor total (R$)','Valor da Fatura','Valor fatura','Valor','valorapagar'] },
    { key:'valor_pago',  label:'Valor Pago',               required:false, aliases:['Valor pago pelo cliente (R$)','Valor Pago','valor_pago'] },
    { key:'vencimento',  label:'Vencimento',               required:false, aliases:['Vencimento Fatura Norten','Data de vencimento','Vencimento fatura','dtvencimento'] },
    { key:'pagto',       label:'Data de Pagamento',        required:false, aliases:['Data de recebimento','Data de pagamento','Data Pagamento','dtpagamento','Pagto fatura'] },
    { key:'codbar',      label:'Código de Barras',         required:false, aliases:['Código de barras','Codigo de barras','CodigoBarras','codigobarra','Codigo Barra Boleto'] },
    { key:'link',        label:'Link do Boleto',           required:false, aliases:['Link de pagamento','Arquivo do recebimento','Url Boleto','url_boleto','Link Boleto'] },
    { key:'id_rec',      label:'ID Recebimento',           required:false, aliases:['Recebimento (Identificador)','ID Recebimento','id_recebimento'] },
    { key:'cpf',         label:'CPF / CNPJ',               required:false, aliases:['CPF/CNPJ','CPF','cpf','documento'] },
    { key:'cliente',     label:'Cliente / Nome',           required:false, aliases:['Favorecido','Consorciado','Nome','nome_cliente','Cliente'] },
  ],
  qualidade_pag: [
    { key:'instalacao',       label:'Instalação / UC',          required:true,  aliases:['Número da Instalação','Nº da Instalação','Numero da Instalacao','Instalação','Instalacao','UC','uc','numinstalacao','num_instalacao'] },
    { key:'mes',              label:'Mês de Referência',        required:true,  aliases:['Mês de Referência','Mes de Referencia','Mês de referência','Mês','Mes','Data Referencia','mes_referencia','mesreferencia'] },
    { key:'compensado',       label:'Energia Compensada (kWh)', required:true,  aliases:['Energia Compensada (kWh)','Energia Compensada','energia_compensada','Compensado','Compensado (kWh)'] },
    { key:'saldo_acumulado',  label:'Saldo Acumulado (kWh)',    required:false, aliases:['Saldo acumulado (kWh)','Saldo Acumulado (kWh)','saldo_acumulado','Saldo Acumulado'] },
    { key:'cliente',          label:'Cliente / Nome',           required:false, aliases:['Cliente','Favorecido','Consorciado','Nome','nome_cliente'] },
    { key:'distribuidora',    label:'Distribuidora',            required:false, aliases:['Distribuidora','Concessionaria','Concessionária','Fornecedor','Fornecedora'] },
    { key:'media_consumo',    label:'Média Consumo',            required:false, aliases:['Media Consumo','Média Consumo','media_consumo','Consumo Total','Consumo'] },
    { key:'data_injecao',     label:'Data Injeção',             required:false, aliases:['Data Injecao','Data Injeção','data_injecao','Data de Injeção'] },
    { key:'classificacao',    label:'Classificação',            required:false, aliases:['Classificacao','Classificação','classificacao'] },
    { key:'rateio',           label:'Rateio',                   required:false, aliases:['Rateio','rateio'] },
    { key:'validado_sucesso', label:'Validado Sucesso',         required:false, aliases:['Validado Sucesso','ValidadoSucesso','validado_sucesso'] },
    { key:'status',           label:'Status',                   required:false, aliases:['Status','status','Status fatura','Situação'] },
  ],
  qualidade_cli: [
    { key:'numero_cliente',   label:'Número Cliente / Código', required:false, aliases:['Numero Cliente','Número Cliente','numero_cliente','Código','Codigo','codigo','cod_cliente','UC'] },
    { key:'instalacao',       label:'Instalação / UC',         required:false, aliases:['Instalação','Instalacao','instalacao','UC','num_instalacao'] },
    { key:'nova_instalacao',  label:'Nova Instalação',         required:false, aliases:['Nova Instalacao','Nova Instalação','nova_instalacao'] },
    { key:'nome',             label:'Nome do Cliente',         required:false, aliases:['Nome','Cliente','Nome Cliente','nome_cliente'] },
    { key:'media_consumo',    label:'Média Consumo',           required:false, aliases:['Media Consumo','Média Consumo','media_consumo','Consumo','Consumo Total'] },
    { key:'classificacao',    label:'Classificacao',            required:false, aliases:['Classificacao','classificacao','Tipo Ligacao','Fase'] },
    { key:'regiao',           label:'Região',                  required:false, aliases:['Regiao','Região','regiao','Distribuidora','Concessionaria'] },
    { key:'licenciado',       label:'Licenciado',              required:false, aliases:['Licenciado','Licenciado Consultor','Consultor'] },
  ],
  qualidade_rec: [
    { key:'numero_cliente',   label:'Numero Cliente',           required:false, aliases:['Numero Cliente','numero_cliente','N Cliente'] },
    { key:'instalacao',       label:'Instalacao / UC',          required:false, aliases:['Instalacao','instalacao','UC','num_instalacao'] },
    { key:'mes',              label:'Mes de Referencia',        required:true,  aliases:['Data Referencia','data referencia','mes_referencia','Mes'] },
    { key:'cliente',          label:'Cliente / Nome',           required:false, aliases:['Cliente','cliente','Nome','nome_cliente'] },
    { key:'cpf',              label:'CPF / CNPJ',               required:false, aliases:['CPF','cpf','CNPJ','cnpj','CPF/CNPJ'] },
    { key:'status',           label:'Status',                   required:false, aliases:['Status','status','Status fatura','Status Financeiro'] },
    { key:'valor',            label:'Valor a Pagar',            required:false, aliases:['Valor A Pagar','Valor a Pagar','valor a pagar','valorapagar','Valor'] },
    { key:'codigo_cliente',   label:'Codigo Cliente',           required:false, aliases:['Codigo Cliente','codigo cliente','cod_cliente'] },
    { key:'fornecedora',      label:'Fornecedora',              required:false, aliases:['Fornecedora','fornecedora','Organizacao'] },
    { key:'concessionaria',   label:'Concessionaria',           required:false, aliases:['Concessionaria','Distribuidora','distribuidora'] },
  ],
  boletos_pag: [
    { key:'instalacao',    label:'Instalacao / UC',       required:true,  aliases:['Instalacao','instalacao','Numero de instalacao','Numero instalacao','numinstalacao','num_instalacao','UC'] },
    { key:'mes',           label:'Mes de Referencia',     required:true,  aliases:['Mes referencia','Mes de referencia','Mes','Data Referencia','mes_referencia','mesreferencia','DATA DO DOCUMENTO'] },
    { key:'status',        label:'Status da Fatura',      required:false, aliases:['Status fatura','StatusFatura','Status','status','Situacao do recebimento'] },
    { key:'valor',         label:'Valor da Fatura',       required:false, aliases:['Valor fatura','Valor da Fatura','Valor total (R$)','Valor','valorapagar'] },
    { key:'vencimento',    label:'Vencimento',            required:false, aliases:['Vencimento fatura','Data Vencimento','Data de vencimento','dtvencimento'] },
    { key:'cliente',       label:'Cliente / Nome',        required:false, aliases:['Favorecido','Consorciado','Nome','Cliente','nome_cliente','Nome do Cliente'] },
    { key:'cpf',           label:'CPF / CNPJ',            required:false, aliases:['CPF/CNPJ','CPF','cpf','CNPJ','documento'] },
    { key:'distribuidora', label:'Distribuidora',         required:false, aliases:['Distribuidora','Concessionaria','Fornecedora'] },
  ],
  boletos_gv: [
    { key:'codigo',          label:'Codigo Cliente',       required:false, aliases:['codigo','Codigo','Codigo Cliente','codigo cliente','cod_cliente'] },
    { key:'nome',            label:'Nome do Cliente',      required:false, aliases:['nome','Nome','Cliente','cliente','Nome Cliente'] },
    { key:'instalacao',      label:'Instalacao / UC',      required:false, aliases:['instalacao','Instalacao','UC','num_instalacao'] },
    { key:'nova_instalacao', label:'Nova Instalacao',      required:false, aliases:['Nova instalacao','Nova Instalacao','nova_instalacao'] },
    { key:'numero_cliente',  label:'Numero Cliente',       required:false, aliases:['numero cliente','Numero Cliente','NumeroCliente','N Cliente','UC'] },
    { key:'cpf',             label:'CPF / CNPJ',           required:false, aliases:['cpf','CPF','CPF/CNPJ','cnpj','CNPJ'] },
    { key:'fornecedora',     label:'Fornecedora / Regiao', required:false, aliases:['fornecedora','Fornecedora','regiao','Regiao','regiao/fornecedora'] },
    { key:'status',          label:'Status',               required:false, aliases:['Status','status','Jornada Status','Status Financeiro'] },
  ],
  boletos_rec: [
    { key:'instalacao',     label:'Instalacao / UC',       required:false, aliases:['instalacao','Instalacao','UC','num_instalacao'] },
    { key:'numero_cliente', label:'Numero Cliente',        required:false, aliases:['numero cliente','Numero Cliente','NumeroCliente','N Cliente'] },
    { key:'codigo_cliente', label:'Codigo Cliente',        required:false, aliases:['codigo cliente','Codigo Cliente','cod_cliente','Codigo'] },
    { key:'mes',            label:'Data Referencia',       required:true,  aliases:['data referencia','Data Referencia','mes_referencia','Mes','Mes referencia'] },
    { key:'status',         label:'Status',                required:false, aliases:['status','Status','Status fatura','Status Financeiro Cliente'] },
    { key:'valor',          label:'Valor a Pagar',         required:false, aliases:['valor a pagar','Valor A Pagar','valorapagar','Valor'] },
    { key:'vencimento',     label:'Vencimento',            required:false, aliases:['data vencimento','Data Vencimento','dtvencimento','Vencimento fatura'] },
    { key:'cliente',        label:'Cliente / Nome',        required:false, aliases:['cliente','Cliente','nome_cliente','Nome'] },
    { key:'cpf',            label:'CPF / CNPJ',            required:false, aliases:['cpf','CPF','CPF/CNPJ','cnpj','CNPJ'] },
    { key:'fornecedora',    label:'Fornecedora',           required:false, aliases:['fornecedora','Fornecedora','cfornecedora'] },
    { key:'concessionaria', label:'Concessionaria',        required:false, aliases:['Concessionaria','concessionaria','Distribuidora'] },
  ],
  inad_pag: [
    { key:'instalacao',     label:'Instalacao / UC',       required:true,  aliases:['Instala','Instalacao','instalacao','Numero de instalacao','Numero da Instalacao','Numero da Instalação','numinstalacao','num_instalacao','UC'] },
    { key:'mes',            label:'Competencia / Mes',     required:true,  aliases:['Refer','Mes referencia','Mes de referencia','Mes','Mês','Data Referencia','Data Referência','mes_referencia','mesreferencia','DATA DO DOCUMENTO'] },
    { key:'status',         label:'Status da Fatura',      required:false, aliases:['Situa','Status fatura','StatusFatura','Status','status','Situacao do recebimento','Situação do recebimento','statuspagamentofornecedora'] },
    { key:'vencimento',     label:'Vencimento',            required:false, aliases:['Vencimento fatura','Vencimento Fatura Norten','Data Vencimento','Data de vencimento','dtvencimento','DATA DE VENCIMENTO'] },
    { key:'valor',          label:'Valor',                 required:false, aliases:['Valor fatura','Valor da Fatura','Valor total (R$)','Valor','valorapagar'] },
    { key:'codigo_cliente', label:'Codigo Cliente',        required:false, aliases:['Codigo Cliente','codigo cliente','cod_cliente','Codigo','Código'] },
    { key:'cpf',            label:'CPF / CNPJ',            required:false, aliases:['CPF/CNPJ','CPF','cpf','CNPJ','documento'] },
    { key:'cliente',        label:'Cliente / Nome',        required:false, aliases:['Favorecido','Consorciado','Nome','Cliente','nome_cliente','Nome do Cliente'] },
    { key:'fornecedora',    label:'Fornecedora',           required:false, aliases:['Fornecedora','fornecedora','Distribuidora','Concessionaria','Organizacao','Organização','Organiza'] },
  ],
  inad_rec: [
    { key:'instalacao',     label:'Instalacao / UC',       required:false, aliases:['instalacao','Instalacao','Instalação','UC','num_instalacao'] },
    { key:'numero_cliente', label:'Numero Cliente',        required:false, aliases:['numero cliente','Numero Cliente','Número Cliente','NumeroCliente','N Cliente'] },
    { key:'codigo_cliente', label:'Codigo Cliente',        required:false, aliases:['codigo cliente','Codigo Cliente','Código Cliente','cod_cliente','Codigo','Código'] },
    { key:'mes',            label:'Data Referencia',       required:true,  aliases:['data referencia','Data Referencia','Data Referência','mes_referencia','Mes','Mês','Mes referencia'] },
    { key:'status',         label:'Status',                required:false, aliases:['status','Status','Status fatura','Status Financeiro Cliente','StatusFinanceiroCliente'] },
    { key:'vencimento',     label:'Vencimento',            required:false, aliases:['data vencimento','Data Vencimento','DataVencimento','dtvencimento','Vencimento fatura','Data de vencimento'] },
    { key:'valor',          label:'Valor',                 required:false, aliases:['valor a pagar','Valor A Pagar','ValorAPagar','valorapagar','Valor'] },
    { key:'cliente',        label:'Cliente / Nome',        required:false, aliases:['cliente','Cliente','nome_cliente','Nome'] },
    { key:'cpf',            label:'CPF / CNPJ',            required:false, aliases:['cpf','CPF','CPF/CNPJ','cnpj','CNPJ'] },
    { key:'fornecedora',    label:'Fornecedora',           required:false, aliases:['fornecedora','Fornecedora','cfornecedora'] },
  ],
  inad_cli: [
    { key:'codigo',          label:'Codigo Cliente',       required:false, aliases:['codigo','Codigo','Código','Codigo Cliente','Código Cliente','codigo cliente','cod_cliente','ID'] },
    { key:'nome',            label:'Nome do Cliente',      required:false, aliases:['nome','Nome','Cliente','cliente','Nome Cliente','nome_cliente','Apelido','Razao social','Razão social','Raz'] },
    { key:'instalacao',      label:'Instalacao / UC',      required:false, aliases:['Instala','instalacao','Instalacao','Instalação','UC','num_instalacao'] },
    { key:'nova_instalacao', label:'Nova Instalacao',      required:false, aliases:['Nova instalacao','Nova Instalacao','Nova Instalação','nova_instalacao','Numero da instalacao','N da instalacao','da instalacao','pré-padronização','pre-padroniza'] },
    { key:'numero_cliente',  label:'Numero Cliente',       required:false, aliases:['numero cliente','Numero Cliente','Número Cliente','NumeroCliente','N Cliente','N do cliente','Nº do cliente','do cliente','UC'] },
    { key:'telefone',        label:'Telefone / Celular',   required:false, aliases:['telefone','Telefone','celular','Celular','Numero telefone','N telefone','Telefone 1','celular 1','celular 2','WhatsApp','Whatsapp'] },
    { key:'cpf',             label:'CPF / CNPJ',           required:false, aliases:['cpf','CPF','CPF/CNPJ','cnpj','CNPJ','documento'] },
    { key:'fornecedora',     label:'Fornecedora / Regiao', required:false, aliases:['fornecedora','Fornecedora','regiao','Regiao','Região','regiao/fornecedora','Organizacao','Organização','Organiza'] },
    { key:'status',          label:'Status Base',          required:false, aliases:['Status','status','Jornada Status','Status Financeiro','Situacao','Situação','Situa'] },
    { key:'data_cancelamento', label:'Data Cancelamento',  required:false, aliases:['Data Cancelamento','DataCancelamento','data_cancelamento','Dt Cancel'] },
  ],
  inad_inc: [
    { key:'instalacao',     label:'Instalacao / UC',       required:true,  aliases:['UNIDADE CONSUMIDORA (UC)','UNIDADE CONSUMIDORA','UC','UC.1','INSTALATIONNUMBER','Instalacao','instalacao','num_instalacao'] },
    { key:'mes',            label:'Competencia / Mes',     required:true,  aliases:['MES DE REFERENCIA','MÊS DE REFERÊNCIA','Mês de referência','Mes referencia','Mes de referencia','REFER','Mês Faturamento'] },
    { key:'status',         label:'Status',                required:false, aliases:['STATUS','Status','STATUS.1','SITUACAO DO DISPARO','SITUAÇÃO DO DISPARO'] },
    { key:'vencimento',     label:'Vencimento',            required:false, aliases:['DATA DE VENCIMENTO','Data Vencimento','Vencimento','VENCIMENTO FATURA NORTEN','VENCIMENTO CONCESSIONARIA'] },
    { key:'valor',          label:'Valor',                 required:false, aliases:['VALOR DA FATURA (R$)','VALOR DA FATURA','Valor da Fatura','VALOR LÍQUIDO (FATURAMENTO)','VALOR LIQUIDO','VALORPARCELA','TOTAL A PAGAR'] },
    { key:'codbar',         label:'Codigo de Barras',      required:false, aliases:['CÓDIGO DE BARRAS','CODIGO DE BARRAS','LINHA DIGITÁVEL','LINHA DIGITAVEL','PIX COPIA E COLA'] },
    { key:'arquivo_origem', label:'Arquivo de Origem',     required:false, aliases:['ARQUIVO_DE_ORIGEM','ARQUIVO DO BOLETO','ARQUIVO DO RECEBIMENTO'] },
    { key:'codigo_cliente', label:'Codigo Cliente',        required:false, aliases:['Codigo Cliente','Codigo','CÓDIGO PARCEIRO','CODIGO PARCEIRO','cod_cliente','IDENTIFICADOR'] },
    { key:'cpf',            label:'CPF / CNPJ',            required:false, aliases:['CPF/CNPJ','CPF','CNPJ','UC - CPF/CNPJ'] },
    { key:'cliente',        label:'Cliente / Nome',        required:false, aliases:['NOME DO CLIENTE','Cliente','Nome','UC - NOME'] },
    { key:'fornecedora',    label:'Fornecedora',           required:false, aliases:['DISTRIBUIDORA','Fornecedora','UC - CONCESSIONÁRIA','UC - CONCESSIONARIA'] },
  ],
  inad_lab: [
    { key:'idrcb',                 label:'ID RCB',                    required:false, aliases:['ID RCB','IDRCB','idrcb'] },
    { key:'codigo_cliente',        label:'ID/Codigo Cliente',         required:false, aliases:['ID Cliente','Codigo Cliente','Código Cliente','cod_cliente'] },
    { key:'instalacao',            label:'Instalacao / UC',           required:true,  aliases:['Instala','Nº Instalação','N Instala','Numero Instalacao','Instalacao','UC','num_instalacao'] },
    { key:'mes',                   label:'Mes Referencia',            required:true,  aliases:['Refer','Mês Referência','Mes Referencia','Mes Refer','Data Referencia'] },
    { key:'inclusao_backoffice',   label:'Data Inclusao Backoffice',  required:true,  aliases:['Data Inclusão Backoffice','Data Inclusao Backoffice','Data Inclus'] },
    { key:'emissao',               label:'Data de Emissao',           required:false, aliases:['Emiss','Data Emissão','Data de Emissão','Data Emissao','Data de Emissao'] },
    { key:'status',                label:'Status',                    required:false, aliases:['Status','Status Fornecedora'] },
    { key:'vencimento',            label:'Vencimento',                required:false, aliases:['Vencimento','Venc. Original','Data Vencimento'] },
    { key:'valor',                 label:'Valor',                     required:false, aliases:['Valor a Pagar','Valor','Valor Sem Desconto'] },
    { key:'codbar',                label:'Codigo de Barras',          required:false, aliases:['Código de Barras','Codigo de Barras','Linha Digitável','Linha Digitavel'] },
    { key:'cliente',               label:'Cliente',                   required:false, aliases:['Cliente','Nome'] },
    { key:'cpf',                   label:'CPF / CNPJ',                required:false, aliases:['CPF/CNPJ','CPF','CNPJ','cpf'] },
    { key:'fornecedora',           label:'Fornecedora',               required:false, aliases:['Fornecedora','Concessionária','Concessionaria'] },
  ],
  inad_gv_recebiveis: [
    { key:'idrcb',                 label:'ID RCB',                    required:false, aliases:['ID RCB','IDRCB','idrcb'] },
    { key:'codigo_cliente',        label:'ID/Codigo Cliente',         required:false, aliases:['idcliente','ID Cliente','Codigo Cliente','cod_cliente'] },
    { key:'instalacao',            label:'Instalacao / UC',           required:true,  aliases:['numinstalacao','N Instala','Numero Instalacao','Instalacao','UC','num_instalacao'] },
    { key:'mes',                   label:'Mes Referencia',            required:true,  aliases:['mesreferencia','Refer','Mes Referencia','Mes Refer','Data Referencia'] },
    { key:'inclusao_backoffice',   label:'Data Inclusao Backoffice',  required:false, aliases:['data_inclusao_backoffice','Data Inclusao Backoffice','Data Inclusao','Data Inclus'] },
    { key:'emissao',               label:'Data de Emissao',           required:false, aliases:['Data Emissao','Data de Emissao','Emissao','Emiss'] },
    { key:'status',                label:'Status',                    required:false, aliases:['status','status_financeiro','status_financeiro_cliente','Status','Status Fornecedora'] },
    { key:'vencimento',            label:'Vencimento',                required:false, aliases:['dtvencimento','Vencimento','Venc. Original','Data Vencimento'] },
    { key:'valor',                 label:'Valor',                     required:false, aliases:['valorapagar','Valor a Pagar','Valor','Valor Sem Desconto'] },
    { key:'codbar',                label:'Codigo de Barras',          required:false, aliases:['codigobarra','Codigo de Barras','Linha Digitavel','urlboleto'] },
    { key:'cliente',               label:'Cliente',                   required:false, aliases:['cliente','Cliente','Nome'] },
    { key:'cpf',                   label:'CPF / CNPJ',                required:false, aliases:['cpf','CPF/CNPJ','CPF','CNPJ'] },
    { key:'fornecedora',           label:'Fornecedora',               required:false, aliases:['fornecedora','Fornecedora','concessionaria','Concessionaria'] },
  ],
  atu_update: [
    { key:'codigo_cliente',  label:'Cod. Cliente',          required:true,  aliases:['Cod cliente','COD. Cliente','Codigo Cliente','Código Cliente','codigo cliente','cod_cliente'] },
    { key:'cliente',         label:'Nome do Cliente',       required:true,  aliases:['Cliente','NOME DO CLIENTE','Nome do Cliente','Nome'] },
    { key:'instalacao',      label:'Instalacao / UC',       required:true,  aliases:['Instalação','Instalacao','UNIDADE CONSUMIDORA (UC)','UC','instalacao'] },
    { key:'mes',             label:'Mes de Referencia',     required:true,  aliases:['Mês de referência','Mes de referencia','MÊS DE REFERÊNCIA','Mes referencia','Data Referencia'] },
    { key:'novo_vencimento', label:'Nova Data Vencimento',  required:true,  aliases:['Nova data pagamento','NOVA DATA DE VENCIMENTO','Nova data vencimento','Novo vencimento'] },
    { key:'valor',           label:'Valor da Fatura',       required:false, aliases:['Valor','VALOR DA FATURA (R$)','Valor da Fatura','Valor fatura','valor a pagar'] },
    { key:'codbar',          label:'Codigo de Barras',      required:false, aliases:['Código de barras','CÓDIGO DE BARRAS','Codigo de barras','codigo barra boleto','Linha Digitavel'] },
    { key:'idrcb',           label:'IDRCB',                 required:false, aliases:['IDRCB','Idrcb','idrcb','ID RCB'] },
    { key:'fornecedora',     label:'Distribuidora',         required:false, aliases:['Distribuidora e UF','DISTRIBUIDORA','Distribuidora','Concessionaria'] },
  ],
  atu_faturamento: [
    { key:'instalacao',            label:'Instalacao / UC',       required:true,  aliases:['UNIDADE CONSUMIDORA (UC)','UNIDADE CONSUMIDORA','UC','UC.1','INSTALATIONNUMBER','Instalacao'] },
    { key:'mes',                   label:'Mes de Referencia',     required:true,  aliases:['MÊS DE REFERÊNCIA','MES DE REFERENCIA','Mês de referência','Mes referencia','Mês Faturamento'] },
    { key:'cliente',               label:'Nome do Cliente',       required:false, aliases:['NOME DO CLIENTE','Cliente','Nome','UC - NOME'] },
    { key:'codigo_cliente',        label:'Codigo Cliente',        required:false, aliases:['CÓDIGO PARCEIRO','CODIGO PARCEIRO','Codigo Cliente','Cod cliente','IDENTIFICADOR'] },
    { key:'favorecido',            label:'Favorecido',            required:false, aliases:['FAVORECIDO','Favorecido'] },
    { key:'fornecedora',           label:'Distribuidora',         required:false, aliases:['DISTRIBUIDORA','Distribuidora','Concessionaria','UC - CONCESSIONÁRIA'] },
    { key:'consumo',               label:'Consumo kWh',           required:false, aliases:['CONSUMO (kWh)','Consumo','consumo'] },
    { key:'energia_compensada',    label:'Energia Compensada',    required:false, aliases:['ENERGIA COMPENSADA (kWh)','Energia Compensada','Energia compensada'] },
    { key:'tarifa_sem_desconto',   label:'Tarifa sem desconto',   required:false, aliases:['TARIFA SEM DESCONTO (DISTRIBUIDORA)','Tarifa sem desconto'] },
    { key:'tarifa_com_desconto',   label:'Tarifa GD',             required:false, aliases:['TARIFA COM DESCONTO (GD)','Tarifa GD','TARIFA GD'] },
    { key:'percentual_desconto',   label:'Percentual desconto',   required:false, aliases:['% DE DESCONTO','% - Desconto','Percentual desconto'] },
    { key:'valor_desconto',        label:'Valor desconto',        required:false, aliases:['VALOR DO DESCONTO (R$)','Desconto','Valor desconto'] },
    { key:'valor',                 label:'Valor da Fatura',       required:false, aliases:['VALOR DA FATURA (R$)','VALOR DA FATURA','Valor da Fatura','Valor fatura'] },
    { key:'repasse',               label:'Repasse',               required:false, aliases:['REPASSE DISTRIBUIDORA','Repasse Distribuidora','Repasse energisa'] },
    { key:'economia',              label:'Economia acumulada',    required:false, aliases:['ECONOMIA ACUMULADA','Economia Acumulada'] },
    { key:'bandeira',              label:'Bandeira tarifaria',    required:false, aliases:['BANDEIRA TARIFÁRIA','Bandeira Tarifária'] },
    { key:'emissao',               label:'Data de Emissao',       required:false, aliases:['DATA DE EMISSÃO','Data de emissão - Fatura GV','Data de emissão - Fatura Norten','Emissão da fatura'] },
    { key:'codbar',                label:'Codigo de Barras',      required:false, aliases:['CÓDIGO DE BARRAS','CODIGO DE BARRAS','código de barras','Código de barras'] },
    { key:'pix',                   label:'PIX Copia e Cola',      required:false, aliases:['PIX COPIA E COLA','pix copia e cola'] },
  ],
  atu_rec: [
    { key:'idrcb',          label:'IDRCB',             required:false, aliases:['idrcb','IDRCB','Idrcb','ID Rcb','Recebimento (Identificador)'] },
    { key:'codigo_cliente', label:'Codigo Cliente',    required:false, aliases:['codigo cliente','Codigo Cliente','Código Cliente','cod_cliente'] },
    { key:'instalacao',     label:'Instalacao / UC',   required:false, aliases:['instalação','Instalação','Instalacao','UC','num_instalacao'] },
    { key:'mes',            label:'Data Referencia',   required:true,  aliases:['data referencia','Data Referencia','Mês de referência','Mes referencia'] },
    { key:'cliente',        label:'Cliente',           required:false, aliases:['cliente','Cliente','NOME DO CLIENTE','Nome'] },
    { key:'fornecedora',    label:'Fornecedora',       required:false, aliases:['fornecedora','Concessionaria','concessionaria'] },
    { key:'valor',          label:'Valor',             required:false, aliases:['valor a pagar','Valor A Pagar','valorapagar','Valor'] },
    { key:'codbar',         label:'Codigo de Barras',  required:false, aliases:['codigo barra boleto','Codigo Barra Boleto','Código de barras','Linha Digitavel'] },
    { key:'vencimento',     label:'Vencimento',        required:false, aliases:['data vencimento','Data Vencimento','dtvencimento'] },
  ],
  atu_pag: [
    { key:'instalacao',          label:'Instalacao / UC',       required:true,  aliases:['Instalação','Instalacao','UC','UNIDADE CONSUMIDORA (UC)','num_instalacao'] },
    { key:'mes',                 label:'Mes de Referencia',     required:true,  aliases:['MÊS NORMALIZADO','Mes referência','Mes referencia','Mês','Mes','Data Referencia'] },
    { key:'cliente',             label:'Nome do Cliente',       required:false, aliases:['Consorciado','Cliente','NOME DO CLIENTE','Nome'] },
    { key:'favorecido',          label:'Favorecido',            required:false, aliases:['Favorecido','FAVORECIDO'] },
    { key:'fornecedora',         label:'Distribuidora',         required:false, aliases:['Distribuidora','DISTRIBUIDORA'] },
    { key:'energia_compensada',  label:'Energia Compensada',    required:false, aliases:['Energia Compensada','ENERGIA COMPENSADA (kWh)'] },
    { key:'valor',               label:'Valor da Fatura',       required:false, aliases:['Valor fatura','Valor da Fatura','VALOR DA FATURA (R$)'] },
    { key:'repasse',             label:'Repasse',               required:false, aliases:['Repasse Distribuidora','REPASSE DISTRIBUIDORA'] },
    { key:'emissao',             label:'Data de Emissao',       required:false, aliases:['Emissão da fatura','Data de emissão - Fatura Norten','DATA DE EMISSÃO'] },
    { key:'codbar',              label:'Codigo de Barras',      required:false, aliases:['Código de barras','CÓDIGO DE BARRAS','Codigo de barras'] },
    { key:'id_cobranca',         label:'ID Cobranca',           required:false, aliases:['ID Cobrança','ID Cobranca','ID cobrança'] },
    { key:'iugu',                label:'IUGU',                  required:false, aliases:['IUGU','iugu'] },
    { key:'vencimento',          label:'Vencimento',            required:false, aliases:['Vencimento fatura','Vencimento Fatura Norten','DATA DE VENCIMENTO'] },
  ],
  gv_bko: [
    { key:'codigo',        label:'Código do Cliente',    required:true,  aliases:['Código','Codigo','codigo','cod_cliente','Código do Cliente','UC'] },
    { key:'nome',          label:'Nome do Cliente',      required:false, aliases:['Nome do Cliente','Nome Cliente','NomeCliente','nome_cliente','Nome','Cliente'] },
    { key:'instalacao',    label:'Instalação / UC',      required:false, aliases:['Instalação','Instalacao','instalacao','UC','num_instalacao'] },
    { key:'cidade',        label:'Cidade',               required:false, aliases:['Cidade','cidade','Município','Municipio'] },
    { key:'consumo',       label:'Consumo',              required:false, aliases:['Consumo','consumo','Consumo (kWh)'] },
    { key:'status_bko',    label:'Status BKO',           required:true,  aliases:['Status BKO','StatusBKO','status_bko','Status'] },
    { key:'motivo_cancel', label:'Motivo Cancelamento',  required:false, aliases:['Motivo Cancelamento','Motivo do Cancelamento','motivo_cancelamento','Motivo'] },
    { key:'data_ativo',    label:'Data Ativo',           required:false, aliases:['Data Ativo','DataAtivo','data_ativo','Data de Ativação','Data Ativacao'] },
    { key:'cadastro',      label:'Cadastro',             required:false, aliases:['Cadastro','cadastro','Status Cadastro'] },
    { key:'envio',         label:'Envio',                required:false, aliases:['Envio','envio','Status Envio'] },
    { key:'status_fluxo',  label:'Status Fluxo',         required:false, aliases:['Status Fluxo','StatusFluxo','status_fluxo','Fluxo'] },
    { key:'ano_contrato',  label:'Ano do Contrato',      required:false, aliases:['Ano Contrato','AnoContrato','ano_contrato','Ano do Contrato','Ano'] },
    { key:'fornecedora',   label:'Fornecedora',          required:false, aliases:['Fornecedora','fornecedora','Distribuidora'] },
    { key:'regiao',        label:'Região',               required:false, aliases:['Região','Regiao','regiao','Região/Fornecedora'] },
  ],
  gv_retorno: [
    { key:'codigo',        label:'Código do Cliente',    required:true,  aliases:['Código','Codigo','codigo','cod_cliente'] },
    { key:'status_gv',     label:'Status GV',            required:true,  aliases:['Status GV','StatusGV','status_gv','Status'] },
    { key:'status_forn',   label:'Status Fornecedora',   required:false, aliases:['Status Fornecedora','StatusFornecedora','status_fornecedora','Status GV Fornecedora'] },
    { key:'obs_gv',        label:'Observação GV',        required:false, aliases:['Observação GV','Observacao GV','obs_gv','Observacao','Observação'] },
    { key:'status_rateio', label:'Status Rateio GV',     required:false, aliases:['Status Rateio GV','StatusRateioGV','status_rateio','Rateio GV','Rateio'] },
    { key:'devolutiva',    label:'Devolutiva',           required:false, aliases:['Devolutiva','devolutiva','Data Devolutiva'] },
    { key:'mes_injecao',   label:'Mês Injeção',          required:false, aliases:['Mês Injeção','Mes Injecao','mes_injecao','Mês de Injeção'] },
  ],
  gv_fin: [
    { key:'codigo',        label:'Código do Cliente',    required:true,  aliases:['Código','Codigo','codigo','cod_cliente','UC'] },
    { key:'nome',          label:'Nome',                 required:false, aliases:['Nome','nome','Cliente'] },
  ],
  conc_base: [
    { key:'codigo',            label:'Código / ID do Cliente', required:true,  aliases:['Código','Codigo','codigo','cod_cliente','ID','Número Cliente','NumeroCliente','numero_cliente','UC','Instalação','Instalacao','instalacao'] },
    { key:'data_ativo',        label:'Data Ativo',             required:true,  aliases:['Data Ativo','DataAtivo','data_ativo','Dt Ativo','dt_ativo','Data de Ativação','Data Ativacao','Data Ativação'] },
    { key:'data_cancelamento',  label:'Data Cancelamento',      required:false, aliases:['Data Cancelamento','DataCancelamento','data_cancelamento','Dt Cancelamento','Data de Cancelamento','Dt Cancel'] },
    { key:'devolutiva',         label:'Devolutiva Interna',     required:false, aliases:['Devolutiva','Devolutiva Interna','devolutiva','devolutiva_interna','Retorno','retorno'] },
    { key:'validado_sucesso',   label:'Validado Sucesso',       required:false, aliases:['Validado Sucesso','ValidadoSucesso','validado_sucesso','Validado com Sucesso','Val. Sucesso','Validacao Sucesso','Validação Sucesso'] },
    { key:'rateio',         label:'Rateio (BKO)',           required:false, aliases:['Rateio','rateio','Rateio GV','RateioGV','rateio_gv','AR','ar'] },
    { key:'jornada_status', label:'Jornada Status',          required:false, aliases:['Jornada Status','JornadaStatus','jornada_status','Jornada de Status','Status Jornada'] },
    { key:'jornada_etapa',  label:'Jornada Etapa',           required:false, aliases:['Jornada Etapa','JornadaEtapa','jornada_etapa','Etapa Jornada','Etapa da Jornada'] },
    { key:'status',            label:'Status / Jornada',       required:false, aliases:['Status','status','Situação','situacao','Status Cliente','Jornada','Etapa','Etapa Jornada'] },
    { key:'nome',              label:'Nome do Cliente',        required:false, aliases:['Nome','nome','Cliente','Nome Cliente','NomeCliente'] },
  ],
  conc_fin: [
    { key:'codigo', label:'Código / ID do Cliente', required:true, aliases:['Código','Codigo','codigo','cod_cliente','ID','UC','Instalação','Instalacao','instalacao','Número Cliente','NumeroCliente'] },
    { key:'nome',   label:'Nome do Cliente',        required:false, aliases:['Nome','nome','Cliente','Nome Cliente'] },
  ],
  conc_rec: [
    { key:'codigo', label:'Código / ID do Cliente', required:true, aliases:['Código','Codigo','codigo','cod_cliente','ID','UC','Instalação','Instalacao','instalacao','Número Cliente','NumeroCliente','numero_cliente'] },
    { key:'nome',   label:'Nome do Cliente',        required:false, aliases:['Nome','nome','Cliente','Nome Cliente'] },
    { key:'idrcb', label:'ID Recebível (IDRCB)', required:false, aliases:['Idrcb','idrcb','id_rcb','Recebimento (Identificador)','ID Recebimento','ID Rcb'] },
  ],
  gv_rec: [
    { key:'codigo',        label:'Código / Nº Cliente',  required:true,  aliases:['Código','Codigo','codigo','Numero Cliente','NumeroCliente','numero_cliente','cod_cliente'] },
    { key:'status',        label:'Status',               required:false, aliases:['Status Financeiro Cliente','Status','status'] },
    { key:'dias_atraso',   label:'Dias em Atraso',       required:false, aliases:['Dias Atraso','dias_atraso','Dias em Atraso','Atraso (dias)'] },
  ],
  status_forn: [
    { key:'codigo',        label:'Código / ID do Cliente', required:true,  aliases:['Código','Codigo','codigo','cod_cliente','ID','Número Cliente','NumeroCliente','numero_cliente','UC','Instalação','Instalacao','instalacao'] },
    { key:'obs',           label:'Observação GV',          required:true,  aliases:['Observação GV','Observacao GV','obs_gv','Obs GV','Observação','Observacao','obs','Obs','Motivo'] },
    { key:'status_rateio', label:'Status Rateio GV',       required:true,  aliases:['Status Rateio GV','StatusRateioGV','status_rateio','Rateio GV','Status Rateio','Rateio'] },
    { key:'status',        label:'Status GV',              required:false, aliases:['Status GV','StatusGV','status_gv','Status Fornecedora','Status','status'] },
  ],
  fat_rec: [
    { key:'instalacao',  label:'Instalação / UC',         required:true,  aliases:['Instalacao','Instalação','instalacao','UC','numinstalacao'] },
    // 'Status' (PAGO/VENCIDO/A RECEBER) deve vir ANTES de 'Status Financeiro Cliente'
    // para evitar que textos longos como "Boleto Pago" sejam enviados ao statusRec()
    { key:'status',      label:'Status',                   required:true,  aliases:['Status','status','statuspagamentofornecedora','Status fatura','Status Financeiro Cliente','StatusFinanceiroCliente'] },
    { key:'mes',         label:'Mês de Referência',        required:true,  aliases:['Data Referencia','Data Referência','mesreferencia','Mês de referência'] },
    { key:'valor',       label:'Valor a Pagar',            required:false, aliases:['Valor A Pagar','ValorAPagar','valorapagar','Valor total (R$)','Valor'] },
    { key:'vencimento',  label:'Vencimento',               required:false, aliases:['Data Vencimento','DataVencimento','dtvencimento','Vencimento fatura'] },
    { key:'pagto',       label:'Data de Pagamento',        required:false, aliases:['Data Pagamento','DataPagamento','dtpagamento','Pagto fatura'] },
    { key:'codbar',      label:'Código de Barras',         required:false, aliases:['Codigo Barra Boleto','Linha Digitavel','Linha Digitável','codigobarra','Código de barras'] },
    { key:'link',        label:'Link do Boleto',           required:false, aliases:['Url Boleto','URL Boleto','url_boleto','link_boleto'] },
    { key:'id_rcb',      label:'ID Recebível',             required:false, aliases:['Idrcb','idrcb','Recebimento (Identificador)'] },
    { key:'cpf',         label:'CPF',                      required:false, aliases:['Cpf','CPF','cpf','CPF/CNPJ'] },
    { key:'cliente',     label:'Cliente',                  required:false, aliases:['Cliente','nome_cliente','Nome'] },
    { key:'num_cliente', label:'Nº Cliente',               required:false, aliases:['Numero Cliente','NumeroCliente','numero_cliente'] },
    { key:'cod_cliente', label:'Código do Cliente',        required:false, aliases:['Codigo Cliente','codigo cliente','Código Cliente'] },
    { key:'fornecedora', label:'Fornecedora',              required:false, aliases:['Fornecedora','fornecedora','cfornecedora'] },
    { key:'stat_fin',    label:'Status Financeiro',        required:false, aliases:['Status Financeiro Cliente','StatusFinanceiroCliente'] },
  ],
}

function normStr(s) {
  return String(s || '').toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim()
}

function autoDetect(headers, aliases) {
  for (const a of aliases) {
    const k = headers.find(h => normStr(h) === normStr(a))
    if (k) return k
  }
  for (const a of aliases) {
    const k = headers.find(h => normStr(h).includes(normStr(a)))
    if (k) return k
  }
  return ''
}

export function ColumnMapper({ open, raw, headers, schemaKey, title, fileName, savedMapping, onConfirm, onCancel }) {
  const schema = SCHEMAS[schemaKey] || []
  const [mapping, setMapping] = useState({})
  const [ucMode, setUcMode] = useState('uc') // 'uc' | 'num_cliente'
  const prevOpenRef = useRef(false)

  // Ao abrir (false → true): restaura mapeamento salvo se existir, senão auto-detecta.
  // Não resetar se apenas headers mudar de referência enquanto o modal já está aberto.
  useEffect(() => {
    const justOpened = open && !prevOpenRef.current
    prevOpenRef.current = open
    if (!justOpened || !headers.length) return
    if (savedMapping) {
      setMapping(savedMapping)
    } else {
      const detected = {}
      schema.forEach(f => {
        detected[f.key] = autoDetect(headers, f.aliases)
      })
      setMapping(detected)
    }
    setUcMode('uc')
  }, [open, headers, schemaKey])

  if (!open) return null

  const preview = raw.slice(0, 3)
  const mappedFields = schema.filter(f => mapping[f.key])
  const missingRequired = schema.filter(f => f.required && !mapping[f.key])

  const handleConfirm = () => {
    if (missingRequired.length) return
    const remapped = raw.map(row => {
      const out = { ...row }
      schema.forEach(f => {
        if (mapping[f.key]) out[`_gmap_${f.key}`] = row[mapping[f.key]]
      })
      if (schemaKey === 'fat_pag' && ucMode === 'num_cliente') {
        out.__ucModeNumCliente = true
      }
      return out
    })
    onConfirm(remapped, mapping, { ucMode })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4 backdrop-blur-sm">
      <div className="flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-bd bg-s1 shadow-2xl">

        {/* Header */}
        <div className="flex items-start justify-between px-6 py-5 border-b border-bd">
          <div className="flex-1 min-w-0">
            <div className="text-base font-bold text-tx">{title || 'Análise de Colunas'}</div>
            <div className="text-xs text-tx3 mt-0.5">
              {fileName} · {raw.length.toLocaleString('pt-BR')} linhas detectadas · verifique o mapeamento
            </div>

            {/* Toggle UC mode — só para Pagadoria */}
            {schemaKey === 'fat_pag' && (
              <div className="flex items-center gap-2 mt-3">
                <ArrowLeftRight size={13} className="text-tx3 flex-shrink-0" />
                <span className="text-xs text-tx3 flex-shrink-0">UC cruza com:</span>
                <div className="flex rounded-lg border border-bd overflow-hidden text-xs font-semibold">
                  <button
                    onClick={() => setUcMode('uc')}
                    className={`px-3 py-1.5 transition-colors ${
                      ucMode === 'uc'
                        ? 'bg-acc text-onacc'
                        : 'bg-s2 text-tx3 hover:bg-s3'
                    }`}
                  >
                    UC (padrão)
                  </button>
                  <button
                    onClick={() => setUcMode('num_cliente')}
                    className={`px-3 py-1.5 transition-colors border-l border-bd ${
                      ucMode === 'num_cliente'
                        ? 'bg-acc text-onacc'
                        : 'bg-s2 text-tx3 hover:bg-s3'
                    }`}
                  >
                    Nº Cliente (Recebíveis)
                  </button>
                </div>
                {ucMode === 'num_cliente' && (
                  <span className="text-[11px] text-acc">
                    A UC desta base será cruzada com o campo Número Cliente nos Recebíveis
                  </span>
                )}
              </div>
            )}
          </div>
          <button onClick={onCancel} className="text-tx3 hover:text-tx p-1 rounded-lg hover:bg-s3 transition-colors ml-4 flex-shrink-0">
            <X size={18} />
          </button>
        </div>

        {/* Body com scroll */}
        <div className="overflow-y-auto flex-1 px-6 py-5 space-y-4">

          {/* Aviso de campos obrigatórios */}
          {missingRequired.length > 0 && (
            <div className="flex items-start gap-2.5 bg-warn/10 border border-warn/20 rounded-xl p-3.5 text-xs text-warn">
              <AlertTriangle size={14} className="flex-shrink-0 mt-0.5" />
              <span>Campos obrigatórios sem mapeamento: <strong>{missingRequired.map(f => f.label).join(', ')}</strong></span>
            </div>
          )}

          {/* Grid de campos */}
          <div className="grid grid-cols-2 gap-3">
            {schema.map(f => {
              const detected = autoDetect(headers, f.aliases)
              const selected = mapping[f.key] || ''
              const isFound = !!detected
              const isSelected = !!selected

              return (
                <div key={f.key} className="bg-s2 border border-bd rounded-xl p-3.5">
                  {/* Label + badge */}
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-semibold text-tx">{f.label}</span>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                      f.required
                        ? 'bg-danger/10 text-danger border border-danger/20'
                        : 'bg-s3 text-tx3 border border-bd'
                    }`}>
                      {f.required ? 'Obrigatório' : 'Opcional'}
                    </span>
                  </div>

                  {/* Status de detecção */}
                  <div className={`flex items-center gap-1.5 text-[11px] mb-2.5 ${
                    isFound ? 'text-acc' : 'text-warn'
                  }`}>
                    {isFound
                      ? <><Check size={11} /> Detectado: <span className="font-mono">"{detected}"</span></>
                      : <><AlertTriangle size={11} /> Não detectado — selecione manualmente</>
                    }
                  </div>

                  {/* Dropdown */}
                  <select
                    value={selected}
                    onChange={e => setMapping(prev => ({ ...prev, [f.key]: e.target.value }))}
                    className="w-full bg-s1 border border-bd rounded-lg text-xs text-tx px-2.5 py-1.5 outline-none focus:border-acc/50 transition-colors"
                  >
                    <option value="">— não mapear —</option>
                    {headers.map(h => (
                      <option key={h} value={h}>{h}</option>
                    ))}
                  </select>
                </div>
              )
            })}
          </div>

          {/* Preview */}
          {mappedFields.length > 0 && preview.length > 0 && (
            <div>
              <div className="flex items-center gap-2 text-xs font-semibold text-tx3 mb-2">
                <Eye size={12} /> Preview das primeiras linhas
              </div>
              <div className="overflow-x-auto rounded-xl border border-bd">
                <table className="w-full text-[11px]">
                  <thead>
                    <tr>
                      {mappedFields.map(f => (
                        <th key={f.key} className="px-3 py-2 text-left text-tx3 bg-s2 border-b border-bd font-semibold whitespace-nowrap">
                          {f.label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {preview.map((row, i) => (
                      <tr key={i} className="border-b border-bd last:border-0">
                        {mappedFields.map(f => (
                          <td key={f.key} className="px-3 py-2 text-tx2 whitespace-nowrap max-w-[200px] truncate" title={String(row[mapping[f.key]] ?? '')}>
                            {String(row[mapping[f.key]] ?? '—').substring(0, 35)}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-bd bg-s2">
          <div className="text-xs text-tx3">
            {missingRequired.length > 0
              ? <span className="text-warn">⚠ {missingRequired.length} campo(s) obrigatório(s) sem mapeamento</span>
              : <span className="text-acc">✓ {raw.length.toLocaleString('pt-BR')} registros prontos para carregar</span>
            }
          </div>
          <div className="flex gap-2">
            <button onClick={onCancel}
              className="px-4 py-2 text-xs font-medium text-tx3 hover:text-tx border border-bd rounded-lg hover:bg-s3 transition-colors">
              Cancelar
            </button>
            <button
              onClick={handleConfirm}
              disabled={missingRequired.length > 0}
              className="px-4 py-2 text-xs font-bold bg-acc text-onacc rounded-lg hover:bg-acc/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1.5">
              <Check size={13} /> Confirmar e carregar
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
