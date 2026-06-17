// Sistema de Log de Erros para Leitura de Planilhas

const logs = []

export function addErrorLog(tipo, mensagem, dados = {}) {
  const timestamp = new Date().toLocaleTimeString('pt-BR')
  const logEntry = {
    timestamp,
    tipo,
    mensagem,
    dados,
    stack: new Error().stack
  }
  logs.push(logEntry)
  console.error(`[${timestamp}] [${tipo}] ${mensagem}`, dados)
}

export function addDebugLog(mensagem, dados = {}) {
  const timestamp = new Date().toLocaleTimeString('pt-BR')
  const logEntry = {
    timestamp,
    tipo: 'DEBUG',
    mensagem,
    dados
  }
  logs.push(logEntry)
  console.log(`[${timestamp}] [DEBUG] ${mensagem}`, dados)
}

export function getAllLogs() {
  return logs
}

export function getLogs(tipo) {
  return logs.filter(l => l.tipo === tipo)
}

export function clearLogs() {
  logs.length = 0
}

export function exportLogsAsText() {
  return logs.map(l => {
    const dataStr = JSON.stringify(l.dados).substring(0, 100)
    return `[${l.timestamp}] [${l.tipo}] ${l.mensagem} ${dataStr}`
  }).join('\n')
}

export function downloadLogs() {
  const text = exportLogsAsText()
  const blob = new Blob([text], { type: 'text/plain' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `logs-${Date.now()}.txt`
  a.click()
  URL.revokeObjectURL(url)
}
