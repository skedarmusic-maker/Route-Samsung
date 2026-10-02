-- ============================================================
-- ROUTE SAMSUNG - CRIAÇÃO DE TABELAS NO NOVO SUPABASE
-- Execute este script no SQL Editor do seu projeto Supabase:
-- https://supabase.com/dashboard/project/prbwawnrmmuklkpdkndz/sql/new
-- ============================================================

-- 1. TABELA DE CONSULTORES
CREATE TABLE IF NOT EXISTS consultores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome TEXT NOT NULL UNIQUE,
  rota TEXT,
  cidade TEXT,
  uf TEXT,
  lat DOUBLE PRECISION,
  lng DOUBLE PRECISION,
  cor TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. TABELA DE VERSÕES DE ROTEIRO
CREATE TABLE IF NOT EXISTS versoes_roteiro (
  id TEXT PRIMARY KEY,
  nome TEXT NOT NULL,
  descricao TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. TABELA DE ROTEIROS (PRINCIPAL)
CREATE TABLE IF NOT EXISTS roteiros (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  consultor TEXT NOT NULL,
  mes INT NOT NULL,
  ano INT NOT NULL,
  status TEXT DEFAULT 'Aprovado',
  cenario TEXT NOT NULL,
  versao_id TEXT,
  versao_nome TEXT,
  dados_roteiro JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT uq_roteiro_consultor_mes_ano_cenario UNIQUE (consultor, mes, ano, cenario)
);

-- 4. TABELA DE DESPESAS HISTÓRICAS (OPCIONAL)
CREATE TABLE IF NOT EXISTS despesas_historicas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  consultor TEXT NOT NULL,
  mes INT NOT NULL,
  ano INT NOT NULL,
  dados_despesas JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- HABILITAR RLS E CRIAR POLÍTICAS PERMISSIVAS PARA ACESSO PÚBLICO/ANON
ALTER TABLE consultores ENABLE ROW LEVEL SECURITY;
ALTER TABLE versoes_roteiro ENABLE ROW LEVEL SECURITY;
ALTER TABLE roteiros ENABLE ROW LEVEL SECURITY;
ALTER TABLE despesas_historicas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Acesso Total Consultores" ON consultores FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Acesso Total Versoes" ON versoes_roteiro FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Acesso Total Roteiros" ON roteiros FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Acesso Total Despesas" ON despesas_historicas FOR ALL USING (true) WITH CHECK (true);

-- POPULAR CONSULTORES BASE
INSERT INTO consultores (nome, rota, cidade, uf, lat, lng, cor) VALUES
('TATIANE SOUZA DOS SANTOS', 'NE_1', 'Salvador', 'BA', -12.9714, -38.5014, '#3B82F6'),
('LIEDY AQUINO GOMES DOS SANTOS', 'SPC1', 'São Paulo', 'SP', -23.5505, -46.6333, '#EC4899'),
('LUIZ FALCAO DE SOUZA NETO', 'NE_2', 'Recife', 'PE', -8.0476, -34.8770, '#10B981'),
('MARCIO JOSE FLORES PEREIRA', 'SUL_1', 'Porto Alegre', 'RS', -30.0346, -51.2177, '#F59E0B'),
('DIOGO DO NASCIMENTO SANTOS', 'RJ', 'Rio de Janeiro', 'RJ', -22.9068, -43.1729, '#8B5CF6')
ON CONFLICT (nome) DO UPDATE SET
  rota = EXCLUDED.rota,
  cidade = EXCLUDED.cidade,
  uf = EXCLUDED.uf,
  lat = EXCLUDED.lat,
  lng = EXCLUDED.lng,
  cor = EXCLUDED.cor;
