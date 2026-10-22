import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import cityCoords from '@/lib/city_coords.json';
import airports from '@/lib/airports.json';
import benchmark360 from '@/lib/benchmark_custos_real_360.json';
import axios from 'axios';

// Função Haversine pura (linha reta)
function computeHaversine(p1: { lat: number; lng: number }, p2: { lat: number; lng: number }): number {
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

// Obter distância rodoviária real via OSRM (com fallback para Haversine calibrado em 1.38x)
async function getRoadDistance(
  p1: { lat: number; lng: number },
  p2: { lat: number; lng: number }
): Promise<{ km: number; isRoad: boolean; durationHours: number }> {
  try {
    const url = `https://router.project-osrm.org/route/v1/driving/${p1.lng},${p1.lat};${p2.lng},${p2.lat}?overview=false`;
    const res = await axios.get(url, { timeout: 3500 });
    if (res.data?.routes?.[0]?.distance) {
      const km = Math.round(res.data.routes[0].distance / 1000);
      const durationHours = Math.round((res.data.routes[0].duration / 3600) * 10) / 10;
      return { km, isRoad: true, durationHours };
    }
  } catch (err) {
    // Falha silenciosa, usa fallback geométrico calibrado
  }

  const straight = computeHaversine(p1, p2);
  const km = Math.round(straight * 1.38); // Fator de curvas de rodovias no Brasil
  const durationHours = Math.round((km / 75) * 10) / 10; // Média de 75 km/h
  return { km, isRoad: false, durationHours };
}

// Mapeador Inteligente de Aeroportos
function getIataAirport(cidade: string, uf: string): string {
  const cleanCidade = (cidade || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .trim();
  const cleanUf = (uf || '').toUpperCase().trim();

  const cityMap: Record<string, string> = {
    'FOZ DO IGUACU': 'IGU',
    'MARINGA': 'MGF',
    'LONDRINA': 'LDB',
    'CASCAVEL': 'CAC',
    'PORTO ALEGRE': 'POA',
    'CURITIBA': 'CWB',
    'SAO PAULO': 'GRU',
    'DIADEMA': 'CGH',
    'CAMPINAS': 'VCP',
    'RIO DE JANEIRO': 'GIG',
    'DUQUE DE CAXIAS': 'GIG',
    'SALVADOR': 'SSA',
    'RECIFE': 'REC',
    'PAULISTA': 'REC',
    'BRASILIA': 'BSB',
    'GOIANIA': 'GYN',
    'FLORIANOPOLIS': 'FLN',
    'JOINVILLE': 'JOI',
    'NAVEGANTES': 'NVT',
    'BELO HORIZONTE': 'CNF',
    'VITORIA': 'VIX'
  };

  if (cityMap[cleanCidade]) return cityMap[cleanCidade];
  if ((airports as any)[cleanCidade]) return (airports as any)[cleanCidade];
  if ((airports as any)[cleanUf]) return (airports as any)[cleanUf];
  return 'GRU';
}

async function fetchRealFlightPrice(
  originCidade: string,
  originUf: string,
  destCidade: string,
  destUf: string
): Promise<{ price: number; isRealPrice: boolean; source: string }> {
  const originIata = getIataAirport(originCidade, originUf);
  const destIata = getIataAirport(destCidade, destUf);

  if (originIata === destIata) {
    return { price: 0, isRealPrice: true, source: 'Mesmo Aeroporto' };
  }

  const rapidApiKey = process.env.RAPIDAPI_KEY;
  const rapidApiHost = process.env.RAPIDAPI_HOST || 'google-flights2.p.rapidapi.com';

  if (rapidApiKey && rapidApiHost) {
    try {
      const date = new Date();
      date.setDate(date.getDate() + 18);
      const dateStr = date.toISOString().split('T')[0];

      const res = await axios.get(`https://${rapidApiHost}/api/v1/searchFlights`, {
        params: {
          departure_id: originIata,
          arrival_id: destIata,
          outbound_date: dateStr,
          currency: 'BRL',
          travel_class: 'ECONOMY',
          adults: '1',
          show_hidden: '1',
          language_code: 'pt-BR',
          country_code: 'BR',
          search_type: 'best'
        },
        headers: {
          'x-rapidapi-key': rapidApiKey,
          'x-rapidapi-host': rapidApiHost
        },
        timeout: 10000
      });

      const itineraries = res.data?.data?.itineraries || {};
      const allFlights = [
        ...(itineraries.topFlights || []),
        ...(itineraries.otherFlights || [])
      ];

      const best = allFlights[0]?.price || res.data?.data?.priceHistory?.summary?.current;
      if (best && Number(best) > 0) {
        return { price: Math.round(Number(best)), isRealPrice: true, source: 'Google Flights' };
      }
    } catch (e: any) {
      // Fallback para matriz de benchmark calibrada
    }
  }

  // Matriz de Contingência Calibrada por Hub de Origem e Destino
  const cleanDest = destCidade.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().trim();
  const cleanOrig = originCidade.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().trim();
  const origUfUpper = (originUf || '').toUpperCase();

  // Foz do Iguaçu (IGU)
  if (cleanDest === 'FOZ DO IGUACU') {
    if (origUfUpper === 'SP') return { price: 732, isRealPrice: false, source: 'Benchmark Compras SP' };
    if (origUfUpper === 'RS') return { price: 1018, isRealPrice: false, source: 'Benchmark Compras RS' };
    if (origUfUpper === 'RJ') return { price: 850, isRealPrice: false, source: 'Benchmark Compras RJ' };
    if (origUfUpper === 'PR') return { price: 1219, isRealPrice: false, source: 'Benchmark Compras PR' };
    if (origUfUpper === 'BA' || origUfUpper === 'PE') return { price: 1550, isRealPrice: false, source: 'Benchmark Nordeste' };
  }

  // Maringá (MGF)
  if (cleanDest === 'MARINGA') {
    if (origUfUpper === 'SP') return { price: 791, isRealPrice: false, source: 'Benchmark Compras SP' };
    if (origUfUpper === 'RS') return { price: 1069, isRealPrice: false, source: 'Benchmark Compras RS' };
    if (origUfUpper === 'RJ') return { price: 880, isRealPrice: false, source: 'Benchmark Compras RJ' };
    if (origUfUpper === 'PR') return { price: 959, isRealPrice: false, source: 'Benchmark Compras PR' };
    if (origUfUpper === 'BA' || origUfUpper === 'PE') return { price: 1600, isRealPrice: false, source: 'Benchmark Nordeste' };
  }

  // Estimativa geral por região
  if (origUfUpper === 'SP' || origUfUpper === 'RJ' || origUfUpper === 'DF') {
    return { price: 780, isRealPrice: false, source: 'Estimativa Hub Sudeste' };
  }
  if (origUfUpper === 'RS' || origUfUpper === 'SC') {
    return { price: 1050, isRealPrice: false, source: 'Estimativa Sul' };
  }
  return { price: 1450, isRealPrice: false, source: 'Estimativa Geral' };
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const cidade = searchParams.get('cidade');
    const uf = searchParams.get('uf');

    if (!cidade || !uf) {
      return NextResponse.json({ error: 'Faltam os parâmetros cidade e uf.' }, { status: 400 });
    }

    const cleanCid = cidade.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().trim();
    const cleanUf = uf.toUpperCase().trim();
    const key = `${cleanCid}-${cleanUf}`;
    const coords = (cityCoords as any)[key] || (cityCoords as any)[`${cidade.toUpperCase()}-${cleanUf}`];

    if (!coords) {
      return NextResponse.json({ error: 'Coordenadas da cidade não encontradas no cache.' }, { status: 404 });
    }

    const { data: dataC, error: errorC } = await supabase.from('consultores').select('*');
    if (errorC) throw errorC;

    // Buscar custo de hotel homologado da praça no benchmark de Compras
    const hoteisHomologados = (benchmark360 as any).hospedagem_homologada_compras || {};
    const hotelInfo = hoteisHomologados[cleanCid] || hoteisHomologados[cidade.toUpperCase()];
    const custoHospedagemPadrao = hotelInfo?.media_diaria || 350;

    const consultores = (dataC || []).map(c => ({
      nome: c.nome,
      endereco: `${c.cidade || ''} - ${c.uf || ''}`,
      lat: Number(c.lat),
      lng: Number(c.lng),
      cidade: c.cidade || '',
      ufBase: c.uf || ''
    }));

    const consultoresComDistancia = await Promise.all(
      consultores.map(async (c) => {
        // Cálculo de distância rodoviária real
        const roadInfo = await getRoadDistance({ lat: c.lat, lng: c.lng }, coords);
        const kmReal = roadInfo.km;
        const durationHours = roadInfo.durationHours;

        let custoVoo = 0;
        let custoHospedagem = 0;
        let custoKm = 0;
        let kmCobrado = 0;
        let isRealPrice = false;
        let sourceVoo = 'Estimativa';

        // Regra de necessidade de voo:
        // Se a distância rodoviária for > 550 km OU mais de 6h30 de estrada OU se for outro estado distante
        const outroEstado = c.ufBase && c.ufBase.toUpperCase() !== cleanUf;
        const precisaVoo = kmReal > 550 || durationHours > 6.5 || (outroEstado && kmReal > 450);

        if (precisaVoo) {
          const flight = await fetchRealFlightPrice(c.cidade, c.ufBase, cidade, uf);
          custoVoo = flight.price;
          isRealPrice = flight.isRealPrice;
          sourceVoo = flight.source;

          custoHospedagem = custoHospedagemPadrao;
          kmCobrado = 40; // Deslocamento local no destino
          custoKm = kmCobrado * 0.80; // R$ 0,80 por KM
        } else {
          // Deslocamento rodoviário (ida e volta)
          kmCobrado = kmReal * 2;
          custoKm = kmCobrado * 0.80; // R$ 0,80 por KM
          if (kmReal > 200) {
            custoHospedagem = custoHospedagemPadrao;
          }
        }

        const custoTotal = custoVoo + custoKm + custoHospedagem;

        return {
          ...c,
          distanciaKm: kmReal,
          durationHours,
          estimativaCusto: {
            total: Math.round(custoTotal),
            voo: custoVoo,
            km: Math.round(custoKm),
            kmReferencia: kmCobrado,
            hospedagem: custoHospedagem,
            tipo: precisaVoo ? 'Aéreo' : 'Terrestre',
            isRealPrice,
            sourceVoo,
            isRoad: roadInfo.isRoad
          }
        };
      })
    );

    const sorted = consultoresComDistancia.sort(
      (a, b) => (a.estimativaCusto.total - b.estimativaCusto.total) || (a.distanciaKm - b.distanciaKm)
    );

    return NextResponse.json(sorted.slice(0, 6));
  } catch (error: any) {
    console.error('Erro na sugestão de journey:', error);
    return NextResponse.json({ error: error.message || 'Erro interno' }, { status: 500 });
  }
}
