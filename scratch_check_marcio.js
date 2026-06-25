const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.resolve(__dirname, '.env.local') });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!url || !key) {
  console.error('Erro: Credentials not found in .env.local');
  process.exit(1);
}

const supabase = createClient(url, key);

async function main() {
  const { data: lojas, error } = await supabase
    .from('lojas_julho')
    .select('*')
    .eq('consultor_vinculado', 'MARCIO JOSE FLORES PEREIRA');

  if (error) {
    console.error('Erro:', error);
    process.exit(1);
  }

  console.log(`Total de lojas para Marcio: ${lojas.length}`);
  const summary = {};
  for (const l of lojas) {
    const key = `${l.uf} | ${l.status}`;
    summary[key] = (summary[key] || 0) + 1;
  }
  console.log('Resumo por UF e Status:');
  console.log(summary);

  const ativos = lojas.filter(l => l.status === 'ATIVO');
  console.log(`\nTotal de lojas ATIVAS para Marcio: ${ativos.length}`);
  for (const l of ativos) {
    console.log(`- ${l.codigo_sap} | ${l.nome_pdv} | ${l.cidade} | ${l.uf} | ${l.cluster} | ${l.periodo}`);
  }
}

main();
