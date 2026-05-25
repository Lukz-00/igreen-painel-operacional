# Lógica de Cruzamento de Status Divergentes - Faturamento

Abaixo está a explicação da lógica usada no sistema React (função `ehDivergente` em `src/utils/fatCruzar.js`) e como você pode aplicar a mesma lógica no Excel.

## 1. Como a lógica funciona no sistema

A lógica de verificação de **Status Divergentes** ocorre nas etapas de cruzamento (cascading join) entre a planilha de **Pagadoria** e a de **Recebíveis**. O objetivo é identificar se a mesma fatura (mesmo mês e UC) possui status financeiros que se contradizem ou estão em momentos diferentes entre as duas planilhas.

### Etapa 1: Normalização dos Status
Antes de comparar, o sistema converte qualquer status que vier da planilha para um **Grupo Padrão** ("Status Master"). Isso é feito pelas funções `statusPag()` e `statusRec()`.

Por exemplo:
- "PAID", "PAGA", "PAGA JUNTO AO CLIENTE", "RECEBIDO" ➔ **PAGO**
- "OVERDUE", "VENCIDA" ➔ **VENCIDO**
- "OPEN", "PENDENTE", "EM ABERTO", "A VENCER" ➔ **A RECEBER**
- "CANCELLED", "CANCELADO" ➔ **CANCELADA**
- "EXPIRED", "EXPIRADO" ➔ **EXPIRADA**
- "CALCULATED" ➔ **CALCULADA**

### Etapa 2: A Regra de Divergência
Após a normalização, o sistema usa a função `ehDivergente(status_pagadoria, status_recebiveis)`.
A regra é simples:
O sistema possui 6 **grupos exclusivos**. Se o status da Pagadoria e o status dos Recebíveis não pertencerem ao mesmo grupo, a fatura é classificada como **Status Divergente**.

Os 6 grupos são:
1. `["PAGO"]`
2. `["VENCIDO", "VENCIDA", "OVERDUE"]`
3. `["A RECEBER", "A VENCER", "OPEN", "PENDENTE"]`
4. `["CANCELADA", "CANCELLED"]`
5. `["EXPIRADA", "EXPIRED"]`
6. `["CALCULADA"]`

*(Nota: Se alguma das planilhas não tiver status preenchido ("—"), o sistema ignora a divergência, para evitar falsos positivos).*

---

## 2. Como aplicar essa lógica no Excel

Para fazer isso no Excel, você precisa primeiro criar as "chaves de cruzamento" usando PROCV (VLOOKUP) e depois fazer uma fórmula SE (IF) para comparar os status agrupados.

### Passo 1: Trazer o status de uma planilha para a outra
Na sua planilha de **Pagadoria**, crie uma coluna chamada `Status Recebíveis` e use um `PROCV` buscando pelo código do cliente + mês de referência (ou crie uma coluna "Chave" que junte `UC & Mês`).
Exemplo: `=PROCV(A2; 'PlanilhaRecebiveis'!A:Z; ColunaDoStatus; FALSO)`

### Passo 2: Criar as colunas de "Status Normalizado"
Como os nomes podem variar, crie duas colunas para traduzir o status para um padrão. 

**Coluna: Status Norm. Pagadoria**
```excel
=SE(OU(B2="PAGO"; B2="PAGA"; B2="RECEBIDO"); "GRUPO_PAGO";
  SE(OU(B2="VENCIDO"; B2="VENCIDA"); "GRUPO_VENCIDO";
  SE(OU(B2="A RECEBER"; B2="A VENCER"; B2="PENDENTE"); "GRUPO_A_RECEBER";
  SE(OU(B2="CANCELADO"; B2="CANCELADA"); "GRUPO_CANCELADO"; B2))))
```
*(Onde B2 é a célula com o status original da Pagadoria)*

**Coluna: Status Norm. Recebíveis**
Faça a mesma fórmula para a coluna onde você trouxe o status dos Recebíveis.

### Passo 3: Identificar a Divergência
Agora, crie uma coluna chamada `É Divergente?` comparando os dois grupos:

```excel
=SE(OU([@[Status Norm. Pagadoria]]=""; [@[Status Norm. Recebíveis]]=""); "Ignorar";
  SE([@[Status Norm. Pagadoria]] <> [@[Status Norm. Recebíveis]]; "Divergente"; "Coincidente"))
```

### Opcional: Filtro
Basta aplicar o filtro na coluna `É Divergente?` selecionando apenas "Divergente". Você terá exatamente o mesmo resultado da aba "Status Divergentes" do sistema React!