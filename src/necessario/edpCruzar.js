/**
 * edpCruzar.js — Motor de cruzamento EDP
 *
 * FONTE POR CATEGORIA:
 *   emAberto  → BOL (Pagadoria EDP): status em aberto (Não Emitida, Inadimplente,
 *               Regular, Em Atraso) cruzado com BKO Data Ativo preenchida.
 *               = boleto que a EDP ainda não marcou como pago, cliente ativo.
 *
 *   vencidos  → REC (Recebíveis internos): clientes com Data Ativo + boleto
 *               com status vencido no nosso sistema.
 *
 *   darBaixa  → BOL diz Pago/Regular + REC ainda mostra Vencido para o mesmo
 *               inst+mês = dar baixa no sistema interno.
 *
 * Os Recebíveis (REC) são internos e já estão contabilizados no sistema.
 * "Em Aberto" é medido pela Pagadoria (fonte externa EDP).
 */

function normUC(v) {
  const d = String(v ?? '').replace(/[^0-9]/g, '')
  if (!d) return ''
  const s = d.replace(/^0+/, '')
  return s || '0'
}

function normMes(v) {
  if (!v) return ''
  const s = String(v).trim()
  let m = s.match(/^(\d{4})-(\d{2})(?:-\d{2})?/)
  if (m) return `${m[1]}-${m[2]}`
  m = s.match(/^(\d{2})\/(\d{4})$/)
  if (m) return `${m[2]}-${m[1]}`
  m = s.match(/^\d{2}\/(\d{2})\/(\d{4})/)
  if (m) return `${m[2]}-${m[1]}`
  return ''
}

function getField(r, aliases) {
  for (const a of aliases) {
    if (r[a] !== undefined && r[a] !== '') return r[a]
  }
  return ''
}

function fmtValor(v) {
  if (!v) return 0
  const n = parseFloat(String(v).replace(',', '.').replace(/[^0-9.]/g, ''))
  return isNaN(n) ? 0 : n
}

// ── Status da Pagadoria (BOL) ──────────────────────────────────────────────
// Em aberto: EDP ainda não recebeu / não emitiu
const BOL_STATUS_EM_ABERTO = new Set([
  'NÃO EMITIDA', 'NAO EMITIDA',
  'INADIMPLENTE',
  'REGULAR',
  'EM ATRASO',
  'A VENCER',
  'PENDENTE',
  'EM ABERTO',
])

const BOL_STATUS_INADIMPLENTE = new Set(['INADIMPLENTE'])
const BOL_STATUS_NAO_EMITIDA  = new Set(['NÃO EMITIDA', 'NAO EMITIDA'])
// Pago: EDP já recebeu (base para Dar Baixa)
const BOL_STATUS_PAGO = new Set([
  'PAGA', 'PAGO', 'RECEBIDA', 'RECEBIDO', 'QUITADA', 'QUITADO',
])

// ── Status dos Recebíveis (REC) — Coluna T: campo 'Status' ──────────────────
// Valores reais encontrados na planilha: PAGO | VENCIDO | A RECEBER
const REC_STATUS_PAGO    = new Set(['PAGO', 'QUITADO', 'QUITADA'])
const REC_STATUS_VENCIDO = new Set(['VENCIDO'])
const REC_STATUS_A_RECEBER = new Set(['A RECEBER', 'A VENCER', 'PENDENTE'])
// Não pago = qualquer status que não seja PAGO (base para Dar Baixa)
const REC_STATUS_NAO_PAGO = new Set(['VENCIDO', 'A RECEBER', 'A VENCER', 'PENDENTE'])

