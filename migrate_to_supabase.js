import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import * as xlsx from 'xlsx';
import { createClient } from '@supabase/supabase-js';

// Configurações do Supabase
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Caminhos dos arquivos
const BASE_DIR = path.resolve(process.cwd(), '..');
const CADASTRO_FILE = path.join(BASE_DIR, 'Cadastro_Locais.csv');
const LOJAS_FILE = path.join(BASE_DIR, 'Protrade I Samsung AC I Reestruturação (base de lojas).xlsx');
const COORDS_FILE = path.join(BASE_DIR, 'route-app', 'src', 'lib', 'city_coords.json');

// Carregar dicionário de coordenadas atual
const cityCoords = JSON.parse(fs.readFileSync(COORDS_FILE, 'utf-8'));

function normalize(str) {
  if (!str) return '';
  return str.toString().normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().trim();
}

async function migrate() {
  console.log('🚀 Iniciando migração para Supabase...');

  // 1. Migrar Consultores
  console.log('👥 Lendo consultores...');
  if (fs.existsSync(CADASTRO_FILE)) {
    const content = fs.readFileSync(CADASTRO_FILE, 'utf-8');
    const lines = content.split('\n').filter(line => line.trim() !== '');
    const consultores = [];

    for (let i = 1; i < lines.length; i++) {
      const [nome, endereco, coordenadas] = lines[i].split(';');
      if (nome && endereco && coordenadas) {
        const [latStr, lngStr] = coordenadas.split(',');
        const uf = endereco.split('-').pop()?.trim() || '';
        consultores.push({
          nome: nome.trim(),
          endereco_completo: endereco.trim(),
          uf_base: uf,
          lat: parseFloat(latStr.trim()),
          lng: parseFloat(lngStr.trim())
        });
      }
    }

    console.log(`📤 Enviando ${consultores.length} consultores para o Supabase...`);
    const { error: errorC } = await supabase.from('consultores').upsert(consultores, { onConflict: 'nome' });
    if (errorC) console.error('❌ Erro ao subir consultores:', errorC);
    else console.log('✅ Consultores migrados!');
  } else {
    console.warn(`⚠️ Arquivo de consultores não encontrado em: ${CADASTRO_FILE}`);
  }

  // 2. Migrar Lojas
  console.log('🏪 Lendo lojas...');
  if (fs.existsSync(LOJAS_FILE)) {
    const fileBuffer = fs.readFileSync(LOJAS_FILE);
    const workbook = xlsx.read(fileBuffer, { type: 'buffer' });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rawData = xlsx.utils.sheet_to_json(sheet);

    const lojas = rawData.map(row => {
      const cidade = row['CIDADE'] || '';
      const uf = row['UF'] || '';
      const key = `${normalize(cidade)}-${normalize(uf)}`;
      const coords = cityCoords[key] || { lat: null, lng: null };

      return {
        codigo_sap: row['CNPJ'] ? row['CNPJ'].toString() : '',
        cliente: row['CLIENTE'] || '',
        nome_pdv: row['NOME PDV NOVO'] || '',
        endereco: row['ENDEREÇO'] || '',
        cidade: cidade,
        uf: uf,
        cluster: row['CLUSTER'] || '',
        periodo: row['PERIODO'] || '',
        status: row['STATUS (ATIVO / NÃO ATIVO)'] || '',
        consultor_vinculado: row['CONSULTOR'] || '',
        lat: coords.lat,
        lng: coords.lng
      };
    });

    console.log(`📤 Enviando ${lojas.length} lojas para o Supabase...`);

    const batchSize = 100;
    for (let i = 0; i < lojas.length; i += batchSize) {
      const batch = lojas.slice(i, i + batchSize);
      const { error: errorL } = await supabase.from('lojas').upsert(batch);
      if (errorL) {
        console.error(`❌ Erro no lote ${Math.floor(i / batchSize)}:`, errorL);
      } else {
        process.stdout.write(`✅ Enviando: ${Math.min(i + batchSize, lojas.length)}/${lojas.length}\r`);
      }
    }
    console.log('\n✅ Todas as lojas migradas!');
  } else {
    console.warn(`⚠️ Arquivo de lojas não encontrado em: ${LOJAS_FILE}`);
  }

  console.log('✨ Migração concluída com sucesso!');
  process.exit(0);
}

migrate();
