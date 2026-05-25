import { getField, normUC, fmtData, fmtValor } from './normalizadores'

// ── Dicionário de Marcações ────────────────────────────────────
export const MARCACOES = {
  1:  { label: 'Clientes OK',                           acao: 'Nenhuma ação necessária',                        cor: '#22c55e' },
  2:  { label: 'Boletando sem data ativo',              acao: 'Verificar manual / Abrir chamado TI',             cor: '#f97316' },
  3:  { label: 'Cancelado GV — não no BKO',             acao: 'Solicitar ao TI cancelamento no BKO',             cor: '#ef4444' },
  4:  { label: 'Sem motivo de cancelamento',            acao: 'TI inserir motivo de cancelamento',               cor: '#ef4444' },
  5:  { label: 'Equipe de devolutivas',                 acao: 'Enviar para Ana Luiza',                           cor: '#a855f7' },
  6:  { label: 'OK — cancelados em ambos',              acao: 'Nenhuma ação necessária',                        cor: '#22c55e' },
  7:  { label: 'Em atraso',                             acao: 'Pedir novo prazo de injeção à GV',                cor: '#dc2626' },
  10: { label: 'Cancelado BKO / ativo na fornecedora',  acao: 'Pedir GV cancelar do lado deles',                 cor: '#ef4444' },
  11: { label: 'Realocação',                            acao: 'Inserir na planilha de realocação',               cor: '#f59e0b' },
  12: { label: 'OK — não enviado',                      acao: 'Enviar na planilha de finalizados',               cor: '#3b82f6' },
  14: { label: 'Aguardando fornecedora',                acao: 'Aguardar retorno da GV',                         cor: '#94a3b8' },
  15: { label: 'Não encontrado na GV',                  acao: 'Cruzar com todos os fornecedores',                cor: '#f59e0b' },
  16: { label: 'Andressa — verificar',                  acao: 'Passar para setor de contratos (Andressa)',       cor: '#f59e0b' },
  17: { label: '#N/D sem devolutiva',                   acao: 'Verificar 2023/2024 e seguir com cancelamentos',  cor: '#ef4444' },
  18: { label: 'OK — sem assinatura / não enviado',     acao: 'Nenhuma ação necessária',                        cor: '#22c55e' },
  19: { label: 'Enviados — não cadastrados',            acao: 'Pedir motivo + prazo de injeção à GV',            cor: '#f97316' },
  20: { label: 'Enviados — não aceitos',                acao: 'Cancelar cadastro e realocar',                    cor: '#ef4444' },
  21: { label: 'Aumentar consumo',                      acao: 'Solicitar esclarecimento à GV',                   cor: '#f59e0b' },
}

function n(s) {
  return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim()
}
const inc = (s, t) => n(s).includes(n(t))
const eq  = (s, t) => n(s) === n(t)

// ── Extratores ─────────────────────────────────────────────────
function extrairBKO(r) {
  return {
    codigo:             getField(r, ['_gmap_codigo','Código','Codigo','codigo','cod_cliente','Código do Cliente','CodigoCliente','UC']),
    nome:               getField(r, ['_gmap_nome','Nome do Cliente','Nome Cliente','NomeCliente','nome_cliente','Nome','Cliente']),
    instalacao:         getField(r, ['_gmap_instalacao','Instalação','Instalacao','instalacao','UC','num_instalacao']),
    cidade:             getField(r, ['_gmap_cidade','Cidade','cidade','Município','Municipio']),
    consumo:            getField(r, ['_gmap_consumo','Consumo','consumo','Consumo (kWh)']),
    statusBKO:          getField(r, ['_gmap_status_bko','Status BKO','StatusBKO','status_bko','Status']),
    motivoCancelamento: getField(r, ['_gmap_motivo_cancel','Motivo Cancelamento','Motivo do Cancelamento','motivo_cancelamento','Motivo']),
    dataAtivo:          getField(r, ['_gmap_data_ativo','Data Ativo','DataAtivo','data_ativo','Data de Ativação','Data Ativacao']),
    cadastro:           getField(r, ['_gmap_cadastro','Cadastro','cadastro','Status Cadastro']),
    envio:              getField(r, ['_gmap_envio','Envio','envio','Status Envio']),
    statusFluxo:        getField(r, ['_gmap_status_fluxo','Status Fluxo','StatusFluxo','status_fluxo','Fluxo']),
    anoContrato:        getField(r, ['_gmap_ano_contrato','Ano Contrato','AnoContrato','ano_contrato','Ano do Contrato','Ano']),
    fornecedora:        getField(r, ['_gmap_fornecedora','Fornecedora','fornecedora','Distribuidora']),
    regiao:             getField(r, ['_gmap_regiao','Região','Regiao','regiao','Região/Fornecedora']),
  }
}

