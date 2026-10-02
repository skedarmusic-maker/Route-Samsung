/**
 * Script: criar_tabela_lojas.js
 * Cria a tabela lojas_julho no Supabase novo e popula com dados do Excel
 */

const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');
const path = require('path');
const xlsx = require('xlsx');

dotenv.config({ path: path.resolve(__dirname, '.env.local') });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const LOJAS_FILE = path.resolve(
  __dirname,
  '..',
  'Protrade I Samsung AC I Reestruturação (base de lojas).xlsx'
);

async function run() {
  console.log('📂 Lendo arquivo Excel de lojas...');
  const wb = xlsx.readFile(LOJAS_FILE);
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rawData = xlsx.utils.sheet_to_json(ws);

  console.log(`📊 Total de linhas no Excel: ${rawData.length}`);

  // Mapeia para o schema da tabela lojas_julho
  const lojas = rawData.map((row) => {
    let lat = null, lng = null;
    const coords = row['coordandas'] || row['coordenadas'] || row['coordenadas '] || '';
    if (coords && typeof coords === 'string') {
      const parts = coords.split(',').map(s => parseFloat(s.trim()));
      if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
        lat = parts[0];
        lng = parts[1];
      }
    } else if (typeof coords === 'number') {
      // coordenadas em formato numérico (lat pode estar separada)
    }

    return {
      trader: row['TRADER'] || null,
      cliente: row['CLIENTE'] || null,
      bandeira: row['BANDEIRA'] || null,
      nome_pdv: row['NOME PDV NOVO'] || null,
      nome_pdv_antigo: row['NOME PDV ANTIGO'] || null,
      cnpj: row['CNPJ'] ? row['CNPJ'].toString() : null,
      endereco: row['ENDEREÇO'] || null,
      canal: row['CANAL'] || null,
      store_type: row['STORE TYPE'] || null,
      periodo: row['PERIODO'] || null,
      trajeto: row['TRAJETO'] || null,
      cenario_a: row['CENÁRIO A'] || null,
      cenario_b: row['CENÁRIO B'] || null,
      cenario_c: row['CENÁRIO C'] || null,
      consultor: row['CONSULTOR'] || null,
      rota: row['ROTA'] || null,
      cidade: row['CIDADE'] || null,
      uf: row['UF'] || null,
      cep: row['CEP'] ? row['CEP'].toString() : null,
      regional: row['REGIONAL'] || null,
      status: row['STATUS (ATIVO / NÃO ATIVO)'] || null,
      cluster: row['CLUSTER'] || null,
      grupo_clientes: row['GRUPO DE CLIENTES'] || null,
      shopping: row['SHOPPING'] || null,
      lat: lat,
      lng: lng,
    };
  }).filter(l => l.nome_pdv); // Remove linhas sem nome PDV

  console.log(`✅ Lojas válidas para inserir: ${lojas.length}`);

  // Verifica se a tabela já existe tentando buscar
  const { error: checkError } = await supabase.from('lojas_julho').select('id').limit(1);
  
  if (checkError && checkError.message.includes('does not exist')) {
    console.log('⚠️  Tabela lojas_julho não existe no Supabase.');
    console.log('');
    console.log('🔧 AÇÃO NECESSÁRIA: Crie a tabela no Supabase Dashboard com o SQL abaixo:');
    console.log('');
    console.log(`-- Execute no SQL Editor do Supabase:
CREATE TABLE public.lojas_julho (
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

-- Habilita acesso público de leitura
ALTER TABLE public.lojas_julho ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Leitura publica" ON public.lojas_julho FOR SELECT USING (true);
CREATE POLICY "Insert service role" ON public.lojas_julho FOR INSERT WITH CHECK (true);
`);
    process.exit(1);
  }

  if (checkError && !checkError.message.includes('schema cache')) {
    console.log('❌ Erro inesperado:', checkError.message);
    process.exit(1);
  }

  // Verifica se já tem dados
  const { count } = await supabase.from('lojas_julho').select('*', { count: 'exact', head: true });
  if (count && count > 0) {
    console.log(`ℹ️  Tabela já tem ${count} registros. Limpando para re-inserir...`);
    await supabase.from('lojas_julho').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  }

  // Insere em lotes de 100
  const BATCH = 100;
  let inseridos = 0;
  for (let i = 0; i < lojas.length; i += BATCH) {
    const batch = lojas.slice(i, i + BATCH);
    const { error } = await supabase.from('lojas_julho').insert(batch);
    if (error) {
      console.error(`❌ Erro no lote ${i}-${i + BATCH}:`, error.message);
    } else {
      inseridos += batch.length;
      process.stdout.write(`\r⬆️  Inseridos: ${inseridos}/${lojas.length}`);
    }
  }

  console.log(`\n\n🎉 CONCLUÍDO! ${inseridos} lojas inseridas na tabela lojas_julho.`);

  // Verificação final
  const { count: finalCount } = await supabase.from('lojas_julho').select('*', { count: 'exact', head: true });
  console.log(`✅ Verificação final: ${finalCount} registros no Supabase.`);
}

run().catch(err => {
  console.error('ERRO FATAL:', err.message);
  process.exit(1);
});
