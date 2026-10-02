const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');
const fs = require('fs');
const path = require('path');
dotenv.config({path: './.env.local'});
const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
s.from('roteiros').select('*').eq('mes', 8).eq('ano', 2026).eq('cenario', 'V3 final aprovado').then(r => {
  fs.writeFileSync('../scratch/sb_data.json', JSON.stringify(r.data, null, 2), 'utf-8');
  console.log('JSON salvo com sucesso');
});
