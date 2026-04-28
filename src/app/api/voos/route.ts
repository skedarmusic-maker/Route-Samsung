import { NextResponse } from 'next/server';

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const origin = searchParams.get('origin');
    const destination = searchParams.get('destination');
    const date = searchParams.get('date');

    if (!origin || !destination || !date) {
      return NextResponse.json({ error: 'Parâmetros ausentes' }, { status: 400 });
    }

    const voosApiKey = process.env.VOOS_API_KEY;

    if (!voosApiKey) {
      return NextResponse.json({
        isMock: true,
        offers: generateMockFlights(origin, destination, date)
      });
    }

    // 1. Chamar a API de Voos providenciada pelo usuário
    const flightsRes = await fetch('https://app.apidevoos.dev/api/v1/flights/search', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${voosApiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        type: 'one_way',
        slices: [
          {
            origin: origin,
            destination: destination,
            departureDate: date
          }
        ],
        passengers: [
          { type: 'adult', count: 1 }
        ],
        cabinClass: 'economy',
        maxConnections: 2,
        suppliers: ["latam", "gol", "azul"],
        enableDeduplication: true,
        searchType: "pagante"
      })
    });

    if (!flightsRes.ok) {
      console.error('[API-DE-VOOS Error]', flightsRes.status);
      return NextResponse.json({
        isMock: true,
        offers: generateMockFlights(origin, destination, date)
      });
    }

    const flightsData = await flightsRes.json();
    
    // Tentativa de parsear o formato da resposta
    let rawOffers = flightsData.results || flightsData.data || flightsData.offers || [];

    // Suporte ao formato "flightGroups" da nova API
    if (flightsData.flightGroups && Array.isArray(flightsData.flightGroups)) {
      flightsData.flightGroups.forEach((group: any) => {
        if (group.flights && Array.isArray(group.flights)) {
          rawOffers.push(...group.flights);
        }
      });
    }

    const offers = Array.isArray(rawOffers) ? rawOffers.map((offer: any, index: number) => {
      return {
        id: offer.id || `api-${index}`,
        airline: offer.airline || offer.carrier || 'Companhia Aérea',
        flightNumber: offer.flightNumber || offer.number || `Voo ${index + 101}`,
        departureTime: offer.departureTime || '08:00',
        arrivalTime: offer.arrivalTime || '10:30',
        duration: offer.duration || '2h 30m',
        price: parseFloat(offer.price?.total || offer.price || '600'),
        stops: offer.stops || 0
      };
    }) : [];

    // Se a API externa retornar vazio, caímos no Mock
    if (offers.length === 0) {
      return NextResponse.json({
        isMock: true,
        offers: generateMockFlights(origin, destination, date)
      });
    }

    return NextResponse.json({ isMock: false, offers });

  } catch (error: any) {
    return NextResponse.json({
      isMock: true,
      offers: generateMockFlights(origin, destination, date)
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
