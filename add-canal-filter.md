# Plano de Implementação: Filtro de Canal (add-canal-filter)

## 1. Análise
- **Objetivo:** Adicionar um filtro de seleção múltipla (Checkboxes) para a coluna "Canal" (Coluna H do Excel), permitindo filtrar lojas (ex: "Especializadas") e integrá-lo aos demais filtros existentes.
- **Arquivos que serão modificados:**
  - `route-app/src/app/page.tsx` (Interface e lógica de filtros)
  - `route-app/src/app/api/dashboard-intel/route.ts` (Filtro no backend da inteligência)
  - `route-app/src/components/DashboardIntel.tsx` (Propagação do filtro para o painel lateral)
  - `scratch_upload_new_lojas.py` (Mapeamento do Excel para o Supabase)

## 2. Planejamento (Task Breakdown)
- [x] **Fase 0: Banco de Dados (Dependência)**
  - O usuário precisa adicionar a coluna `canal` (tipo `text`) na tabela `lojas` no Supabase.
- [x] **Fase 1: Ajuste no Script de Upload**
  - Atualizar `scratch_upload_new_lojas.py` para ler a coluna `CANAL` do Excel e enviar no payload do Supabase.
- [x] **Fase 2: Backend & API**
  - Adicionar o campo `canal` no `select` e no filtro `where` da API `dashboard-intel/route.ts`.
- [x] **Fase 3: Frontend & UI**
  - Passar o novo filtro pelo componente `DashboardIntel.tsx`.
  - No `src/app/page.tsx`:
    - Mapear o campo `canal` no carregamento das lojas.
    - Criar estado `selectedCanais`.
    - Integrar `canal` na lógica de `lojasFiltradasCompletas`.
    - Adicionar o componente `<CheckboxList title="Canal" ... />` na UI.

## 3. Solução (Arquitetura)
- O filtro será do tipo `Set<string>`, assim como Cliente e Cluster.
- A sincronização garantirá que ao filtrar por Canal, as métricas do Dashboard lateral reflitam a escolha.

## 4. Verificação/Testes
- Validar se as lojas carregam com a informação de Canal.
- Testar a seleção e deseleção de canais.
