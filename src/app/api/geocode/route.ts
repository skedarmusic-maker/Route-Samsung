import { NextResponse } from 'next/server';

const GOOGLE_KEY = process.env.GOOGLE_MAPS_KEY;

// Cache simples em memória para evitar chamadas repetidas durante a sessão
const geocodeCache: Record<string, { lat: number; lng: number }> = {};

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const address = searchParams.get('address');

  if (!address) {
    return NextResponse.json({ error: 'Parâmetro "address" obrigatório' }, { status: 400 });
  }

  // Retorna do cache se já geocodificado
  if (geocodeCache[address]) {
    return NextResponse.json(geocodeCache[address]);
  }

  try {
    const encoded = encodeURIComponent(`${address}, Brasil`);
    const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encoded}&key=${GOOGLE_KEY}&language=pt-BR`;
    
    const res = await fetch(url);
    const data = await res.json();

    if (data.status !== 'OK' || !data.results?.[0]) {
      console.warn(`Geocodificação sem resultado para: "${address}" — status: ${data.status}`);
      return NextResponse.json({ error: `Endereço não encontrado: ${address}`, status: data.status }, { status: 404 });
    }

    const { lat, lng } = data.results[0].geometry.location;
    geocodeCache[address] = { lat, lng };

    return NextResponse.json({ lat, lng, formatted: data.results[0].formatted_address });
  } catch (error: any) {
    console.error('Erro na geocodificação:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
