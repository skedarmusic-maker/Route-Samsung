const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.resolve(__dirname, '.env.local') });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!url || !key) {
  console.error('Erro: Credentials not found');
  process.exit(1);
}

const supabase = createClient(url, key);

const ROTA_MAP = {
  "PAULO SERGIO MARQUES DA SILVA": "SPC2",
  "LIEDY AQUINO GOMES DOS SANTOS": "SPC1",
  "MARCIO JOSE FLORES PEREIRA": "SUL_1",
  "ALEXANDRE RIBEIRO LIMA": "SPI_2",
  "DIOGO DO NASCIMENTO SANTOS": "RJ",
  "TATIANE SOUZA DOS SANTOS": "NE_1",
  "LUIZ FALCAO DE SOUZA NETO": "NE_2"
};

async function main() {
  const { data: lojas, error } = await supabase
    .from('lojas_julho')
    .select('*');

  if (error) {
    console.error('Erro ao buscar lojas:', error);
    process.exit(1);
  }

  console.log(`Total de lojas em lojas_julho: ${lojas.length}`);
  const ativos = lojas.filter(l => l.status === 'ATIVO');
  console.log(`Total de lojas ATIVAS em lojas_julho: ${ativos.length}\n`);

  for (const c of Object.keys(ROTA_MAP)) {
    const c_lojas = ativos.filter(l => l.consultor_vinculado === c);
    let total_visits = 0;
    c_lojas.forEach(l => {
      const freq = parseInt(l.periodo, 10);
      total_visits += isNaN(freq) ? 1 : freq;
    });
    console.log(`${c}:`);
    console.log(`  Lojas ativas: ${c_lojas.length}`);
    console.log(`  Visitas planejadas por frequência: ${total_visits}`);
  }
}

main();
