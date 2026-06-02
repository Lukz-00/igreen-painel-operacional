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
      ]),
    ),
    valorPago: fmtValor(
      getField(r, [
        "Valor pago pelo cliente (R$)", // Solatio
        "Valor Pago",
        "valor_pago",
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
    favorecido: getField(r, ["Favorecido", "nome_cliente", "Nome", "Cliente"]),
    consorciado: getField(r, [
      "Consorciado",
      "nome_cliente",
      "Nome",
      "Cliente",
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
  };
}

// ── Cascading Join ─────────────────────────────────────────────
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
  pagRows.forEach((rP) => {
    const k = (rP[pagKey] || "") + "|" + (rP._mes_norm || "");
    const cands = idxRec[k] || [];
    if (!cands.length) {
      pagOrfaos.push(rP);
      return;
    }
    const cand = cands.find((c) => !recUsados.has(c.i)) || cands[0];
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

  const rowsPag = dfPag
    .map(extrairPag)
    .filter((r) => r._uc_norm && r._mes_norm);
  const rowsRec = dfRec
    .map(extrairRec)
    .filter((r) => r._uc_norm && r._mes_norm);

  log(
    `Pag sem mês normalizável: ${dfPag.length - rowsPag.length} | Rec: ${dfRec.length - rowsRec.length}`,
    "warn",
  );
  if (rowsPag[0])
    log(`Mês Pag: "${rowsPag[0].mesRaw}" → "${rowsPag[0]._mes_norm}"`);
  if (rowsRec[0])
    log(`Mês Rec: "${rowsRec[0].mesRaw}" → "${rowsRec[0]._mes_norm}"`);

  const rowsPagNorthen = rowsPag.filter((r) => r._is_northen);
  const rowsPagOthers = rowsPag.filter((r) => !r._is_northen);
  log(
    `Northen: ${rowsPagNorthen.length} linhas | Outros: ${rowsPagOthers.length} linhas`,
  );

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
  const rowsRecDisponiveis = rowsRec.filter(
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
    "_uc_norm",
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

  // Falta nos Recebíveis — dividido em três grupos:
  //   faltaRec:        ausente de REC e do BKO (problema real)
  //   faltaRecSoBKO:   UC encontrada no BKO, sem boleto neste mês (cliente novo/sem boleto)
  //   faltaRecUCDiv:   Nome encontrado no BKO mas UC enviada não corresponde (fornecedor enviou UC errada)
  const faltaRec      = [];
  const faltaRecSoBKO = [];
  const faltaRecUCDiv = [];

  pagOrfaosFinais.forEach((r) => {
    const existe  = (idxRecPorUC[r._uc_norm] || []).length > 0;
    const recNC   = idxRecNC[r._uc_norm] || [];
    const nomePag = normName(r.nomeCliente || r.favorecido || r.consorciado || '');
    const bkoUC   = bkoByUC[r._uc_norm];
    const bkoNome = !bkoUC && nomePag ? bkoByName[nomePag] : null;

    const base = {
      "UC (Pagadoria)": r.ucRaw,
      "UC existe nos Recebíveis": existe ? "SIM" : "NÃO",
      "ID Recebimento": r.idRecebimento || "—",
      CPF: r.cpfRaw || "—",
      "Consorciado/Nome": r.consorciado || r.favorecido || "—",
      "Status Pagadoria": r.statusRaw || "—",
      "Mês Referência (Pag.)": r.mesRef || "—",
      "Mês Normalizado": r._mes_norm || "—",
      Valor: r.valor || "—",
      "Data Pagamento": r.pagto || "—",
      "Link Boleto": r.linkBoleto || recNC[0]?.linkBoleto || "—",
    };

    if (bkoUC) {
      faltaRecSoBKO.push({
        ...base,
        "Código do Cliente (BKO)": getField(bkoUC, ['Codigo', 'codigo', 'Código']) || '—',
        "Status BKO": getField(bkoUC, ['Jornada Status', 'Status', 'status', 'Status Financeiro']) || '—',
        Motivo: existe
          ? `UC existe nos Recebíveis mas mês ${r._mes_norm} não está — cliente cadastrado no BKO`
          : 'Cliente cadastrado no BKO — boleto ainda não gerado nos Recebíveis',
      });
    } else if (bkoNome) {
      faltaRecUCDiv.push({
        ...base,
        'Nome (BKO)': getField(bkoNome, ['Nome', 'Cliente', 'nome_cliente']) || '—',
        'UC Correta (BKO — Instalação)': getField(bkoNome, ['Instalacao', 'Instalação', 'instalacao']) || '—',
        'Nº Cliente (BKO)': getField(bkoNome, ['Numero Cliente', 'NumeroCliente', 'numero_cliente']) || '—',
        'Código do Cliente (BKO)': getField(bkoNome, ['Codigo', 'codigo', 'Código']) || '—',
        Motivo: 'Nome encontrado no BKO mas UC/Nº Cliente divergente — verificar UC enviada pelo fornecedor',
      });
    } else {
      faltaRec.push({
        ...base,
        Motivo: existe
          ? `UC existe nos Recebíveis mas mês ${r._mes_norm} não está nos Recebíveis`
          : 'UC não encontrada nos Recebíveis nem no BKO',
      });
    }
  });

  log(`Falta Rec: ${faltaRec.length} (real) | Só no BKO: ${faltaRecSoBKO.length} | UC Divergente: ${faltaRecUCDiv.length}`, 'warn');

  // Falta na Pagadoria
  const faltaPag = recOrfaosFinais.map((r) => {
    const existe = (idxPagPorUC[r._uc_norm] || []).length > 0;
    return {
      "UC (Recebíveis)": r.ucRaw,
      "UC existe na Pagadoria": existe ? "SIM" : "NÃO",
      "ID Rcb": r.idRcb || "—",
      "Cód. Cliente": r.codCliente || "—",
      "Nº Cliente": r.numCliente || "—",
      CPF: r.cpfRaw || "—",
      Cliente: r.cliente || "—",
      Fornecedora: r.fornecedora || "—",
      "Status Recebíveis": r.statusRaw || "—",
      "Status Financeiro": r.statusFin || "—",
      "Mês Referência (Rec.)": r.mesRef || "—",
      "Mês Normalizado": r._mes_norm || "—",
      Valor: r.valor || "—",
      "Link Boleto": r.linkBoleto || "—",
      Motivo: existe
        ? `UC existe na Pagadoria mas mês ${r._mes_norm} não está na Pagadoria`
        : "UC não encontrada na Pagadoria",
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
  };
}
