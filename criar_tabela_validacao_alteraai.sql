-- ============================================================
-- TABELA DE VALIDAÇÃO DE JPs (ROUTE SAMSUNG <-> ALTERAAI)
-- Execute no SQL Editor do Supabase do Alteraai:
-- https://supabase.com/dashboard/project/vpvdprunhcvaztrqewjp/sql/new
-- ============================================================

CREATE TABLE IF NOT EXISTS public.jp_validacoes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    versao_id TEXT NOT NULL,
    versao_nome TEXT NOT NULL,
    mes INT NOT NULL,
    ano INT NOT NULL,
    consultor TEXT NOT NULL,
    status TEXT DEFAULT 'Pendente', -- 'Pendente', 'Validado', 'Com Apontamentos'
    enviado_em TIMESTAMPTZ DEFAULT NOW(),
    respondido_em TIMESTAMPTZ,
    total_visitas INT DEFAULT 0,
    visitas_validadas INT DEFAULT 0,
    visitas_reavaliar INT DEFAULT 0,
    roteiro JSONB NOT NULL,
    observacao_geral TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Índices para buscas ultrarrápidas
CREATE INDEX IF NOT EXISTS idx_jp_val_consultor ON public.jp_validacoes(consultor);
CREATE INDEX IF NOT EXISTS idx_jp_val_versao ON public.jp_validacoes(versao_id);
CREATE INDEX IF NOT EXISTS idx_jp_val_status ON public.jp_validacoes(status);

-- Habilitar Row Level Security (RLS) permissiva para o app
ALTER TABLE public.jp_validacoes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Permitir acesso completo jp_validacoes" ON public.jp_validacoes;
CREATE POLICY "Permitir acesso completo jp_validacoes" 
ON public.jp_validacoes 
FOR ALL 
USING (true) 
WITH CHECK (true);
