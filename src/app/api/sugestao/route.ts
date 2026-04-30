import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import cityCoords from '@/lib/city_coords.json';

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

    const consultores = (dataC || []).map(c => ({
      nome: c.nome,
      endereco: c.endereco_completo,
      lat: c.lat,
      lng: c.lng,
      cidade: c.cidade
    }));

    const consultoresComDistancia = consultores.map(c => {
      const dist = computeDistance({ lat: c.lat, lng: c.lng }, coords);
      return {
        ...c,
        distanciaKm: Math.round(dist)
      };
    }).sort((a, b) => a.distanciaKm - b.distanciaKm);

    // Retorna o top 5
    return NextResponse.json(consultoresComDistancia.slice(0, 5));
  } catch (error: any) {
    console.error('Erro na sugestão de journey:', error);
    return NextResponse.json({ error: error.message || 'Erro interno' }, { status: 500 });
  }
}
