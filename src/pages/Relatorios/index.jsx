import { useState, useEffect, useMemo } from 'react'
import { getHistoryLogs, clearHistory } from '../../utils/history'
import { Printer, Trash2, Calendar, FileSpreadsheet, ChevronLeft } from 'lucide-react'
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend, BarChart, Bar, XAxis, YAxis, CartesianGrid } from 'recharts'

export function Relatorios() {
  const [logs, setLogs] = useState([])
  const [selected, setSelected] = useState(null)

  useEffect(() => {
    setLogs(getHistoryLogs())
  }, [])

  const handleClear = () => {
    if (window.confirm('Tem certeza que deseja apagar todo o histórico de relatórios?')) {
      clearHistory()
      setLogs([])
      setSelected(null)
    }
  }

  if (selected) {
    return <ReportView report={selected} onBack={() => setSelected(null)} />
  }

  return (
    <div className="p-7 space-y-6">
      <div className="flex items-center justify-between pb-5 border-b border-bd">
        <div>
          <h1 className="text-2xl font-bold text-tx">Histórico e Relatórios</h1>
          <p className="text-sm text-tx3 mt-1">Consulte os cruzamentos anteriores para gerar relatórios e PDFs.</p>
        </div>
        <button onClick={handleClear} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-red-500/10 text-red-500 hover:bg-red-500/20 transition-colors text-sm font-medium">
          <Trash2 size={16} />
          Limpar Histórico
        </button>
      </div>

      {logs.length === 0 ? (
        <div className="text-center py-20 text-tx3">
          <FileSpreadsheet size={48} className="mx-auto mb-4 opacity-20" />
          <p>Nenhum relatório encontrado no histórico.</p>
          <p className="text-xs mt-2">Execute um cruzamento em Faturamento ou EDP para salvar um relatório.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {logs.map(log => (
            <div 
              key={log.id} 
              onClick={() => setSelected(log)}
              className="p-5 rounded-xl border border-bd bg-bg2 hover:border-acc/50 cursor-pointer transition-all hover:shadow-lg hover:-translate-y-1 group"
            >
              <div className="flex items-center justify-between mb-4">
                <span className={`px-2.5 py-1 rounded-md text-xs font-bold ${
                  log.type === 'EDP' ? 'bg-blue-500/10 text-blue-500' : 'bg-green-500/10 text-green-500'
                }`}>
                  {log.type}
                </span>
                <div className="flex items-center text-tx3 text-xs gap-1.5">
                  <Calendar size={12} />
                  {new Date(log.timestamp).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}
                </div>
              </div>
              
              <div className="space-y-2 mb-4">
                {Object.entries(log.fileNames).map(([k, v]) => (
                  <div key={k} className="text-xs flex items-center justify-between text-tx3">
                    <span className="uppercase font-medium w-10">{k}:</span>
                    <span className="truncate flex-1 text-right ml-2 text-tx2" title={v}>{v}</span>
                  </div>
                ))}
              </div>

              <div className="pt-4 border-t border-bd/50 flex justify-between items-center text-sm font-medium text-acc opacity-0 group-hover:opacity-100 transition-opacity">
                Visualizar Relatório Completo &rarr;
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function ReportView({ report, onBack }) {
  const isEDP = report.type === 'EDP'

  // Preparar dados para gráficos
  const chartData = useMemo(() => {
    const s = report.summary || {}
    if (isEDP) {
      return [
        { name: 'Inadimplentes', value: s.inadimplentes || 0, fill: '#ef4444' },
        { name: 'Vencidos', value: s.vencidos || 0, fill: '#f59e0b' },
        { name: 'Em Aberto', value: s.emAberto || 0, fill: '#3b82f6' },
        { name: 'Divergentes', value: s.divergentes || 0, fill: '#a855f7' },
        { name: 'Dar Baixa', value: s.darBaixa || 0, fill: '#22c55e' },
      ].filter(d => d.value > 0)
    } else {
      return [
        // { name: 'Coincidentes', value: s.coincidentes || 0, fill: '#22c55e' },
        { name: 'Status Divergentes', value: s.divergentes || 0, fill: '#ef4444' },
        { name: 'Falta Rec.', value: s.faltaRec || 0, fill: '#f59e0b' },
        { name: 'Falta Pag.', value: s.faltaPag || 0, fill: '#a855f7' },
        { name: 'Divergência Cód', value: s.divergenciasCod || 0, fill: '#f97316' },
      ].filter(d => d.value > 0)
    }
  }, [report, isEDP])

  const barData = useMemo(() => {
    return chartData.sort((a, b) => b.value - a.value)
  }, [chartData])

  return (
    <div className="p-7 space-y-6 print:p-0 print:m-0 print:space-y-4 print:bg-white print:text-black">
      {/* Non-printable header actions */}
      <div className="flex items-center justify-between pb-5 border-b border-bd print:hidden">
        <button onClick={onBack} className="flex items-center gap-2 text-tx2 hover:text-acc transition-colors text-sm font-medium">
          <ChevronLeft size={16} />
          Voltar
        </button>
        <button onClick={() => window.print()} className="flex items-center gap-2 px-4 py-2 rounded-lg bg-acc text-white hover:bg-acc/90 transition-colors text-sm font-medium shadow-lg shadow-acc/20">
          <Printer size={16} />
          Imprimir Relatório (PDF)
        </button>
      </div>

      {/* Printable Report Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-bold text-tx print:text-black">Relatório Gerencial — {report.type}</h1>
          <p className="text-sm text-tx3 mt-2 print:text-gray-600">
            Gerado em {new Date(report.timestamp).toLocaleString('pt-BR', { dateStyle: 'long', timeStyle: 'medium' })}
          </p>
        </div>
        <div className="text-right text-sm">
          <div className="font-bold text-tx print:text-black mb-1">Arquivos Fonte</div>
          {Object.entries(report.fileNames).map(([k, v]) => (
            <div key={k} className="text-tx2 print:text-gray-700 flex justify-end gap-2">
              <span className="uppercase text-tx3 text-xs font-bold w-8">{k}:</span>
              <span className="truncate max-w-[200px]">{v}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Dashboard Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6">
        {chartData.map(item => (
          <div key={item.name} className="p-4 rounded-xl border border-bd bg-bg2 print:bg-gray-50 print:border-gray-200">
            <div className="text-xs text-tx3 print:text-gray-500 font-semibold mb-1 uppercase tracking-wider">{item.name}</div>
            <div className="text-2xl font-bold" style={{ color: item.fill }}>{item.value.toLocaleString('pt-BR')}</div>
          </div>
        ))}
      </div>

      {/* Charts */}
      {!isEDP && (
        chartData.length > 0 ? (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-8 print:block print:space-y-8">
            
            <div className="p-6 rounded-xl border border-bd bg-bg2 print:bg-white print:border-gray-200 print:break-inside-avoid">
              <h3 className="text-lg font-bold text-tx print:text-black mb-6">Distribuição de Status</h3>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={chartData}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={80}
                      paddingAngle={5}
                      dataKey="value"
                    >
                      {chartData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.fill} stroke="rgb(var(--color-s1))" />
                      ))}
                    </Pie>
                    <Tooltip 
                      contentStyle={{ backgroundColor: 'rgb(var(--color-s1))', border: '1px solid rgb(var(--color-bd))', borderRadius: '8px', color: 'rgb(var(--color-tx))' }}
                      itemStyle={{ color: 'rgb(var(--color-tx))' }}
                    />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="p-6 rounded-xl border border-bd bg-bg2 print:bg-white print:border-gray-200 print:break-inside-avoid">
              <h3 className="text-lg font-bold text-tx print:text-black mb-6">Volume por Categoria</h3>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={barData} layout="vertical" margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="rgb(var(--color-bd) / 0.65)" />
                    <XAxis type="number" stroke="rgb(var(--color-tx3))" />
                    <YAxis dataKey="name" type="category" width={100} stroke="rgb(var(--color-tx3))" fontSize={11} />
                    <Tooltip 
                      cursor={{fill: 'rgb(var(--color-s2) / 0.75)'}}
                      contentStyle={{ backgroundColor: 'rgb(var(--color-s1))', border: '1px solid rgb(var(--color-bd))', borderRadius: '8px', color: 'rgb(var(--color-tx))' }}
                    />
                    <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                      {barData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.fill} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

          </div>
        ) : (
          <div className="text-center py-10 text-tx3">Nenhum dado com valores maiores que zero para exibir.</div>
        )
      )}

      {/* CSS for print mode */}
      <style>{`
        @media print {
          body * {
            visibility: hidden;
          }
          .flex-1.flex.flex-col.min-w-0 {
            display: block !important;
          }
          main.flex-1.overflow-y-auto {
            overflow: visible !important;
            display: block !important;
          }
          .print\\:hidden {
            display: none !important;
          }
          .print\\:p-0, .print\\:p-0 * {
            visibility: visible;
          }
          .print\\:p-0 {
            position: absolute;
            left: 0;
            top: 0;
            width: 100%;
          }
          /* Fix Recharts in print mode */
          .recharts-responsive-container {
            width: 100% !important;
            height: 300px !important;
          }
        }
      `}</style>
    </div>
  )
}
