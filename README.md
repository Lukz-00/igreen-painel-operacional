# iGreen Painel Operacional

![React](https://img.shields.io/badge/React-18-61DAFB?logo=react&logoColor=111)
![Vite](https://img.shields.io/badge/Vite-5-646CFF?logo=vite&logoColor=fff)
![FastAPI](https://img.shields.io/badge/FastAPI-0.115-009688?logo=fastapi&logoColor=fff)
![Polars](https://img.shields.io/badge/Polars-engine-blue)
![Status](https://img.shields.io/badge/status-operacional-16a34a)

Painel interno para analises operacionais da iGreen, com frontend em React e backend em FastAPI + Polars. O sistema centraliza rotinas de cruzamento de planilhas, conciliacao de bases, identificacao de divergencias e exportacao de resultados em Excel.

> Projeto voltado para uso interno. Nao versione planilhas reais, bases de clientes, tokens, outputs ou qualquer arquivo com dado sensivel.

## Visao geral

O painel foi desenhado para trabalhar com arquivos grandes de faturamento, pagadoria, recebiveis e bases de clientes. A interface permite enviar planilhas, mapear colunas, executar o processamento no backend e baixar arquivos finais com abas separadas por tipo de ocorrencia.

Principais frentes:

| Area | O que faz |
| --- | --- |
| Faturamento / Pagadoria | Cruza Pagadoria, Recebiveis e Base de Clientes para encontrar divergencias, duplicidades e lacunas. |
| Boletos Faltantes | Ajuda a identificar boletos esperados que nao apareceram nas bases analisadas. |
| Inadimplentes | Separa clientes inadimplentes, atraso de faturamento, erro interno e atraso de inclusao no backoffice. |
| Atualizacoes GV | Monta a planilha de boletos atualizados usando Atualizacoes GV, faturamento consolidado, recebiveis e pagadorias. |
| Conciliacao de Base | Classifica clientes entre base operacional, financeiro, recebiveis e status. |
| Qualidade de Injecao | Analisa qualidade/indice de injecao por cliente, UC e competencia. |

## Modulos principais

### Operacoes financeiras

- **Faturamento:** cruzamento base entre Pagadoria x Recebiveis x Clientes.
- **Inadimplentes:** usa Pagadorias Interna, GV-CMU e GV-Northen, Recebiveis, Base Clientes, Inclusao Consolidada e GV-Recebiveis.
- **Atualizacoes:** preenche uma planilha padrao de atualizacao, priorizando os dados corretos da planilha `Atualizacoes_GV`.
- **Exports:** gera workbooks com resumo e abas especificas para cada tipo de resultado.

### Conciliacao

- Classificacao de bases em grupos operacionais.
- Apoio para GV, SUNNE, EDP e demais visoes usadas no painel.
- Saida em Excel com abas nomeadas conforme o tipo de situacao encontrada.

### Experiencia visual

- Layout renovado com sidebar, topbar e dashboard operacional.
- Modo claro e modo escuro.
- Componentes reutilizaveis para upload, metricas, tabelas, abas, logs e mapeamento de colunas.

## Stack

| Camada | Tecnologias |
| --- | --- |
| Frontend | React 18, Vite, Tailwind CSS, Lucide React, Recharts, SheetJS |
| Backend | FastAPI, Polars, fastexcel, openpyxl |
| Exportacao | Workbooks `.xlsx` gerados no backend |
| Testes | `unittest` para regras Python principais |

## Como rodar localmente

### Pre-requisitos

- Node.js 18 ou superior
- Python 3.10 ou superior
- Windows com `py` disponivel no PATH, ou ambiente Python equivalente

### Instalacao

```bash
npm install
npm run setup:api
```

### Desenvolvimento

```bash
npm run dev
```

Por padrao:

- Frontend: `http://localhost:5173/igreen-react/`
- API: `http://127.0.0.1:8000`

Se precisar apontar o frontend para outra API:

```bash
VITE_API_URL=http://127.0.0.1:8000 npm run dev
```

No PowerShell:

```powershell
$env:VITE_API_URL="http://127.0.0.1:8000"
npm run dev
```

## Build

```bash
npm run build
npm run preview
```

## Testes

O projeto nao possui script `npm test` configurado. Para validar as regras Python principais:

```powershell
.venv\Scripts\python.exe -m unittest tests.test_reconciliation tests.test_inadimplentes tests.test_atualizacoes
```

## Estrutura do projeto

```text
.
|-- server/
|   |-- app.py                 # API FastAPI
|   |-- reconciliation.py      # Cruzamento de faturamento
|   |-- conciliacao.py         # Regras de conciliacao de base
|   |-- inadimplentes.py       # Regras de inadimplencia e atrasos
|   |-- atualizacoes.py        # Regras de atualizacao de boletos
|   `-- excel_io.py            # Leitura, preview e escrita de planilhas
|-- src/
|   |-- components/
|   |   |-- layout/            # Sidebar e Topbar
|   |   `-- ui/                # Componentes reutilizaveis
|   |-- context/               # Estado global da interface
|   |-- pages/                 # Telas do painel
|   `-- utils/pythonApi.js     # Cliente HTTP da API Python
|-- tests/                     # Testes das regras de processamento
|-- package.json
|-- requirements.txt
`-- README.md
```

## Fluxo de uso

1. Abra a aba desejada no painel.
2. Envie as planilhas solicitadas.
3. Selecione a aba interna do arquivo, quando houver mais de uma.
4. Confira ou ajuste o mapeamento de colunas.
5. Execute a analise.
6. Revise os cards, previews e logs.
7. Baixe o Excel final gerado pelo backend.

## Cuidados com dados sensiveis

Este repositorio deve guardar codigo, documentacao e testes. Arquivos operacionais reais devem ficar fora do Git.

Ja estao ignorados:

- `.env`
- `.venv/`
- `GV/`
- `*.xlsx`, `*.xls`, `*.xlsm`
- `*.csv`
- `*.zip`
- outputs e pastas locais de diagnostico

Antes de commitar, confira:

```bash
git status --short
```

Nao suba:

- planilhas reais;
- bases de clientes;
- tokens de API ou GitHub;
- prints com dados sensiveis;
- arquivos temporarios de analise;
- scripts descartaveis fora das pastas esperadas.

## Manutencao

- Preserve a logica principal do backend ao fazer mudancas visuais.
- Mantenha cruzamentos pesados no backend com Polars.
- Ao criar uma nova rotina, adicione a pagina no frontend, o endpoint no backend e testes focados nas regras criticas.
- Ao alterar exports, valide nomes das abas, colunas obrigatorias e contagens do resumo.

## Licenca e acesso

Uso interno iGreen. Antes de compartilhar, revise permissao de acesso e remova qualquer dado operacional real.
