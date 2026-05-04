import { NextResponse } from 'next/server';
import axios from 'axios';

export async function GET() {
  const rapidApiKey = process.env.RAPIDAPI_KEY;
  const rapidApiHost = process.env.RAPIDAPI_HOST;

  const debug: any = {
    rapidApiKey: rapidApiKey ? `${rapidApiKey.substring(0, 8)}...` : 'MISSING',
    rapidApiHost: rapidApiHost || 'MISSING',
  };

  try {
    // Testar com GRU→CNF (maior oferta) e data próxima
    const testDate = new Date();
    testDate.setDate(testDate.getDate() + 7);
    const dateStr = testDate.toISOString().split('T')[0];

    const res = await axios.get(`https://${rapidApiHost}/api/v1/searchFlights`, {
      params: {
        departure_id: 'GRU',
        arrival_id: 'CNF',
        outbound_date: dateStr,
        currency: 'BRL',
        travel_class: 'ECONOMY',
        adults: '1',
        show_hidden: '1',
        language_code: 'pt-BR',
        country_code: 'BR',
        search_type: 'best',
      },
      headers: {
        'x-rapidapi-key': rapidApiKey!,
        'x-rapidapi-host': rapidApiHost!,
      },
      timeout: 15000,
    });

    debug.httpStatus = res.status;
    debug.dataStatus = res.data?.status;
    debug.allDataKeys = Object.keys(res.data || {});
    debug.dataDataKeys = Object.keys(res.data?.data || {});
    debug.testedDate = dateStr;

    const itinData = res.data?.data?.itineraries || {};
    debug.itinerariesKeys = Object.keys(itinData);
    debug.topFlightsCount = itinData.topFlights?.length ?? 'N/A';
    debug.otherFlightsCount = itinData.otherFlights?.length ?? 'N/A';
    debug.firstTopFlight = itinData.topFlights?.[0];
    debug.firstTopFlightSegment = itinData.topFlights?.[0]?.flights?.[0];
    // Mostrar o data completo (limitado) para debug
    debug.fullDataRaw = res.data?.data;

  } catch (err: any) {
    debug.error = err?.message;
    debug.httpError = err?.response?.status;
    debug.errorData = err?.response?.data;
  }

  return NextResponse.json(debug, { status: 200 });
}
