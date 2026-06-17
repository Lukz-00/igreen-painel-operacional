const STORAGE_KEY = 'igreen_painel_history'

export function getHistoryLogs() {
  try {
    const data = localStorage.getItem(STORAGE_KEY)
    if (!data) return []
    return JSON.parse(data)
  } catch (err) {
    console.error('Erro ao ler histórico', err)
    return []
  }
}

export function saveHistoryLog(type, fileNames, summary) {
  try {
    const logs = getHistoryLogs()
    
    const newLog = {
      id: crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(),
      timestamp: new Date().toISOString(),
      type, // 'FATURAMENTO' ou 'EDP'
      fileNames, // { bko: '...', rec: '...', bol: '...' }
      summary // { divergentes: 10, inadimplentes: 20, ... }
    }

    logs.unshift(newLog) // Adiciona no início
    
    // Mantém apenas os últimos 100 relatórios para não sobrecarregar o localStorage
    if (logs.length > 100) {
      logs.length = 100
    }

    localStorage.setItem(STORAGE_KEY, JSON.stringify(logs))
    return newLog
  } catch (err) {
    console.error('Erro ao salvar no histórico', err)
  }
}

export function clearHistory() {
  localStorage.removeItem(STORAGE_KEY)
}
