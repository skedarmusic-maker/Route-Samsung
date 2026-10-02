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
const cityCoords = require('./src/lib/city_coords.json');

const EXCEL_PATH = path.resolve(__dirname, '../public/Journey Agosto - V4 (aprovada).xlsx');
const CENARIO = 'Journey Agosto - Aprovado';
const VERSAO_ID = 'v-journey-agosto-aprovado';
const VERSAO_NOME = 'Journey Agosto - Aprovado';
const MES = 8;
const ANO = 2026;

function normalize(str) {
  return (str || '').toString().normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().trim();
}

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

function formatTime(val, defaultTime = '09:00') {
  if (val === null || val === undefined || val === '') return defaultTime;
  
  let strVal = val.toString().trim();
  
  if (strVal.match(/^\d{1,2}:\d{2}(:\d{2})?$/)) {
    const parts = strVal.split(':');
    const h = String(parseInt(parts[0], 10)).padStart(2, '0');
    const m = parts[1];
    return `${h}:${m}`;
  }
  
  const num = parseFloat(strVal);
  if (!isNaN(num)) {
    const fraction = num > 1 ? num - Math.floor(num) : num;
    const totalSeconds = Math.round(fraction * 24 * 3600);
    const hours = Math.floor(totalSeconds / 3600) % 24;
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
  }

  return defaultTime;
}

function computeDistance(p1, p2) {
  const R = 6371;
  const dLat = ((p2.lat - p1.lat) * Math.PI) / 180;
  const dLng = ((p2.lng - p1.lng) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((p1.lat * Math.PI) / 180) *
    Math.cos((p2.lat * Math.PI) / 180) *
    Math.sin(dLng / 2) *
    Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

async function fetchWithRetry(fetchUrl, options = {}, retries = 3, delay = 1000) {
  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch(fetchUrl, options);
      if (res.ok) return res;
      if (res.status >= 500 && i < retries - 1) {
        console.warn(`  [RETRY ${i + 1}/${retries}] HTTP ${res.status} para ${fetchUrl}. Tentando novamente em ${delay}ms...`);
        await new Promise(r => setTimeout(r, delay));
        delay *= 2;
        continue;
      }
      return res;
    } catch (err) {
      if (i < retries - 1) {
        console.warn(`  [RETRY ${i + 1}/${retries}] Erro de rede (${err.message}). Tentando novamente em ${delay}ms...`);
        await new Promise(r => setTimeout(r, delay));
        delay *= 2;
        continue;
      }
      throw err;
    }
  }
}

async function salvarNoSupabase(cName, payload, headers) {
  const checkUrl = `${url}/rest/v1/roteiros?consultor=eq.${encodeURIComponent(cName)}&mes=eq.${MES}&ano=eq.${ANO}&cenario=eq.${encodeURIComponent(payload.cenario)}`;
  const checkRes = await fetchWithRetry(checkUrl, { headers });
  if (!checkRes.ok) {
    console.error(`  [ERRO] Falha na checagem para ${cName}:`, await checkRes.text());
    return;
  }
  const exist = await checkRes.json();
  if (exist && exist.length > 0) {
    const rowId = exist[0].id;
    const patchRes = await fetchWithRetry(`${url}/rest/v1/roteiros?id=eq.${rowId}`, {
      method: 'PATCH',
      headers: { ...headers, 'Content-Type': 'application/json', 'Prefer': 'return=representation' },
      body: JSON.stringify(payload)
    });
    if (patchRes.ok) {
      console.log(`  [OK] ${cName} ATUALIZADO como '${VERSAO_NOME}' no cenário '${CENARIO}'.`);
    } else {
      console.error(`  [ERRO] Falha ao atualizar ${cName}:`, await patchRes.text());
    }
  } else {
    const postRes = await fetchWithRetry(`${url}/rest/v1/roteiros`, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json', 'Prefer': 'return=representation' },
      body: JSON.stringify(payload)
    });
    if (postRes.ok) {
      console.log(`  [OK] ${cName} INSERIDO como '${VERSAO_NOME}' no cenário '${CENARIO}'.`);
    } else {
      console.error(`  [ERRO] Falha ao inserir ${cName}:`, await postRes.text());
    }
  }
}