// ── Normalização de status para aba Divergentes ──────────────────────────
// Espelha a lógica do fatCruzar para compatibilidade com DivergentesTable
function spNormEDP(v) {
  const u = String(v || '').trim().toUpperCase()
  if (['PAGA','PAGO','RECEBIDA','RECEBIDO','QUITADA','QUITADO'].includes(u)) return 'PAGO'
  if (['INADIMPLENTE','EM ATRASO','VENCIDO','VENCIDA'].includes(u))           return 'VENCIDO'
  if (['A VENCER','A RECEBER','EM ABERTO','PENDENTE','REGULAR'].includes(u))  return 'A RECEBER'
  if (['NÃO EMITIDA','NAO EMITIDA','CALCULADA'].includes(u))                  return 'CALCULADA'
  if (['CANCELADA','CANCELADO','ESTORNADA'].includes(u))                      return 'CANCELADA'
  return u || '—'
}
function srNormEDP(v) {
  const u = String(v || '').trim().toUpperCase()
  if (['PAGO','PAGA','QUITADO','QUITADA'].includes(u))    return 'PAGO'
  if (['VENCIDO','VENCIDA'].includes(u))                  return 'VENCIDO'
  if (['A RECEBER','A VENCER','PENDENTE'].includes(u))    return 'A RECEBER'
  return u || '—'
}
const _GRUPOS_DIV = [['PAGO'],['VENCIDO'],['A RECEBER'],['CALCULADA'],['CANCELADA'],['EXPIRADA']]
function ehDivergenteEDP(sp, sr) {
  if (!sp || !sr || sp === '—' || sr === '—') return false
  // CALCULADA (NÃO EMITIDA) × PAGO: fatura ainda não gerada na distribuidora
  // mas já paga no sistema interno — situação esperada, não é divergência real
  if (sp === 'CALCULADA' && sr === 'PAGO') return false
  const grpOf = s => _GRUPOS_DIV.findIndex(g => g.includes(s))
  const ga = grpOf(sp), gb = grpOf(sr)
  return ga !== -1 && gb !== -1 && ga !== gb
}

// ── Motor principal ───────────────────────────────────────────────────────

