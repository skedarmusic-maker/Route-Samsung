# Plano de Implementação: Slicer de Data (add-date-range-slicer)

## 1. Análise
- **Objetivo:** Adicionar um seletor de intervalo de datas (Date Range Picker) visual e um botão para disparar a geração de roteiros.
- **Tecnologias Identificadas:** Next.js, React 19, Tailwind CSS v4, `date-fns`.
- **Arquivos que serão modificados/criados:**
  - `src/components/DateRangePicker.tsx` (Novo componente premium)
  - `src/app/page.tsx` (Integração da lógica e botão)

## 2. Planejamento (Task Breakdown)
- [ ] **Fase 1: Criação do Componente UI**
  - Criar `src/components/DateRangePicker.tsx`.
  - Implementar navegação de meses/anos.
  - Implementar seleção de range (data inicial e final).
  - Aplicar design premium com Tailwind v4.
- [ ] **Fase 2: Integração de Estado**
  - Adicionar estados `startDate` e `endDate` no `src/app/page.tsx`.
  - Passar os estados para o componente.
- [ ] **Fase 3: Lógica do Botão**
  - Adicionar o botão "Gerar Roteiro do Período".
  - Conectar o botão à função que processa os dados com base no range selecionado.

## 3. Solução (Arquitetura)
- O `DateRangePicker` será um componente controlado ou semi-controlado.
- Utilizaremos `date-fns` para manipulação de datas (já está no `package.json`).
- O design seguirá o padrão do projeto, evitando cores roxas (conforme regras internas).

## 4. Verificação/Testes
- Validar se o calendário renderiza os dias corretamente.
- Validar se a seleção de range funciona (data fim > data início).
- Validar se o botão dispara a ação correta.
