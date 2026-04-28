import { NextResponse } from 'next/server';
import { getConsultoresLocais, getLojas } from '@/lib/dataParser';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const type = searchParams.get('type');

    if (type === 'consultores') {
      const consultores = await getConsultoresLocais();
      console.log('Consultores carregados:', consultores.length);
      return NextResponse.json(consultores);
    } else if (type === 'lojas') {
      const lojas = await getLojas();
      console.log('Lojas carregadas:', lojas.length);
      return NextResponse.json(lojas);
    } else {
      return NextResponse.json({ error: 'Parâmetro "type" inválido. Use "consultores" ou "lojas".' }, { status: 400 });
    }
  } catch (error: any) {
    console.error('ERRO CRÍTICO NA API DE DADOS:', error);
    return NextResponse.json({ error: error.message || 'Erro interno no servidor' }, { status: 500 });
  }
}