function extrairRetorno(r) {
  return {
    codigo:             getField(r, ['_gmap_codigo','Código','Codigo','codigo','cod_cliente']),
    statusGV:           getField(r, ['_gmap_status_gv','Status GV','StatusGV','status_gv','Status']),
    statusFornecedora:  getField(r, ['_gmap_status_forn','Status Fornecedora','StatusFornecedora','status_fornecedora','Status GV Fornecedora']),
    observacaoGV:       getField(r, ['_gmap_obs_gv','Observação GV','Observacao GV','obs_gv','Observacao','Observação']),
    statusRateioGV:     getField(r, ['_gmap_status_rateio','Status Rateio GV','StatusRateioGV','status_rateio','Rateio GV','Rateio']),
    devolutiva:         getField(r, ['_gmap_devolutiva','Devolutiva','devolutiva','Data Devolutiva']),
    mesInjecao:         getField(r, ['_gmap_mes_injecao','Mês Injeção','Mes Injecao','mes_injecao','Mês de Injeção','Mês Injeção GV']),
    retornoFornecedora: getField(r, ['Retorno Fornecedora','RetornoFornecedora','retorno_fornecedora','Retorno']),
  }
}

// ── Classificação (Marcação) ───────────────────────────────────
function classificar(c) {
  const sGV    = c.statusGV   || ''
  const sBKO   = c.statusBKO  || ''
  const sFor   = c.statusFornecedora || ''
  const sFluxo = c.statusFluxo || ''

  // Cancelado BKO + ativo na fornecedora → 10
  if (inc(sBKO, 'cancelad') && inc(sFor, 'ativo')) return 10

  // Cancelado na GV, não no BKO → 3
  if (inc(sGV, 'cancelad') && !inc(sBKO, 'cancelad')) return 3

  // Cancelado BKO sem motivo → 4
  if (inc(sBKO, 'cancelad') && !c.motivoCancelamento) return 4

  // Devolutiva → 5
  if (inc(sFluxo, 'devolutiva')) return 5

  // #N/D sem devolutiva sem data ativo → 17
  if ((inc(sGV, '#n/d') || sGV === '#N/D') && !c.devolutiva && !c.dataAtivo) return 17

  // Não encontrado na GV → 15
  if (inc(sGV, 'nao encontrad') || inc(sGV, 'não encontrad')) return 15

  // Realocação → 11
  if (inc(sFluxo, 'realocac')) return 11

  // Em atraso → 7
  if (inc(sBKO, 'atraso') || inc(c.status || '', 'atraso') || (c.diasAtraso && parseInt(c.diasAtraso) > 0)) return 7

  // Boletando sem data ativo → 2
  if (c.boletando && !c.dataAtivo && !inc(sBKO, 'cancelad')) return 2

  // Aguardando fornecedora / GV → 14
  if (inc(sFluxo, 'aguardando')) return 14

  // OK cancelados em ambos → 6
  if (c.finalizado && inc(sBKO, 'cancelad') && inc(sFor, 'cancelad')) return 6

  // OK sem assinatura não enviado → 18
  if (c.finalizado && inc(c.cadastro || '', 'sem assinatura') && inc(c.envio || '', 'nao enviado')) return 18

  // OK não enviado → 12
  if (c.finalizado && inc(c.envio || '', 'nao enviado')) return 12

  // Aumentar consumo → 21
  if (inc(sFor, 'aumentar consumo')) return 21

  // Enviados não aceitos → 20
  if (inc(c.envio || '', 'enviado') && inc(sFor, 'nao aceito')) return 20

  // Enviados não cadastrados sem status fornecedora → 19
  if (inc(c.envio || '', 'enviado') && (inc(c.cadastro || '', 'nao cadastrad') || !sFor)) return 19

  // Andressa verificar → 16
  if (inc(sFluxo, 'andressa')) return 16

  // OK padrão → 1
  return 1
}

