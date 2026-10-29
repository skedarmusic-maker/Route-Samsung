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
    // Fallback geométrico calibrado
  }

  const straight = computeHaversine(p1, p2);
  const km = Math.round(straight * 1.38); // Fator de curvas de rodovias no Brasil
  const durationHours = Math.round((km / 75) * 10) / 10; // Média de 75 km/h
  return { km, isRoad: false, durationHours };
}

// Mapeamento das bases dos consultores com seu aeroporto preferencial e distância de traslado (km da residência até o aeroporto)
const consultorAeroportoBase: Record<string, { iata: string; nomeAeroporto: string; kmBaseAero: number }> = {
  'CAMPINAS': { iata: 'VCP', nomeAeroporto: 'Viracopos (VCP)', kmBaseAero: 16 },
  'DIADEMA': { iata: 'CGH', nomeAeroporto: 'Congonhas (CGH)', kmBaseAero: 18 },
  'SAO PAULO': { iata: 'CGH', nomeAeroporto: 'Congonhas (CGH)', kmBaseAero: 15 },
  'DUQUE DE CAXIAS': { iata: 'GIG', nomeAeroporto: 'Galeão (GIG)', kmBaseAero: 19 },
  'RIO DE JANEIRO': { iata: 'SDU', nomeAeroporto: 'Santos Dumont (SDU)', kmBaseAero: 12 },
  'PORTO ALEGRE': { iata: 'POA', nomeAeroporto: 'Salgado Filho (POA)', kmBaseAero: 12 },
  'SALVADOR': { iata: 'SSA', nomeAeroporto: 'Salvador (SSA)', kmBaseAero: 24 },
  'PAULISTA': { iata: 'REC', nomeAeroporto: 'Recife (REC)', kmBaseAero: 28 },
  'RECIFE': { iata: 'REC', nomeAeroporto: 'Recife (REC)', kmBaseAero: 14 },
  'CURITIBA': { iata: 'CWB', nomeAeroporto: 'Afonso Pena (CWB)', kmBaseAero: 18 },
  'BELO HORIZONTE': { iata: 'CNF', nomeAeroporto: 'Confins (CNF)', kmBaseAero: 35 },
  'BRASILIA': { iata: 'BSB', nomeAeroporto: 'Brasília (BSB)', kmBaseAero: 15 }
};

