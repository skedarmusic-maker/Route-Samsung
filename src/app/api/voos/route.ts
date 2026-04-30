import { NextResponse } from 'next/server';
import axios from 'axios';

export async function GET(req: Request) {
  let origin: string | null = null;
  let destination: string | null = null;
  let date: string | null = null;

  try {
    const { searchParams } = new URL(req.url);
    origin = searchParams.get('origin');
    destination = searchParams.get('destination');
    date = searchParams.get('date');

    if (!origin || !destination || !date) {
      return NextResponse.json({ error: 'Parâmetros ausentes' }, { status: 400 });
    }

    const rapidApiKey = process.env.RAPIDAPI_KEY;
    const rapidApiHost = process.env.RAPIDAPI_HOST;

    if (!rapidApiKey || !rapidApiHost) {
      console.warn('[Google Flights] Chaves não configuradas, usando mocks.');
      return NextResponse.json({
        isMock: true,
        offers: generateMockFlights(origin, destination, date)
      });
    }

    // 1. Chamar a API do Google Flights (RapidAPI)
    const options = {
      method: 'GET',
      url: `https://${rapidApiHost}/api/v1/searchFlights`,
      params: {
        departure_id: origin,
        arrival_id: destination,
        outbound_date: date,
        currency: 'BRL',
        travel_class: 'ECONOMY',
        adults: '1',
        show_hidden: '1',
        language_code: 'pt-BR',
        country_code: 'BR',
        search_type: 'best',
      },
      headers: {
        'x-rapidapi-key': rapidApiKey,
        'x-rapidapi-host': rapidApiHost
      }
    };

    const res = await axios.request(options);
    
    if (!res.data || !res.data.status) {
      console.error('[Google Flights API Error]', res.data);
      return NextResponse.json({
        isMock: true,
        offers: generateMockFlights(origin, destination, date)
      });
    }

    // itineraries é um OBJETO com topFlights e otherFlights (não um array)
    const itinData = res.data.data?.itineraries || {};
    const allFlights = [
      ...(itinData.topFlights || []),
      ...(itinData.otherFlights || []),
    ];

    console.log(`[Google Flights] topFlights: ${itinData.topFlights?.length || 0}, otherFlights: ${itinData.otherFlights?.length || 0}`);

    if (allFlights.length === 0) {
      console.warn('[Google Flights] Nenhum voo retornado, usando mock');
      return NextResponse.json({ isMock: true, offers: generateMockFlights(origin, destination, date) });
    }

    const offers = allFlights.map((flight: any, index: number) => {
      // Segmento dentro de flights[]
      const seg = flight.flights?.[0] || {};

      // Horário: formato "2026-5-7 13:30" — pegar apenas HH:MM
      const depRaw: string = seg.departure_airport?.time || flight.departure_time || '';
      const arrRaw: string = seg.arrival_airport?.time || flight.arrival_time || '';
      const extractTime = (raw: string) => {
        const parts = raw.split(' ');
        return parts[parts.length - 1]?.substring(0, 5) || '--:--';
      };

      // Duração: duration.raw em minutos ou duration.text
      const totalMin: number = flight.duration?.raw || seg.duration || 0;
      const durationStr = totalMin
        ? `${Math.floor(totalMin / 60)}h ${totalMin % 60}m`
        : flight.duration?.text || 'N/A';

      return {
        id: flight.booking_token || `flight-${index}`,
        airline: seg.airline || 'Companhia Aérea',
        flightNumber: seg.flight_number || 'N/A',
        departureTime: extractTime(depRaw),
        arrivalTime: extractTime(arrRaw),
        duration: durationStr,
        price: flight.price || seg.price || 0,
        currency: 'BRL',
        stops: flight.stops ?? (flight.flights?.length || 1) - 1,
        airlineLogo: seg.airline_logo || null,
      };
    });

    const validOffers = offers.filter((o: any) => o.price > 0);

    if (validOffers.length === 0) {
      console.warn('[Google Flights] Sem preços válidos, usando mock');
      return NextResponse.json({ isMock: true, offers: generateMockFlights(origin, destination, date) });
    }

    validOffers.sort((a: any, b: any) => a.price - b.price);

    return NextResponse.json({ isMock: false, offers: validOffers });

  } catch (error: any) {
    console.error('[Flights Route Error]', error);
    return NextResponse.json({
      isMock: true,
      offers: generateMockFlights(origin!, destination!, date!)
    });
  }
}

function generateMockFlights(origin: string, destination: string, date: string) {
  const seed = origin.charCodeAt(0) + destination.charCodeAt(0) + new Date(date).getDate();
  
  const options = [
    { airline: 'LATAM Airlines', prefix: 'LA' },
    { airline: 'GOL Linhas Aéreas', prefix: 'G3' },
    { airline: 'Azul Linhas Aéreas', prefix: 'AD' }
  ];

  const getRandom = (min: number, max: number, offset = 0) => {
    return Math.floor(((seed * (offset + 1)) % (max - min + 1)) + min);
  };

  return options.map((opt, i) => {
    const depHour = getRandom(5, 22, i);
    const depMin = getRandom(0, 5) * 10;
    const durationHours = getRandom(1, 4, i + 5);
    const durationMins = getRandom(0, 5) * 10;

    const arrHour = (depHour + durationHours) % 24;
    const arrMin = (depMin + durationMins) % 60;

    const pad = (n: number) => n.toString().padStart(2, '0');

    return {
      id: `mock-${i}`,
      airline: opt.airline,
      flightNumber: `${opt.prefix} ${getRandom(1000, 9999, i + 10)}`,
      departureTime: `${pad(depHour)}:${pad(depMin)}`,
      arrivalTime: `${pad(arrHour)}:${pad(arrMin)}`,
      duration: `${durationHours}h ${durationMins}m`,
      price: getRandom(350, 1200, i + 15),
      stops: getRandom(0, 1, i + 20)
    };
  });
}
