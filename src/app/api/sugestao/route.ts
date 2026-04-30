import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import cityCoords from '@/lib/city_coords.json';
import airports from '@/lib/airports.json';
import axios from 'axios';

// Função Haversine para cálculo de distância
function computeDistance(p1: { lat: number; lng: number }, p2: { lat: number; lng: number }): number {
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

async function fetchHotelPrice(cidade: string, uf: string) {
  const rapidApiKey = process.env.RAPIDAPI_KEY;
  const bookingHost = process.env.BOOKING_RAPIDAPI_HOST;

  if (!rapidApiKey || !bookingHost) {
    console.warn('[HotelAPI] Credenciais ausentes');
    return 350;
  }

  try {
    // 1. Buscar dest_id da cidade
    console.log(`[HotelAPI] Buscando localização: ${cidade}, ${uf}`);
    const locRes = await axios.get(`https://${bookingHost}/v1/hotels/locations`, {
      params: {
        name: `${cidade}`,
        locale: 'pt-br',
      },
      headers: {
        'x-rapidapi-key': rapidApiKey,
        'x-rapidapi-host': bookingHost,
      },
      timeout: 10000,
    });

    console.log(`[HotelAPI] Locations status: ${locRes.status}, count: ${locRes.data?.length}`);
    
    // Buscar resultado de cidade — preferindo city_ufi como ID da cidade
    const anyResult = locRes.data?.[0];
    if (!anyResult) {
      console.warn('[HotelAPI] Nenhum resultado encontrado');
      return 350;
    }

    // city_ufi é o ID real da cidade no Booking.com
    const cityUfi = anyResult?.city_ufi;
    const destId = cityUfi ? String(cityUfi) : anyResult?.dest_id;
    const destType = cityUfi ? 'city' : (anyResult?.dest_type || 'city');

    if (!destId) {
      console.warn('[HotelAPI] dest_id não encontrado');
      return 350;
    }
    console.log(`[HotelAPI] dest_id: ${destId}, dest_type: ${destType}`);

    // 2. Buscar hotéis mais baratos
    const checkin = new Date();
    checkin.setDate(checkin.getDate() + 14);
    const checkout = new Date(checkin);
    checkout.setDate(checkout.getDate() + 1);

    const searchRes = await axios.get(`https://${bookingHost}/v1/hotels/search`, {
      params: {
        dest_id: destId,
        dest_type: destType,
        checkin_date: checkin.toISOString().split('T')[0],
        checkout_date: checkout.toISOString().split('T')[0],
        order_by: 'price',
        adults_number: '1',
        room_number: '1',
        filter_by_currency: 'BRL',
        locale: 'pt-br',
        page_number: '0',
        include_adjacency: 'true',
        units: 'metric',
      },
      headers: {
        'x-rapidapi-key': rapidApiKey,
        'x-rapidapi-host': bookingHost,
      },
      timeout: 15000,
    });

    console.log(`[HotelAPI] Search status: ${searchRes.status}, hotéis: ${searchRes.data?.result?.length}`);
    const cheapest = searchRes.data?.result?.[0]?.min_total_price;
    console.log(`[HotelAPI] Menor preço encontrado: ${cheapest}`);

    return cheapest ? Math.round(cheapest) : 350;
  } catch (err: any) {
    console.error('[HotelAPI] Erro:', err?.response?.status, err?.response?.data || err?.message);
    return 350;
  }
}

async function fetchRealFlightPrice(originUf: string, destUf: string, destCidade: string) {
  try {
    const originIata = (airports as any)[originUf.toUpperCase()] || (airports as any)['SAO PAULO'];
    const destIata = (airports as any)[destCidade.toUpperCase()] || (airports as any)[destUf.toUpperCase()] || (airports as any)['SAO PAULO'];
    
    console.log(`[FlightAPI] Buscando: ${originIata} -> ${destIata}`);

    if (originIata === destIata) return 0;

    const date = new Date();
    date.setDate(date.getDate() + 14);
    const dateStr = date.toISOString().split('T')[0];

    const options = {
      method: 'GET',
      url: `https://${process.env.RAPIDAPI_HOST}/api/v1/searchFlights`,
      params: {
        departure_id: originIata,
        arrival_id: destIata,
        outbound_date: dateStr,
        currency: 'BRL',
        travel_class: 'ECONOMY',
        adults: '1'
      },
      headers: {
        'x-rapidapi-key': process.env.RAPIDAPI_KEY,
        'x-rapidapi-host': process.env.RAPIDAPI_HOST
      },
      timeout: 10000 
    };

    const response = await axios.request(options);
    const data = response.data?.data || {};
    const bestPrice = data.bestFlights?.[0]?.price || data.priceHistory?.summary?.current;
    
    if (!bestPrice) {
      return { error: `No price found. Sub-keys: ${Object.keys(data).join(',')}` };
    }
    return { price: Math.round(bestPrice), source: 'Google Flights' };
  } catch (error: any) {
    console.error('[FlightAPI] Erro:', error.message);
    return { error: error.message };
  }
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const cidade = searchParams.get('cidade');
    const uf = searchParams.get('uf');

    if (!cidade || !uf) {
      return NextResponse.json({ error: 'Faltam os parâmetros cidade e uf.' }, { status: 400 });
    }

    const key = `${cidade.toUpperCase()}-${uf.toUpperCase()}`;
    const coords = (cityCoords as any)[key];

    if (!coords) {
      return NextResponse.json({ error: 'Coordenadas da cidade não encontradas no cache.' }, { status: 404 });
    }

    const { data: dataC, error: errorC } = await supabase.from('consultores').select('*');
    if (errorC) throw errorC;

    // Buscar custo real de hotel UMA VEZ para a cidade de destino
    let custoHospedagemReal = 350;
    let isRealHotel = false;
    try {
      const hotelPrice = await fetchHotelPrice(cidade, uf);
      if (hotelPrice && hotelPrice !== 350) {
        custoHospedagemReal = hotelPrice;
        isRealHotel = true;
      }
    } catch (e) {
      console.warn('Falha ao buscar hotel real, usando padrão.');
    }

    const consultores = (dataC || []).map(c => ({
      nome: c.nome,
      endereco: c.endereco_completo,
      lat: c.lat,
      lng: c.lng,
      cidade: c.cidade_base,
      ufBase: c.uf_base
    }));

    const consultoresComDistancia = await Promise.all(consultores.map(async (c) => {
      const dist = computeDistance({ lat: c.lat, lng: c.lng }, coords);
      const km = Math.round(dist);
      
      let custoVoo = 0;
      let custoHospedagem = 0;
      let custoKm = 0;
      let kmCobrado = 0;
      let isRealPrice = false;
      let errorMessage = '';
      
      const outroEstado = c.ufBase && c.ufBase.toUpperCase() !== uf.toUpperCase();
      const precisaVoo = (outroEstado && km > 300) || km > 550;

      if (precisaVoo) {
        const flightData: any = await fetchRealFlightPrice(c.ufBase || 'SP', uf, cidade);
        
        if (flightData && flightData.price) {
          custoVoo = flightData.price;
          isRealPrice = true;
        } else {
          errorMessage = flightData?.error || 'No flight price found';
          const hubsPrincipais = ['SP', 'RJ', 'DF'];
          const regioesNorteSul = ['RS', 'SC', 'AM', 'PA', 'CE', 'PE', 'RN'];
          
          if (hubsPrincipais.includes(c.ufBase?.toUpperCase() || '')) {
            custoVoo = 780;
          } else if (regioesNorteSul.includes(c.ufBase?.toUpperCase() || '')) {
            custoVoo = 1450;
          } else {
            custoVoo = 1100;
          }
        }

        custoHospedagem = isRealHotel ? custoHospedagemReal : 350;
        kmCobrado = 40; 
        custoKm = kmCobrado * 1.10;
      } else {
        kmCobrado = km;
        custoKm = km * 1.10;
        if (km > 200) {
          custoHospedagem = isRealHotel ? custoHospedagemReal : 350;
        }
      }

      const custoTotal = custoVoo + custoKm + custoHospedagem;

      return {
        ...c,
        distanciaKm: km,
        estimativaCusto: {
          total: Math.round(custoTotal),
          voo: custoVoo,
          km: Math.round(custoKm),
          kmReferencia: kmCobrado,
          hospedagem: custoHospedagem,
          tipo: precisaVoo ? 'Aéreo' : 'Terrestre',
          isRealPrice,
          isRealHotel,
          errorMessage
        }
      };
    }));

    const sorted = consultoresComDistancia.sort((a, b) => (a.estimativaCusto.total - b.estimativaCusto.total) || (a.distanciaKm - b.distanciaKm));

    return NextResponse.json(sorted.slice(0, 5));
  } catch (error: any) {
    console.error('Erro na sugestão de journey:', error);
    return NextResponse.json({ error: error.message || 'Erro interno' }, { status: 500 });
  }
}
