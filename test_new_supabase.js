const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.resolve(__dirname, '.env.local') });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

console.log('Testando conexão com o NOVO Supabase:', url);

const supabase = createClient(url, key);

async function test() {
  const { data, error } = await supabase.from('consultores').select('*');
  if (error) {
    console.log('Tabela consultores ainda não existe ou erro:', error.message);
  } else {
    console.log('Tabela consultores encontrada! Quantidade:', data.length);
  }
}

test();