async function main() {
  console.log('=== SUBIR JOURNEY AGOSTO - APROVADO PARA SUPABASE ===');
  console.log(`Lendo arquivo: ${EXCEL_PATH}\n`);

  console.log('Carregando consultores do banco de dados...');
  const { data: dbConsultores, error: errC } = await supabase.from('consultores').select('*');
  if (errC) {
    console.error('Erro ao carregar consultores do banco:', errC);
    process.exit(1);
  }
  console.log(`${dbConsultores.length} consultores carregados da tabela consultores.\n`);

  const workbook = xlsx.readFile(EXCEL_PATH);
  const sheet = workbook.Sheets['Roteiros'] || workbook.Sheets[workbook.SheetNames[0]];
  
  // Converte linhas para array de objetos e encontra o cabeçalho correto
  const allRowsRaw = xlsx.utils.sheet_to_json(sheet, { header: 1, defval: '' });
  
  let headerRowIndex = 0;
  for (let i = 0; i < allRowsRaw.length; i++) {
    const rowStr = allRowsRaw[i].join(' ');
    if (rowStr.includes('Consultor') || rowStr.includes('Nome PDV')) {
      headerRowIndex = i;
      break;
    }
  }

  const rawHeaders = allRowsRaw[headerRowIndex].map(h => (h || '').toString().trim());
  console.log(`Cabeçalho encontrado na linha ${headerRowIndex + 1}:`, rawHeaders.filter(Boolean));

  const dataRowsRaw = allRowsRaw.slice(headerRowIndex + 1);
  const rows = dataRowsRaw.map(rowArr => {
    const obj = {};
    rawHeaders.forEach((h, idx) => {
      if (h) obj[h] = rowArr[idx];
    });
    return obj;
  }).filter(r => Object.values(r).some(v => v !== ''));

  console.log(`${rows.length} linhas de dados lidas do Excel public.\n`);

  console.log(`Cadastrando versão '${VERSAO_NOME}' na tabela 'versoes_roteiro'...`);
  const { error: errV } = await supabase
    .from('versoes_roteiro')
    .upsert({
      id: VERSAO_ID,
      nome: VERSAO_NOME,
      descricao: 'Roteiro de Agosto Aprovado na íntegra da pasta public.'
    }, { onConflict: 'id' });
  if (errV) {
    console.error('Erro ao cadastrar versão na tabela versoes_roteiro:', errV);
  } else {
    console.log(`Versão '${VERSAO_NOME}' cadastrada com sucesso na tabela versoes_roteiro.\n`);
  }

  const porConsultor = {};

  for (const row of rows) {
    const consultor = (row['Consultor'] || '').toString().trim();
    const dataStr = excelDateToStr(row['Data']);
    const diaSem = (row['Dia da Semana'] || '').toString().trim().toUpperCase();
    const nomePdv = (row['Nome PDV'] || '').toString().trim();
    const filial = (row['Filial'] || '').toString().trim();
    const cliente = (row['Cliente'] || '').toString().trim();
    const cidade = (row['Cidade'] || '').toString().trim();
    const uf = (row['UF'] || '').toString().trim();
    const cluster = (row['Cluster'] || '').toString().trim();
    const rota = (row['Rota'] || '').toString().trim();
    const tipo = (row['Tipo'] || '').toString().trim();

    const checkIn = formatTime(row['Check-in'] || row['Check-In'], '09:00');
    const checkOut = formatTime(row['Check-out'] || row['Check-Out'], '12:00');

    if (!consultor || !dataStr) continue;

    if (!porConsultor[consultor]) porConsultor[consultor] = {};
    if (!porConsultor[consultor][dataStr]) {
      porConsultor[consultor][dataStr] = {
        data: dataStr,
        diaSemana: diaSem,
        lojas: []
      };
    }

    const tipoNorm = normalize(tipo);
    const pdvNorm = normalize(nomePdv);

    if (tipoNorm.includes('FERIADO') || pdvNorm.includes('FERIADO')) {
      porConsultor[consultor][dataStr].feriado = nomePdv || 'Feriado';
    } else {
      porConsultor[consultor][dataStr].lojas.push({
        nome_pdv: nomePdv,
        filial,
        cliente,
        cidade,
        uf,
        cluster,
        checkIn,
        checkOut,
        tipo: tipoNorm.includes('VIAGEM') ? 'viagem' : (tipoNorm.includes('EVENTO') ? 'evento' : 'local'),
        estadoViagem: tipoNorm.includes('VIAGEM') ? uf : undefined,
        rota
      });
    }
  }

  const baseHeaders = { apikey: key, Authorization: `Bearer ${key}` };

  for (const [cName, diasMap] of Object.entries(porConsultor)) {
    const roteiro = Object.values(diasMap).sort((a, b) => a.data.localeCompare(b.data));
    const totalLojas = roteiro.reduce((acc, d) => acc + d.lojas.length, 0);

    const cDb = dbConsultores.find(c => normalize(c.nome).includes(normalize(cName)));
    const consultorCoords = cDb ? { lat: cDb.lat, lng: cDb.lng } : { lat: -15.77, lng: -47.92 };

    let totalEstimatedKM = 0;
    roteiro.forEach(dia => {
      if (dia.lojas.length === 0) return;

      let firstStore = dia.lojas[0];
      let firstCoords = { lat: firstStore.lat, lng: firstStore.lng };
      if (!firstCoords.lat || !firstCoords.lng) {
        const keyCity = normalize(`${firstStore.cidade}-${firstStore.uf}`);
        const coords = cityCoords[keyCity];
        if (coords) firstCoords = coords;
      }

      const distToHub = (firstCoords.lat && firstCoords.lng)
        ? computeDistance(consultorCoords, firstCoords)
        : 0;

      const goesByPlane = distToHub > 350;
      let curr = goesByPlane ? firstCoords : consultorCoords;
      let diaEstimado = 0;

      dia.lojas.forEach((loja, idx) => {
        let lat = loja.lat;
        let lng = loja.lng;

        if (!lat || !lng) {
          const keyCity = normalize(`${loja.cidade}-${loja.uf}`);
          const coords = cityCoords[keyCity];
          if (coords) {
            lat = coords.lat;
            lng = coords.lng;
          }
        }

        if (lat && lng) {
          if (idx === 0 && goesByPlane) {
            diaEstimado += 5;
            curr = { lat, lng };
          } else {
            diaEstimado += computeDistance(curr, { lat, lng });
            curr = { lat, lng };
          }
        }
      });

      if (!goesByPlane) {
        diaEstimado += computeDistance(curr, consultorCoords);
      } else {
        diaEstimado += 5;
      }

      totalEstimatedKM += (diaEstimado * 1.3);
    });

    const estimatedCost = totalEstimatedKM * 0.80;

    const diasUteisCount = roteiro.filter(d => !d.feriado || d.feriado.startsWith('__viagem')).length;

    console.log(`[${cName}] ${diasUteisCount} dias úteis | ${totalLojas} visitas | KM Estimado: ${totalEstimatedKM.toFixed(1)} km | Custo: R$ ${estimatedCost.toFixed(2)}`);

    const dadosRoteiro = {
      consultor: cName,
      mes: MES,
      ano: ANO,
      cenario: CENARIO,
      versao_id: VERSAO_ID,
      versao_nome: VERSAO_NOME,
      totalLojas,
      totalDiasUteis: diasUteisCount,
      totalEstimatedKM,
      estimatedCost,
      extraCosts: { flights: {}, hotels: {} },
      roteiro
    };

    const payload = {
      consultor: cName,
      mes: MES,
      ano: ANO,
      status: 'Aprovado',
      cenario: CENARIO,
      versao_id: VERSAO_ID,
      versao_nome: VERSAO_NOME,
      dados_roteiro: dadosRoteiro
    };

    await salvarNoSupabase(cName, payload, baseHeaders);
  }

  console.log(`\n=== CONCLUÍDO — Versão '${VERSAO_NOME}' salva com sucesso no Supabase no cenário '${CENARIO}'! ===\n`);
}

main().catch(err => {
  console.error('Erro na execução:', err);
  process.exit(1);
});
