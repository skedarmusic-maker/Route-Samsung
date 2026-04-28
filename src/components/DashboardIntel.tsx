'use client';

import { useEffect, useState } from 'react';
import { TrendingDown, TrendingUp, AlertTriangle, CheckCircle2, Clock, Activity, ChevronRight } from 'lucide-react';

interface RedeData {
  nome: string;
  total: number;
  emDia: number;
  atrasadas: number;
  semHistorico: number;
  percentualEmDia: number;
  maiorAtraso: number;
}

interface CriticaData {
  nome_pdv: string;
  cliente: string;
  cluster: string;
  diasSemVisita: number;
  periodo: string;
}

interface DashboardData {
  totalLojas: number;
  emDia: number;
  atrasadas: number;
  semHistorico: number;
  percentualEmDia: number;
  rankingRedes: RedeData[];
  criticas: CriticaData[];
  totalCriticas: number;
  mediaAtraso: number;
}

function ModalFullList({ list, onClose }: { list: CriticaData[]; onClose: () => void }) {
  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[9999] flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl w-full max-w-4xl max-h-[85vh] flex flex-col shadow-2xl overflow-hidden border border-gray-200">
        <div className="p-6 border-b border-gray-100 flex items-center justify-between bg-gray-50/50">
          <div>
            <h3 className="text-xl font-bold text-gray-900 flex items-center gap-2">
              <Clock className="w-6 h-6 text-orange-500" /> Relatório de Lojas Críticas
            </h3>
            <p className="text-sm text-gray-500 mt-1">Total de {list.length} lojas que precisam de atenção imediata</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-200 rounded-full transition-colors text-gray-400 hover:text-gray-600">
            <Activity className="w-6 h-6 rotate-90" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto">
          <table className="w-full text-left border-collapse">
            <thead className="sticky top-0 bg-white shadow-sm z-10">
              <tr className="text-[10px] uppercase text-gray-400 font-black border-b border-gray-100">
                <th className="px-6 py-4">Loja / PDV</th>
                <th className="px-6 py-4">Rede</th>
                <th className="px-6 py-4 text-center">Cluster</th>
                <th className="px-6 py-4 text-center">Status</th>
                <th className="px-6 py-4 text-right">Dias Sem Visita</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50 text-sm">
              {list.map((l, i) => (
                <tr key={i} className="hover:bg-gray-50 transition-colors">
                  <td className="px-6 py-4">
                    <p className="font-semibold text-gray-800">{l.nome_pdv}</p>
                    <p className="text-[10px] text-gray-400 mt-0.5 uppercase">{l.periodo}</p>
                  </td>
                  <td className="px-6 py-4 text-gray-600">{l.cliente}</td>
                  <td className="px-6 py-4 text-center">
                    <span className="text-[10px] font-bold bg-gray-100 px-2 py-0.5 rounded text-gray-600">{l.cluster}</span>
                  </td>
                  <td className="px-6 py-4 text-center">
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${l.diasSemVisita >= 999 ? 'bg-gray-100 text-gray-500' : 'bg-red-50 text-red-600'}`}>
                      {l.diasSemVisita >= 999 ? 'Sem Registro' : 'Atrasada'}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <span className={`font-bold ${l.diasSemVisita >= 999 ? 'text-gray-400' : 'text-red-600'}`}>
                      {l.diasSemVisita >= 999 ? '--' : `${l.diasSemVisita}d`}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="p-4 bg-gray-50 border-t border-gray-100 flex justify-end">
          <button onClick={onClose} className="px-8 py-2.5 bg-gray-900 text-white font-bold rounded-xl hover:bg-black transition-all shadow-lg active:scale-95">
            Fechar Relatório
          </button>
        </div>
      </div>
    </div>
  );
}

function CircleProgress({ percent, size = 80 }: { percent: number; size?: number }) {
  const r = (size - 10) / 2;
  const circ = 2 * Math.PI * r;
  const filled = (percent / 100) * circ;
  const color = percent >= 70 ? '#22c55e' : percent >= 40 ? '#f59e0b' : '#ef4444';

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="rotate-[-90deg]">
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#e5e7eb" strokeWidth={8} />
      <circle
        cx={size / 2} cy={size / 2} r={r}
        fill="none" stroke={color} strokeWidth={8}
        strokeDasharray={`${filled} ${circ - filled}`}
        strokeLinecap="round"
        style={{ transition: 'stroke-dasharray 0.8s ease' }}
      />
    </svg>
  );
}

function HealthBar({ percent }: { percent: number }) {
  const color = percent >= 70 ? 'bg-green-500' : percent >= 40 ? 'bg-amber-400' : 'bg-red-500';
  return (
    <div className="w-full h-1.5 bg-gray-100 rounded-full overflow-hidden">
      <div className={`h-full ${color} rounded-full transition-all duration-700`} style={{ width: `${percent}%` }} />
    </div>
  );
}

export default function DashboardIntel({ consultor, status, clusters, clientes }: { 
  consultor?: string;
  status?: string;
  clusters?: string[];
  clientes?: string[];
}) {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);
  const [showFullModal, setShowFullModal] = useState(false);

  useEffect(() => {
    setLoading(true);
    setData(null);
    
    const params = new URLSearchParams();
    if (consultor) params.append('consultor', consultor);
    if (status) params.append('status', status);
    if (clusters && clusters.length > 0) params.append('clusters', clusters.join(','));
    if (clientes && clientes.length > 0) params.append('clientes', clientes.join(','));

    const url = `/api/dashboard-intel?${params.toString()}`;

    fetch(url)
      .then(r => r.json())
      .then(d => setData(d))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [consultor, status, clusters, clientes]);

  if (loading) {
    return (
      <div className="flex flex-col gap-3 animate-pulse">
        <div className="h-28 bg-gray-100 rounded-2xl" />
        <div className="h-36 bg-gray-100 rounded-2xl" />
        <div className="h-48 bg-gray-100 rounded-2xl" />
      </div>
    );
  }

  if (!data || !data.rankingRedes || !data.criticas) return null;

  const { totalLojas, emDia, atrasadas, semHistorico, percentualEmDia, rankingRedes, criticas, totalCriticas, mediaAtraso } = data;
  const top5Criticas = criticas.slice(0, 5);
  const saude = percentualEmDia >= 70 ? { label: 'Boa', color: 'text-green-600', bg: 'bg-green-50', border: 'border-green-200' }
    : percentualEmDia >= 40 ? { label: 'Atenção', color: 'text-amber-600', bg: 'bg-amber-50', border: 'border-amber-200' }
    : { label: 'Crítica', color: 'text-red-600', bg: 'bg-red-50', border: 'border-red-200' };

  const pioresRedes = rankingRedes.slice(0, 4);
  const melhoresRedes = [...rankingRedes].sort((a, b) => b.percentualEmDia - a.percentualEmDia).slice(0, 2);

  return (
    <div className="flex flex-col gap-4">
      {showFullModal && <ModalFullList list={criticas} onClose={() => setShowFullModal(false)} />}
      
      {/* Header */}
      <div className="flex items-center gap-2 mb-1">
        <Activity className="w-4 h-4 text-[#1428A0]" />
        <span className="text-xs font-bold text-gray-500 uppercase tracking-wider">
          {consultor ? 'Inteligência do Consultor' : 'Inteligência Global'}
        </span>
      </div>

      {/* Saúde Geral */}
      <div className={`rounded-2xl border p-4 ${saude.bg} ${saude.border}`}>
        <div className="flex items-center gap-4">
          <div className="relative shrink-0">
            <CircleProgress percent={percentualEmDia} size={72} />
            <div className="absolute inset-0 flex items-center justify-center">
              <span className={`text-base font-black ${saude.color}`}>{percentualEmDia}%</span>
            </div>
          </div>
          <div className="flex-1 min-w-0">
            <p className={`text-sm font-bold ${saude.color}`}>Saúde: {saude.label}</p>
            <p className="text-xs text-gray-500 mt-0.5 leading-snug">
              {emDia} em dia · {atrasadas} atrasadas · {semHistorico} sem histórico
            </p>
            <p className="text-xs text-gray-400 mt-1">{totalLojas} lojas no total</p>
          </div>
        </div>
      </div>

      {/* Alerta se atraso médio alto */}
      {mediaAtraso > 15 && (
        <div className="flex items-start gap-2.5 p-3 bg-red-50 border border-red-200 rounded-xl">
          <AlertTriangle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
          <div>
            <p className="text-xs font-semibold text-red-700">Atraso Médio: +{mediaAtraso} dias</p>
            <p className="text-[11px] text-red-500 mt-0.5">Várias lojas ultrapassaram o prazo de visita</p>
          </div>
        </div>
      )}

      {/* Lojas Críticas */}
      {top5Criticas.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between bg-orange-50/30">
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-orange-500" />
              <p className="text-xs font-bold text-gray-700 uppercase tracking-wider">Lojas mais críticas</p>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] font-black text-orange-600 bg-white border border-orange-200 px-2 py-0.5 rounded-lg shadow-sm">
                {totalCriticas || 0}
              </span>
            </div>
          </div>
          <div className="divide-y divide-gray-50">
            {top5Criticas.slice(0, expanded ? 5 : 3).map((l, i) => (
              <div key={i} className="px-4 py-2.5 flex items-center gap-3">
                <div className={`shrink-0 w-1.5 h-1.5 rounded-full ${l.diasSemVisita >= 999 ? 'bg-gray-400' : l.diasSemVisita > 60 ? 'bg-red-500' : 'bg-amber-400'}`} />
                <div className="flex-1 min-w-0">
                  <p className="text-[11px] font-semibold text-gray-800 truncate">{l.nome_pdv.split(' - ').slice(0, 2).join(' - ')}</p>
                  <p className="text-[10px] text-gray-400">{l.cliente} · Cluster {l.cluster}</p>
                </div>
                <span className={`text-[10px] font-bold shrink-0 px-2 py-0.5 rounded-full ${l.diasSemVisita >= 999 ? 'bg-gray-100 text-gray-500' : 'bg-red-50 text-red-600'}`}>
                  {l.diasSemVisita >= 999 ? 'Nunca' : `${l.diasSemVisita}d`}
                </span>
              </div>
            ))}
          </div>
          <div className="flex flex-col border-t border-gray-50">
            <button onClick={() => setExpanded(!expanded)} className="w-full py-2 text-[11px] text-blue-600 hover:bg-blue-50 transition-colors flex items-center justify-center gap-1 border-b border-gray-50">
              {expanded ? 'Recolher mini lista' : 'Ver mais na mini lista'}
              <ChevronRight className={`w-3 h-3 transition-transform ${expanded ? 'rotate-90' : ''}`} />
            </button>
            <button 
              onClick={() => setShowFullModal(true)}
              className="w-full py-2.5 text-[11px] font-bold text-orange-600 hover:bg-orange-50 transition-colors flex items-center justify-center gap-2"
            >
              <Activity className="w-3 h-3" />
              Ver Lista Completa ({totalCriticas})
            </button>
          </div>
        </div>
      )}

      {/* Ranking de Redes */}
      <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <TrendingDown className="w-4 h-4 text-red-500" />
            <p className="text-xs font-bold text-gray-700 uppercase tracking-wider">Redes em alerta</p>
          </div>
        </div>
        <div className="p-3 space-y-3">
          {pioresRedes.map((rede, i) => (
            <div key={i}>
              <div className="flex items-center justify-between mb-1">
                <span className="text-[11px] font-semibold text-gray-700 truncate max-w-[60%]">{rede.nome}</span>
                <span className={`text-[10px] font-bold ${rede.percentualEmDia >= 70 ? 'text-green-600' : rede.percentualEmDia >= 40 ? 'text-amber-600' : 'text-red-600'}`}>
                  {rede.percentualEmDia}% em dia
                </span>
              </div>
              <HealthBar percent={rede.percentualEmDia} />
              <p className="text-[9px] text-gray-400 mt-0.5">{rede.emDia}/{rede.total} lojas · {rede.atrasadas} atrasadas</p>
            </div>
          ))}
        </div>
      </div>

      {/* Melhores Redes */}
      {melhoresRedes.length > 0 && melhoresRedes[0].percentualEmDia > 0 && (
        <div className="bg-green-50 border border-green-200 rounded-2xl p-4">
          <div className="flex items-center gap-2 mb-3">
            <TrendingUp className="w-4 h-4 text-green-600" />
            <p className="text-xs font-bold text-green-700 uppercase tracking-wider">Melhores redes</p>
          </div>
          <div className="space-y-2">
            {melhoresRedes.map((rede, i) => (
              <div key={i} className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-3 h-3 text-green-500" />
                  <span className="text-[11px] font-semibold text-gray-700">{rede.nome}</span>
                </div>
                <span className="text-[11px] font-bold text-green-600">{rede.percentualEmDia}%</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
