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

// Importa coordenadas das cidades para cálculo de distância
const cityCoords = require('./src/lib/city_coords.json');

const EXCEL_PATH = path.resolve(__dirname, '../Journey Agosto - Versão 1.xlsx');
const CENARIO = 'agosto v1';
const VERSAO_ID = 'v-agosto-v1';
const VERSAO_NOME = 'Agosto - V1';

function normalize(str) {
  return (str || '').toString().normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().trim();
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

// Função Haversine para cálculo de distância
function computeDistance(p1, p2) {
  const R = 6371; // Raio da Terra em km
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

async function salvarNoSupabase(cName, payload, headers) {
  const checkUrl = `${url}/rest/v1/roteiros?consultor=eq.${encodeURIComponent(cName)}&mes=eq.8&ano=eq.2026&cenario=eq.${encodeURIComponent(payload.cenario)}`;
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
  console.log('=== SUBIR AGOSTO V1 DO EXCEL ===');
  console.log(`Lendo: ${EXCEL_PATH}\n`);

  // Carrega consultores do Supabase para obter Hub Coordinates
  console.log('Carregando consultores do banco de dados...');
  const { data: dbConsultores, error: errC } = await supabase.from('consultores').select('*');
  if (errC) {
    console.error('Erro ao carregar consultores do banco:', errC);
    process.exit(1);
  }
  console.log(`${dbConsultores.length} consultores carregados.\n`);

  const workbook = xlsx.readFile(EXCEL_PATH);
  const sheet = workbook.Sheets['Roteiros'];
  const rows = xlsx.utils.sheet_to_json(sheet, { defval: '' });
  console.log(`${rows.length} linhas na aba Roteiros.\n`);

  // Cadastra ou atualiza a versão na tabela 'versoes_roteiro' para aparecer no modal
  console.log(`Cadastrando versão '${VERSAO_NOME}' na tabela 'versoes_roteiro'...`);
  const { error: errV } = await supabase
    .from('versoes_roteiro')
    .upsert({
      id: VERSAO_ID,
      nome: VERSAO_NOME,
      descricao: 'Roteiro de Agosto - Versão 1 com replicação de Julho e ajustes de viagens.'
    }, { onConflict: 'id' });
  if (errV) {
    console.error('Erro ao cadastrar versão na tabela versoes_roteiro:', errV);
  } else {
    console.log(`Versão '${VERSAO_NOME}' cadastrada com sucesso.\n`);
  }

  // =============================================
  // DELEÇÃO DOS CONSULTORES EM FÉRIAS
  // Garante que os registros antigos sejam apagados
  // mesmo que eles não tenham visitas no novo upload
  // =============================================
  const consultoresFerias = [
    'LUIZ FALCAO DE SOUZA NETO' // Férias 10/08 a 08/09
  ];
  const headersBase = { apikey: key, Authorization: `Bearer ${key}` };

  for (const cFerias of consultoresFerias) {
    const delUrl = `${url}/rest/v1/roteiros?consultor=eq.${encodeURIComponent(cFerias)}&mes=eq.8&ano=eq.2026&cenario=eq.${encodeURIComponent(CENARIO)}`;
    const delRes = await fetch(delUrl, { method: 'DELETE', headers: { ...headersBase, 'Prefer': 'return=representation' } });
    if (delRes.ok) {
      console.log(`  [FÉRIAS] Registro de ${cFerias} apagado do Supabase (férias em Agosto).`);
    } else {
      console.error(`  [ERRO] Falha ao apagar registro de ${cFerias}:`, await delRes.text());
    }
  }
  console.log('');

  // Agrupar por consultor → por data
  const porConsultor = {};

  for (const row of rows) {
    const consultor = (row['Consultor'] || '').toString().trim().toUpperCase();
    if (!consultor) continue;

    const dataStr = excelDateToStr(row['Data']);
    if (!dataStr) continue;

    const nomePdv = (row['Nome PDV'] || '').toString().trim();
    const filial = (row['Filial'] || '').toString().trim();
    const cliente = (row['Cliente'] || '').toString().trim();
    const cidade = (row['Cidade'] || '').toString().trim();
    const uf = (row['UF'] || '').toString().trim();
    const cluster = (row['Cluster'] || '').toString().trim();
    const rota = (row['Rota'] || '').toString().trim();
    const tipo = (row['Tipo'] || 'Local').toString().trim();
    const diaSem = (row['Dia da Semana'] || '').toString().trim().toUpperCase();
    let checkIn = (row['Check-in'] || row['Check-In'] || '09:00').toString().trim();
    let checkOut = (row['Check-out'] || row['Check-Out'] || '12:00').toString().trim();

    if (checkIn.length > 5) checkIn = checkIn.substring(0, 5);
    if (checkOut.length > 5) checkOut = checkOut.substring(0, 5);

    const statusVal = (row['Status'] || '').toString().trim().toUpperCase();
    const filialVal = (row['Filial'] || '').toString().trim().toUpperCase();
    const cnpjVal = (row['Cnpj'] || '').toString().trim().toUpperCase();

    const isFeriadoOuFolga = statusVal.includes('FERIADO') || statusVal.includes('FOLGA') ||
      filialVal.includes('FERIADO') || cnpjVal.includes('FERIADO');

    if (!porConsultor[consultor]) porConsultor[consultor] = {};
    if (!porConsultor[consultor][dataStr]) {
      porConsultor[consultor][dataStr] = {
        data: dataStr,
        diaSemana: diaSem,
        lojas: []
      };
    }

    if (isFeriadoOuFolga) {
      porConsultor[consultor][dataStr].feriado = nomePdv || 'Feriado/Folga';
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
        tipo: tipo.toLowerCase().includes('viagem') ? 'viagem' : 'local',
        estadoViagem: tipo.toLowerCase().includes('viagem') ? uf : undefined,
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

    // --- CÁLCULO DE KM ESTIMADO ---
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

    console.log(`\n[${cName}] ${roteiro.length} dias | ${totalLojas} visitas | KM Estimado: ${totalEstimatedKM.toFixed(1)} km | Custo: R$ ${estimatedCost.toFixed(2)}`);

    const dadosRoteiro = {
      consultor: cName,
      mes: 8,
      ano: 2026,
      totalLojas,
      totalDiasUteis: roteiro.length,
      totalEstimatedKM: totalEstimatedKM,
      estimatedCost: estimatedCost,
      extraCosts: { flights: {}, hotels: {} },
      roteiro
    };

    const payload = {
      consultor: cName,
      mes: 8,
      ano: 2026,
      cenario: CENARIO,
      versao_id: VERSAO_ID,
      versao_nome: VERSAO_NOME,
      dados_roteiro: dadosRoteiro,
      status: 'APROVADO'
    };

    await salvarNoSupabase(cName, payload, baseHeaders);
  }

  console.log(`\n=== CONCLUÍDO — '${VERSAO_NOME}' salvo no Supabase! ===`);
}

main().catch(err => {
  console.error('Erro fatal:', err);
  process.exit(1);
});
