import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { alteraaiAdminSupabase } from '@/lib/alteraaiSupabase';

// GET: Retorna o status de validação dos consultores para uma versão específica
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const versao_id = searchParams.get('versao_id');

    let query = alteraaiAdminSupabase
      .from('jp_validacoes')
      .select('*')
      .order('enviado_em', { ascending: false });

    if (versao_id) {
      query = query.eq('versao_id', versao_id);
    }

    const { data, error } = await query;

    if (error) {
      // Se a tabela ainda não existe no Supabase do Alteraai
      if (error.code === 'PGRST205' || error.message?.includes('schema cache')) {
        return NextResponse.json({
          success: false,
          tableNotFound: true,
          message: 'Tabela public.jp_validacoes ainda não foi criada no Supabase do Alteraai.',
          validacoes: []
        });
      }
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      validacoes: data || []
    });
  } catch (err: any) {
    console.error('Erro ao buscar validações:', err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

// POST: Envia roteiro de 1 consultor ou todos para validação no Alteraai
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { versao_id, versao_nome, consultor, todos } = body;

    if (!versao_id) {
      return NextResponse.json(
        { success: false, error: 'O parâmetro versao_id é obrigatório.' },
        { status: 400 }
      );
    }

    // 1. Buscar os roteiros desta versão no Route Samsung Supabase
    let query = supabase.from('roteiros').select('*').eq('versao_id', versao_id);

    if (!todos && consultor) {
      query = query.eq('consultor', consultor);
    }

    const { data: roteiros, error: rotError } = await query;

    if (rotError) {
      return NextResponse.json(
        { success: false, error: `Erro ao buscar roteiros: ${rotError.message}` },
        { status: 500 }
      );
    }

    if (!roteiros || roteiros.length === 0) {
      return NextResponse.json(
        { success: false, error: 'Nenhum roteiro encontrado para os parâmetros informados.' },
        { status: 404 }
      );
    }

    const consultoresEnviados: string[] = [];
    const erros: string[] = [];

    // 2. Processar cada roteiro e sincronizar com Alteraai Supabase
    for (const r of roteiros) {
      const d = r.dados_roteiro || {};
      const diasOriginais = Array.isArray(d.roteiro) ? d.roteiro : [];

      // Mapear dias e lojas garantindo estrutura de validação em cada visita
      let totalVisitas = 0;
      const diasFormatados = diasOriginais.map((dia: any) => {
        const lojasFormatadas = (dia.lojas || []).map((loja: any) => {
          totalVisitas++;
          return {
            ...loja,
            status_validacao: loja.status_validacao || 'pendente', // 'pendente' | 'aprovado' | 'reavaliar'
            observacao: loja.observacao || '',
            motivo_categoria: loja.motivo_categoria || null
          };
        });

        return {
          ...dia,
          lojas: lojasFormatadas
        };
      });

      // Verificar se já existe validação desta versão para este consultor
      const { data: existente } = await alteraaiAdminSupabase
        .from('jp_validacoes')
        .select('id, status, roteiro')
        .eq('versao_id', versao_id)
        .eq('consultor', r.consultor)
        .maybeSingle();

      const payload = {
        versao_id,
        versao_nome: versao_nome || r.versao_nome || versao_id,
        mes: r.mes || d.mes || 11,
        ano: r.ano || d.ano || 2026,
        consultor: r.consultor,
        status: 'Pendente',
        total_visitas: totalVisitas,
        visitas_validadas: 0,
        visitas_reavaliar: 0,
        roteiro: diasFormatados,
        observacao_geral: null,
        enviado_em: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };

      let saveError = null;

      if (existente && existente.id) {
        // Atualiza o rascunho com a nova versão enviada
        const { error } = await alteraaiAdminSupabase
          .from('jp_validacoes')
          .update(payload)
          .eq('id', existente.id);
        saveError = error;
      } else {
        // Insere novo registro de validação
        const { error } = await alteraaiAdminSupabase
          .from('jp_validacoes')
          .insert([payload]);
        saveError = error;
      }

      if (saveError) {
        if (saveError.code === 'PGRST205' || saveError.message?.includes('schema cache')) {
          return NextResponse.json({
            success: false,
            tableNotFound: true,
            message: 'A tabela public.jp_validacoes ainda não foi criada no Supabase do Alteraai. Por favor, execute o script SQL no editor do Supabase antes de enviar.'
          }, { status: 400 });
        }
        erros.push(`${r.consultor}: ${saveError.message}`);
      } else {
        consultoresEnviados.push(r.consultor);
      }
    }

    if (consultoresEnviados.length === 0 && erros.length > 0) {
      return NextResponse.json(
        { success: false, error: erros.join(' | ') },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: `${consultoresEnviados.length} roteiro(s) enviado(s) com sucesso para validação no Alteraai!`,
      consultoresEnviados,
      erros: erros.length > 0 ? erros : undefined
    });
  } catch (err: any) {
    console.error('Erro na rota POST /api/validacao:', err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

// PATCH: Salva a decisão do gestor (aceito / negado) para os apontamentos do consultor
export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json();
    const { id, roteiro, status_gestor, observacao_gestor } = body;

    if (!id || !roteiro) {
      return NextResponse.json(
        { success: false, error: 'Parâmetros id e roteiro são obrigatórios.' },
        { status: 400 }
      );
    }

    // Mantemos os campos essenciais que existem na tabela: roteiro e updated_at
    // As decisões individuais de cada loja (decisao_gestor: 'aceito' | 'negado', obs_gestor)
    // já ficam 100% gravadas dentro do JSONB 'roteiro'.
    const updatePayload: any = {
      roteiro,
      updated_at: new Date().toISOString()
    };

    // Tentar atualizar com status_gestor se a coluna existir, mas se der erro de coluna ausente, tenta sem ela
    if (status_gestor !== undefined) {
      updatePayload.status_gestor = status_gestor;
    }

    let { data, error } = await alteraaiAdminSupabase
      .from('jp_validacoes')
      .update(updatePayload)
      .eq('id', id)
      .select()
      .single();

    // Se a coluna status_gestor ou observacao_gestor não existir na tabela jp_validacoes, salva apenas roteiro e updated_at
    if (error && error.message && error.message.includes('column of \'jp_validacoes\' in the schema cache')) {
      console.warn('Coluna opcional não encontrada no Supabase, salvando apenas no JSON roteiro:', error.message);
      const safePayload = {
        roteiro,
        updated_at: new Date().toISOString()
      };
      const retry = await alteraaiAdminSupabase
        .from('jp_validacoes')
        .update(safePayload)
        .eq('id', id)
        .select()
        .single();
      
      data = retry.data;
      error = retry.error;
    }

    if (error) {
      console.error('Erro ao atualizar decisão do gestor:', error);
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      message: 'Avaliação do gestor salva com sucesso!',
      validacao: data
    });
  } catch (err: any) {
    console.error('Erro no PATCH /api/validacao:', err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
