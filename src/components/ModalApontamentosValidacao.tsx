'use client';

import React, { useState } from 'react';
import { 
  X, AlertTriangle, CheckCircle, Clock, Store, MapPin, 
  Calendar, Check, ThumbsUp, ThumbsDown, Save, Loader2, Edit3, ArrowRight
} from 'lucide-react';

interface ModalApontamentosProps {
  validacao: any;
  onClose: () => void;
  onAplicarAjustes?: (roteiroAjustado: any) => void;
  onDecisaoSalva?: (validacaoAtualizada: any) => void;
}

export default function ModalApontamentosValidacao({ 
  validacao, 
  onClose,
  onAplicarAjustes,
  onDecisaoSalva
}: ModalApontamentosProps) {
  if (!validacao) return null;

  // Roteiro local editável no modal
  const [roteiroState, setRoteiroState] = useState<any[]>(() => {
    return Array.isArray(validacao.roteiro) ? JSON.parse(JSON.stringify(validacao.roteiro)) : [];
  });

  const [salvandoDecisoes, setSalvandoDecisoes] = useState(false);
  const [feedbackSalvo, setFeedbackSalvo] = useState(false);

  // Extrair todas as visitas que têm apontamentos (status_validacao === 'reavaliar' ou observação preenchida)
  const visitasComApontamento: Array<{
    dataDia: string;
    diaSemana: string;
    lojaId: string;
    loja: any;
  }> = [];

  roteiroState.forEach((dia: any) => {
    (dia.lojas || []).forEach((loja: any) => {
      if (loja.status_validacao === 'reavaliar' || (loja.observacao && loja.observacao.trim().length > 0)) {
        visitasComApontamento.push({
          dataDia: dia.data,
          diaSemana: dia.diaSemana || dia.dia_semana || '',
          lojaId: loja.codigo || loja.nome_pdv,
          loja
        });
      }
    });
  });

  const totalApontamentos = visitasComApontamento.length;
  const aceitosCount = visitasComApontamento.filter(v => v.loja.decisao_gestor === 'aceito').length;
  const negadosCount = visitasComApontamento.filter(v => v.loja.decisao_gestor === 'negado').length;
  const pendentesDecisaoCount = totalApontamentos - (aceitosCount + negadosCount);

  // Alternar decisão do gestor para uma loja específica
  const handleToggleDecisao = (dataDia: string, lojaId: string, decisao: 'aceito' | 'negado') => {
    setFeedbackSalvo(false);
    setRoteiroState(prev => {
      return prev.map(dia => {
        if (dia.data !== dataDia) return dia;
        return {
          ...dia,
          lojas: (dia.lojas || []).map((l: any) => {
            const currentId = l.codigo || l.nome_pdv;
            if (currentId !== lojaId) return l;

            // Se clicar na mesma decisão já selecionada, limpa
            const novaDecisao = l.decisao_gestor === decisao ? null : decisao;
            return {
              ...l,
              decisao_gestor: novaDecisao
            };
          })
        };
      });
    });
  };

  // Atualizar observação/comentário do gestor para uma loja específica
  const handleUpdateObsGestor = (dataDia: string, lojaId: string, texto: string) => {
    setFeedbackSalvo(false);
    setRoteiroState(prev => {
      return prev.map(dia => {
        if (dia.data !== dataDia) return dia;
        return {
          ...dia,
          lojas: (dia.lojas || []).map((l: any) => {
            const currentId = l.codigo || l.nome_pdv;
            if (currentId !== lojaId) return l;
            return {
              ...l,
              obs_gestor: texto
            };
          })
        };
      });
    });
  };

  // Salvar decisões no Supabase (Alteraai)
  const handleSalvarDecisoesNoBanco = async () => {
    setSalvandoDecisoes(true);
    try {
      let statusGestor = 'Em Análise';
      if (aceitosCount > 0 && negadosCount === 0 && pendentesDecisaoCount === 0) {
        statusGestor = 'Ajustes Aceitos';
      } else if (negadosCount > 0 && aceitosCount === 0 && pendentesDecisaoCount === 0) {
        statusGestor = 'Ajustes Negados';
      } else if (aceitosCount > 0 || negadosCount > 0) {
        statusGestor = 'Ajustes Avaliados';
      }

      const res = await fetch('/api/validacao', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: validacao.id,
          roteiro: roteiroState,
          status_gestor: statusGestor
        })
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        alert('Erro ao salvar avaliação: ' + (data.error || 'Falha desconhecida'));
        return;
      }

      setFeedbackSalvo(true);
      if (onDecisaoSalva) {
        onDecisaoSalva({
          ...validacao,
          roteiro: roteiroState,
          status_gestor: statusGestor
        });
      }
    } catch (err: any) {
      alert('Erro ao conectar com API de validação: ' + err.message);
    } finally {
      setSalvandoDecisoes(false);
    }
  };

  // Abrir roteiro na tela de edição pré-carregando os ajustes aceitos
  const handleAbrirEdicaoComAjustes = async () => {
    // 1. Salva automaticamente no banco antes de abrir
    await handleSalvarDecisoesNoBanco();

    if (!onAplicarAjustes) {
      alert('Função de edição não disponível nesta tela.');
      return;
    }

    // 2. Prepara o roteiro com marcações de ajuste para a tela de prévia/edição
    const roteiroParaEdicao = {
      ...validacao,
      roteiro: roteiroState,
      ajustesAplicados: {
        total: totalApontamentos,
        aceitos: aceitosCount,
        negados: negadosCount
      }
    };

    onAplicarAjustes(roteiroParaEdicao);
    onClose();
  };

  const isComApontamentos = validacao.status === 'Com Apontamentos' || visitasComApontamento.length > 0;
  const isValidadoTotal = validacao.status === 'Validado' && visitasComApontamento.length === 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
      <div className="bg-slate-900 border border-slate-700/80 rounded-2xl w-full max-w-4xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="p-5 border-b border-slate-800 flex items-center justify-between bg-slate-950/70">
          <div className="flex items-center gap-3">
            <div className={`p-2.5 rounded-xl ${
              isComApontamentos 
                ? 'bg-amber-500/10 text-amber-400 border border-amber-500/30' 
                : isValidadoTotal 
                  ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30' 
                  : 'bg-blue-500/10 text-blue-400 border border-blue-500/30'
            }`}>
              {isComApontamentos ? <AlertTriangle className="w-5 h-5" /> : isValidadoTotal ? <CheckCircle className="w-5 h-5" /> : <Clock className="w-5 h-5" />}
            </div>
            <div>
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                Validação de JP: <span className="text-blue-400">{validacao.consultor}</span>
              </h2>
              <p className="text-xs text-slate-400">
                {validacao.versao_nome} • Enviado em: {validacao.enviado_em ? new Date(validacao.enviado_em).toLocaleDateString('pt-BR') : '-'}
                {validacao.respondido_em && ` • Respondido em: ${new Date(validacao.respondido_em).toLocaleString('pt-BR')}`}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Métricas rápidas */}
        <div className="grid grid-cols-4 gap-3 p-4 bg-slate-950/40 border-b border-slate-800 text-center">
          <div className="bg-slate-800/40 p-2.5 rounded-xl border border-slate-800">
            <div className="text-[10px] text-slate-400 uppercase font-semibold">Total Visitas</div>
            <div className="text-lg font-bold text-white mt-0.5">{validacao.total_visitas || 0}</div>
          </div>
          <div className="bg-emerald-950/30 p-2.5 rounded-xl border border-emerald-900/40">
            <div className="text-[10px] text-emerald-400 uppercase font-semibold">Validadas (✅)</div>
            <div className="text-lg font-bold text-emerald-400 mt-0.5">{validacao.visitas_validadas || 0}</div>
          </div>
          <div className="bg-amber-950/30 p-2.5 rounded-xl border border-amber-900/40">
            <div className="text-[10px] text-amber-400 uppercase font-semibold">Apontadas (❌)</div>
            <div className="text-lg font-bold text-amber-400 mt-0.5">{totalApontamentos}</div>
          </div>
          <div className="bg-blue-950/30 p-2.5 rounded-xl border border-blue-900/40">
            <div className="text-[10px] text-blue-400 uppercase font-semibold">Avaliação Gestor</div>
            <div className="text-xs font-bold text-blue-300 mt-1 flex items-center justify-center gap-2">
              <span className="text-emerald-400">{aceitosCount} Aceitos</span>
              <span className="text-slate-500">|</span>
              <span className="text-red-400">{negadosCount} Negados</span>
            </div>
          </div>
        </div>

        {/* Feedback visual de gravação */}
        {feedbackSalvo && (
          <div className="mx-5 mt-3 p-2.5 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-xs text-emerald-300 flex items-center justify-between">
            <span className="flex items-center gap-1.5 font-medium">
              <Check className="w-4 h-4 text-emerald-400" /> Decisões salvas no banco de dados e sincronizadas com o Alteraai!
            </span>
            <span className="text-[11px] text-emerald-400 font-bold">Status atualizado</span>
          </div>
        )}

        {/* Observação Geral do consultor */}
        {validacao.observacao_geral && (
          <div className="mx-5 mt-3 p-3 bg-blue-950/30 border border-blue-800/50 rounded-xl text-xs text-blue-200">
            <span className="font-bold text-blue-400 block mb-0.5">📝 Observação Geral do Consultor:</span>
            {validacao.observacao_geral}
          </div>
        )}

        {/* Lista de Apontamentos com Botões de Decisão do Gestor */}
        <div className="flex-1 overflow-y-auto p-5 space-y-3.5 custom-scrollbar">
          {visitasComApontamento.length === 0 ? (
            <div className="text-center py-12 px-4">
              {validacao.status === 'Pendente' ? (
                <>
                  <div className="inline-flex p-3 rounded-full bg-slate-800 text-blue-400 mb-3">
                    <Clock className="w-6 h-6 animate-pulse" />
                  </div>
                  <h3 className="text-base font-semibold text-white">Aguardando Validação do Consultor</h3>
                  <p className="text-xs text-slate-400 max-w-md mx-auto mt-1">
                    Este roteiro foi enviado para a tela do consultor no aplicativo Alteraai e está pendente de avaliação.
                  </p>
                </>
              ) : (
                <>
                  <div className="inline-flex p-3 rounded-full bg-emerald-950 text-emerald-400 mb-3 border border-emerald-800/40">
                    <CheckCircle className="w-6 h-6" />
                  </div>
                  <h3 className="text-base font-semibold text-emerald-400">Roteiro 100% Validado!</h3>
                  <p className="text-xs text-slate-400 max-w-md mx-auto mt-1">
                    O consultor avaliou e concordou com todas as visitas programadas, sem nenhum apontamento ou contestação.
                  </p>
                </>
              )}
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between text-xs font-semibold text-slate-300 mb-1">
                <span className="text-amber-400 flex items-center gap-1.5 uppercase tracking-wider">
                  <AlertTriangle className="w-4 h-4" />
                  {totalApontamentos} Visita(s) apontada(s) para reavaliação:
                </span>
                <span className="text-[11px] text-slate-400 font-normal">
                  Marque <strong className="text-emerald-400">Aceito</strong> para aplicar o ajuste ou <strong className="text-red-400">Negado</strong> para manter a visita original.
                </span>
              </div>

              {visitasComApontamento.map((item, idx) => {
                const { dataDia, diaSemana, lojaId, loja } = item;
                const decisao = loja.decisao_gestor; // 'aceito' | 'negado' | undefined
                const isAceito = decisao === 'aceito';
                const isNegado = decisao === 'negado';

                return (
                  <div 
                    key={idx}
                    className={`p-4 rounded-xl border transition-all ${
                      isAceito 
                        ? 'bg-emerald-950/20 border-emerald-500/40' 
                        : isNegado 
                          ? 'bg-red-950/20 border-red-500/40' 
                          : 'bg-slate-800/40 hover:bg-slate-800/60 border-amber-500/30'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3 mb-2 flex-wrap">
                      <div className="flex items-center gap-2">
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-amber-500/20 text-amber-300 border border-amber-500/30">
                          ❌ Reavaliar
                        </span>
                        {loja.motivo_categoria && (
                          <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-slate-700/80 text-slate-300 border border-slate-600">
                            {loja.motivo_categoria}
                          </span>
                        )}
                        <span className="text-xs font-semibold text-slate-300 flex items-center gap-1">
                          <Calendar className="w-3.5 h-3.5 text-blue-400" />
                          {dataDia ? dataDia.split('-').reverse().join('/') : ''} ({diaSemana})
                        </span>
                      </div>

                      <div className="flex items-center gap-3">
                        <span className="text-xs font-mono text-slate-400">
                          {loja.checkIn || '-'} às {loja.checkOut || '-'}
                        </span>
                        {/* Selo de status da decisão */}
                        {isAceito && (
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500 text-white shadow-xs">
                            AJUSTE ACEITO
                          </span>
                        )}
                        {isNegado && (
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-red-600 text-white shadow-xs">
                            AJUSTE NEGADO (MANTÉM ROTEIRO)
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="text-sm font-bold text-white flex items-center gap-1.5">
                      <Store className="w-4 h-4 text-slate-400 shrink-0" />
                      {loja.codigo} - {loja.filial || loja.cliente}
                    </div>

                    <div className="text-xs text-slate-400 flex items-center gap-1 mt-1">
                      <MapPin className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                      {loja.endereco || `${loja.cidade || ''} - ${loja.uf || ''}`}
                    </div>

                    {/* Justificativa do Consultor */}
                    <div className="mt-3 p-3 bg-amber-950/30 border-l-4 border-amber-500 rounded-r-lg">
                      <span className="text-[11px] font-bold text-amber-400 uppercase tracking-wide block mb-0.5">
                        Motivo / Justificativa do Consultor:
                      </span>
                      <p className="text-xs text-amber-100 font-medium whitespace-pre-wrap leading-relaxed">
                        {loja.observacao || 'Nenhum comentário específico preenchido.'}
                      </p>
                    </div>

                    {/* ── BARRA DE AVALIAÇÃO DO GESTOR ── */}
                    <div className="mt-3.5 pt-3 border-t border-slate-700/60 flex items-center justify-between gap-3 flex-wrap bg-slate-900/60 p-2.5 rounded-lg">
                      <span className="text-xs font-semibold text-slate-300">
                        Sua Decisão como Gestor:
                      </span>

                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => handleToggleDecisao(dataDia, lojaId, 'aceito')}
                          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                            isAceito
                              ? 'bg-emerald-600 text-white shadow-md shadow-emerald-900/50 scale-102 ring-2 ring-emerald-400'
                              : 'bg-slate-800 text-slate-300 hover:bg-emerald-950/60 hover:text-emerald-300 border border-slate-700'
                          }`}
                          title="Concordar com o ajuste apontado pelo consultor"
                        >
                          <ThumbsUp className="w-3.5 h-3.5" />
                          <span>Aceitar Ajuste (OK)</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => handleToggleDecisao(dataDia, lojaId, 'negado')}
                          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                            isNegado
                              ? 'bg-red-600 text-white shadow-md shadow-red-900/50 scale-102 ring-2 ring-red-400'
                              : 'bg-slate-800 text-slate-300 hover:bg-red-950/60 hover:text-red-300 border border-slate-700'
                          }`}
                          title="Negar a solicitação e manter o atendimento no roteiro"
                        >
                          <ThumbsDown className="w-3.5 h-3.5" />
                          <span>Negar Ajuste (X)</span>
                        </button>
                      </div>
                    </div>

                    {/* Observação opcional do gestor para esta loja */}
                    {(isAceito || isNegado) && (
                      <div className="mt-2">
                        <input
                          type="text"
                          value={loja.obs_gestor || ''}
                          onChange={(e) => handleUpdateObsGestor(dataDia, lojaId, e.target.value)}
                          placeholder="Nota do gestor para o consultor (opcional, ex: Visita remanejada para a próxima semana)..."
                          className="w-full text-xs bg-slate-950/70 border border-slate-700 rounded-lg px-3 py-1.5 text-slate-200 placeholder-slate-500 outline-none focus:border-blue-500"
                        />
                      </div>
                    )}
                  </div>
                );
              })}
            </>
          )}
        </div>

        {/* Footer com Ações */}
        <div className="p-4 border-t border-slate-800 bg-slate-950/70 flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <button
              onClick={handleSalvarDecisoesNoBanco}
              disabled={salvandoDecisoes || totalApontamentos === 0}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold rounded-xl transition-all shadow-md active:scale-95 disabled:opacity-50"
            >
              {salvandoDecisoes ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              Salvar Minha Avaliação
            </button>
            <span className="text-xs text-slate-400">
              {aceitosCount + negadosCount} de {totalApontamentos} avaliados
            </span>
          </div>

          <div className="flex items-center gap-2">
            {aceitosCount > 0 && onAplicarAjustes && (
              <button
                onClick={handleAbrirEdicaoComAjustes}
                disabled={salvandoDecisoes}
                className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-xl transition-all shadow-md active:scale-95"
                title="Abrir a tela de edição do roteiro para aplicar as trocas e gerar a nova versão"
              >
                <Edit3 className="w-4 h-4" />
                <span>Carregar no Editor ({aceitosCount} Aceitos)</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            )}

            <button
              onClick={onClose}
              className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold rounded-xl transition-colors"
            >
              Fechar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
