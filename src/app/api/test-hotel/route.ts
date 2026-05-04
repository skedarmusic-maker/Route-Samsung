import { NextResponse } from 'next/server';
import axios from 'axios';

export async function GET() {
  const rapidApiKey = process.env.RAPIDAPI_KEY;
  const bookingHost = process.env.BOOKING_RAPIDAPI_HOST;

  const results: any = { rapidApiKey: rapidApiKey ? 'OK' : 'MISSING', bookingHost };

  // STEP 1: buscar dest_id
  try {
    const locRes = await axios.get(`https://${bookingHost}/v1/hotels/locations`, {
      params: { name: 'Belo Horizonte, MG, Brazil', locale: 'pt-br' },
      headers: { 'x-rapidapi-key': rapidApiKey!, 'x-rapidapi-host': bookingHost! },
      timeout: 10000,
    });
    results.step1_status = locRes.status;
    results.step1_data = locRes.data?.slice?.(0, 2) ?? locRes.data;
    const anyResult = locRes.data?.[0];
    results.step1_first = anyResult;
    const cityUfi = anyResult?.city_ufi;
    const destId = cityUfi ? String(cityUfi) : anyResult?.dest_id;
    const destType = cityUfi ? 'city' : (anyResult?.dest_type || 'city');
    results.destId = destId;
    results.destType = destType;
    results.usedCityUfi = !!cityUfi;

    if (!destId) {
      results.error = 'dest_id não encontrado na resposta';
      return NextResponse.json(results);
    }

    // STEP 2: buscar hotéis
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
      headers: { 'x-rapidapi-key': rapidApiKey!, 'x-rapidapi-host': bookingHost! },
      timeout: 15000,
    });

    results.step2_status = searchRes.status;
    results.step2_result_count = searchRes.data?.result?.length;
    results.step2_first_hotel = searchRes.data?.result?.[0];
    results.cheapest_price = searchRes.data?.result?.[0]?.min_total_price;

  } catch (err: any) {
    results.error = err?.message;
    results.errorCode = err?.response?.status;
    results.errorData = err?.response?.data;
  }

  return NextResponse.json(results);
}
