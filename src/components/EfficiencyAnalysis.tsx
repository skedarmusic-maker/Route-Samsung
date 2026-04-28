'use client';

import React, { useMemo, useState } from 'react';
import {
  TrendingUp, TrendingDown, Activity, DollarSign, Map,
  CheckCircle2, AlertTriangle, BarChart3, PieChart, Info,
  Plane, Globe, User, Award
} from 'lucide-react';
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';
import { RoteiroDia, LojaVisita } from '@/lib/types';

import despesasHistoricasMeses from '@/lib/despesas_historicas_meses.json';

interface EfficiencyAnalysisProps {
  resultado: any;
  totalEstimatedKM: number;
  historico: { km: number; valor: number; detalhes?: Record<string, number> } | null;
  mesComparacao: '03' | '04';
}

export default function EfficiencyAnalysis({ resultado, totalEstimatedKM, historico, mesComparacao }: EfficiencyAnalysisProps) {
  const [analiseView, setAnaliseView] = useState<'individual' | 'global'>('individual');

  const globalStats = useMemo(() => {
    const data = (despesasHistoricasMeses as any)[mesComparacao] || {};
    let totalValor = 0;
    let totalKM = 0;
    const porConsultor: { nome: string; valor: number; km: number }[] = [];
    const porCategoria: Record<string, number> = {};
    let valorViagem = 0;
    let valorLocal = 0;

    Object.entries(data).forEach(([consultor, info]: [string, any]) => {
      const v = info.valor || 0;
      const k = info.km || 0;
      totalValor += v;
      totalKM += k;
      porConsultor.push({
        nome: consultor,
        valor: v,
        km: k,
      });

      if (info.detalhes) {
        Object.entries(info.detalhes).forEach(([cat, val]: [string, any]) => {
          let targetCat = cat;
          if (cat.startsWith('Percurso')) {
            targetCat = 'Percurso';
          }
          porCategoria[targetCat] = (porCategoria[targetCat] || 0) + val;

          const catNorm = cat.toLowerCase();
          if (
            catNorm.includes('viagem') ||
            catNorm.includes('pedágio') ||
            catNorm.includes('pedagio') ||
            catNorm.includes('estacionamento') ||
            catNorm.includes('hospedagem') ||
            catNorm.includes('jantar') ||
            catNorm.includes('almoço') ||
            catNorm.includes('café')
          ) {
            valorViagem += val;
          } else {
            valorLocal += val;
          }
        });
      } else {
        // Se não houver detalhes (como em Março), consideramos como local (KM puro)
        valorLocal += v;
      }
    });

    porConsultor.sort((a, b) => b.valor - a.valor);

    const categoriasOrdenadas = Object.entries(porCategoria)
      .map(([cat, val]) => ({ categoria: cat, valor: val }))
      .sort((a, b) => b.valor - a.valor);

    return {
      totalValor,
      totalKM,
      porConsultor,
      porCategoria: categoriasOrdenadas,
      valorViagem,
      valorLocal
    };
  }, [mesComparacao]);

  const stats = useMemo(() => {
    const currentKM = totalEstimatedKM || 0;
    const currentCost = currentKM * 0.80; // Regra de R$ 0,80 por KM
    const totalVisitas = resultado.roteiro.reduce((acc: number, dia: RoteiroDia) => acc + dia.lojas.length, 0);
    const diasUteis = resultado.roteiro.length;
    const diasComVisita = resultado.roteiro.filter((d: RoteiroDia) => d.lojas.length > 0).length;

    const kmPorVisita = totalVisitas > 0 ? currentKM / totalVisitas : 0;
    const visitasPorDia = diasComVisita > 0 ? totalVisitas / diasComVisita : 0;

    const economyKM = historico ? historico.km - currentKM : 0;
    const economyValue = historico ? historico.valor - currentCost : 0;
    const percentKM = historico ? (economyKM / historico.km) * 100 : 0;

    // Agrupamento por Cluster
    const clusterCount: Record<string, number> = {};
    resultado.roteiro.forEach((d: RoteiroDia) => {
      d.lojas.forEach((l: LojaVisita) => {
        clusterCount[l.cluster] = (clusterCount[l.cluster] || 0) + 1;
      });
    });

    return {
      currentKM,
      currentCost,
      totalVisitas,
      diasComVisita,
      kmPorVisita,
      visitasPorDia,
      economyKM,
      economyValue,
      percentKM,
      clusterCount
    };
  }, [resultado, historico]);

  const downloadPDF = () => {
    window.print();
  };

  return (
    <div id="efficiency-analysis-container" className="p-6 space-y-8 animate-in fade-in duration-500 bg-[#f9fafb]">
      <style dangerouslySetInnerHTML={{
        __html: `
        @media print {
          body * {
            visibility: hidden;
            background-color: white !important;
          }
          #efficiency-analysis-container, #efficiency-analysis-container * {
            visibility: visible;
          }
          #efficiency-analysis-container {
            position: absolute;
            left: 0;
            top: 0;
            width: 100%;
            padding: 20px !important;
            margin: 0;
            background-color: white !important;
          }
          .no-print {
            display: none !important;
          }
        }
      `}} />
      {/* ── HEADER DE IMPACTO ── */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-black text-gray-900 flex items-center gap-2">
            <Activity className="w-6 h-6 text-blue-600" /> Dashboard de Eficiência Logística
          </h2>
          <p className="text-gray-500 text-sm">Análise comparativa entre o modelo automatizado e o histórico operacional.</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={downloadPDF}
            className="no-print flex items-center gap-2 px-4 py-2.5 bg-gray-900 hover:bg-black text-white text-xs font-bold rounded-xl shadow-md transition-all active:scale-95"
          >
            <BarChart3 className="w-4 h-4 text-blue-400" />
            Baixar Relatório PDF
          </button>
          <div className="flex items-center gap-3 bg-blue-50 border border-blue-100 px-4 py-2 rounded-xl">
            <div className="w-2 h-2 rounded-full bg-blue-600 animate-pulse" />
            <span className="text-xs font-bold text-blue-800 uppercase tracking-widest">Algoritmo V4.0</span>
          </div>
        </div>
      </div>

      {/* ── TOGGLE DE VISÃO ── */}
      <div className="no-print flex bg-gray-100 p-1 rounded-xl border border-gray-200 shadow-inner w-fit">
        <button
          onClick={() => setAnaliseView('individual')}
          className={`flex items-center gap-2 px-6 py-1.5 rounded-lg text-xs font-bold transition-all ${analiseView === 'individual' ? 'bg-white text-blue-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
        >
          <User className="w-4 h-4" /> Visão Individual ({resultado.consultor})
        </button>
        <button
          onClick={() => setAnaliseView('global')}
          className={`flex items-center gap-2 px-6 py-1.5 rounded-lg text-xs font-bold transition-all ${analiseView === 'global' ? 'bg-white text-blue-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
        >
          <Globe className="w-4 h-4" /> Relatório Global de Despesas
        </button>
      </div>

      {analiseView === 'individual' ? (
        <>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <MetricCard
              title="Distância Total"
              value={`${Math.round(stats.currentKM)} km`}
              subtitle="Projeção para o mês"
              icon={<Map className="w-5 h-5 text-blue-600" />}
            />
            <MetricCard
              title="Investimento Estimado"
              value={new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(stats.currentCost)}
              subtitle="Base: R$ 0,80/km"
              icon={<DollarSign className="w-5 h-5 text-green-600" />}
            />
            <MetricCard
              title="Eficiência de Rota"
              value={`${stats.kmPorVisita.toFixed(1)} km`}
              subtitle="Média por visita"
              icon={<BarChart3 className="w-5 h-5 text-purple-600" />}
              invertTrend
              trend={historico ? (stats.kmPorVisita < (historico.km / stats.totalVisitas) ? 'down' : 'up') : undefined}
            />
            <MetricCard
              title="Aproveitamento"
              value={`${stats.visitasPorDia.toFixed(1)}`}
              subtitle="Visitas / dia útil"
              icon={<CheckCircle2 className="w-5 h-5 text-amber-600" />}
              trend={stats.visitasPorDia >= 3 ? 'up' : 'down'}
            />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* ── COMPARAÇÃO HISTÓRICA ── */}
            <div className="lg:col-span-2 bg-white border border-gray-200 rounded-2xl p-6 shadow-sm">
              <div className="flex items-center justify-between mb-6">
                <h3 className="font-bold text-gray-800 flex items-center gap-2">
                  <TrendingUp className="w-5 h-5 text-blue-600" /> Ganho de Produtividade vs Mês Anterior
                </h3>
                <span className="text-[10px] font-bold bg-gray-100 text-gray-500 px-2 py-1 rounded uppercase">Dados Históricos</span>
              </div>

              {!historico ? (
                <div className="flex flex-col items-center justify-center py-12 text-gray-400">
                  <Info className="w-8 h-8 mb-2" />
                  <p className="text-sm">Sem dados históricos disponíveis para este consultor.</p>
                </div>
              ) : (
                <div className="space-y-6">
                  <div className="flex items-end gap-4 h-48">
                    <div className="flex-1 flex flex-col items-center gap-2 h-full justify-end">
                      <div className="w-full bg-gray-200 rounded-t-xl transition-all duration-1000" style={{ height: '100%' }}>
                        <div className="flex items-center justify-center h-full text-gray-600 font-bold text-xs rotate-90 md:rotate-0">
                          {Math.round(historico.km)} km
                        </div>
                      </div>
                      <p className="text-[10px] font-bold text-gray-500 uppercase">Histórico ({mesComparacao === '03' ? 'Março' : 'Abril'})</p>
                    </div>
                    <div className="flex-1 flex flex-col items-center gap-2 h-full justify-end">
                      <div
                        className={`w-full rounded-t-xl transition-all duration-1000 flex items-center justify-center text-white font-bold text-xs rotate-90 md:rotate-0 ${stats.economyKM > 0 ? 'bg-blue-600' : 'bg-red-500'}`}
                        style={{ height: `${(stats.currentKM / historico.km) * 100}%` }}
                      >
                        {Math.round(stats.currentKM)} km
                      </div>
                      <p className="text-[10px] font-bold text-blue-600 uppercase">Projetado (Maio)</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4 pt-6 border-t border-gray-100">
                    <div className={`p-4 rounded-xl border ${stats.economyKM >= 0 ? 'bg-green-50 border-green-100' : 'bg-red-50 border-red-100'}`}>
                      <p className={`text-xs font-medium ${stats.economyKM >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                        {stats.economyKM >= 0 ? 'Economia de Distância' : 'Aumento de Distância'}
                      </p>
                      <p className={`text-2xl font-black ${stats.economyKM >= 0 ? 'text-green-800' : 'text-red-800'}`}>
                        {stats.economyKM > 0 ? '-' : '+'}{Math.abs(Math.round(stats.economyKM))} km
                      </p>
                      <p className={`text-[10px] mt-1 font-bold ${stats.economyKM >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {Math.abs(stats.percentKM).toFixed(1)}% {stats.economyKM >= 0 ? 'menos' : 'mais'} rodagem
                      </p>
                    </div>
                    <div className={`p-4 rounded-xl border ${stats.economyValue >= 0 ? 'bg-blue-50 border-blue-100' : 'bg-red-50 border-red-100'}`}>
                      <p className={`text-xs font-medium ${stats.economyValue >= 0 ? 'text-blue-700' : 'text-red-700'}`}>
                        {stats.economyValue >= 0 ? 'Redução de Custo Direto' : 'Aumento de Custo Direto'}
                      </p>
                      <p className={`text-2xl font-black ${stats.economyValue >= 0 ? 'text-blue-800' : 'text-red-800'}`}>
                        {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Math.abs(stats.economyValue))}
                      </p>
                      <p className={`text-[10px] mt-1 font-bold ${stats.economyValue >= 0 ? 'text-blue-600' : 'text-red-600'}`}>
                        Baseado em R$ 0,80/km
                      </p>
                    </div>
                  </div>

                  {historico.detalhes && Object.keys(historico.detalhes).length > 0 && (
                    <div className="pt-4 border-t border-gray-100">
                      <p className="text-xs font-bold text-gray-700 mb-3">Composição das Despesas Declaradas:</p>
                      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                        {Object.entries(historico.detalhes).map(([tipo, valor]) => (
                          <div key={tipo} className="p-3 bg-gray-50 border border-gray-200 rounded-xl">
                            <p className="text-[10px] text-gray-500 font-semibold truncate uppercase">{tipo}</p>
                            <p className="text-sm font-black text-gray-800">
                              {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(valor)}
                            </p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* ── DISTRIBUIÇÃO POR CLUSTER ── */}
            <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm">
              <h3 className="font-bold text-gray-800 flex items-center gap-2 mb-6">
                <PieChart className="w-5 h-5 text-blue-600" /> Frequência por Cluster
              </h3>
              <div className="space-y-4">
                {Object.entries(stats.clusterCount).sort(([a], [b]) => a.localeCompare(b)).map(([cluster, count]) => {
                  const percent = (count / stats.totalVisitas) * 100;
                  const color = cluster === 'A' ? 'bg-red-500' : cluster === 'B' ? 'bg-orange-500' : cluster === 'C' ? 'bg-blue-500' : 'bg-gray-400';
                  return (
                    <div key={cluster} className="space-y-1">
                      <div className="flex justify-between text-xs font-bold">
                        <span className="text-gray-700">Cluster {cluster}</span>
                        <span className="text-gray-500">{count} visitas ({percent.toFixed(0)}%)</span>
                      </div>
                      <div className="w-full bg-gray-100 rounded-full h-2 overflow-hidden">
                        <div className={`h-full ${color}`} style={{ width: `${percent}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="mt-8 p-4 bg-gray-50 rounded-xl border border-gray-200">
                <h4 className="text-xs font-bold text-gray-700 mb-2 flex items-start gap-1">
                  <AlertTriangle className="w-3 h-3 text-amber-500 mt-0.5" /> Insights Logísticos
                </h4>
                <ul className="text-[10px] text-gray-500 space-y-2 leading-relaxed">
                  <li>• O roteiro prioriza clusters A e B em dias de menor deslocamento.</li>
                  <li>• Rotas de viagem foram agrupadas para garantir 3 visitas/dia.</li>
                  <li>• Feriados foram respeitados, mantendo a carga horária balanceada.</li>
                </ul>
              </div>
            </div>
          </div>
        </>
      ) : (
        /* ── RELATÓRIO GLOBAL DE DESPESAS ── */
        <div className="space-y-8 animate-in fade-in duration-500">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <MetricCard
              title="Gasto Total da Equipe"
              value={new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(globalStats.totalValor)}
              subtitle={`Total apurado em ${globalStats.totalKM.toFixed(0)} km`}
              icon={<DollarSign className="w-5 h-5 text-green-600" />}
            />
            <MetricCard
              title="Despesas com Viagem"
              value={new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(globalStats.valorViagem)}
              subtitle={`Representa ${globalStats.totalValor > 0 ? ((globalStats.valorViagem / globalStats.totalValor) * 100).toFixed(1) : 0}% do total`}
              icon={<Plane className="w-5 h-5 text-orange-600" />}
            />
            <MetricCard
              title="Despesas Locais (KM)"
              value={new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(globalStats.valorLocal)}
              subtitle={`Representa ${globalStats.totalValor > 0 ? ((globalStats.valorLocal / globalStats.totalValor) * 100).toFixed(1) : 0}% do total`}
              icon={<Map className="w-5 h-5 text-blue-600" />}
            />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* RANKING DE CONSULTORES */}
            <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm">
              <h3 className="font-bold text-gray-800 flex items-center gap-2 mb-4">
                <Award className="w-5 h-5 text-amber-500" /> Ranking de Despesas por Consultor
              </h3>
              <div className="space-y-3 max-h-[350px] overflow-y-auto pr-2 custom-scrollbar">
                {globalStats.porConsultor.map((cons, idx) => {
                  const percent = globalStats.totalValor > 0 ? (cons.valor / globalStats.totalValor) * 100 : 0;
                  return (
                    <div key={cons.nome} className="flex items-center justify-between p-3 bg-gray-50 border border-gray-200 rounded-xl">
                      <div className="flex items-center gap-3 min-w-0">
                        <span className="w-6 h-6 rounded-full bg-gray-200 text-gray-700 flex items-center justify-center font-bold text-xs shrink-0">{idx + 1}</span>
                        <div className="min-w-0">
                          <p className="text-xs font-bold text-gray-800 truncate">{cons.nome}</p>
                          <p className="text-[10px] text-gray-500">{cons.km.toFixed(0)} km rodados</p>
                        </div>
                      </div>
                      <div className="text-right shrink-0 ml-4">
                        <p className="text-sm font-black text-gray-900">{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(cons.valor)}</p>
                        <p className="text-[10px] text-gray-400 font-bold">{percent.toFixed(1)}%</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* CATEGORIAS MAIS CARAS */}
            <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm">
              <h3 className="font-bold text-gray-800 flex items-center gap-2 mb-4">
                <BarChart3 className="w-5 h-5 text-purple-600" /> Distribuição por Categoria
              </h3>
              <div className="space-y-4 max-h-[350px] overflow-y-auto pr-2 custom-scrollbar">
                {globalStats.porCategoria.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 text-gray-400">
                    <Info className="w-8 h-8 mb-2" />
                    <p className="text-sm">Sem detalhamento de categorias para este mês.</p>
                  </div>
                ) : (
                  globalStats.porCategoria.map(({ categoria, valor }) => {
                    const percent = globalStats.totalValor > 0 ? (valor / globalStats.totalValor) * 100 : 0;
                    return (
                      <div key={categoria} className="space-y-1">
                        <div className="flex justify-between text-xs font-bold">
                          <span className="text-gray-700 truncate max-w-[70%]" title={categoria}>{categoria}</span>
                          <span className="text-gray-900 shrink-0">{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(valor)}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="w-full bg-gray-100 rounded-full h-2 overflow-hidden flex">
                            <div className="h-full bg-purple-500" style={{ width: `${percent}%` }} />
                          </div>
                          <span className="text-[10px] text-gray-400 font-bold shrink-0 w-8 text-right">{percent.toFixed(1)}%</span>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>

          <div className="p-4 bg-amber-50 rounded-xl border border-amber-200">
            <h4 className="text-xs font-bold text-amber-800 mb-2 flex items-center gap-1">
              <Info className="w-4 h-4 text-amber-600 shrink-0" /> Dinâmica das Viagens
            </h4>
            <p className="text-xs text-amber-700 leading-relaxed">
              As despesas com hospedagem, alimentação e pedágio são geradas nas viagens regionais. O percurso rodado (KM) é reembolsado ao consultor nos dois cenários. A separação clara entre despesas puramente locais e estadias ajuda a mensurar o ROAS (Retorno em Atendimento de Venda) de cada deslocamento.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

function MetricCard({ title, value, subtitle, icon, trend, invertTrend = false }: {
  title: string;
  value: string;
  subtitle: string;
  icon: React.ReactNode;
  trend?: 'up' | 'down';
  invertTrend?: boolean;
}) {
  const isPositive = trend === 'up';
  const colorClass = trend ? (isPositive ? (invertTrend ? 'text-red-600' : 'text-green-600') : (invertTrend ? 'text-green-600' : 'text-red-600')) : 'text-gray-400';

  return (
    <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm hover:shadow-md transition-all border-b-4 border-b-blue-600">
      <div className="flex items-center justify-between mb-2">
        <div className="p-2 bg-gray-50 rounded-lg">{icon}</div>
        {trend && (
          <div className={`${colorClass}`}>
            {isPositive ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
          </div>
        )}
      </div>
      <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">{title}</p>
      <p className="text-xl font-black text-gray-900 mt-1">{value}</p>
      <p className="text-xs text-gray-500 mt-1">{subtitle}</p>
    </div>
  );
}
