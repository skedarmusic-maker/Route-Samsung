/**
 * Recalcula KM e custo dos roteiros do Outubro (mes=10) com coords corretas
 * e atualiza direto no Supabase.
 */
const { createClient } = require('@supabase/supabase-js');

const SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InByYndhd25ybW11a2xrcGRrbmR6Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4OTQwMjM2NSwiZXhwIjoyMTA0OTc4MzY1fQ.4jY9uuqm5bXc6r8bTA4BlqtMs0T7dg3KUlRAg_OZyBk';
const supabase = createClient('https://prbwawnrmmuklkpdkndz.supabase.co', SERVICE_KEY);

const CONSULTOR_COORDS = {
  'LIEDY AQUINO GOMES DOS SANTOS':      { lat: -23.69202666239621,  lng: -46.58843079150503 },
  'DIOGO DO NASCIMENTO SANTOS':          { lat: -22.657981461361462, lng: -43.286510005041265 },
  'LUIZ FALCAO DE SOUZA NETO':           { lat: -7.926160344362215,  lng: -34.82578202080634 },
  'MARCIO JOSE FLORES PEREIRA':          { lat: -30.026159428287684, lng: -51.11646683354198 },
  'ALEXANDRE RIBEIRO LIMA':              { lat: -20.784777890687277, lng: -49.403974737990815 },
  'PAULO SERGIO MARQUES DA SILVA':       { lat: -23.702361878723178, lng: -46.64208060499863 },
  'TATIANE SOUZA DOS SANTOS':            { lat: -12.983108215809484, lng: -38.497329981835826 },
};

const CUSTO_KM = 0.80;

function haversine(p1, p2) {
  const R = 6371;
  const dLat = (p2.lat - p1.lat) * Math.PI / 180;
  const dLon = (p2.lng - p1.lng) * Math.PI / 180;
  const a = Math.sin(dLat/2)**2 +
    Math.cos(p1.lat*Math.PI/180) * Math.cos(p2.lat*Math.PI/180) * Math.sin(dLon/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

function recalcularKM(dadosRoteiro, homeCoords) {
  const roteiro = dadosRoteiro.roteiro || [];
  let totalKM = 0;

  for (const dia of roteiro) {
    if (!dia.lojas || dia.lojas.length === 0) continue;
    const lojas = dia.lojas.filter(l => l.lat && l.lng);
    if (lojas.length === 0) continue;

    const goesByPlane = lojas.some(l => l.tipo === 'viagem');

    if (goesByPlane) {
      for (let i = 0; i < lojas.length - 1; i++) {
        totalKM += haversine(
          { lat: lojas[i].lat, lng: lojas[i].lng },
          { lat: lojas[i+1].lat, lng: lojas[i+1].lng }
        );
      }
    } else {
      let curr = homeCoords;
      for (const loja of lojas) {
        totalKM += haversine(curr, { lat: loja.lat, lng: loja.lng });
        curr = { lat: loja.lat, lng: loja.lng };
      }
      totalKM += haversine(curr, homeCoords);
    }
  }

  return totalKM;
}

async function main() {
  const { data: roteiros, error } = await supabase
    .from('roteiros')
    .select('id, consultor, mes, ano, status, dados_roteiro')
    .eq('mes', 10)
    .ilike('status', 'APROVADO');

  if (error) { console.error('Erro ao buscar:', error); return; }

  console.log('Encontrados ' + roteiros.length + ' roteiros de outubro para recalcular...');

  for (const r of roteiros) {
    const homeCoords = CONSULTOR_COORDS[r.consultor];
    if (!homeCoords) {
      console.log('[SKIP] Sem coords: ' + r.consultor);
      continue;
    }

    const dr = r.dados_roteiro || {};
    const kmAntigo = dr.totalEstimatedKM || 0;
    const kmNovo = recalcularKM(dr, homeCoords);

    let custoNovo = kmNovo * CUSTO_KM;
    const extraCosts = dr.extraCosts || {};
    const parking = extraCosts.parking || extraCosts.other || 0;
    custoNovo += parking;

    const drAtualizado = {
      ...dr,
      totalEstimatedKM: Math.round(kmNovo * 10) / 10,
      estimatedCost: Math.round(custoNovo * 100) / 100,
    };

    const { error: updateError } = await supabase
      .from('roteiros')
      .update({ dados_roteiro: drAtualizado })
      .eq('id', r.id);

    if (updateError) {
      console.error('[ERRO] ' + r.consultor + ' - ' + updateError.message);
    } else {
      const delta = Math.round(kmNovo - kmAntigo);
      console.log('[OK] ' + r.consultor.split(' ')[0] + ' | KM: ' + Math.round(kmAntigo) + ' -> ' + Math.round(kmNovo) + ' (' + (delta >= 0 ? '+' : '') + delta + ' km) | Custo: R$ ' + custoNovo.toFixed(2));
    }
  }

  console.log('Concluido!');
}

main().catch(console.error);
