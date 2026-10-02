-- ============================================================
-- Execute este SQL no Supabase SQL Editor do projeto novo:
-- https://prbwawnrmmuklkpdkndz.supabase.co
-- Menu: SQL Editor > New query > cole e execute
-- ============================================================

CREATE TABLE IF NOT EXISTS public.lojas_julho (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  trader TEXT,
  cliente TEXT,
  bandeira TEXT,
  nome_pdv TEXT,
  nome_pdv_antigo TEXT,
  cnpj TEXT,
  endereco TEXT,
  canal TEXT,
  store_type TEXT,
  periodo TEXT,
  trajeto TEXT,
  cenario_a TEXT,
  cenario_b TEXT,
  cenario_c TEXT,
  consultor TEXT,
  rota TEXT,
  cidade TEXT,
  uf TEXT,
  cep TEXT,
  regional TEXT,
  status TEXT,
  cluster TEXT,
  grupo_clientes TEXT,
  shopping TEXT,
  lat FLOAT8,
  lng FLOAT8,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Habilita acesso público de leitura (necessário para o app funcionar)
ALTER TABLE public.lojas_julho ENABLE ROW LEVEL SECURITY;

CREATE POLICY IF NOT EXISTS "Leitura publica lojas" 
  ON public.lojas_julho FOR SELECT USING (true);

CREATE POLICY IF NOT EXISTS "Insert service role lojas" 
  ON public.lojas_julho FOR INSERT WITH CHECK (true);

CREATE POLICY IF NOT EXISTS "Delete service role lojas" 
  ON public.lojas_julho FOR DELETE USING (true);

-- Confirma criação
SELECT COUNT(*) as total FROM public.lojas_julho;