export function edpCruzar(dfBko, dfRec, dfBol, onLog) {
  const log = (msg, tipo = 'info') => onLog?.(msg, tipo)

  log(`BackOffice: ${dfBko.length.toLocaleString('pt-BR')} clientes`)
  log(`Recebíveis (interno): ${dfRec.length.toLocaleString('pt-BR')} registros`)
  if (dfBol) log(`Pagadoria EDP: ${dfBol.length.toLocaleString('pt-BR')} registros`)

  // ── Índice BKO com Data Ativo preenchida ──────────────────────────────
  const bkoAtivos = dfBko.filter(r => (getField(r, ['Data Ativo']) || '').trim())
  log(`Clientes com Data Ativo: ${bkoAtivos.length.toLocaleString('pt-BR')} / ${dfBko.length.toLocaleString('pt-BR')}`, 'ok')

  const idxInst = {}, idxNc = {}, idxCod = {}
  for (const r of bkoAtivos) {
    const inst = normUC(getField(r, ['Instalacao', 'Instalação']))
    const nc   = normUC(getField(r, ['Numero Cliente', 'NumeroCliente']))
    const cod  = normUC(getField(r, ['Codigo', 'Código']))
    if (inst && !idxInst[inst]) idxInst[inst] = r
    if (nc   && !idxNc[nc])     idxNc[nc]     = r
    if (cod  && !idxCod[cod])   idxCod[cod]   = r
  }

  const findBko = (inst, nc, cod) =>
    idxInst[inst] || idxNc[nc] || idxCod[cod]

  // ────────────────────────────────────────────────────────────────────────
  // EM ABERTO → da Pagadoria (BOL), dividido em Inadimplente / Não Emitida / Em Aberto
  // ────────────────────────────────────────────────────────────────────────
  const inadimplente = []
  const naoEmitida   = []
  const emAberto     = []   // EM ABERTO literal + REGULAR + EM ATRASO + A VENCER + PENDENTE
  let bolPagoIdx = {}

  if (dfBol) {
    for (const bol of dfBol) {
      const st = (getField(bol, ['Status']) || '').toUpperCase().trim()

      // Indexar pagos para Dar Baixa (inst+mes) — guarda status E mês raw para debug
      if (BOL_STATUS_PAGO.has(st)) {
        const inst      = normUC(getField(bol, ['Número da Instalação', 'Numero da Instalacao']))
        const bolMesRaw = getField(bol, ['Mês de Referência', 'Mes de Referencia'])
        const mes       = normMes(bolMesRaw)
        const k         = `${inst}|${mes}`
        if (!bolPagoIdx[k]) bolPagoIdx[k] = { stPag: st, bolMesRaw, bolIdCob: getField(bol, ['ID da Cobrança', 'Id da Cobranca']) }
        continue
      }

      // Em aberto na Pagadoria
      if (!BOL_STATUS_EM_ABERTO.has(st)) continue

      const inst = normUC(getField(bol, ['Número da Instalação', 'Numero da Instalacao']))
      const bko  = idxInst[inst]
      if (!bko) continue   // só interessa clientes com Data Ativo

      const entry = {
        nome:          getField(bko, ['Nome']) || getField(bol, ['Cliente']),
        instalacao:    getField(bko, ['Instalacao']),
        dataAtivo:     getField(bko, ['Data Ativo']),
        uf:            getField(bko, ['UF Consumo', 'Uf Consumo', 'UF']),
        regiao:        getField(bko, ['Regiao', 'Região']),
        licenciado:    getField(bko, ['Licenciado']),
        celular:       getField(bko, ['Celular']),
        mesReferencia: normMes(getField(bol, ['Mês de Referência', 'Mes de Referencia'])),
        status:        getField(bol, ['Status']),
        valor:         fmtValor(getField(bol, ['Valor do Boleto (R$)', 'Valor do Boleto'])),
        vencimento:    (getField(bol, ['Data de Vencimento da Cobrança']) || '').slice(0, 10),
        distribuidora: getField(bol, ['Distribuidora']),
        idCob:         getField(bol, ['ID da Cobrança']),
        linhaDigit:    getField(bol, ['Linha Digitável', 'Linha Digitavel']),
        _fonte:        'PAG',
      }

      if (BOL_STATUS_INADIMPLENTE.has(st))  inadimplente.push(entry)
      else if (BOL_STATUS_NAO_EMITIDA.has(st)) naoEmitida.push(entry)
      else                                     emAberto.push(entry)
    }
    log(`Inadimplente (PAG): ${inadimplente.length.toLocaleString('pt-BR')}`, 'ok')
    log(`Não Emitida (PAG):  ${naoEmitida.length.toLocaleString('pt-BR')}`, 'ok')
    log(`Em Aberto / Outros (PAG): ${emAberto.length.toLocaleString('pt-BR')}`, 'ok')
  }

  // ────────────────────────────────────────────────────────────────────────
  // VENCIDOS → REC interno, clientes com Data Ativo
  // ────────────────────────────────────────────────────────────────────────
  const vencidos = []

  for (const rec of dfRec) {
    // Filtro pelo campo Status (coluna T) — nico campo confiável
    const st    = (getField(rec, ['Status']) || '').toUpperCase().trim()
    // Status Financeiro Cliente (coluna O) — só para exibição
    const stFin = (getField(rec, ['Status Financeiro Cliente']) || '').trim()

    if (!REC_STATUS_VENCIDO.has(st)) continue

    const inst = normUC(getField(rec, ['Instalacao', 'Instalação']))
    const nc   = normUC(getField(rec, ['Numero Cliente', 'NumeroCliente']))
    const cod  = normUC(getField(rec, ['Codigo Cliente', 'CodigoCliente']))
    const bko  = findBko(inst, nc, cod)
    if (!bko) continue

    vencidos.push({
      codigoIGreen:  getField(bko, ['Codigo', 'Código']),
      nome:          getField(bko, ['Nome', 'nome']) || getField(rec, ['Cliente']),
      instalacao:    getField(bko, ['Instalacao']),
      dataAtivo:     getField(bko, ['Data Ativo']),
      uf:            getField(bko, ['UF Consumo', 'Uf Consumo', 'UF']),
      regiao:        getField(bko, ['Regiao', 'Região']),
      licenciado:    getField(bko, ['Licenciado']),
      celular:       getField(bko, ['Celular']),
      email:         getField(bko, ['Email']),
      mesReferencia: normMes(getField(rec, ['Data Referencia', 'DataReferencia'])),
      status:        st,
      statusFin:     stFin,   // Coluna O — descritivo
      valor:         fmtValor(getField(rec, ['Valor A Pagar', 'ValorAPagar'])),
      vencimento:    getField(rec, ['Data Vencimento']),
      urlBoleto:     getField(rec, ['Url Boleto', 'UrlBoleto']),
      codBarra:      getField(rec, ['Codigo Barra Boleto']),
      linhaDigit:    getField(rec, ['Linha Digitavel']),
    })
  }
  log(`Vencidos (REC interno, cliente ativo): ${vencidos.length.toLocaleString('pt-BR')}`, 'ok')

  // ────────────────────────────────────────────────────────────────────────
  // DAR BAIXA → BOL Pago + REC ainda mostra não-pago (mesmo inst+mês)
  // ────────────────────────────────────────────────────────────────────────
  const darBaixa = []

  if (dfBol) {
    for (const rec of dfRec) {
      // Filtro pelo campo Status (coluna T) — não pago = VENCIDO ou A RECEBER
      const st    = (getField(rec, ['Status']) || '').toUpperCase().trim()
      const stFin = (getField(rec, ['Status Financeiro Cliente']) || '').trim()

      if (!REC_STATUS_NAO_PAGO.has(st)) continue

      const inst          = normUC(getField(rec, ['Instalacao', 'Instalação']))
      const recDataRefRaw = getField(rec, ['Data Referencia', 'DataReferencia'])
      const mes           = normMes(recDataRefRaw)
      const k             = `${inst}|${mes}`
      const pago          = bolPagoIdx[k]
      if (!pago) continue  // PAG não diz pago para este inst+mês

      const nc  = normUC(getField(rec, ['Numero Cliente', 'NumeroCliente']))
      const cod = normUC(getField(rec, ['Codigo Cliente', 'CodigoCliente']))
      const bko = findBko(inst, nc, cod)

      // Campos de identificação do registro REC (para debug/rastreio)
      const recId = getField(rec, ['Id', 'ID', 'IdRecebivel', 'Id Recebivel', 'Codigo', 'Número'])
                 || getField(rec, ['Contrato', 'IdContrato', 'NumeroContrato'])

      darBaixa.push({
        codigoIGreen:  bko ? getField(bko, ['Codigo']) : '',
        nome:          bko ? (getField(bko, ['Nome']) || getField(rec, ['Cliente'])) : getField(rec, ['Cliente']),
        instalacao:    bko ? getField(bko, ['Instalacao']) : inst,
        dataAtivo:     bko ? getField(bko, ['Data Ativo']) : '',
        uf:            bko ? getField(bko, ['UF Consumo', 'Uf Consumo', 'UF']) : '',
        regiao:        bko ? getField(bko, ['Regiao']) : '',
        licenciado:    bko ? getField(bko, ['Licenciado']) : '',
        mesReferencia: mes,
        statusPag:     pago.stPag,
        statusRec:     stFin || st,
        valor:         fmtValor(getField(rec, ['Valor A Pagar'])),
        vencimento:    getField(rec, ['Data Vencimento']),
        urlBoleto:     getField(rec, ['Url Boleto']),
        motivoBaixa:   `PAG: ${pago.stPag} → REC: ${stFin || st}`,
        temDataAtivo:  !!bko,
        // ── Debug / Rastreio ──────────────────────────────────────────────
        _recId:          recId,
        _recDataRefRaw:  recDataRefRaw,
        _bolMesRefRaw:   pago.bolMesRaw,
        _bolIdCob:       pago.bolIdCob,
        _mesChave:       mes,
      })
    }
    log(`Dar Baixa (PAG pago ≠ REC vencido): ${darBaixa.length.toLocaleString('pt-BR')}`, 'ok')
  }

  // ────────────────────────────────────────────────────────────────────────
  // DIVERGENTES → BOL × REC por UC+Mês — status de grupos diferentes
  // Usa os mesmos nomes de campo que DivergentesTable.jsx espera:
  //   'Status PAG (norm.)', 'Status REC (norm.)', 'Mês Referência'
  // ────────────────────────────────────────────────────────────────────────
  const divergentes = []

  if (dfBol) {
    // Índice REC completo por UC+Mês (todos os registros, não só vencidos)
    const idxRecAll = {}
    for (const rec of dfRec) {
      const inst = normUC(getField(rec, ['Instalacao', 'Instalação']))
      const mes  = normMes(getField(rec, ['Data Referencia', 'DataReferencia']))
      if (!inst || !mes) continue
      const k = `${inst}|${mes}`
      if (!idxRecAll[k]) idxRecAll[k] = []
      idxRecAll[k].push(rec)
    }

    // Cruzar cada linha do BOL com o REC correspondente
    const recUsadosDiverg = new Set()
    for (const bol of dfBol) {
      const inst      = normUC(getField(bol, ['Número da Instalação', 'Numero da Instalacao']))
      const bolMesRaw = getField(bol, ['Mês de Referência', 'Mes de Referencia'])
      const mes       = normMes(bolMesRaw)
      if (!inst || !mes) continue

      const k     = `${inst}|${mes}`
      const cands = idxRecAll[k] || []
      const rec   = cands.find(r => !recUsadosDiverg.has(r)) || cands[0]
      if (!rec) continue
      recUsadosDiverg.add(rec)

      const stBol = (getField(bol, ['Status']) || '').trim()
      const stRec = (getField(rec, ['Status']) || '').trim()
      const sp    = spNormEDP(stBol)
      const sr    = srNormEDP(stRec)

      if (!ehDivergenteEDP(sp, sr)) continue

      const bko = idxInst[inst]
      divergentes.push({
        'UC':                  inst,
        'Cliente':             bko ? getField(bko, ['Nome']) : (getField(bol, ['Cliente']) || getField(rec, ['Cliente'])),
        'Licenciado':          bko ? getField(bko, ['Licenciado']) : '',
        'Tem Data Ativo':      bko ? 'SIM' : 'NÃO',
        'Mês Referência':      mes,
        // Campos esperados pelo DivergentesTable
        'Status PAG (norm.)':  sp,
        'Status REC (norm.)':  sr,
        // Valores brutos para diagnóstico
        'Status Pagadoria':    stBol,
        'Status Recebíveis':   stRec,
        'Status Fin. REC':     getField(rec, ['Status Financeiro Cliente']),
        'Valor BOL':           fmtValor(getField(bol, ['Valor do Boleto (R$)', 'Valor do Boleto'])),
        'Valor REC':           fmtValor(getField(rec, ['Valor A Pagar'])),
        'Vencimento BOL':      (getField(bol, ['Data de Vencimento da Cobrança']) || '').slice(0, 10),
        'Vencimento REC':      getField(rec, ['Data Vencimento']),
        'ID Cob. BOL':         getField(bol, ['ID da Cobrança', 'Id da Cobranca']),
        'ID REC':              getField(rec, ['Idrcb', 'Id', 'ID']),
      })
    }
    log(`Divergentes BOL×REC: ${divergentes.length.toLocaleString('pt-BR')}`, 'ok')
  }

  // ── Resumo por cliente ────────────────────────────────────────────────
  const todosEmAberto = [...inadimplente, ...naoEmitida, ...emAberto]
  const mapa = {}
  for (const r of [...todosEmAberto, ...vencidos]) {
    const k = r.instalacao || r.codigoIGreen
    if (!mapa[k]) mapa[k] = {
      ...r, qtdEmAberto: 0, qtdVencidos: 0, totalAberto: 0,
    }
    if (r._fonte === 'PAG') mapa[k].qtdEmAberto++
    else                    mapa[k].qtdVencidos++
    mapa[k].totalAberto += r.valor
  }
  const resumoClientes = Object.values(mapa).sort((a, b) => b.totalAberto - a.totalAberto)

  const totalEmAberto = todosEmAberto.reduce((s, r) => s + r.valor, 0)
  const totalVencidos = vencidos.reduce((s, r) => s + r.valor, 0)
  log(`Valor Em Aberto total (PAG): R$ ${totalEmAberto.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`, 'ok')
  log(`  ↳ Inadimplente: ${inadimplente.length} | Não Emitida: ${naoEmitida.length} | Em Aberto: ${emAberto.length}`, 'info')
  log(`Valor Vencidos (REC):  R$ ${totalVencidos.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`, 'ok')

  // Distribuições (por status + UF)
  const porStatus = {}, porUF = {}
  for (const r of vencidos) {
    const k = r.statusFin || r.status || '—'
    porStatus[k] = (porStatus[k] || 0) + 1
    if (r.uf) porUF[r.uf] = (porUF[r.uf] || 0) + 1
  }
  for (const r of todosEmAberto) {
    const k = r.status || '—'
    porStatus[k] = (porStatus[k] || 0) + 1
    if (r.uf) porUF[r.uf] = (porUF[r.uf] || 0) + 1
  }

  return {
    inadimplente,
    naoEmitida,
    emAberto,
    vencidos,
    darBaixa,
    divergentes,
    resumoClientes,
    metrics: {
      totalBko:        dfBko.length,
      totalAtivos:     bkoAtivos.length,
      totalRec:        dfRec.length,
      inadimplente:    inadimplente.length,
      naoEmitida:      naoEmitida.length,
      emAberto:        emAberto.length,
      emAbertoTotal:   todosEmAberto.length,
      vencidos:        vencidos.length,
      darBaixa:        darBaixa.length,
      divergentes:     divergentes.length,
      clientesUnicos:  resumoClientes.length,
      totalEmAberto,
      totalVencidos,
      totalBol:        dfBol?.length || 0,
      porStatus,
      porUF,
    },
  }
}
