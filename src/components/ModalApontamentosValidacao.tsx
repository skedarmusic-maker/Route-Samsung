'use client';

import React from 'react';
import { X, AlertTriangle, CheckCircle, Clock, Store, MapPin, Calendar } from 'lucide-react';

interface ModalApontamentosProps {
  validacao: any;
  onClose: () => void;
}

export default function ModalApontamentosValidacao({ validacao, onClose }: ModalApontamentosProps) {
  if (!validacao) return null;

  // Extrair todas as visitas que têm apontamentos (status_validacao === 'reavaliar' ou observacao preenchida)
  const roteiro = Array.isArray(validacao.roteiro) ? validacao.roteiro : [];
  const visitasComApontamento: Array<{
    data: string;
    diaSemana: string;
    loja: any;
  }> = [];

  roteiro.forEach((dia: any) => {
    (dia.lojas || []).forEach((loja: any) => {
      if (loja.status_validacao === 'reavaliar' || (loja.observacao && loja.observacao.trim().length > 0)) {
        visitasComApontamento.push({
          data: dia.data,
          diaSemana: dia.diaSemana || dia.dia_semana || '',
          loja
        });
      }
    });
  });

  const isComApontamentos = validacao.status === 'Com Apontamentos' || visitasComApontamento.length > 0;
  const isValidadoTotal = validacao.status === 'Validado' && visitasComApontamento.length === 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
      <div className="bg-slate-900 border border-slate-700/80 rounded-2xl w-full max-w-3xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="p-5 border-b border-slate-800 flex items-center justify-between bg-slate-950/60">
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
        <div className="grid grid-cols-3 gap-3 p-4 bg-slate-950/40 border-b border-slate-800 text-center">
          <div className="bg-slate-800/40 p-3 rounded-xl border border-slate-800">
            <div className="text-xs text-slate-400 uppercase font-medium">Total Visitas</div>
            <div className="text-xl font-bold text-white mt-0.5">{validacao.total_visitas || 0}</div>
          </div>
          <div className="bg-emerald-950/30 p-3 rounded-xl border border-emerald-900/40">
            <div className="text-xs text-emerald-400 uppercase font-medium">Validadas (✅)</div>
            <div className="text-xl font-bold text-emerald-400 mt-0.5">{validacao.visitas_validadas || 0}</div>
          </div>
          <div className="bg-amber-950/30 p-3 rounded-xl border border-amber-900/40">
            <div className="text-xs text-amber-400 uppercase font-medium">Reavaliar (❌)</div>
            <div className="text-xl font-bold text-amber-400 mt-0.5">{visitasComApontamento.length}</div>
          </div>
        </div>

        {/* Observação Geral (se houver) */}
        {validacao.observacao_geral && (
          <div className="mx-5 mt-4 p-3.5 bg-blue-950/30 border border-blue-800/50 rounded-xl text-xs text-blue-200">
            <span className="font-bold text-blue-400 block mb-1">📝 Observação Geral do Consultor:</span>
            {validacao.observacao_geral}
          </div>
        )}

        {/* Lista de Apontamentos ou Estado Vazio */}
        <div className="flex-1 overflow-y-auto p-5 space-y-3">
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
              <div className="text-xs font-semibold text-amber-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5" />
                {visitasComApontamento.length} Visita(s) apontada(s) para reavaliação:
              </div>

              {visitasComApontamento.map((item, idx) => {
                const { data, diaSemana, loja } = item;
                return (
                  <div 
                    key={idx}
                    className="p-4 bg-slate-800/40 hover:bg-slate-800/70 border border-amber-500/30 rounded-xl transition-all"
                  >
                    <div className="flex items-start justify-between gap-3 mb-2">
                      <div className="flex items-center gap-2">
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-amber-500/20 text-amber-300 border border-amber-500/30">
                          ❌ Reavaliar
                        </span>
                        {loja.motivo_categoria && (
                          <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-slate-700 text-slate-300">
                            {loja.motivo_categoria}
                          </span>
                        )}
                        <span className="text-xs font-semibold text-slate-300 flex items-center gap-1">
                          <Calendar className="w-3.5 h-3.5 text-blue-400" />
                          {data ? data.split('-').reverse().join('/') : ''} ({diaSemana})
                        </span>
                      </div>

                      <span className="text-xs font-mono text-slate-400">
                        {loja.checkIn || '-'} às {loja.checkOut || '-'}
                      </span>
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
                    <div className="mt-3 p-3 bg-amber-950/25 border-l-4 border-amber-500 rounded-r-lg">
                      <span className="text-[11px] font-bold text-amber-400 uppercase tracking-wide block mb-0.5">
                        Motivo / Justificativa do Consultor:
                      </span>
                      <p className="text-xs text-amber-100 font-medium whitespace-pre-wrap">
                        {loja.observacao || 'Nenhum comentário específico preenchido.'}
                      </p>
                    </div>
                  </div>
                );
              })}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-800 bg-slate-950/60 flex items-center justify-between">
          <div className="text-xs text-slate-400">
            Status: <span className="font-semibold text-white">{validacao.status}</span>
          </div>
          <button
            onClick={onClose}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white text-xs font-semibold rounded-lg transition-colors"
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
}