function buildRow(c) {
  return {
    'Código':               c.codigo        || '—',
    'Nome':                 c.nome          || '—',
    'Instalação':           c.instalacao    || '—',
    'Cidade':               c.cidade        || '—',
    'Fornecedora':          c.fornecedora   || '—',
    'Status BKO':           c.statusBKO     || '—',
    'Motivo Cancelamento':  c.motivoCancelamento || '—',
    'Data Ativo':           c.dataAtivo     || '—',
    'Cadastro':             c.cadastro      || '—',
    'Envio':                c.envio         || '—',
    'Status Fluxo':         c.statusFluxo   || '—',
    'Ano Contrato':         c.anoContrato   || '—',
    'Boletando':            c.boletando     ? 'SIM' : 'NÃO',
    'Dias em Atraso':       c.diasAtraso    || '—',
    'Finalizado':           c.finalizado    ? 'SIM' : 'NÃO',
    'Status GV':            c.statusGV      || '—',
    'Status Fornecedora':   c.statusFornecedora || '—',
    'Observação GV':        c.observacaoGV  || '—',
    'Status Rateio GV':     c.statusRateioGV || '—',
    'Devolutiva':           c.devolutiva    || '—',
    'Mês Injeção':          c.mesInjecao    || '—',
    'Marcação':             c.marcacao      || '—',
    'Classificação':        c.marcacaoLabel || '—',
    'Ação':                 c.marcacaoAcao  || '—',
  }
}

// ── Função principal ───────────────────────────────────────────
export function gvCruzar(dfBKO, dfRec, dfFin, dfRetorno, onLog) {
  const log = (msg, tipo = 'info') => onLog && onLog(msg, tipo)

  log(`BKO: ${dfBKO.length} | Recebíveis: ${dfRec.length} | Finalizados: ${dfFin.length} | Retorno: ${dfRetorno.length}`)

  // Índice Recebíveis por código normalizado
  const idxRec = {}
  dfRec.forEach(r => {
    const cod = normUC(getField(r, ['_gmap_codigo','Código','Codigo','codigo','Numero Cliente','NumeroCliente','numero_cliente','cod_cliente']))
    if (cod) {
      idxRec[cod] = {
        status:     getField(r, ['_gmap_status','Status Financeiro Cliente','Status','status']),
        diasAtraso: getField(r, ['_gmap_dias_atraso','Dias Atraso','dias_atraso','Dias em Atraso','Atraso (dias)']),
      }
    }
  })

  // Índice Finalizados por código
  const idxFin = new Set()
  dfFin.forEach(r => {
    const cod = normUC(getField(r, ['_gmap_codigo','Código','Codigo','codigo','cod_cliente','UC']))
    if (cod) idxFin.add(cod)
  })

  // Índice Retorno por código
  const idxRetorno = {}
  dfRetorno.forEach(r => {
    const ext = extrairRetorno(r)
    const cod = normUC(ext.codigo)
    if (cod) idxRetorno[cod] = ext
  })

  // Processar cada cliente da BKO
  const rows = []
  dfBKO.forEach(rowBKO => {
    const bko = extrairBKO(rowBKO)
    const cod = normUC(bko.codigo)
    if (!cod) return

    const rec     = idxRec[cod]
    const retorno = idxRetorno[cod] || {}
    const fin     = idxFin.has(cod)

    const cliente = {
      ...bko,
      cod,
      boletando:         !!rec,
      diasAtraso:        rec ? (parseInt(rec.diasAtraso) || 0) : 0,
      status:            rec?.status || bko.statusBKO,
      finalizado:        fin,
      statusGV:          retorno.statusGV          || '',
      statusFornecedora: retorno.statusFornecedora || '',
      observacaoGV:      retorno.observacaoGV      || '',
      statusRateioGV:    retorno.statusRateioGV    || '',
      devolutiva:        retorno.devolutiva        || '',
      mesInjecao:        retorno.mesInjecao        || '',
    }

    cliente.marcacao      = classificar(cliente)
    cliente.marcacaoLabel = MARCACOES[cliente.marcacao]?.label || '—'
    cliente.marcacaoAcao  = MARCACOES[cliente.marcacao]?.acao  || '—'
    rows.push(cliente)
  })

  // Agrupar por marcação
  const grupos = {}
  rows.forEach(c => {
    const k = String(c.marcacao)
    if (!grupos[k]) grupos[k] = []
    grupos[k].push(buildRow(c))
  })

  // Grupos de output especiais
  const enviarAnaLuiza    = grupos['5']  || []
  const planilhaFin       = grupos['12'] || []
  const planilhaRealoc    = [...(grupos['11'] || []), ...(grupos['20'] || [])]
  const verificarAndressa = grupos['16'] || []

  const ok = (grupos['1']||[]).length + (grupos['6']||[]).length + (grupos['18']||[]).length

  log(`Classificados: ${rows.length} clientes`, 'ok')
  log(`Ana Luiza: ${enviarAnaLuiza.length} | Finalizados: ${planilhaFin.length} | Realocação: ${planilhaRealoc.length} | Andressa: ${verificarAndressa.length} | OK: ${ok}`, 'ok')

  return { rows: rows.map(buildRow), grupos, enviarAnaLuiza, planilhaFin, planilhaRealoc, verificarAndressa, total: rows.length, totalOK: ok }
}
