import { NextResponse } from 'next/server';

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

    const duffelToken = process.env.DUFFEL_ACCESS_TOKEN;

    if (!duffelToken) {
      return NextResponse.json({
        isMock: true,
        offers: generateMockFlights(origin, destination, date)
      });
    }

    // 1. Chamar a API da Duffel
    const duffelRes = await fetch('https://api.duffel.com/air/offer_requests?return_offers=true', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${duffelToken}`,
        'Duffel-Version': 'v2',
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify({
        data: {
          slices: [
            {
              origin: origin,
              destination: destination,
              departure_date: date
            }
          ],
          passengers: [
            { type: 'adult' }
          ],
          cabin_class: 'economy'
        }
      })
    });

    if (!duffelRes.ok) {
      const errorData = await duffelRes.json().catch(() => ({}));
      console.error('[Duffel API Error]', duffelRes.status, errorData);
      return NextResponse.json({
        isMock: true,
        offers: generateMockFlights(origin, destination, date)
      });
    }

    const duffelData = await duffelRes.json();
    const rawOffers = duffelData.data?.offers || [];

    const offers = rawOffers.map((offer: any, index: number) => {
      const slice = offer.slices[0];
      const segment = slice.segments[0];
      
      // Formatar horários (ISO -> HH:mm)
      const depDate = new Date(segment.departing_at);
      const arrDate = new Date(segment.arriving_at);
      const pad = (n: number) => n.toString().padStart(2, '0');
      
      const depTime = `${pad(depDate.getHours())}:${pad(depDate.getMinutes())}`;
      const arrTime = `${pad(arrDate.getHours())}:${pad(arrDate.getMinutes())}`;

      // Formatar duração (ISO 8601 PT2H30M -> 2h 30m)
      const durationStr = segment.duration.replace('PT', '').replace('H', 'h ').replace('M', 'm').toLowerCase();

      let price = parseFloat(offer.total_amount);
      const currency = offer.total_currency;

      // Se for ambiente de teste da Duffel (token começa com duffel_test), os valores costumam vir em USD/GBP baixos.
      // Vamos aplicar uma conversão simbólica apenas para o teste ficar mais realista.
      if (duffelToken.startsWith('duffel_test_') && (currency === 'USD' || currency === 'GBP' || currency === 'EUR')) {
        price = price * 5.65; // Câmbio simbólico
      }

      return {
        id: offer.id,
        airline: segment.marketing_carrier.name,
        flightNumber: `${segment.marketing_carrier.iata_code} ${segment.marketing_carrier_flight_number}`,
        departureTime: depTime,
        arrivalTime: arrTime,
        duration: durationStr,
        price: price,
        currency: currency === 'USD' || currency === 'GBP' || currency === 'EUR' ? 'BRL' : currency,
        stops: slice.segments.length - 1
      };
    });

    // Se a Duffel retornar vazio, caímos no Mock
    if (offers.length === 0) {
      return NextResponse.json({
        isMock: true,
        offers: generateMockFlights(origin, destination, date)
      });
    }

    // Ordenar por preço
    offers.sort((a: any, b: any) => a.price - b.price);

    return NextResponse.json({ isMock: false, offers });

  } catch (error: any) {
    console.error('[Flights Route Error]', error);
    if (!origin || !destination || !date) {
      return NextResponse.json({ error: 'Erro interno ou parâmetros ausentes' }, { status: 400 });
    }
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
