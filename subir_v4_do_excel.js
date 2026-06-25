/**
 * SUBIR V4 FINAL DO EXCEL
 * 
 * Lê "Journey Julho - Versão 2 (1).xlsx" aba "Roteiros" EXATAMENTE como está.
 * ÚNICA correção: visitas FERREIRA COSTA na tarde → movidas para 09:00-12:00.
 * Nenhuma loja adicionada, removida ou reordenada.
 */

const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');
const path = require('path');
const xlsx = require('xlsx');

dotenv.config({ path: path.resolve(__dirname, '.env.local') });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!url || !key) {
  console.error('Erro: Credenciais não encontradas em .env.local');
  process.exit(1);
}

const supabase = createClient(url, key);

const EXCEL_PATH = path.resolve(__dirname, '../Journey Julho - Versão 2 (1).xlsx');
const CENARIO   = 'julho v4 final';
const VERSAO_ID = 'v-julho-v4-final';
const VERSAO_NOME = 'Julho - V4 Final';

function normalize(str) {
  return (str || '').normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().trim();
}

// Converte serial do Excel para YYYY-MM-DD
function excelDateToStr(val) {
  if (!val) return null;
  if (typeof val === 'string' && val.match(/\d{4}-\d{2}-\d{2}/)) return val.substring(0, 10);
  if (typeof val === 'number') {
    const date = new Date(Math.round((val - 25569) * 86400 * 1000));
    const y = date.getUTCFullYear();
    const m = String(date.getUTCMonth() + 1).padStart(2, '0');
    const d = String(date.getUTCDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  if (val instanceof Date) {
    const y = val.getFullYear();
    const m = String(val.getMonth() + 1).padStart(2, '0');
    const d = String(val.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  return null;
}

function isTarde(checkIn) {
  if (!checkIn) return false;
  const h = parseInt((checkIn || '').split(':')[0], 10);
  return h >= 13;
}

async function salvarNoSupabase(cName, payload, headers) {
  const checkUrl = `${url}/rest/v1/roteiros?consultor=eq.${encodeURIComponent(cName)}&mes=eq.7&ano=eq.2026&cenario=eq.${encodeURIComponent(payload.cenario)}`;
  const checkRes = await fetch(checkUrl, { headers });
  if (!checkRes.ok) {
    console.error(`  [ERRO] Falha na checagem para ${cName}:`, await checkRes.text());
    return;
  }
  const exist = await checkRes.json();
  if (exist && exist.length > 0) {
    const rowId = exist[0].id;
    const patchRes = await fetch(`${url}/rest/v1/roteiros?id=eq.${rowId}`, {
      method: 'PATCH',
      headers: { ...headers, 'Content-Type': 'application/json', 'Prefer': 'return=representation' },
      body: JSON.stringify(payload)
    });
    if (patchRes.ok) {
      console.log(`  [OK] ${cName} ATUALIZADO como '${VERSAO_NOME}'.`);
    } else {
      console.error(`  [ERRO] Falha ao atualizar ${cName}:`, await patchRes.text());
    }
  } else {
    const postRes = await fetch(`${url}/rest/v1/roteiros`, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json', 'Prefer': 'return=representation' },
      body: JSON.stringify(payload)
    });
    if (postRes.ok) {
      console.log(`  [OK] ${cName} INSERIDO como '${VERSAO_NOME}'.`);
    } else {
      console.error(`  [ERRO] Falha ao inserir ${cName}:`, await postRes.text());
    }
  }
}

async function main() {
  console.log('=== SUBIR V4 FINAL DO EXCEL ===');
  console.log(`Lendo: ${EXCEL_PATH}\n`);

  const workbook = xlsx.readFile(EXCEL_PATH);
  const sheet = workbook.Sheets['Roteiros'];
  const rows = xlsx.utils.sheet_to_json(sheet, { defval: '' });
  console.log(`${rows.length} linhas na aba Roteiros.\n`);

  // Agrupar por consultor → por data
  const porConsultor = {};

  for (const row of rows) {
    const consultor = (row['Consultor'] || '').toString().trim().toUpperCase();
    if (!consultor) continue;

    const dataStr = excelDateToStr(row['Data']);
    if (!dataStr) continue;

    const nomePdv  = (row['Nome PDV']  || '').toString().trim();
    const filial   = (row['Filial']    || '').toString().trim();
    const cliente  = (row['Cliente']   || '').toString().trim();
    const cidade   = (row['Cidade']    || '').toString().trim();
    const uf       = (row['UF']        || '').toString().trim();
    const cluster  = (row['Cluster']   || '').toString().trim();
    const rota     = (row['Rota']      || '').toString().trim();
    const tipo     = (row['Tipo']      || 'Local').toString().trim();
    const diaSem   = (row['Dia da Semana'] || '').toString().trim().toUpperCase();
    let checkIn    = (row['Check-in']  || row['Check-In'] || '09:00').toString().trim();
    let checkOut   = (row['Check-out'] || row['Check-Out'] || '12:00').toString().trim();

    // Limpar segundos se houver (ex: "09:00:00" → "09:00")
    if (checkIn.length > 5)  checkIn  = checkIn.substring(0, 5);
    if (checkOut.length > 5) checkOut = checkOut.substring(0, 5);

    // ===== ÚNICA CORREÇÃO PERMITIDA =====
    // FERREIRA COSTA na tarde → manhã (09:00-12:00)
    const nomePdvNorm = normalize(nomePdv);
    const clienteNorm = normalize(cliente);
    if ((nomePdvNorm.includes('FERREIRA COSTA') || clienteNorm.includes('FERREIRA COSTA')) && isTarde(checkIn)) {
      console.log(`  [AJUSTE] ${consultor} | ${dataStr} | ${nomePdv}`);
      console.log(`           ${checkIn}-${checkOut} → 09:00-12:00`);
      checkIn  = '09:00';
      checkOut = '12:00';
    }
    // =====================================

    if (!porConsultor[consultor]) porConsultor[consultor] = {};
    if (!porConsultor[consultor][dataStr]) {
      porConsultor[consultor][dataStr] = {
        data: dataStr,
        diaSemana: diaSem,
        lojas: []
      };
    }

    porConsultor[consultor][dataStr].lojas.push({
      nome_pdv: nomePdv,
      filial,
      cliente,
      cidade,
      uf,
      cluster,
      checkIn,
      checkOut,
      tipo: tipo.toLowerCase().includes('viagem') ? 'viagem' : 'local',
      estadoViagem: tipo.toLowerCase().includes('viagem') ? uf : undefined,
      rota
    });
  }

  const baseHeaders = { apikey: key, Authorization: `Bearer ${key}` };

  for (const [cName, diasMap] of Object.entries(porConsultor)) {
    const roteiro = Object.values(diasMap).sort((a, b) => a.data.localeCompare(b.data));
    const totalLojas = roteiro.reduce((acc, d) => acc + d.lojas.length, 0);

    console.log(`\n[${cName}] ${roteiro.length} dias | ${totalLojas} visitas`);
    roteiro.forEach(d => {
      const fc = d.lojas.filter(l => normalize(l.cliente).includes('FERREIRA COSTA') || normalize(l.nome_pdv).includes('FERREIRA COSTA'));
      const fcInfo = fc.length > 0 ? ` ← ${fc.length} FC (${fc.map(l => l.checkIn).join(', ')})` : '';
      console.log(`  ${d.data} (${d.diaSemana}): ${d.lojas.length} loja(s)${fcInfo}`);
    });

    const dadosRoteiro = {
      consultor: cName,
      mes: 7,
      ano: 2026,
      totalLojas,
      totalDiasUteis: roteiro.length,
      roteiro
    };

    const payload = {
      consultor: cName,
      mes: 7,
      ano: 2026,
      cenario: CENARIO,
      versao_id: VERSAO_ID,
      versao_nome: VERSAO_NOME,
      dados_roteiro: dadosRoteiro,
      status: 'APROVADO'
    };

    await salvarNoSupabase(cName, payload, baseHeaders);
  }

  console.log('\n=== CONCLUÍDO — Julho V4 Final salvo no Supabase ===');
}

main().catch(err => {
  console.error('Erro fatal:', err);
  process.exit(1);
});
