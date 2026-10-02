/**
 * Recalcula KM dos roteiros de outubro cruzando com coords das lojas no banco.
 */
const { createClient } = require('@supabase/supabase-js');

const SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InByYndhd25ybW11a2xrcGRrbmR6Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4OTQwMjM2NSwiZXhwIjoyMTA0OTc4MzY1fQ.4jY9uuqm5bXc6r8bTA4BlqtMs0T7dg3KUlRAg_OZyBk';
const supabase = createClient('https://prbwawnrmmuklkpdkndz.supabase.co', SERVICE_KEY);

const CONSULTOR_COORDS = {
  'LIEDY AQUINO GOMES DOS SANTOS':      { lat: -23.69202666239621,  lng: -46.58843079150503 },
  'DIOGO DO NASCIMENTO SANTOS':          { lat: -22.657981461361462, lng: -43.286510005041265 },
  'LUIZ FALCAO DE SOUZA NETO':           { lat: -7.926160344362215,  lng: -34.82578202080634 },
  'MARCIO JOSE FLORES PEREIRA':          { lat: -30.026159428287684, lng: -51.11646683354198 },
  'TATIANE SOUZA DOS SANTOS':            { lat: -12.983108215809484, lng: -38.497329981835826 },
};

const CUSTO_KM = 0.80;

// Mapa cidade/UF de grandes capitais como fallback
const CITY_COORDS = {
  'SAO PAULO-SP':        { lat: -23.5505, lng: -46.6333 },
  'SÃO PAULO-SP':        { lat: -23.5505, lng: -46.6333 },
  'RIO DE JANEIRO-RJ':   { lat: -22.9068, lng: -43.1729 },
  'PORTO ALEGRE-RS':     { lat: -30.0346, lng: -51.2177 },
  'BELO HORIZONTE-MG':   { lat: -19.9167, lng: -43.9345 },
  'SALVADOR-BA':         { lat: -12.9714, lng: -38.5014 },
  'RECIFE-PE':           { lat: -8.0476,  lng: -34.8770 },
  'FORTALEZA-CE':        { lat: -3.7172,  lng: -38.5434 },
  'CAMPINAS-SP':         { lat: -22.9056, lng: -47.0608 },
  'CURITIBA-PR':         { lat: -25.4278, lng: -49.2731 },
  'DIADEMA-SP':          { lat: -23.6861, lng: -46.6228 },
  'GUARULHOS-SP':        { lat: -23.4543, lng: -46.5338 },
  'OSASCO-SP':           { lat: -23.5329, lng: -46.7919 },
  'SANTO ANDRE-SP':      { lat: -23.6639, lng: -46.5338 },
  'SAO BERNARDO DO CAMPO-SP': { lat: -23.6939, lng: -46.5650 },
};

