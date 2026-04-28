import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

function parsePeriodoToDays(periodo: string): number {
  if (!periodo) return 30;
  const p = periodo.toUpperCase().trim();
  if (p.includes('60 DIAS') || p.includes('BIMESTRAL')) return 60;
  if (p.includes('45 DIAS')) return 45;
  if (p.includes('MENSAL')) return 30;
  if (p.includes('90 DIAS') || p.includes('TRIMESTRAL')) return 90;
  if (p.includes('180 DIAS') || p.includes('SEMESTRAL')) return 180;
  if (p.includes('SEMANAL')) return 7;
  if (p.includes('QUINZENAL')) return 15;
  return 30;
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const consultor = searchParams.get('consultor');
    const status = searchParams.get('status');
    const clusters = searchParams.get('clusters')?.split(',').filter(Boolean);
    const clientes = searchParams.get('clientes')?.split(',').filter(Boolean);

    // 1. Buscar lojas (filtrar por consultor se informado)
    let query = supabase.from('lojas').select('nome_pdv, cliente, cluster, periodo, status, consultor_vinculado');
    
    if (consultor) query = query.eq('consultor_vinculado', consultor);
    if (status) query = query.ilike('status', status);
    if (clusters && clusters.length > 0) query = query.in('cluster', clusters);
    if (clientes && clientes.length > 0) query = query.in('cliente', clientes);

    const { data: lojas, error: errorL } = await query;
    if (errorL) throw errorL;

    // 2. Buscar histórico de visitas
    const { data: historico, error: errorH } = await supabase
      .from('historico_visitas')
      .select('nome_pdv, ultima_visita');
    if (errorH) throw errorH;

    const historicoMap: Record<string, string> = {};
    (historico || []).forEach(h => { historicoMap[h.nome_pdv] = h.ultima_visita; });

    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);

    // 3. Calcular métricas por loja
    let emDia = 0;
    let atrasadas = 0;
    let semHistorico = 0;
    const diasAtrasoList: number[] = [];
    const porRede: Record<string, { total: number; emDia: number; atrasadas: number; semHistorico: number; maiorAtraso: number }> = {};
    const criticas: { nome_pdv: string; cliente: string; cluster: string; diasSemVisita: number; periodo: string }[] = [];

    (lojas || []).forEach(loja => {
      const rede = loja.cliente || 'Sem Rede';
      if (!porRede[rede]) porRede[rede] = { total: 0, emDia: 0, atrasadas: 0, semHistorico: 0, maiorAtraso: 0 };
      porRede[rede].total++;

      const ultimaVisitaStr = historicoMap[loja.nome_pdv];
      const requiredGap = parsePeriodoToDays(loja.periodo);

      if (!ultimaVisitaStr) {
        semHistorico++;
        porRede[rede].semHistorico++;
        // Tratar como atrasada para alertas
        criticas.push({ nome_pdv: loja.nome_pdv, cliente: rede, cluster: loja.cluster, diasSemVisita: 999, periodo: loja.periodo });
      } else {
        const ultimaVisita = new Date(ultimaVisitaStr + 'T00:00:00');
        const diffDays = Math.ceil((hoje.getTime() - ultimaVisita.getTime()) / (1000 * 60 * 60 * 24));
        const atraso = diffDays - requiredGap;

        if (atraso <= 0) {
          emDia++;
          porRede[rede].emDia++;
        } else {
          atrasadas++;
          porRede[rede].atrasadas++;
          diasAtrasoList.push(atraso);
          porRede[rede].maiorAtraso = Math.max(porRede[rede].maiorAtraso, atraso);
          if (atraso > 30) {
            criticas.push({ nome_pdv: loja.nome_pdv, cliente: rede, cluster: loja.cluster, diasSemVisita: diffDays, periodo: loja.periodo });
          }
        }
      }
    });

    const totalLojas = (lojas || []).length;
    const percentualEmDia = totalLojas > 0 ? Math.round((emDia / totalLojas) * 100) : 0;

    // 4. Ranking de Redes (piores primeiro)
    const rankingRedes = Object.entries(porRede)
      .map(([nome, dados]) => ({
        nome,
        ...dados,
        percentualEmDia: dados.total > 0 ? Math.round((dados.emDia / dados.total) * 100) : 0,
      }))
      .sort((a, b) => a.percentualEmDia - b.percentualEmDia); // Piores primeiro

    // 5. Lojas mais críticas (mais dias sem visita, limitado a 5)
    const top5Criticas = criticas
      .sort((a, b) => b.diasSemVisita - a.diasSemVisita)
      .slice(0, 5);

    return NextResponse.json({
      totalLojas,
      emDia,
      atrasadas,
      semHistorico,
      percentualEmDia,
      rankingRedes,
      criticas: criticas.sort((a, b) => b.diasSemVisita - a.diasSemVisita),
      totalCriticas: criticas.length,
      mediaAtraso: diasAtrasoList.length > 0 ? Math.round(diasAtrasoList.reduce((a, b) => a + b, 0) / diasAtrasoList.length) : 0,
    });

  } catch (error: any) {
    console.error('[DASHBOARD-INTEL]', error);
    return NextResponse.json({ error: error.message || 'Erro interno' }, { status: 500 });
  }
}