// Mapeador de Aeroporto de Destino
function getDestIataAirport(cidade: string, uf: string): { iata: string; nome: string } {
  const cleanCidade = (cidade || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .trim();
  const cleanUf = (uf || '').toUpperCase().trim();

  const cityMap: Record<string, { iata: string; nome: string }> = {
    'FOZ DO IGUACU': { iata: 'IGU', nome: 'Foz do Iguaçu (IGU)' },
    'MARINGA': { iata: 'MGF', nome: 'Maringá (MGF)' },
    'LONDRINA': { iata: 'LDB', nome: 'Londrina (LDB)' },
    'CASCAVEL': { iata: 'CAC', nome: 'Cascavel (CAC)' },
    'PORTO ALEGRE': { iata: 'POA', nome: 'Porto Alegre (POA)' },
    'CURITIBA': { iata: 'CWB', nome: 'Curitiba (CWB)' },
    'SAO PAULO': { iata: 'GRU', nome: 'São Paulo (GRU)' },
    'DIADEMA': { iata: 'CGH', nome: 'São Paulo (CGH)' },
    'CAMPINAS': { iata: 'VCP', nome: 'Campinas (VCP)' },
    'RIO DE JANEIRO': { iata: 'GIG', nome: 'Rio de Janeiro (GIG)' },
    'DUQUE DE CAXIAS': { iata: 'GIG', nome: 'Rio de Janeiro (GIG)' },
    'SALVADOR': { iata: 'SSA', nome: 'Salvador (SSA)' },
    'RECIFE': { iata: 'REC', nome: 'Recife (REC)' },
    'PAULISTA': { iata: 'REC', nome: 'Recife (REC)' },
    'BRASILIA': { iata: 'BSB', nome: 'Brasília (BSB)' },
    'GOIANIA': { iata: 'GYN', nome: 'Goiânia (GYN)' },
    'FLORIANOPOLIS': { iata: 'FLN', nome: 'Florianópolis (FLN)' },
    'JOINVILLE': { iata: 'JOI', nome: 'Joinville (JOI)' },
    'NAVEGANTES': { iata: 'NVT', nome: 'Navegantes (NVT)' },
    'BELO HORIZONTE': { iata: 'CNF', nome: 'Belo Horizonte (CNF)' },
    'VITORIA': { iata: 'VIX', nome: 'Vitória (VIX)' }
  };

  if (cityMap[cleanCidade]) return cityMap[cleanCidade];
  const directIata = (airports as any)[cleanCidade] || (airports as any)[cleanUf] || 'GRU';
  return { iata: directIata, nome: `${cidade} (${directIata})` };
}

// Matriz calibrada de rotas de benchmark por par de aeroportos (Origem IATA -> Destino IATA)
const matrizRotasCalibrada: Record<string, Record<string, { preco: number; source: string }>> = {
  'IGU': { // Foz do Iguaçu
    'CGH': { preco: 695, source: 'Rota CGH ➔ IGU' },
    'GRU': { preco: 710, source: 'Rota GRU ➔ IGU' },
    'VCP': { preco: 880, source: 'Rota VCP ➔ IGU' },
    'POA': { preco: 720, source: 'Rota POA ➔ IGU' },
    'GIG': { preco: 810, source: 'Rota GIG ➔ IGU' },
    'SDU': { preco: 830, source: 'Rota SDU ➔ IGU' },
    'SSA': { preco: 1140, source: 'Rota SSA ➔ IGU' },
    'REC': { preco: 1190, source: 'Rota REC ➔ IGU' },
    'CWB': { preco: 420, source: 'Rota CWB ➔ IGU' },
    'BSB': { preco: 790, source: 'Rota BSB ➔ IGU' },
    'CNF': { preco: 830, source: 'Rota CNF ➔ IGU' }
  },
  'MGF': { // Maringá
    'CGH': { preco: 720, source: 'Rota CGH ➔ MGF' },
    'GRU': { preco: 735, source: 'Rota GRU ➔ MGF' },
    'VCP': { preco: 890, source: 'Rota VCP ➔ MGF' },
    'POA': { preco: 820, source: 'Rota POA ➔ MGF' },
    'GIG': { preco: 860, source: 'Rota GIG ➔ MGF' },
    'CWB': { preco: 390, source: 'Rota CWB ➔ MGF' },
    'SSA': { preco: 1220, source: 'Rota SSA ➔ MGF' },
    'REC': { preco: 1280, source: 'Rota REC ➔ MGF' }
  },
  'LDB': { // Londrina
    'CGH': { preco: 690, source: 'Rota CGH ➔ LDB' },
    'GRU': { preco: 710, source: 'Rota GRU ➔ LDB' },
    'VCP': { preco: 840, source: 'Rota VCP ➔ LDB' },
    'POA': { preco: 790, source: 'Rota POA ➔ LDB' },
    'GIG': { preco: 840, source: 'Rota GIG ➔ LDB' },
    'CWB': { preco: 360, source: 'Rota CWB ➔ LDB' },
    'SSA': { preco: 1190, source: 'Rota SSA ➔ LDB' },
    'REC': { preco: 1240, source: 'Rota REC ➔ LDB' }
  },
  'CWB': { // Curitiba
    'CGH': { preco: 520, source: 'Rota CGH ➔ CWB' },
    'GRU': { preco: 540, source: 'Rota GRU ➔ CWB' },
    'VCP': { preco: 580, source: 'Rota VCP ➔ CWB' },
    'POA': { preco: 480, source: 'Rota POA ➔ CWB' },
    'GIG': { preco: 620, source: 'Rota GIG ➔ CWB' },
    'SSA': { preco: 980, source: 'Rota SSA ➔ CWB' },
    'REC': { preco: 1050, source: 'Rota REC ➔ CWB' }
  }
};

function getBenchmarkFlight(origIata: string, destIata: string, origUf: string, destUf: string) {
  if (matrizRotasCalibrada[destIata]?.[origIata]) {
    return matrizRotasCalibrada[destIata][origIata];
  }

  const sudeste = ['SP', 'RJ', 'MG', 'ES'];
  const sul = ['PR', 'SC', 'RS'];
  const nordeste = ['BA', 'PE', 'CE', 'RN', 'PB', 'AL', 'SE', 'MA', 'PI'];

  const origU = (origUf || '').toUpperCase();
  const destU = (destUf || '').toUpperCase();

  if (origU === destU) {
    return { preco: 420, source: `Rota Regional (${origIata} ➔ ${destIata})` };
  }
  if (sul.includes(origU) && sul.includes(destU)) {
    return { preco: 540, source: `Rota Sul (${origIata} ➔ ${destIata})` };
  }
  if (sudeste.includes(origU) && sul.includes(destU)) {
    return { preco: origIata === 'CGH' || origIata === 'GRU' ? 710 : 860, source: `Rota Sudeste-Sul (${origIata} ➔ ${destIata})` };
  }
  if (sudeste.includes(origU) && sudeste.includes(destU)) {
    return { preco: 650, source: `Rota Sudeste (${origIata} ➔ ${destIata})` };
  }
  if (nordeste.includes(origU) || nordeste.includes(destU)) {
    return { preco: 1180, source: `Rota Nordeste (${origIata} ➔ ${destIata})` };
  }
  return { preco: 890, source: `Rota Aérea (${origIata} ➔ ${destIata})` };
}

// Cache em memória para requisições de voo
const flightMemoryCache = new Map<string, { price: number; isRealPrice: boolean; source: string; iataRoute: string }>();

async function fetchRealFlightPrice(
  originIata: string,
  destIata: string,
  originCidade: string,
  originUf: string,
  destCidade: string,
  destUf: string
): Promise<{ price: number; isRealPrice: boolean; source: string; iataRoute: string }> {
  const iataRoute = `${originIata} ➔ ${destIata}`;

  if (originIata === destIata) {
    return { price: 0, isRealPrice: true, source: 'Mesmo Aeroporto', iataRoute };
  }

  const cacheKey = `${originIata}-${destIata}`;
  if (flightMemoryCache.has(cacheKey)) {
    return flightMemoryCache.get(cacheKey)!;
  }

  const rapidApiKey = process.env.RAPIDAPI_KEY || '21d1f3e496msh0e4b7a42d9dc8d7p1f4aeejsnfa6f3645d1c2';
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
        timeout: 8000
      });

      const itineraries = res.data?.data?.itineraries || {};
      const allFlights = [
        ...(itineraries.topFlights || []),
        ...(itineraries.otherFlights || [])
      ];

      const best = allFlights[0]?.price || res.data?.data?.priceHistory?.summary?.current;
      if (best && Number(best) > 0) {
        const result = {
          price: Math.round(Number(best)),
          isRealPrice: true,
          source: 'Google Flights',
          iataRoute
        };
        flightMemoryCache.set(cacheKey, result);
        return result;
      }
    } catch (e: any) {
      // Falha de API externa, cai no benchmark de rota calibrado
    }
  }

  const benchmark = getBenchmarkFlight(originIata, destIata, originUf, destUf);
  const result = {
    price: benchmark.preco,
    isRealPrice: false,
    source: benchmark.source,
    iataRoute
  };
  flightMemoryCache.set(cacheKey, result);
  return result;
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

    // Deduplicação defensiva de consultores por nome canônico
    const consultoresMap = new Map<string, any>();
    for (const c of dataC || []) {
      const nomeLimpo = (c.nome || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toUpperCase()
        .trim();

      // Unifica 'GIOVANA' e 'GIOVANNA MENDES' na mesma pessoa
      let chaveCanonica = nomeLimpo;
      if (nomeLimpo.includes('GIOVAN')) {
        chaveCanonica = 'GIOVANNA MENDES';
      }

      // Se ainda não foi adicionado ou se este registro tem nome mais completo
      if (!consultoresMap.has(chaveCanonica) || c.nome.length > consultoresMap.get(chaveCanonica).nome.length) {
        consultoresMap.set(chaveCanonica, {
          nome: chaveCanonica === 'GIOVANNA MENDES' ? 'GIOVANNA MENDES' : c.nome,
          cidade: c.cidade || '',
          ufBase: c.uf || '',
          endereco: `${c.cidade || ''} - ${c.uf || ''}`,
          lat: Number(c.lat),
          lng: Number(c.lng)
        });
      }
    }

    const consultores = Array.from(consultoresMap.values());

    // Custo de hotel homologado da praça no benchmark de Compras
    const hoteisHomologados = (benchmark360 as any).hospedagem_homologada_compras || {};
    const hotelInfo = hoteisHomologados[cleanCid] || hoteisHomologados[cidade.toUpperCase()];
    const custoHospedagemPadrao = hotelInfo?.media_diaria || 350;

    const destAirportInfo = getDestIataAirport(cidade, uf);

    const consultoresComDistancia = await Promise.all(
      consultores.map(async (c) => {
        // Cálculo de distância rodoviária real
        const roadInfo = await getRoadDistance({ lat: c.lat, lng: c.lng }, coords);
        const kmReal = roadInfo.km;
        const durationHours = roadInfo.durationHours;

        // Obter aeroporto base do consultor
        const cleanOrigCidade = (c.cidade || '')
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
          .toUpperCase()
          .trim();

        const aeroBase = consultorAeroportoBase[cleanOrigCidade] || {
          iata: (airports as any)[c.ufBase?.toUpperCase()] || 'GRU',
          nomeAeroporto: `${c.cidade} (${(airports as any)[c.ufBase?.toUpperCase()] || 'GRU'})`,
          kmBaseAero: 20
        };

        let custoVoo = 0;
        let custoHospedagem = 0;
        let custoKm = 0;
        let kmCobrado = 0;
        let kmDetalhe = '';
        let isRealPrice = false;
        let sourceVoo = 'Estimativa';
        let iataRoute = '';

        // Regra de necessidade de voo:
        // Distância rodoviária > 550 km OU mais de 6h30 de estrada OU se for outro estado e > 450 km
        const outroEstado = c.ufBase && c.ufBase.toUpperCase() !== cleanUf;
        const precisaVoo = kmReal > 550 || durationHours > 6.5 || (outroEstado && kmReal > 450);

        if (precisaVoo) {
          const flight = await fetchRealFlightPrice(
            aeroBase.iata,
            destAirportInfo.iata,
            c.cidade,
            c.ufBase,
            cidade,
            uf
          );

          custoVoo = flight.price;
          isRealPrice = flight.isRealPrice;
          sourceVoo = flight.source;
          iataRoute = flight.iataRoute;

          custoHospedagem = custoHospedagemPadrao;

          // Deslocamento quando aéreo:
          // 1) Traslado ida e volta da residência até o aeroporto de origem: aeroBase.kmBaseAero * 2
          // 2) Deslocamento local no destino (aeroporto -> hotéis / lojas): 40 km fixos
          const kmTrasladoAero = aeroBase.kmBaseAero * 2;
          const kmLocalDestino = 40;
          kmCobrado = kmTrasladoAero + kmLocalDestino;
          custoKm = Math.round(kmCobrado * 0.80); // R$ 0,80 por KM
          kmDetalhe = `${kmTrasladoAero}km aero + ${kmLocalDestino}km destino`;
        } else {
          // Deslocamento rodoviário (ida e volta)
          kmCobrado = kmReal * 2;
          custoKm = Math.round(kmCobrado * 0.80); // R$ 0,80 por KM
          kmDetalhe = 'ida e volta rodoviário';
          if (kmReal > 200) {
            custoHospedagem = custoHospedagemPadrao;
          }
        }

        const custoTotal = custoVoo + custoKm + custoHospedagem;

        return {
          ...c,
          distanciaKm: kmReal,
          durationHours,
          aeroportoOrigem: aeroBase.nomeAeroporto,
          aeroportoDestino: destAirportInfo.nome,
          estimativaCusto: {
            total: Math.round(custoTotal),
            voo: custoVoo,
            km: Math.round(custoKm),
            kmReferencia: kmCobrado,
            kmDetalhe,
            hospedagem: custoHospedagem,
            tipo: precisaVoo ? 'Aéreo' : 'Terrestre',
            isRealPrice,
            sourceVoo,
            iataRoute,
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