function haversine(p1, p2) {
  const R = 6371;
  const dLat = (p2.lat - p1.lat) * Math.PI / 180;
  const dLon = (p2.lng - p1.lng) * Math.PI / 180;
  const a = Math.sin(dLat/2)**2 +
    Math.cos(p1.lat*Math.PI/180) * Math.cos(p2.lat*Math.PI/180) * Math.sin(dLon/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

function getLojaCoords(loja, lojaMap) {
  // 1. Tenta pelo nome_pdv exato
  if (loja.nome_pdv && lojaMap[loja.nome_pdv]) return lojaMap[loja.nome_pdv];
  if (loja.filial && lojaMap[loja.filial]) return lojaMap[loja.filial];

  // 2. Tenta busca parcial pelo inicio do nome_pdv (codigo SAP S0XXXX)
  const codigoMatch = (loja.nome_pdv || '').match(/^(S\d{5})/);
  if (codigoMatch) {
    const codigo = codigoMatch[1];
    const found = Object.entries(lojaMap).find(([k]) => k.startsWith(codigo));
    if (found) return found[1];
  }

  // 3. Fallback: centro da cidade
  const key = (loja.cidade || '').toUpperCase().trim() + '-' + (loja.uf || '').toUpperCase().trim();
  if (CITY_COORDS[key]) return CITY_COORDS[key];
  
  return null;
}

function recalcularDia(dia, homeCoords, lojaMap) {
  if (!dia.lojas || dia.lojas.length === 0) return 0;
  
  const lojas = dia.lojas.filter(l => !l.feriado);
  if (lojas.length === 0) return 0;

  const goesByPlane = lojas.some(l => l.tipo === 'viagem');
  let diaKM = 0;

  if (goesByPlane) {
    // Em viagem: calcula entre lojas consecutivas (já descontado o voo)
    for (let i = 0; i < lojas.length - 1; i++) {
      const c1 = getLojaCoords(lojas[i], lojaMap);
      const c2 = getLojaCoords(lojas[i+1], lojaMap);
      if (c1 && c2) diaKM += haversine(c1, c2);
    }
  } else {
    // Dia local: casa -> lojas -> casa
    let curr = homeCoords;
    for (const loja of lojas) {
      const coords = getLojaCoords(loja, lojaMap);
      if (coords) {
        diaKM += haversine(curr, coords);
        curr = coords;
      }
    }
    // Volta para casa
    diaKM += haversine(curr, homeCoords);
  }

  return diaKM;
}

async function main() {
  console.log('Buscando lojas no banco...');
  let allLojas = [];
  let from = 0;
  const pageSize = 1000;
  while (true) {
    const { data, error } = await supabase.from('lojas_julho').select('nome_pdv,lat,lng,cidade,uf').range(from, from + pageSize - 1);
    if (error) { console.error('Erro ao buscar lojas:', error); break; }
    if (!data || data.length === 0) break;
    allLojas = allLojas.concat(data);
    if (data.length < pageSize) break;
    from += pageSize;
  }
  console.log('Total lojas com coords:', allLojas.filter(l => l.lat && l.lng).length, '/', allLojas.length);

  // Montar mapa nome_pdv -> {lat, lng}
  const lojaMap = {};
  for (const l of allLojas) {
    if (l.lat && l.lng && l.nome_pdv) {
      lojaMap[l.nome_pdv] = { lat: l.lat, lng: l.lng };
    }
  }

  // Buscar roteiros de OUTUBRO aprovados
  const { data: roteiros, error: errR } = await supabase
    .from('roteiros')
    .select('id, consultor, mes, status, dados_roteiro')
    .eq('mes', 10)
    .ilike('status', 'APROVADO');

  if (errR) { console.error('Erro ao buscar roteiros:', errR); return; }
  console.log('Roteiros outubro para recalcular:', roteiros.length);
  console.log('');

  for (const r of roteiros) {
    const homeCoords = CONSULTOR_COORDS[r.consultor];
    if (!homeCoords) {
      console.log('[SKIP] Sem coords de casa: ' + r.consultor);
      continue;
    }

    const dr = r.dados_roteiro || {};
    const kmAntigo = dr.totalEstimatedKM || 0;
    let totalKM = 0;
    let diasSemCoord = 0;

    for (const dia of (dr.roteiro || [])) {
      if (!dia.lojas || dia.lojas.length === 0) continue;
      const lojas = dia.lojas.filter(l => !l.feriado);
      if (lojas.length === 0) continue;

      // Enriquecer com coords do banco se não tiver
      for (const loja of lojas) {
        if (!loja.lat || !loja.lng) {
          const coords = getLojaCoords(loja, lojaMap);
          if (coords) { loja.lat = coords.lat; loja.lng = coords.lng; }
        }
      }

      const diaKM = recalcularDia(dia, homeCoords, lojaMap);
      if (diaKM === 0 && lojas.some(l => l.tipo !== 'viagem')) diasSemCoord++;
      totalKM += diaKM;
    }

    // Custo base + extras
    let custoNovo = totalKM * CUSTO_KM;
    const parking = (dr.extraCosts || {}).parking || (dr.extraCosts || {}).other || 0;
    custoNovo += parking;

    const drAtualizado = {
      ...dr,
      totalEstimatedKM: Math.round(totalKM * 10) / 10,
      estimatedCost: Math.round(custoNovo * 100) / 100,
    };

    const { error: updErr } = await supabase.from('roteiros').update({ dados_roteiro: drAtualizado }).eq('id', r.id);

    const delta = Math.round(totalKM - kmAntigo);
    const warn = diasSemCoord > 0 ? ' [!' + diasSemCoord + ' dias sem coord]' : '';
    if (updErr) {
      console.error('[ERRO] ' + r.consultor.split(' ')[0] + ': ' + updErr.message);
    } else {
      console.log('[OK] ' + r.consultor.split(' ')[0].padEnd(10) + '| KM: ' + Math.round(kmAntigo).toString().padStart(5) + ' -> ' + Math.round(totalKM).toString().padStart(5) + ' (' + (delta >= 0 ? '+' : '') + delta + ' km) | Custo: R$ ' + custoNovo.toFixed(2) + warn);
    }
  }

  console.log('');
  console.log('Feito!');
}

main().catch(console.error);
