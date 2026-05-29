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
    { key:'jornada_status', label:'Jornada Status',  required:false, aliases:['Jornada Status','JornadaStatus','jornada_status','Jornada de Status','Status Jornada'] },
    { key:'jornada_etapa',  label:'Jornada Etapa',   required:false, aliases:['Jornada Etapa','JornadaEtapa','jornada_etapa','Etapa Jornada','Etapa da Jornada'] },
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
    onConfirm(remapped, mapping)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="bg-s1 border border-bd rounded-2xl w-full max-w-3xl max-h-[90vh] overflow-hidden flex flex-col shadow-2xl">

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
                        ? 'bg-acc text-black'
                        : 'bg-s2 text-tx3 hover:bg-s3'
                    }`}
                  >
                    UC (padrão)
                  </button>
                  <button
                    onClick={() => setUcMode('num_cliente')}
                    className={`px-3 py-1.5 transition-colors border-l border-bd ${
                      ucMode === 'num_cliente'
                        ? 'bg-acc text-black'
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
            <div className="flex items-start gap-2.5 bg-warn/8 border border-warn/20 rounded-xl p-3.5 text-xs text-warn">
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
              className="px-4 py-2 text-xs font-bold bg-acc text-black rounded-lg hover:bg-green-400 transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1.5">
              <Check size={13} /> Confirmar e carregar
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
