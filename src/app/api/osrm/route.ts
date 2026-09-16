import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const coords = searchParams.get('coords');

  if (!coords) {
    return NextResponse.json({ error: 'Coordenadas obrigatórias' }, { status: 400 });
  }

  try {
    const url = `https://router.project-osrm.org/route/v1/driving/${coords}?overview=full&geometries=geojson`;
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'SamsungRouteApp/1.0'
      }
    });
    
    if (!res.ok) {
      return NextResponse.json({ error: `OSRM HTTP error: ${res.status}` }, { status: res.status });
    }

    const data = await res.json();
    return NextResponse.json(data);
  } catch (error: any) {
    console.error('Erro na rota OSRM:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
