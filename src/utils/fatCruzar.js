// ═══════════════════════════════════════════════════════════════
// iGreen — Cruzamento Pagadoria × Recebíveis
// Cascading Join com chave composta [UC + Mês de Referência]
// Suporta: Solatio, Northen/Energisa, EDP, GV, CMU BackOffice
// ═══════════════════════════════════════════════════════════════
import {
  normUC,
  normalizarMes,
  fmtData,
  fmtValor,
  getField,
} from "./normalizadores";

// Retorna o primeiro valor que parece um código de barras real (≥ 20 dígitos)
// Usa busca fuzzy igual ao getField para lidar com variações de acento/capitalização
function getBarcodeField(r, aliases) {
  const rKeys = Object.keys(r);
  const norm = (s) =>
    String(s || "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .trim();
  for (const alias of aliases) {
    let k = rKeys.find((k) => norm(k) === norm(alias));
    if (!k) k = rKeys.find((k) => norm(k).includes(norm(alias)));
    if (k === undefined) continue;
    const v = r[k];
    if (v === null || v === undefined || v === "") continue;
    const s = String(v).trim();
    if (s.replace(/\D/g, "").length >= 20) return s;
  }
  return "";
}

// ── Status Pagadoria ───────────────────────────────────────────
function statusPag(v) {
  const u = String(v || "")
    .trim()
    .toUpperCase();
  if (["PAGO", "PAGA", "PAGA JUNTO AO CLIENTE", "RECEBIDO"].includes(u))
    return "PAGO";
  // Inclui status EDP: Inadimplente / Em atraso = vencido
  if (["VENCIDO", "VENCIDA", "INADIMPLENTE", "EM ATRASO"].includes(u))
    return "VENCIDO";
  // Estornada EDP = cancelada
  if (["CANCELADO", "CANCELADA", "ESTORNADA"].includes(u)) return "CANCELADA";
  // Regular EDP = boleto em aberto
  if (["A VENCER", "A RECEBER", "EM ABERTO", "PENDENTE", "REGULAR"].includes(u))
    return "A RECEBER";
  if (["EXPIRADA", "EXPIRADO"].includes(u)) return "EXPIRADA";
  // Não Emitida EDP = fatura ainda não gerada = calculada
  if (["CALCULADA", "NÃO EMITIDA", "NAO EMITIDA"].includes(u)) return "CALCULADA";
  return u || "—";
}

// ── Status Recebíveis (inclui inglês da SUNNE) ─────────────────
function statusRec(v) {
  const u = String(v || "")
    .trim()
    .toUpperCase();
  const MAP = {
    PAID: "PAGO",
    PAGO: "PAGO",
    PAGA: "PAGO",
    OPEN: "A RECEBER",
    "A VENCER": "A RECEBER",
    "A RECEBER": "A RECEBER",
    PENDENTE: "A RECEBER",
    OVERDUE: "VENCIDO",
    VENCIDO: "VENCIDO",
    VENCIDA: "VENCIDO",
    CANCELLED: "CANCELADA",
    CANCELADO: "CANCELADA",
    CANCELADA: "CANCELADA",
    EXPIRED: "EXPIRADA",
    EXPIRADA: "EXPIRADA",
    EXPIRADO: "EXPIRADA",
    CALCULATED: "CALCULADA",
    CALCULADA: "CALCULADA",
  };
  return MAP[u] || u || "—";
}

function ehDivergente(sp, sr) {
  if (!sp || !sr || sp === "—" || sr === "—") return false;
  const grupos = [
    ["PAGO"],
    ["VENCIDO", "VENCIDA", "OVERDUE"],
    ["A RECEBER", "A VENCER", "OPEN", "PENDENTE"],
    ["CANCELADA", "CANCELLED"],
    ["EXPIRADA", "EXPIRED"],
    ["CALCULADA"],
  ];
  const grpOf = (s) => grupos.findIndex((g) => g.includes(s));
  const ga = grpOf(sp),
    gb = grpOf(sr);
  return ga !== -1 && gb !== -1 && ga !== gb;
}

// ── Extrator Pagadoria ─────────────────────────────────────────
// Aliases em ordem de prioridade por fornecedora:
// _gmap_* = mapeamento manual (prioridade máxima)
// Solatio: 'Instalação (Identificador)', 'Situação do recebimento', 'Mês de referência'
// Northen/Energisa: 'UC', 'Status', 'Mês', 'Valor da Fatura', 'Vencimento Fatura Norten'
// EDP / BackOffice: 'numinstalacao', 'statuspagamentofornecedora', 'valorapagar'
function extrairPag(r) {
  const _is_northen =
    !!r.__ucModeNumCliente ||
    Object.keys(r).some((k) => {
      const kl = k.toLowerCase();
      return kl.includes("norten") || kl.includes("northen");
    });

  const ucRaw = getField(r, [
    "_gmap_instalacao",
    "Número de instalação", // CMU/Solatio — coluna BH (instalação real distribuidora)
    "Numero de instalacao",
    "Numero instalacao",
    "NumeroInstalacao",
    "Instalação (Identificador)", // Solatio Recebimentos (fallback)
    "Instalacao",
    "Instalação",
    "instalacao",
    "instalação",
    "num_instalacao",
    "NumInstalacao",
    "numinstalacao",
    "UC", // Northen/Energisa
  ]);
  const mesRaw = getField(r, [
    "_gmap_mes",
    "Mês de referência", // Solatio
    "Mês",
    "Mes referência",
    "Mes Referencia", // Northen
    "Data Referencia",
    "Data Referência",
    "DataReferencia",
    "mes_referencia",
    "MesReferencia",
    "mesreferencia",
    "DATA DO DOCUMENTO",  // BC Energia (Memória de Cálculo)
    "Data do Documento",
    "DataDocumento",
  ]);
  const cpfRaw = getField(r, [
    "CPF/CNPJ",
    "CPF",
    "CNPJ",
    "cpf",
    "cpf_cliente",
    "documento",
  ]);
  return {
    _is_northen,
    _uc_norm: normUC(ucRaw),
    _mes_norm: normalizarMes(mesRaw),
    _cpf_norm: normUC(cpfRaw),
    _raw: r,
    ucRaw,
    mesRaw,
    cpfRaw,
    idRecebimento: getField(r, [
      "Recebimento (Identificador)", // Solatio
      "ID Recebimento",
      "id_recebimento",
      "IdRecebimento",
      "Nº do documento",
    ]),
    statusRaw: getField(r, [
      "_gmap_status",
      "Situação do recebimento", // Solatio
      "Situacao do recebimento",
      "situacao_recebimento",
      "Status",
      "Status fatura",
      "StatusFatura", // Northen/EDP
      "statuspagamentofornecedora", // BackOffice
      "StatusPagamentoFornecedora",
    ]),
    mesRef: fmtData(mesRaw),
    valor: fmtValor(
      getField(r, [
        "_gmap_valor",
        "Valor total (R$)", // Solatio
        "Valor da Fatura", // Northen
        "Valor fatura",
        "ValorFatura",
        "Valor",
        "valorapagar",
        "valor_liquido_fatura_fornecedora", // BackOffice
        "VALOR DO ITEM/SERVI\u00c7O",  // BC Energia
        "VALOR DA NF-E",             // BC Energia
        "Valor do Item",
        "Valor do Servico",
      ]),
    ),
    valorPago: fmtValor(
      getField(r, [
        "Valor pago pelo cliente (R$)", // Solatio
        "Valor Pago",
        "valor_pago",
        "VALOR RECEBIDO DO ITEM/SERVI\u00c7O", // BC Energia
        "Valor Recebido",
      ]),
    ),
    venc: fmtData(
      getField(r, [
        "Vencimento Fatura Norten", // Northen
        "Data de vencimento", // Solatio
        "Data Vencimento",
        "DataVencimento",
        "dtvencimento",
        "Vencimento fatura",
        "VencimentoFatura",
        "DATA DE VENCIMENTO", // BC Energia
        "Data de Vencimento",
      ]),
    ),
    pagto: fmtData(
      getField(r, [
        "Data de recebimento", // Northen
        "Data de pagamento", // Solatio
        "Data Pagamento",
        "DataPagamento",
        "dtpagamento",
        "Pagto fatura",
        "PagtoFatura",
      ]),
    ),
    codBar: getBarcodeField(r, [
      "Linha Digitável",   // EDP
      "Linha Digitavel",
      "Código de barras",
      "Codigo de barras",
      "CodigoBarras",
      "codigobarra",
      "Codigo Barra Boleto",
    ]),
    linkBoleto: getField(r, [
      "Link de pagamento", // Solatio
      "Arquivo do recebimento", // Solatio
      "Link Boleto",
      "link_boleto",
      "Url Boleto",
      "url_boleto",
      "URL Boleto", // BackOffice
    ]),
    favorecido: getField(r, ["Favorecido", "nome_cliente", "Nome", "Cliente", "NOME DO CLIENTE/FORNECEDOR"]),
    consorciado: getField(r, [
      "Consorciado",
      "nome_cliente",
      "Nome",
      "Cliente",
      "NOME DO CLIENTE/FORNECEDOR",
    ]),
    nomeCliente: getField(r, [
      "Nome do Cliente",
      "Nome Cliente",
      "NomeCliente",
      "nome_cliente",
      "Nome",
      "Cliente",
      "Favorecido",
      "Consorciado",
      "NOME DO CLIENTE/FORNECEDOR", // BC Energia
    ]),
    dataEmissao: fmtData(
      getField(r, [
        "Data de emissão - Fatura Norten",
        "Data de Emissão",
        "Data Emissão",
        "DataEmissao",
        "data_emissao",
        "Data Emissao",
      ]),
    ),
    distribuidora: getField(r, [
      "Distribuidora",
      "distribuidora",
      "DISTRIBUIDORA",
      "EMPRESA DO FATURAMENTO", // BC Energia
      "Empresa do Faturamento",
    ]),
    energiaCompensada: getField(r, [
      "Energia Compensada",
      "Energia compensada",
      "EnergiaCompensada",
      "energia_compensada",
    ]),
    repasseDistribuidora: getField(r, [
      "Repasse Distribuidora",
      "Repasse distribuidora",
      "RepasseDistribuidora",
      "repasse_distribuidora",
      "Repasse",
    ]),
  };
}

// ── Detecção de Provider da Pagadoria ───────────────────────────
// Inspeciona os cabeçalhos da planilha para identificar qual
// fornecedora/distribuidora originou a pagadoria.
function detectProvider(dfPag) {
  if (!dfPag || !dfPag.length) return 'outros'
  const allKeys = Object.keys(dfPag[0]).map(k => k.toLowerCase())
  const hasKey  = (...terms) => terms.some(t => allKeys.some(k => k.includes(t)))

  // Northen/Energisa: tem colunas com "norten" ou "northen", e não tem "edp"
  if (hasKey('norten', 'northen') && !hasKey('cobranca', 'cob.')) return 'northen'

  // GV-Interno: tem "distribuidora" mas não tem "norten"
  // Tipicamente tem coluna de "Distribuidora" e "Repasse Distribuidora"
  if (hasKey('repasse distribuidora', 'repasse_distribuidora')) return 'gv_interno'

  // Fornecedoras menores: detecta pelo valor nos campos Fornecedora/Distribuidora
  const amostra = dfPag.slice(0, 20)
  const fornVals = amostra.map(r => {
    const v = getField(r, [
      'Fornecedora', 'fornecedora', 'cfornecedora',
      'Distribuidora', 'distribuidora',
      'Organização', 'Organizacao', 'organizacao',
      '_gmap_distribuidora',
    ])
    return String(v || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim()
  }).filter(v => v.length > 0 && v.length < 60)

  const inForn = (term) => fornVals.some(v => v.includes(term))

  if (inForn('comerc')) return 'comerc'
  if (inForn('bom futuro') || inForn('bomfuturo')) return 'bom_futuro'
  if (inForn('sunclick')) return 'sunclick'

  return 'outros'
}

// ── Normalização de Região do Fornecedor (Rec) ─────────────────
function normRegiao(v) {
  const s = String(v || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim()
  if (s.includes('northen') || s.includes('norten') || s.includes('energisa')) return 'northen'
  if (s.includes('gv') || s.includes('consorcio') || s.includes('interno')) return 'gv_interno'
  if (s === 'comerc' || s.startsWith('comerc ') || s.endsWith(' comerc')) return 'comerc'
  if (s.includes('bom futuro') || s === 'bomfuturo') return 'bom_futuro'
  if (s.includes('sunclick')) return 'sunclick'
  return null
}

// ── Extrator Recebíveis ────────────────────────────────────────
// CMU BackOffice iGreen (todas as fornecedoras)
function extrairRec(r) {
  const ucRaw = getField(r, [
    "_gmap_instalacao",
    "Instalacao",
    "Instalação",
    "instalacao",
    "instalação",
    "Instalação (Identificador)",
    "num_instalacao",
    "NumInstalacao",
    "numinstalacao",
    "UC",
  ]);
  const ncRaw = getField(r, [
    "Numero Cliente",
    "NumeroCliente",
    "numero_cliente",
    "Nº Cliente",
  ]);
  const cpfRaw = getField(r, [
    "Cpf",
    "CPF",
    "cpf",
    "cpf_cliente",
    "CPF/CNPJ",
    "documento",
  ]);
  const mesRaw = getField(r, [
    "Data Referencia",
    "Data Referência",
    "DataReferencia",
    "mesreferencia",
    "mes_referencia",
    "Mês de referência",
  ]);
  return {
    _uc_norm: normUC(ucRaw) || normUC(ncRaw),
    _num_cliente_norm: normUC(ncRaw),
    _cpf_norm: normUC(cpfRaw),
    _mes_norm: normalizarMes(mesRaw),
    _raw: r,
    ucRaw: ucRaw || ncRaw,
    mesRaw,
    cpfRaw,
    idRcb: getField(r, [
      "Idrcb",
      "idrcb",
      "id_rcb",
      "Recebimento (Identificador)",
      "ID Recebimento",
    ]),
    codCliente: getField(r, [
      "Codigo Cliente",
      "codigo cliente",
      "cod_cliente",
      "codcliente",
      "Código Cliente",
      "codigo_cliente",
    ]),
    numCliente: ncRaw,
    mesRef: fmtData(mesRaw),
    valor: fmtValor(
      getField(r, [
        "Valor A Pagar",
        "ValorAPagar",
        "Valor a Pagar",
        "valorapagar",
        "valor_liquido_fatura_fornecedora",
        "valor_liquido",
        "Valor total (R$)",
        "Valor",
      ]),
    ),
    venc: fmtData(
      getField(r, [
        "Data Vencimento",
        "DataVencimento",
        "dtvencimento",
        "Vencimento fatura",
        "VencimentoFatura",
        "Data de vencimento",
      ]),
    ),
    pagto: fmtData(
      getField(r, [
        "Data Pagamento",
        "DataPagamento",
        "dtpagamento",
        "Pagto fatura",
        "PagtoFatura",
        "Data de pagamento",
      ]),
    ),
    codBar: getBarcodeField(r, [
      "Codigo Barra Boleto",
      "CodigoBarraBoleto",
      "Linha Digitavel",
      "codigobarra",
      "Código de barras",
      "Codigo de barras",
    ]),
    statusRaw: getField(r, [
      "_gmap_status",
      "Status Financeiro Cliente",
      "StatusFinanceiroCliente",
      "Status",
      "status",
      "StatusFatura",
      "Status fatura",
      "statuspagamentofornecedora",
      "StatusPagamentoFornecedora",
      "Situação do recebimento",
      "situacao_recebimento",
    ]),
    statusFin: getField(r, [
      "Status Financeiro Cliente",
      "StatusFinanceiroCliente",
    ]),
    cliente: getField(r, [
      "Cliente",
      "nome_cliente",
      "Nome",
      "Favorecido",
      "Consorciado",
    ]),
    fornecedora: getField(r, [
      "Fornecedora",
      "fornecedora",
      "cfornecedora",
      "Organização",
    ]),
    linkBoleto: getField(r, [
      "Url Boleto",
      "URL Boleto",
      "url_boleto",
      "Link de pagamento",
      "Arquivo do recebimento",
      "link_boleto",
      "Link Boleto",
      "linkboleto",
    ]),
    concessionaria: getField(r, [
      "Concessionaria",
      "concessionaria",
      "Concessionária",
      "Distribuidora",
      "distribuidora",
    ]),
    _regiao_rec: normRegiao(
      getField(r, ['Fornecedora', 'cfornecedora', 'fornecedora', 'Organização', 'Organizacao', 'Distribuidora'])
    ),
  };
}

// ── Cascading Join ─────────────────────────────────────────────
// Quando há múltiplos candidatos REC para a mesma chave UC|Mês,
// aplica desambiguação em 3 níveis antes do fallback:
//   1. CPF exato (PAG._cpf_norm === REC._cpf_norm)
//   2. Nome normalizado (PAG.consorciado/favorecido === REC.cliente)
//   3. Distribuidora/Concessionária (PAG.distribuidora ≈ REC.concessionaria)
// Isso resolve o caso de duas instalações com o mesmo número em distribuidoras distintas.
function cascadeJoin(pagRows, recRows, pagKey, recKey, etapa, onLog) {
  const idxRec = {};
  recRows.forEach((r, i) => {
    const k = (r[recKey] || "") + "|" + (r._mes_norm || "");
    if (!idxRec[k]) idxRec[k] = [];
    idxRec[k].push({ row: r, i });
  });
  const pagOrfaos = [],
    recUsados = new Set(),
    matches = [];

  const normStr = (s) =>
    String(s || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]/g, '')
      .trim();

  pagRows.forEach((rP) => {
    const k = (rP[pagKey] || "") + "|" + (rP._mes_norm || "");
    const cands = idxRec[k] || [];
    if (!cands.length) {
      pagOrfaos.push(rP);
      return;
    }
    const available = cands.filter((c) => !recUsados.has(c.i));
    if (!available.length) {
      pagOrfaos.push(rP);
      return;
    }

    let cand;

    if (available.length === 1) {
      // Caso simples: apenas um candidato disponível
      cand = available[0];
    } else {
      // ── Tiebreaker 1: CPF exato ──────────────────────────────
      const cpfPag = rP._cpf_norm;
      if (cpfPag) {
        cand = available.find(c => c.row._cpf_norm === cpfPag);
      }

      // ── Tiebreaker 2: nome normalizado do cliente ─────────────
      if (!cand) {
        const nomePag = normStr(rP.consorciado || rP.favorecido || rP.nomeCliente || '');
        if (nomePag) {
          cand = available.find(c => {
            const nomeRec = normStr(c.row.cliente || '');
            return nomeRec && nomeRec === nomePag;
          });
        }
      }

      // ── Tiebreaker 3: distribuidora/concessionária ────────────
      // Compara PAG.distribuidora (ex: "EDP ES") com REC.concessionaria (ex: "EDP")
      // Se pelo menos parte do nome bate, prefere esse candidato
      if (!cand) {
        const distPag = normStr(rP.distribuidora || '');
        if (distPag) {
          cand = available.find(c => {
            const concRec = normStr(c.row.concessionaria || '');
            // bate se um contém o outro ("edp" ⊂ "edpes" ou "edpes" ⊃ "edp")
            return concRec && (distPag.includes(concRec) || concRec.includes(distPag));
          });
        }
      }

      // ── Fallback: primeiro disponível ─────────────────────────
      if (!cand) cand = available[0];
    }

    recUsados.add(cand.i);
    matches.push({ pag: rP, rec: cand.row, etapa });
  });
  const recOrfaos = recRows.filter((_, i) => !recUsados.has(i));
  onLog &&
    onLog(
      `Etapa ${etapa} (${pagKey}×${recKey}): ${matches.length} matches | ${pagOrfaos.length} órfãos Pag | ${recOrfaos.length} órfãos Rec`,
    );
  return { matches, pagOrfaos, recOrfaos };
}

function buildRow(pag, rec) {
  return {
    "UC (Pagadoria)": pag.ucRaw,
    "UC (Recebíveis)": rec.ucRaw,
    "ID Recebimento": pag.idRecebimento || rec.idRcb || "—",
    "Cód. Cliente": rec.codCliente || "—",
    "Nº Cliente": rec.numCliente || "—",
    CPF: pag.cpfRaw || rec.cpfRaw || "—",
    Cliente: rec.cliente || pag.favorecido || "—",
    Fornecedora: rec.fornecedora || "—",
    "Mês Referência": pag._mes_norm || "—",
    "Mês Pag. (original)": pag.mesRef || "—",
    "Mês Rec. (original)": rec.mesRef || "—",
    "Status Pagadoria": pag.statusRaw || "—",
    "Status Recebíveis": rec.statusRaw || "—",
    "Status Fin. Rec.": rec.statusFin || "—",
    "Valor Pagadoria": pag.valor || "—",
    "Valor Recebíveis": rec.valor || "—",
    "Vencimento Pag.": pag.venc || "—",
    "Data Pagamento Pag.": pag.pagto || "—",
    "Data Pagamento Rec.": rec.pagto || "—",
    "Link Boleto": pag.linkBoleto || rec.linkBoleto || "—",
    "Cód. Barras Pag.": pag.codBar || "—",
    "Cód. Barras Rec.": rec.codBar || "—",
    _rawPag: pag._raw || null,
    _rawRec: rec._raw || null,
  };
}

// ── Northen: row builders ──────────────────────────────────────
function buildRowNorthen(pag, rec) {
  return {
    "Código do Cliente": rec.codCliente || "—",
    UC: pag.ucRaw || "—",
    Cliente: pag.nomeCliente || pag.favorecido || rec.cliente || "—",
    "Mês Ref.": pag._mes_norm || "—",
    "Status Pagadoria": pag.statusRaw || "—",
    "Status Recebíveis": rec.statusRaw || "—",
    "Valor da Fatura": pag.valor || "—",
    "Data de Emissão - Fatura Norten": pag.dataEmissao || "—",
    "Data de Recebimento": pag.pagto || "—",
    "Vencimento Fatura Norten": pag.venc || "—",
    Distribuidora: pag.distribuidora || "—",
    "Energia Compensada": pag.energiaCompensada || "—",
    "Repasse Distribuidora": pag.repasseDistribuidora || "—",
    _rawPag: pag._raw || null,
    _rawRec: rec._raw || null,
  };
}

function buildRowNorthenSemMatch(pag) {
  return {
    "Código do Cliente": "—",
    UC: pag.ucRaw || "—",
    Cliente: pag.nomeCliente || pag.favorecido || "—",
    "Mês Ref.": pag._mes_norm || "—",
    "Status Pagadoria": pag.statusRaw || "—",
    "Status Recebíveis": "—",
    "Valor da Fatura": pag.valor || "—",
    "Data de Emissão - Fatura Norten": pag.dataEmissao || "—",
    "Data de Recebimento": pag.pagto || "—",
    "Vencimento Fatura Norten": pag.venc || "—",
    Distribuidora: pag.distribuidora || "—",
    "Energia Compensada": pag.energiaCompensada || "—",
    "Repasse Distribuidora": pag.repasseDistribuidora || "—",
    _rawPag: pag._raw || null,
  };
}

// ── Normalização de nome (para lookup BKO por nome)
// Sem acento, maiúsculo, apenas letras/números/espaço
const normName = (s) =>
  String(s || '')
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

// ── Northen: processamento dedicado ───────────────────────────
// Chave primária: normUC(UC_pag) === normUC(NumeroCliente_rec) + mesmo mês
// "Incluir e dar Baixa": Pag = PAGO e Rec != PAGO
// bkoByUC / bkoByName: índices pré-construídos do BKO (Clientes GV) para
// separar órfãos "só no BKO" dos que realmente não existem.
function processarNorthen(rowsPagNorthen, rowsRec, onLog, bkoByUC = {}, bkoByName = {}) {
  const log = (msg) => onLog && onLog(msg);
  if (!rowsPagNorthen.length)
    return {
      naoExiste: [],
      existeNoBKO: [],
      ucDivergente: [],
      existeEmAmbas: [],
      incluirBaixa: [],
      matchPairs: [],
      pagOrfaos: [],
      recConsumidos: new Set(),
    };

  const idxRec = {};
  rowsRec.forEach((r) => {
    const k = (r._num_cliente_norm || "") + "|" + (r._mes_norm || "");
    if (!idxRec[k]) idxRec[k] = [];
    idxRec[k].push(r);
  });

  const recConsumidos = new Set();
  const naoExiste     = [];
  const existeNoBKO   = [];
  const ucDivergente  = []; // nome bate no BKO mas UC enviada pelo fornecedor não corresponde
  const existeEmAmbas = [];
  const incluirBaixa  = [];
  const matchPairs    = [];
  const pagOrfaos     = [];

  rowsPagNorthen.forEach((rP) => {
    const k = (rP._uc_norm || "") + "|" + (rP._mes_norm || "");
    const cand = (idxRec[k] || []).find((r) => !recConsumidos.has(r));

    if (!cand) {
      // Sem match em REC — classificar pelo BKO
      const nomePag = normName(rP.nomeCliente || rP.favorecido || '');
      const bkoUC   = bkoByUC[rP._uc_norm];
      const bkoNome = !bkoUC && nomePag ? bkoByName[nomePag] : null;

      if (bkoUC) {
        // UC da pagadoria encontrada no BKO → cliente cadastrado, boleto ainda não gerado
        existeNoBKO.push({
          ...buildRowNorthenSemMatch(rP),
          'Código do Cliente (BKO)': getField(bkoUC, ['Codigo', 'codigo', 'Código']) || '—',
          'Status BKO': getField(bkoUC, ['Status', 'status', 'Jornada Status', 'Status Financeiro']) || '—',
          'Motivo': 'Cliente cadastrado no BKO — boleto ainda não gerado nos Recebíveis',
        });
      } else if (bkoNome) {
        // Nome encontrado no BKO mas UC enviada não corresponde → divergência de UC
        ucDivergente.push({
          ...buildRowNorthenSemMatch(rP),
          'Nome (BKO)': getField(bkoNome, ['Nome', 'Cliente', 'nome_cliente']) || '—',
          'UC Correta (BKO — Instalação)': getField(bkoNome, ['Instalacao', 'Instalação', 'instalacao']) || '—',
          'Nº Cliente (BKO)': getField(bkoNome, ['Numero Cliente', 'NumeroCliente', 'numero_cliente']) || '—',
          'Código do Cliente (BKO)': getField(bkoNome, ['Codigo', 'codigo', 'Código']) || '—',
          'Motivo': 'Nome encontrado no BKO mas UC/Nº Cliente divergente — verificar UC enviada pelo fornecedor',
        });
      } else {
        naoExiste.push(buildRowNorthenSemMatch(rP));
      }
      pagOrfaos.push(rP);
      return;
    }

    recConsumidos.add(cand);
    const row = buildRowNorthen(rP, cand);
    existeEmAmbas.push(row);
    matchPairs.push({ pag: rP, rec: cand, etapa: "N" });

    const sp = statusPag(rP.statusRaw);
    const sr = statusRec(cand.statusRaw);
    if (sp === "PAGO" && sr !== "PAGO") incluirBaixa.push(row);
  });

  log(
    `[Northen] Não existe (REC+BKO): ${naoExiste.length} | Só no BKO: ${existeNoBKO.length} | UC Divergente: ${ucDivergente.length} | Existe em Ambas: ${existeEmAmbas.length} | Incluir/Baixa: ${incluirBaixa.length}`,
    "ok",
  );
  return {
    naoExiste,
    existeNoBKO,
    ucDivergente,
    existeEmAmbas,
    incluirBaixa,
    matchPairs,
    pagOrfaos,
    recConsumidos,
  };
}

// ── Extrator Clientes GV BackOffice ───────────────────────────
// Usado para enriquecer o join quando a instalação da PAG
// está atualizada mas o REC ainda usa a numeração antiga.
// Clientes GV serve como ponte: PAG.Num_Inst → CLI.Instalacao → CLI.NC → REC
function indexarCli(dfCli) {
  if (!dfCli || !dfCli.length) return { byInst: {}, byNc: {}, byNovaInst: {} };
  const byInst     = {};
  const byNc       = {};
  const byNovaInst = {}; // PAG tem a nova instalação, REC ainda tem a antiga
  dfCli.forEach((r) => {
    const inst = normUC(getField(r, ["Instalacao", "Instalação", "instalacao"]));
    const nc   = normUC(getField(r, ["Numero Cliente", "NumeroCliente", "numero_cliente"]));
    const nova = normUC(getField(r, ["Nova Instalacao", "NovaInstalacao", "nova_instalacao"]));
    const cod  = getField(r, ["Codigo", "codigo", "Código"]);
    const nome = getField(r, ["Nome", "Cliente", "nome_cliente"]);
    const payload = { inst, nc, nova, cod, nome };
    if (inst && !byInst[inst])         byInst[inst]         = payload;
    if (nc   && !byNc[nc])             byNc[nc]             = payload;
    // Caso inverso: PAG já tem a nova numeração, REC ainda usa a antiga
    // byNovaInst[nova] → payload (com inst = chave antiga para buscar no REC)
    if (nova && !byNovaInst[nova])     byNovaInst[nova]     = payload;
  });
  return { byInst, byNc, byNovaInst };
}

// ── Função principal ───────────────────────────────────────────
export function fatCruzar(dfPag, dfRec, onLog, dfCli = null) {
  const log = (msg, tipo = "info") => onLog && onLog(msg, tipo);

  log(
    `Pagadoria: ${dfPag.length.toLocaleString("pt-BR")} | Recebíveis: ${dfRec.length.toLocaleString("pt-BR")}`,
  );

  const getPagPriority = (st) => {
    st = (st || "").toUpperCase().trim();
    if (st === "PAGO") return 0;
    if (st === "A RECEBER" || st === "PENDENTE" || st === "REGULAR") return 1;
    if (st === "VENCIDO") return 2;
    return 3;
  };

  const getRecPriority = (st) => {
    st = (st || "").toUpperCase().trim();
    if (st === "PAGO") return 0;
    if (st === "A RECEBER" || st === "OPEN" || st === "PENDENTE") return 1;
    if (st === "VENCIDO" || st === "OVERDUE") return 2;
    return 3;
  };

  const rowsPag = dfPag
    .map(extrairPag)
    .filter((r) => r._uc_norm && r._mes_norm)
    .sort((a, b) => getPagPriority(a.statusRaw) - getPagPriority(b.statusRaw));

  const rowsRec = dfRec
    .map(extrairRec)
    .filter((r) => r._uc_norm && r._mes_norm)
    .sort((a, b) => getRecPriority(a.statusRaw) - getRecPriority(b.statusRaw));

  log(
    `Pag sem mês normalizável: ${dfPag.length - rowsPag.length} | Rec: ${dfRec.length - rowsRec.length}`,
    "warn",
  );
  if (rowsPag[0])
    log(`Mês Pag: "${rowsPag[0].mesRaw}" → "${rowsPag[0]._mes_norm}"`);
  if (rowsRec[0])
    log(`Mês Rec: "${rowsRec[0].mesRaw}" → "${rowsRec[0]._mes_norm}"`);

  const rowsPagNorthen = rowsPag.filter((r) => r._is_northen);
  const rowsPagOthers  = rowsPag.filter((r) => !r._is_northen);
  const providerDetectado = detectProvider(dfPag);
  log(
    `Provider detectado: ${providerDetectado} | Northen: ${rowsPagNorthen.length} | Outros: ${rowsPagOthers.length}`,
  );

  // Filtrar Rec por região da pagadoria carregada
  let rowsRecFiltrados = rowsRec;
  let totalRecIgnorado = 0;
  if (providerDetectado === 'northen') {
    // PAG Northen: cruzar apenas com Rec de Northen/Energisa
    const comRegiao = rowsRec.filter(r => r._regiao_rec === 'northen');
    // Se nenhum Rec tiver região marcada (campo ausente), usa todos para não perder dados
    if (comRegiao.length > 0) {
      totalRecIgnorado = rowsRec.length - comRegiao.length;
      rowsRecFiltrados = comRegiao;
      log(`[Região] Northen detectada — Rec filtrados: ${comRegiao.length} (ignorados: ${totalRecIgnorado})`, 'ok');
    } else {
      log(`[Região] Northen detectada — campo Fornecedora sem região nos Rec, usando todos`, 'warn');
    }
  } else if (providerDetectado === 'gv_interno') {
    const comRegiao = rowsRec.filter(r => r._regiao_rec === 'gv_interno' || r._regiao_rec === null);
    const soNorthen = rowsRec.filter(r => r._regiao_rec === 'northen');
    if (soNorthen.length > 0) {
      totalRecIgnorado = soNorthen.length;
      rowsRecFiltrados = comRegiao;
      log(`[Região] GV-Interno detectado — excluídos ${soNorthen.length} Rec Northen`, 'ok');
    }
  } else if (['comerc', 'bom_futuro', 'sunclick'].includes(providerDetectado)) {
    // Fornecedoras menores: filtrar Rec para apenas registros desta fornecedora (ou sem região definida)
    const comRegiao = rowsRec.filter(r => r._regiao_rec === providerDetectado || r._regiao_rec === null);
    const outras    = rowsRec.filter(r => r._regiao_rec !== null && r._regiao_rec !== providerDetectado);
    if (outras.length > 0) {
      totalRecIgnorado = outras.length;
      rowsRecFiltrados = comRegiao;
      log(`[Região] ${providerDetectado} detectado — Rec filtrados: ${comRegiao.length} (ignorados: ${totalRecIgnorado})`, 'ok');
    } else {
      log(`[Região] ${providerDetectado} detectado — sem filtro regional necessário, usando todos`, 'warn');
    }
  }

  // ── Índice BKO (Clientes GV) para validação de órfãos ──────────────────
  // Construído UMA vez aqui e reutilizado tanto pelo Northen quanto pelo
  // faltaRec geral (todas as fornecedoras).
  const bkoByUC   = {};
  const bkoByName = {};
  if (dfCli && dfCli.length) {
    dfCli.forEach((r) => {
      const inst = normUC(getField(r, ['Instalacao', 'Instalação', 'instalacao']));
      const nc   = normUC(getField(r, ['Numero Cliente', 'NumeroCliente', 'numero_cliente', 'Numero_Cliente']));
      const nova = normUC(getField(r, ['Nova Instalacao', 'NovaInstalacao', 'nova_instalacao']));
      const nome = normName(getField(r, ['Nome', 'Cliente', 'nome_cliente']));
      if (inst) bkoByUC[inst]   = r;
      if (nc)   bkoByUC[nc]     = r;
      if (nova) bkoByUC[nova]   = r;
      if (nome && !bkoByName[nome]) bkoByName[nome] = r;
    });
    log(`[BKO] Índice Clientes GV: ${Object.keys(bkoByUC).length} UCs | ${Object.keys(bkoByName).length} nomes`);
  }

  // Northen: processamento dedicado UC × NumeroCliente, com output próprio
  // Passa bkoByUC/bkoByName para validar órfãos antes de marcar como "Não em Rec"
  const northen = processarNorthen(rowsPagNorthen, rowsRec, (msg, tipo) =>
    log(msg, tipo),
  bkoByUC, bkoByName);

  // Cascata padrão — Rec já consumidos pelo Northen ficam fora
  const rowsRecDisponiveis = rowsRecFiltrados.filter(
    (r) => !northen.recConsumidos.has(r),
  );

  // Cascata geral — Northen fica somente nos tabs dedicados
  const matchesTotais = [];
  const e1 = cascadeJoin(
    rowsPagOthers,
    rowsRecDisponiveis,
    "_uc_norm",
    "_uc_norm",
    1,
    (msg) => log(msg),
  );
  matchesTotais.push(...e1.matches);
  const e2 = cascadeJoin(
    e1.pagOrfaos,
    e1.recOrfaos,
    "_uc_norm",
    "_num_cliente_norm",
    2,
    (msg) => log(msg),
  );
  matchesTotais.push(...e2.matches);
  const e3 = cascadeJoin(
    e2.pagOrfaos,
    e2.recOrfaos,
    "_cpf_norm",
    "_cpf_norm",
    3,
    (msg) => log(msg),
  );
  matchesTotais.push(...e3.matches);

  // ── Etapa E-CLI: enriquecimento via Clientes GV ──────────────
  // Quando PAG tem instalação nova (coluna BH) mas REC ainda usa
  // a numeração antiga, o Clientes GV serve de ponte:
  //   PAG._uc_norm → CLI.inst → CLI.nc → REC._num_cliente_norm
  let pagOrfaosFinais = e3.pagOrfaos;
  let recOrfaosFinais = e3.recOrfaos;
  let matchesCli = 0;

  if (dfCli && dfCli.length) {
    const cli = indexarCli(dfCli);
    log(`[CLI] Clientes GV carregados: ${Object.keys(cli.byInst).length} por Instalação, ${Object.keys(cli.byNc).length} por Nº Cliente`);

    // Re-indexar orphans REC por NC e UC
    const idxRecOrfNc = {};
    const idxRecOrfUc = {};
    e3.recOrfaos.forEach((r, i) => {
      const kNc = (r._num_cliente_norm || "") + "|" + (r._mes_norm || "");
      const kUc = (r._uc_norm || "")         + "|" + (r._mes_norm || "");
      if (!idxRecOrfNc[kNc]) idxRecOrfNc[kNc] = [];
      if (!idxRecOrfUc[kUc]) idxRecOrfUc[kUc] = [];
      idxRecOrfNc[kNc].push({ row: r, i });
      idxRecOrfUc[kUc].push({ row: r, i });
    });

    const recUsadosCli = new Set();
    const pagOrfaosCli = [];

    e3.pagOrfaos.forEach((rP) => {
      const uc  = rP._uc_norm;
      const mes = rP._mes_norm;

      // Caso 1 (normal): PAG tem a instalação antiga, CLI.inst = uc
      // Caso 2 (inverso): PAG já tem a nova instalação (coluna BH), CLI.nova = uc
      const cliRow = cli.byInst[uc] || cli.byNc[uc] || cli.byNovaInst[uc];
      if (!cliRow) { pagOrfaosCli.push(rP); return; }

      // Para caso 1: busca no REC por CLI.nc ou CLI.nova
      // Para caso 2 (byNovaInst): busca no REC por CLI.inst (a antiga que o REC ainda usa)
      const isInverso = !cli.byInst[uc] && !cli.byNc[uc] && !!cli.byNovaInst[uc];

      let chaves;
      if (isInverso) {
        // PAG tem nova → REC usa antiga → busca por CLI.inst no REC
        chaves = [
          cliRow.inst ? cliRow.inst + "|" + mes : null,
          cliRow.nc   ? cliRow.nc   + "|" + mes : null,
        ];
      } else {
        // PAG tem antiga → REC pode ter nova ou NC
        chaves = [
          cliRow.nc   ? cliRow.nc   + "|" + mes : null,
          cliRow.nova ? cliRow.nova + "|" + mes : null,
          cliRow.inst ? cliRow.inst + "|" + mes : null,
        ];
      }

      // Tenta encontrar no REC
      let cand = null;
      for (const chave of chaves) {
        if (!chave) continue;
        const arr = [...(idxRecOrfNc[chave] || []), ...(idxRecOrfUc[chave] || [])];
        cand = arr.find((c) => !recUsadosCli.has(c.i));
        if (cand) break;
      }

      if (!cand) { pagOrfaosCli.push(rP); return; }
      recUsadosCli.add(cand.i);
      const enriquecida = { ...rP, _via_cli: true, _via_cli_inverso: isInverso, _cli_nc: cliRow.nc, _cli_nome: cliRow.nome, _cli_inst_antiga: cliRow.inst };
      matchesTotais.push({ pag: enriquecida, rec: cand.row, etapa: "CLI" });
      matchesCli++;
    });

    pagOrfaosFinais = pagOrfaosCli;
    recOrfaosFinais = e3.recOrfaos.filter((_, i) => !recUsadosCli.has(i));
    log(`[CLI] Matches adicionais via enriquecimento: ${matchesCli}`, "ok");
  }

  log(
    `Total: ${matchesTotais.length} matches (${matchesCli} via CLI) | Falta Rec: ${pagOrfaosFinais.length} | Falta Pag: ${recOrfaosFinais.length}`,
    "ok",
  );

  // Índices por UC (sem mês) para diagnóstico
  const idxRecPorUC = {};
  rowsRec.forEach((r) => {
    if (!r._uc_norm) return;
    (idxRecPorUC[r._uc_norm] = idxRecPorUC[r._uc_norm] || []).push(r);
    if (r._num_cliente_norm && r._num_cliente_norm !== r._uc_norm)
      (idxRecPorUC[r._num_cliente_norm] =
        idxRecPorUC[r._num_cliente_norm] || []).push(r);
  });
  const idxPagPorUC = {};
  rowsPag.forEach((r) => {
    if (!r._uc_norm) return;
    (idxPagPorUC[r._uc_norm] = idxPagPorUC[r._uc_norm] || []).push(r);
  });

  // Índice secundário Recebíveis por Numero Cliente (para link do boleto)
  const idxRecNC = {};
  dfRec.forEach((r) => {
    const nc = getField(r, [
      "Numero Cliente",
      "NumeroCliente",
      "numero_cliente",
    ]);
    const k = normUC(nc);
    if (k)
      (idxRecNC[k] = idxRecNC[k] || []).push({
        linkBoleto: getField(r, [
          "Url Boleto",
          "url_boleto",
          "URL Boleto",
          "Url Demonstrativo",
        ]),
        cpf: getField(r, ["Cpf", "CPF", "cpf"]),
      });
  });

  // Classificar matches
  const divergentes = [],
    coincidentes = [],
    divergenciasCod = [],
    semPagtoValor = [];
  const vazio = (v) => !v || v === "—" || String(v).trim() === "";

  const normCod = (s) => String(s || "").replace(/\D/g, "");

  matchesTotais.forEach(({ pag, rec, etapa }) => {
    const sp = statusPag(pag.statusRaw);
    const sr = statusRec(rec.statusRaw);
    const row = buildRow(pag, rec);
    if (ehDivergente(sp, sr)) divergentes.push({
      ...row,
      "Status PAG (norm.)": sp,
      "Status REC (norm.)": sr,
    });
    else coincidentes.push(row);

    // Divergência cód. barras — só compara etapa 1 (UC × UC, mesmo cliente)
    // Etapas 2/3 cruzam por NumeroCliente ou CPF — pares de clientes diferentes, barcode não é comparável
    const cbP = normCod(pag.codBar);
    const cbR = normCod(rec.codBar);
    if (etapa === 1 && cbP.length >= 20 && cbR.length >= 20 && cbP !== cbR) {
      divergenciasCod.push({
        "UC (Pagadoria)": pag.ucRaw,
        "UC (Recebíveis)": rec.ucRaw,
        "ID Recebimento": pag.idRecebimento || rec.idRcb || "—",
        Cliente: rec.cliente || pag.favorecido || "—",
        CPF: pag.cpfRaw || rec.cpfRaw || "—",
        "Mês Referência": pag._mes_norm || "—",
        "Status Pagadoria": pag.statusRaw || "—",
        "Status Recebíveis": rec.statusRaw || "—",
        "Cód. Barras Pag.": pag.codBar || "—",
        "Cód. Barras Rec.": rec.codBar || "—",
        "Link Boleto Pag.": pag.linkBoleto || "—",
        "Link Boleto Rec.": rec.linkBoleto || "—",
        "Valor Pagadoria": pag.valor || "—",
        "Valor Recebíveis": rec.valor || "—",
        _rawPag: pag._raw || null,
        _rawRec: rec._raw || null,
      });
    }

    // Sem data de pagamento E sem valor na Pagadoria
    if (vazio(pag.pagto) && vazio(pag.valor)) {
      semPagtoValor.push({
        "UC (Pagadoria)": pag.ucRaw,
        "UC (Recebíveis)": rec.ucRaw,
        "ID Recebimento": pag.idRecebimento || rec.idRcb || "—",
        "Cód. Cliente": rec.codCliente || "—",
        "Nº Cliente": rec.numCliente || "—",
        CPF: pag.cpfRaw || rec.cpfRaw || "—",
        Cliente: rec.cliente || pag.favorecido || "—",
        Fornecedora: rec.fornecedora || "—",
        "Mês Referência": pag._mes_norm || "—",
        "Status Pagadoria": pag.statusRaw || "—",
        "Status Recebíveis": rec.statusRaw || "—",
        "Valor Pagadoria": pag.valor || "—",
        "Valor Recebíveis": rec.valor || "—",
        "Vencimento Pag.": pag.venc || "—",
        "Data Pagamento Pag.": pag.pagto || "—",
        "Data Pagamento Rec.": rec.pagto || "—",
        _rawPag: pag._raw || null,
        _rawRec: rec._raw || null,
      });
    }
  });

  log(
    `Divergência Cód.: ${divergenciasCod.length} | Sem Pagto/Valor: ${semPagtoValor.length}`,
    "warn",
  );

  // Duplicidades — linhas com fingerprint idêntico na Pagadoria (ignora campos internos _gmap_* e __)
  const fpMap = {};
  dfPag.forEach((row, i) => {
    const fp = Object.entries(row)
      .filter(([k]) => !k.startsWith("_") && !k.startsWith("__"))
      .map(([, v]) =>
        String(v || "")
          .trim()
          .toLowerCase(),
      )
      .join("||");
    (fpMap[fp] = fpMap[fp] || []).push(i);
  });
  const dupIdx = new Set();
  Object.values(fpMap).forEach((arr) => {
    if (arr.length > 1) arr.forEach((i) => dupIdx.add(i));
  });
  const duplicidadesPag = [];
  dfPag.forEach((row, i) => {
    if (!dupIdx.has(i)) return;
    duplicidadesPag.push({
      "[PAG] UC": getField(row, [
        "_gmap_instalacao",
        "Instalação (Identificador)",
        "UC",
        "Instalacao",
        "Instalação",
        "instalacao",
      ]),
      "[PAG] ID Recebimento": getField(row, [
        "Recebimento (Identificador)",
        "ID Recebimento",
        "id_recebimento",
        "Nº do documento",
      ]),
      "[PAG] Cliente": getField(row, [
        "Favorecido",
        "Nome",
        "nome_cliente",
        "Cliente",
        "Consorciado",
      ]),
      "[PAG] CPF/CNPJ": getField(row, [
        "CPF/CNPJ",
        "CPF",
        "CNPJ",
        "cpf",
        "cpf_cliente",
        "documento",
      ]),
      "[PAG] Mês Referência": fmtData(
        getField(row, [
          "_gmap_mes",
          "Mês de referência",
          "Mês",
          "Mes referência",
          "Mes Referencia",
          "Data Referencia",
          "mes_referencia",
        ]),
      ),
      "[PAG] Status": getField(row, [
        "_gmap_status",
        "Situação do recebimento",
        "Status",
        "Status fatura",
        "statuspagamentofornecedora",
      ]),
      "[PAG] Valor": fmtValor(
        getField(row, [
          "_gmap_valor",
          "Valor total (R$)",
          "Valor da Fatura",
          "Valor fatura",
          "Valor",
          "valorapagar",
        ]),
      ),
      "[PAG] Valor Pago": fmtValor(
        getField(row, [
          "Valor pago pelo cliente (R$)",
          "Valor Pago",
          "valor_pago",
        ]),
      ),
      "[PAG] Vencimento": fmtData(
        getField(row, [
          "Vencimento Fatura Norten",
          "Data de vencimento",
          "Data Vencimento",
          "dtvencimento",
        ]),
      ),
      "[PAG] Data Pagamento": fmtData(
        getField(row, [
          "Data de recebimento",
          "Data de pagamento",
          "Data Pagamento",
          "dtpagamento",
        ]),
      ),
      "[PAG] Cód. Barras": getField(row, [
        "Código de barras",
        "Codigo de barras",
        "CodigoBarras",
        "codigobarra",
        "Codigo Barra Boleto",
      ]),
      "[PAG] Link Boleto": getField(row, [
        "Link de pagamento",
        "Arquivo do recebimento",
        "Link Boleto",
        "link_boleto",
        "Url Boleto",
        "url_boleto",
      ]),
    });
  });
  log(`Duplicidades: ${duplicidadesPag.length} registros`, "warn");

  // ══════════════════════════════════════════════════════════════════════════
  // ANÁLISE DE BOLETOS FALTANTES — LÓGICA BIFÁSICA
  //
  // FASE 1: Identificar quais CLIENTES existem em AMBOS os lados (PAG e REC).
  //   → Clientes que só estão num lado NÃO entram na análise de boletos.
  //   → Isso evita falsos positivos: um cliente novo no REC sem histórico na
  //     PAG não é "boleto faltante", é simplesmente um cliente diferente.
  //
  // FASE 2: Para os clientes em ambos, verificar mês a mês quais boletos
  //   (UC + Mês) existem num lado e não no outro.
  // ══════════════════════════════════════════════════════════════════════════

  // — Índice de UCs presentes na PAG (todas as chaves: UC, NC, CPF) —
  const ucsPagSet = new Set();
  rowsPag.forEach(r => {
    if (r._uc_norm)          ucsPagSet.add(r._uc_norm);
    if (r._num_cliente_norm) ucsPagSet.add(r._num_cliente_norm);
    if (r._cpf_norm)         ucsPagSet.add(r._cpf_norm);
  });

  // — Índice de UCs presentes no REC (todas as chaves) —
  const ucsRecSet = new Set();
  rowsRec.forEach(r => {
    if (r._uc_norm)          ucsRecSet.add(r._uc_norm);
    if (r._num_cliente_norm) ucsRecSet.add(r._num_cliente_norm);
    if (r._cpf_norm)         ucsRecSet.add(r._cpf_norm);
  });

  // Função auxiliar: um cliente está "em ambos" se qualquer das suas chaves
  // aparecer nos dois índices.
  const clienteEstaEmAmbos = (r, setPag, setRec) => {
    const chaves = [r._uc_norm, r._num_cliente_norm, r._cpf_norm].filter(Boolean);
    const noRec  = chaves.some(k => setRec.has(k));
    const naPag  = chaves.some(k => setPag.has(k));
    return { noRec, naPag, emAmbos: noRec && naPag };
  };

  // ── FASE 1 — Clientes que existem APENAS num lado ──────────────────────
  const clientesSoNaPag = [];  // PAG sem nenhuma UC/NC/CPF no REC
  const clientesSoNoRec = [];  // REC sem nenhuma UC/NC/CPF na PAG

  // Clientes órfãos da PAG cujo cliente não está no REC
  pagOrfaosFinais.forEach(r => {
    const { emAmbos, noRec } = clienteEstaEmAmbos(r, ucsPagSet, ucsRecSet);
    if (!noRec) {
      // Cliente só existe na PAG — não é boleto faltante, é cliente diferente
      const bkoUC   = bkoByUC[r._uc_norm];
      const nomePag = normName(r.nomeCliente || r.favorecido || r.consorciado || '');
      const bkoNome = !bkoUC && nomePag ? bkoByName[nomePag] : null;
      clientesSoNaPag.push({
        'UC (Pagadoria)':        r.ucRaw,
        'ID Recebimento':        r.idRecebimento || '—',
        CPF:                     r.cpfRaw || '—',
        'Consorciado/Nome':      r.consorciado || r.favorecido || '—',
        'Status Pagadoria':      r.statusRaw || '—',
        'Mês Referência':        r._mes_norm || '—',
        Valor:                   r.valor || '—',
        'No BKO':                bkoUC ? 'SIM' : bkoNome ? 'Parcial (nome)' : 'NÃO',
        Motivo:                  'Cliente da Pagadoria sem nenhuma correspondência nos Recebíveis',
        _rawPag:                 r._raw || null,
      });
    }
  });

  // Clientes órfãos do REC cujo cliente não está na PAG
  recOrfaosFinais.forEach(r => {
    const { emAmbos, naPag } = clienteEstaEmAmbos(r, ucsPagSet, ucsRecSet);
    if (!naPag) {
      clientesSoNoRec.push({
        'UC (Recebíveis)':   r.ucRaw,
        'ID Rcb':            r.idRcb || '—',
        'Cód. Cliente':      r.codCliente || '—',
        'Nº Cliente':        r.numCliente || '—',
        CPF:                 r.cpfRaw || '—',
        Cliente:             r.cliente || '—',
        Fornecedora:         r.fornecedora || '—',
        'Status Recebíveis': r.statusRaw || '—',
        'Mês Referência':    r._mes_norm || '—',
        Valor:               r.valor || '—',
        'Link Boleto':       r.linkBoleto || '—',
        Motivo:              'Cliente dos Recebíveis sem nenhuma correspondência na Pagadoria',
        _rawRec:             r._raw || null,
      });
    }
  });

  log(`[Fase 1] Clientes só na PAG: ${clientesSoNaPag.length} | Só no REC: ${clientesSoNoRec.length}`, 'warn');

  // ── FASE 2 — Boletos faltantes SOMENTE para clientes em ambos ──────────
  // Índice PAG por (UC+Mês) — inclui todas as rows, não só órfãs
  const idxPagMes = {};
  rowsPag.forEach(r => {
    const chaves = [r._uc_norm, r._num_cliente_norm, r._cpf_norm].filter(Boolean);
    chaves.forEach(k => {
      const key = `${k}|${r._mes_norm}`;
      (idxPagMes[key] = idxPagMes[key] || []).push(r);
    });
  });

  // Índice REC por (UC+Mês) — idem
  const idxRecMes = {};
  rowsRecFiltrados.forEach(r => {
    const chaves = [r._uc_norm, r._num_cliente_norm, r._cpf_norm].filter(Boolean);
    chaves.forEach(k => {
      const key = `${k}|${r._mes_norm}`;
      (idxRecMes[key] = idxRecMes[key] || []).push(r);
    });
  });

  const faltaRec      = [];
  const faltaRecSoBKO = [];
  const faltaRecUCDiv = [];

  // Mapear chaves (CPF|Mês) que já foram reconciliadas com sucesso
  const matchedCpfMes = new Set();
  matchesTotais.forEach(m => {
    const pag = m.pag;
    if (pag._cpf_norm && pag._mes_norm) {
      matchedCpfMes.add(`${pag._cpf_norm}|${pag._mes_norm}`);
    }
  });

  // PAG órfãos cujo CLIENTE está no REC → boleto faltante no REC neste mês
  pagOrfaosFinais.forEach(r => {
    const { noRec } = clienteEstaEmAmbos(r, ucsPagSet, ucsRecSet);
    if (!noRec) return; // Fase 1: cliente só na PAG — já tratado acima

    const kCpfMes = r._cpf_norm && r._mes_norm ? `${r._cpf_norm}|${r._mes_norm}` : null;
    if (kCpfMes && matchedCpfMes.has(kCpfMes)) {
      // É uma duplicidade lógica da Pagadoria (mesmo mês faturado >1 vez, e um deles já bateu)
      duplicidadesPag.push({
        "[PAG] UC": r.ucRaw,
        "[PAG] ID Recebimento": r.idRecebimento || "—",
        "[PAG] Cliente": r.consorciado || r.favorecido || r.nomeCliente || "—",
        "[PAG] CPF/CNPJ": r.cpfRaw || "—",
        "[PAG] Mês Referência": r._mes_norm || "—",
        "[PAG] Status": r.statusRaw || "—",
        "[PAG] Valor": r.valor || "—",
        "[PAG] Vencimento": r.venc || "—",
        "[PAG] Data Pagamento": r.pagto || "—",
        "[PAG] Cód. Barras": r.codBar || "—",
        "[PAG] Link Boleto": r.linkBoleto || "—",
        "Motivo": "Boletos extras/duplicados gerados na Pagadoria no mesmo mês (já há um boleto reconciliado)."
      });
      return;
    }

    const existe   = (idxRecPorUC[r._uc_norm] || []).length > 0;
    const recNC    = idxRecNC[r._uc_norm] || [];
    const nomePag  = normName(r.nomeCliente || r.favorecido || r.consorciado || '');
    const bkoUC    = bkoByUC[r._uc_norm];
    const bkoNome  = !bkoUC && nomePag ? bkoByName[nomePag] : null;

    const base = {
      'UC (Pagadoria)':          r.ucRaw,
      'UC existe nos Recebíveis': existe ? 'SIM' : 'NÃO',
      'ID Recebimento':          r.idRecebimento || '—',
      CPF:                       r.cpfRaw || '—',
      'Consorciado/Nome':        r.consorciado || r.favorecido || '—',
      'Status Pagadoria':        r.statusRaw || '—',
      'Mês Referência (Pag.)':   r.mesRef || '—',
      'Mês Normalizado':         r._mes_norm || '—',
      Valor:                     r.valor || '—',
      'Data Pagamento':          r.pagto || '—',
      'Link Boleto':             r.linkBoleto || recNC[0]?.linkBoleto || '—',
      _rawPag:                   r._raw || null,
    };

    if (bkoUC) {
      faltaRecSoBKO.push({
        ...base,
        'Código do Cliente (BKO)': getField(bkoUC, ['Codigo', 'codigo', 'Código']) || '—',
        'Status BKO':              getField(bkoUC, ['Jornada Status', 'Status', 'status', 'Status Financeiro']) || '—',
        Motivo: existe
          ? `Cliente em ambos — UC existe nos Rec. mas mês ${r._mes_norm} não está (BKO: cadastrado)`
          : 'Cliente em ambos — BKO cadastrado, boleto deste mês não gerado nos Recebíveis',
      });
    } else if (bkoNome) {
      faltaRecUCDiv.push({
        ...base,
        'Nome (BKO)':                  getField(bkoNome, ['Nome', 'Cliente', 'nome_cliente']) || '—',
        'UC Correta (BKO — Instalação)': getField(bkoNome, ['Instalacao', 'Instalação', 'instalacao']) || '—',
        'Nº Cliente (BKO)':            getField(bkoNome, ['Numero Cliente', 'NumeroCliente', 'numero_cliente']) || '—',
        'Código do Cliente (BKO)':     getField(bkoNome, ['Codigo', 'codigo', 'Código']) || '—',
        Motivo:                        'Cliente em ambos — nome no BKO mas UC divergente (verificar UC enviada pelo fornecedor)',
      });
    } else {
      faltaRec.push({
        ...base,
        Motivo: existe
          ? `Cliente em ambos — UC nos Rec. mas mês ${r._mes_norm} ausente`
          : 'Cliente em ambos — UC não encontrada nos Recebíveis neste mês',
      });
    }
  });

  log(`Falta Rec: ${faltaRec.length} (real) | Só no BKO: ${faltaRecSoBKO.length} | UC Divergente: ${faltaRecUCDiv.length}`, 'warn');

  // Falta na Pagadoria — REC órfãos cujo CLIENTE está na PAG
  const faltaPag = recOrfaosFinais
    .filter(r => {
      const { naPag } = clienteEstaEmAmbos(r, ucsPagSet, ucsRecSet);
      return naPag; // Fase 1: só os que têm cliente na PAG
    })
    .map(r => {
      const existe = (idxPagPorUC[r._uc_norm] || []).length > 0;
      return {
        'UC (Recebíveis)':         r.ucRaw,
        'UC existe na Pagadoria':  existe ? 'SIM' : 'NÃO',
        'ID Rcb':                  r.idRcb || '—',
        'Cód. Cliente':            r.codCliente || '—',
        'Nº Cliente':              r.numCliente || '—',
        CPF:                       r.cpfRaw || '—',
        Cliente:                   r.cliente || '—',
        Fornecedora:               r.fornecedora || '—',
        'Status Recebíveis':       r.statusRaw || '—',
        'Status Financeiro':       r.statusFin || '—',
        'Mês Referência (Rec.)':   r.mesRef || '—',
        'Mês Normalizado':         r._mes_norm || '—',
        Valor:                     r.valor || '—',
        'Link Boleto':             r.linkBoleto || '—',
        Motivo: existe
          ? `Cliente em ambos — UC na PAG mas mês ${r._mes_norm} ausente da Pagadoria`
          : 'Cliente em ambos — UC nos Rec. sem correspondência de mês na Pagadoria',
        _rawRec:                   r._raw || null,
      };
    });

  return {
    divergentes,
    coincidentes,
    divergenciasCod,
    semPagtoValor,
    faltaRec,
    faltaRecSoBKO,
    faltaRecUCDiv,
    faltaPag,
    clientesSoNaPag,
    clientesSoNoRec,
    duplicidadesPag,
    northenNaoExiste: northen.naoExiste,
    northenExisteNoBKO: northen.existeNoBKO,
    northenUCDivergente: northen.ucDivergente,
    northenExisteEmAmbas: northen.existeEmAmbas,
    northenIncluirBaixa: northen.incluirBaixa,
    totalPag: dfPag.length,
    totalRec: dfRec.length,
    emAmbos: matchesTotais.length + northen.matchPairs.length,
    soPag: pagOrfaosFinais.length,
    soRec: recOrfaosFinais.length,
    providerDetectado,
    totalRecFiltrado: rowsRecFiltrados.length,
    totalRecIgnorado,
  };
}
