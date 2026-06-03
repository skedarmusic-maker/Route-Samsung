import { NextResponse } from 'next/server';
import axios from 'axios';

export async function POST(req: Request) {
  try {
    const { city, checkin, checkout } = await req.json();

    const rapidApiKey = process.env.RAPIDAPI_KEY;
    const bookingHost = process.env.BOOKING_RAPIDAPI_HOST || 'booking-com.p.rapidapi.com';

    if (!rapidApiKey) {
      return NextResponse.json({ error: 'Configuração da API ausente (RAPIDAPI_KEY)' }, { status: 500 });
    }

    // STEP 1: Buscar o dest_id da cidade
    const locRes = await axios.get(`https://${bookingHost}/v1/hotels/locations`, {
      params: { name: city, locale: 'pt-br' },
      headers: { 'x-rapidapi-key': rapidApiKey, 'x-rapidapi-host': bookingHost },
      timeout: 10000,
    });

    const anyResult = locRes.data?.[0];
    if (!anyResult) {
      return NextResponse.json({ error: 'Cidade não encontrada no Booking.com' }, { status: 404 });
    }

    const cityUfi = anyResult.city_ufi;
    const destId = cityUfi ? String(cityUfi) : anyResult.dest_id;
    const destType = cityUfi ? 'city' : (anyResult.dest_type || 'city');

    if (!destId) {
      return NextResponse.json({ error: 'ID de destino não encontrado' }, { status: 404 });
    }

    // STEP 2: Buscar hotéis
    const searchRes = await axios.get(`https://${bookingHost}/v1/hotels/search`, {
      params: {
        dest_id: destId,
        dest_type: destType,
        checkin_date: checkin,
        checkout_date: checkout,
        order_by: 'price',
        adults_number: '1',
        room_number: '1',
        filter_by_currency: 'BRL',
        locale: 'pt-br',
        page_number: '0',
        include_adjacency: 'true',
        units: 'metric',
      },
      headers: { 'x-rapidapi-key': rapidApiKey, 'x-rapidapi-host': bookingHost },
      timeout: 15000,
    });

    const results = searchRes.data?.result || [];
    
    // Mapear para um formato mais limpo
    const hotels = results.slice(0, 10).map((h: any) => ({
      id: h.hotel_id,
      name: h.hotel_name,
      address: h.address,
      city: h.city,
      distance: h.distance_to_cc,
      price: h.min_total_price,
      currency: h.currency_code,
      reviewScore: h.review_score,
      imageUrl: h.main_photo_url?.replace('square60', 'square300'),
      url: h.url,
      checkin,
      checkout
    }));

    return NextResponse.json({ hotels });

  } catch (error: any) {
    console.error('Erro na API de hotéis:', error.response?.data || error.message);
    return NextResponse.json({ 
      error: 'Falha ao buscar hotéis', 
      details: error.response?.data || error.message,
      mockReason: 'API offline ou erro de cota'
    }, { status: 500 });
  }
}
