import fs from 'fs';
import path from 'path';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import csvParser from 'csv-parser';

dotenv.config({ path: './.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function parseCsv(filePath) {
  return new Promise((resolve, reject) => {
    const results = [];
    fs.createReadStream(filePath)
      .pipe(csvParser({ separator: ';' }))
      .on('data', (data) => results.push(data))
      .on('end', () => resolve(results))
      .on('error', (err) => reject(err));
  });
}

async function main() {
  const parentDir = '../';
  const files = fs.readdirSync(parentDir)
    .filter(file => file.startsWith('Execuções de Check In e Out') && file.endsWith('.csv'))
    .map(file => path.join(parentDir, file));

  console.log(`Arquivos encontrados para processar: ${files.length}`);

  let allData = [];
  for (const file of files) {
    console.log(`Lendo: ${file}...`);
    const data = await parseCsv(file);
    allData = allData.concat(data);
  }

  // Filter where Check In Realizado is valid
  const visits = allData.filter(row => row['Check In Realizado'] && Object.keys(row).some(k => k.includes('Data Prevista')) && row['Local']);

  // Map to find latest visit
  const latestVisits = new Map();
  
  visits.forEach(row => {
    const keys = Object.keys(row);
    const dataKey = keys.find(k => k.includes('Data Prevista'));
    const local = row['Local'];
    const dataStr = row[dataKey]; // format: DD/MM/YYYY
    const parts = dataStr.split('/');
    if (parts.length === 3) {
      const dateObj = new Date(`${parts[2]}-${parts[1]}-${parts[0]}T00:00:00`);
      if (!latestVisits.has(local) || dateObj > latestVisits.get(local)) {
        latestVisits.set(local, dateObj);
      }
    }
  });

  const records = [];
  latestVisits.forEach((dateObj, local) => {
    records.push({
      nome_pdv: local,
      ultima_visita: dateObj.toISOString().split('T')[0]
    });
  });

  console.log(`Encontradas ${records.length} lojas com histórico de visita.`);

  // Insert to Supabase in batches
  const batchSize = 100;
  for (let i = 0; i < records.length; i += batchSize) {
    const batch = records.slice(i, i + batchSize);
    const { error } = await supabase.from('historico_visitas').upsert(batch, { onConflict: 'nome_pdv' });
    if (error) {
      console.error(`Erro no batch ${i}:`, error);
    } else {
      console.log(`Batch ${i} enviado.`);
    }
  }

  console.log("Migração concluída!");
}

main().catch(console.error);
