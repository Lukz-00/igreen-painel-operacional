# iGreen — Painel Operacional (React + Tailwind)

## Como rodar no VSCode

### Pré-requisitos

- Node.js 18+ instalado (https://nodejs.org)
- VSCode com extensão **ES7+ React/Redux/React-Native** (opcional mas útil)

### Passos

```bash
# 1. Abrir a pasta no VSCode
# File → Open Folder → selecionar a pasta igreen-painel

# 2. Abrir o terminal integrado (Ctrl+`)

# 3. Instalar dependências
npm install

# 4. Preparar o backend Python (somente na primeira vez)
npm run setup:api

# 5. Rodar a API em um terminal
npm run dev:api

# 6. Rodar o frontend em outro terminal
npm run dev
```

O sistema abrirá em **http://localhost:5173**

O cruzamento de Faturamento é executado em **http://127.0.0.1:8000** com
Polars. A API mantém os uploads e resultados por 24 horas na pasta temporária
do Windows; a saída XLSX é criada com openpyxl em modo de escrita incremental.

---

## Estrutura do projeto

```
igreen-painel/
├── src/
│   ├── utils/
│   │   ├── normalizadores.js   ← normUC, normalizarMes, fmtData, fmtValor
│   │   ├── fatCruzar.js        ← Cascading Join (lógica principal de cruzamento)
│   │   └── exportar.js         ← Exportação para Excel
│   ├── components/
│   │   ├── ui/                 ← Button, Badge, DataTable, UploadBox, etc.
│   │   └── layout/             ← Sidebar, Topbar
│   ├── pages/
│   │   ├── Faturamento/        ← Cruzamento Pagadoria × Recebíveis (completo)
│   │   ├── Thopen/             ← Atraso de Injeção (completo)
│   │   ├── iVolt/              ← Em desenvolvimento
│   │   ├── Jornada/            ← Em desenvolvimento
│   │   └── Boletos/            ← Em desenvolvimento
│   ├── context/
│   │   └── AppContext.jsx      ← Navegação e estado global
│   ├── App.jsx
│   ├── main.jsx
│   └── index.css
├── package.json
├── vite.config.js
├── tailwind.config.js
└── postcss.config.js
```

---

## Módulos prontos

- ✅ **Cruzamento Pagadoria × Recebíveis** — cascading join completo, todas as abas, exportação Excel
- ✅ **Thopen — Atraso de Injeção** — classificação por 90 dias, todas as abas

## Em desenvolvimento

- 🔧 iVolt (Análise de Injeção GV/SUNNE/EDP)
- 🔧 Jornada do Cliente (Classificador de Status)
- 🔧 Central de Boletos
