'use client';

import React, { useMemo, useState } from 'react';
import { 
  TrendingUp, Users, Map, DollarSign, Activity, 
  ArrowLeft, Download, Layers, CheckCircle2 
} from 'lucide-react';
import * as xlsx from 'xlsx';
import dynamic from 'next/dynamic';

// Carregamento dinâmico do mapa consolidado (apenas leitura/visualização)
const MapPreview = dynamic(() => import('@/components/MapPreview'), { ssr: false });

import cityCoords from '@/lib/city_coords.json';
import { normalize, computeDistance } from '@/lib/utils';
import despesasHistoricasMeses from '@/lib/despesas_historicas_meses.json';

interface RoteiroSalvo {
  id: string;
  consultor: string;
  mes: number;
  ano: number;
  status: string;
  created_at: string;
  dados_roteiro: any;
}

interface ConsolidatedDashboardProps {
  roteiros: RoteiroSalvo[];
  consultores: any[];
  onVoltar: () => void;
  onSelectRoteiro: (dados: any) => void;
}

export default function ConsolidatedDashboard({ roteiros, consultores, onVoltar, onSelectRoteiro }: ConsolidatedDashboardProps) {
  const [mesComparacao, setMesComparacao] = useState<'03' | '04'>('04');

  const pastMonthStats = useMemo(() => {
    const data = (despesasHistoricasMeses as any)[mesComparacao] || {};
    let pastKM = 0;
    let pastCost = 0;
    
    Object.values(data).forEach((info: any) => {
      pastKM += info.km || 0;
      pastCost += info.valor || 0;
    });

    return { pastKM, pastCost };
  }, [mesComparacao]);

  const globalExpenseStats = useMemo(() => {
    const data = (despesasHistoricasMeses as any)[mesComparacao] || {};
    let totalValor = 0;
    let valorViagem = 0;
    let valorLocal = 0;
    const porCategoria: Record<string, number> = {};

    Object.values(data).forEach((info: any) => {
      totalValor += info.valor || 0;
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
        valorLocal += info.valor || 0;
      }
    });

    const categoriasOrdenadas = Object.entries(porCategoria)
      .map(([cat, val]) => ({ categoria: cat, valor: val }))
      .sort((a, b) => b.valor - a.valor);

    return { totalValor, valorViagem, valorLocal, porCategoria: categoriasOrdenadas };
  }, [mesComparacao]);

  const stats = useMemo(() => {
    let totalKM = 0;
    let totalLojas = 0;
    let totalVisitas = 0;
    const consultorStats: Record<string, { km: number, visitas: number, lojas: number }> = {};

    roteiros.forEach(r => {
      const d = r.dados_roteiro;
      if (!d) return;

      let km = d.totalEstimatedKM || 0;
      
      // FALLBACK: Se o KM não estiver no JSON (roteiros antigos), calculamos agora
      if (km === 0 && d.roteiro) {
        const consultorInfo = consultores.find(c => normalize(c.nome) === normalize(r.consultor));
        const consultorCoords = consultorInfo ? { lat: consultorInfo.lat, lng: consultorInfo.lng } : { lat: 0, lng: 0 };
        
        if (consultorCoords.lat !== 0) {
          d.roteiro.forEach((dia: any) => {
            if (dia.lojas.length === 0) return;
            
            let firstStore = dia.lojas[0];
            let firstCoords = { lat: firstStore.lat, lng: firstStore.lng };
            if (!firstCoords.lat || !firstCoords.lng) {
              const key = normalize(`${firstStore.cidade}-${firstStore.uf}`);
              const coords = (cityCoords as Record<string, any>)[key];
              if (coords) firstCoords = coords;
            }

            const distToHub = (firstCoords.lat && firstCoords.lng) ? computeDistance(consultorCoords, firstCoords) : 0;
            const goesByPlane = distToHub > 350;
            
            let curr = goesByPlane ? firstCoords : consultorCoords;
            let diaEstimado = 0;
            
            dia.lojas.forEach((loja: any, idx: number) => {
              let lat = loja.lat;
              let lng = loja.lng;
              if (!lat || !lng) {
                const key = normalize(`${loja.cidade}-${loja.uf}`);
                const coords = (cityCoords as Record<string, any>)[key];
                if (coords) { lat = coords.lat; lng = coords.lng; }
              }
              if (lat && lng) {
                if (!(idx === 0 && goesByPlane)) {
                  diaEstimado += computeDistance(curr, { lat, lng });
                }
                curr = { lat, lng };
              }
            });
            if (!goesByPlane) diaEstimado += computeDistance(curr, consultorCoords);
            km += (diaEstimado * 1.3);
          });
        }
      }

      totalKM += km;
      totalLojas += d.totalLojas || 0;
      
      let visitas = 0;
      d.roteiro?.forEach((dia: any) => {
        visitas += dia.lojas?.length || 0;
      });
      totalVisitas += visitas;

      consultorStats[r.consultor] = {
        km: (consultorStats[r.consultor]?.km || 0) + km,
        visitas: (consultorStats[r.consultor]?.visitas || 0) + visitas,
        lojas: (consultorStats[r.consultor]?.lojas || 0) + (d.totalLojas || 0)
      };
    });

    return {
      totalKM,
      totalLojas,
      totalVisitas,
      consultorStats,
      totalCost: totalKM * 0.80
    };
  }, [roteiros, consultores]);

  const handleExportAll = () => {
    const dataToExport = roteiros.flatMap((r) => {
      const resultado = r.dados_roteiro;
      if (!resultado || !resultado.roteiro) return [];

      return resultado.roteiro.flatMap((dia: any) => {
        if (dia.feriado && !dia.feriado.startsWith('__viagem')) {
          return [{
            Data: dia.data,
            'Dia da Semana': dia.diaSemana,
            Consultor: r.consultor,
            'Nome PDV': dia.feriado,
            'Status': 'FERIADO/FOLGA'
          }];
        }

        return dia.lojas.map((loja: any) => ({
          Data: dia.data,
          'Dia da Semana': dia.diaSemana,
          Consultor: r.consultor,
          'Nome PDV': loja.nome_pdv,
          Cliente: loja.cliente,
          Cidade: loja.cidade,
          UF: loja.uf,
          Cluster: loja.cluster,
          'Check-in': loja.checkIn,
          'Check-out': loja.checkOut,
          Tipo: loja.tipo === 'viagem' ? `Viagem (${loja.estadoViagem})` : 'Local'
        }));
      });
    });

    const worksheet = xlsx.utils.json_to_sheet(dataToExport);
    const workbook = xlsx.utils.book_new();
    xlsx.utils.book_append_sheet(workbook, worksheet, "Consolidado");
    xlsx.writeFile(workbook, `Consolidado_Roteiros_${new Date().getTime()}.xlsx`);
  };

  return (
    <div id="consolidated-dashboard-container" className="fixed inset-0 bg-gray-50 z-[60] flex flex-col overflow-hidden">
      <style dangerouslySetInnerHTML={{__html: `
        @media print {
          body * {
            visibility: hidden;
            background-color: white !important;
          }
          #consolidated-dashboard-container, #consolidated-dashboard-container * {
            visibility: visible;
          }
          #consolidated-dashboard-container {
            position: absolute;
            left: 0;
            top: 0;
            width: 100%;
            height: auto !important;
            overflow: visible !important;
            padding: 20px !important;
            margin: 0;
            background-color: white !important;
          }
          .no-print {
            display: none !important;
          }
        }
      `}} />
      {/* ── HEADER ── */}
      <div className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between shadow-sm shrink-0 no-print">
        <div className="flex items-center gap-4">
          <button onClick={onVoltar} className="p-2 hover:bg-gray-100 rounded-full transition-colors">
            <ArrowLeft className="w-5 h-5 text-gray-600" />
          </button>
          <div>
            <h1 className="text-xl font-black text-gray-900">Visão Geral Consolidada</h1>
            <p className="text-xs text-gray-500 uppercase font-bold tracking-widest">Mês de Referência: {roteiros[0]?.mes}/{roteiros[0]?.ano}</p>
          </div>

          <div className="flex items-center gap-2 bg-gray-50 border border-gray-200 px-3 py-1.5 rounded-xl ml-4">
            <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Base Comparação:</span>
            <select 
              value={mesComparacao} 
              onChange={(e) => setMesComparacao(e.target.value as '03' | '04')}
              className="bg-transparent text-xs font-bold text-gray-700 focus:outline-none cursor-pointer"
            >
              <option value="03">Março/2026</option>
              <option value="04">Abril/2026</option>
            </select>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button 
            onClick={() => window.print()}
            className="flex items-center gap-2 px-4 py-2 bg-gray-900 text-white font-bold rounded-xl hover:bg-black transition-all shadow-md active:scale-95 text-sm"
          >
            <Download className="w-4 h-4" /> Baixar PDF
          </button>
          <button 
            onClick={handleExportAll}
            className="flex items-center gap-2 px-4 py-2 bg-[#1428A0] text-white font-bold rounded-xl hover:bg-blue-800 transition-all shadow-md active:scale-95 text-sm"
          >
            <Download className="w-4 h-4" /> Exportar Tudo (Excel)
          </button>
        </div>
      </div>

      {/* ── CONTEÚDO ── */}
      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {/* ── KPI CARDS ── */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="bg-white p-5 rounded-2xl border border-gray-200 shadow-sm border-b-4 border-b-blue-600">
            <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Distância Total</p>
            <p className="text-2xl font-black text-gray-900">{Math.round(stats.totalKM)} km</p>
            <div className="flex items-center justify-between mt-2 border-t border-gray-50 pt-1.5">
              <div className="flex items-center gap-1 text-blue-600">
                <Map className="w-3 h-3" />
                <span className="text-[10px] font-bold">Total da Frota</span>
              </div>
              <span className="text-[9px] font-bold text-gray-400">vs {Math.round(pastMonthStats.pastKM)} km ({mesComparacao === '03' ? 'Março' : 'Abril'})</span>
            </div>
          </div>
          <div className="bg-white p-5 rounded-2xl border border-gray-200 shadow-sm border-b-4 border-b-green-600">
            <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Investimento Total</p>
            <p className="text-2xl font-black text-gray-900">{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(stats.totalCost)}</p>
            <div className="flex items-center justify-between mt-2 border-t border-gray-50 pt-1.5">
              <div className="flex items-center gap-1 text-green-600">
                <DollarSign className="w-3 h-3" />
                <span className="text-[10px] font-bold">Base R$ 0,80/km</span>
              </div>
              <span className="text-[9px] font-bold text-gray-400">vs {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(pastMonthStats.pastCost)}</span>
            </div>
          </div>
          <div className="bg-white p-5 rounded-2xl border border-gray-200 shadow-sm border-b-4 border-b-purple-600">
            <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Cobertura de Lojas</p>
            <p className="text-2xl font-black text-gray-900">{stats.totalLojas}</p>
            <div className="flex items-center gap-1 text-purple-600 mt-2">
              <CheckCircle2 className="w-3 h-3" />
              <span className="text-[10px] font-bold">PDVs Únicos</span>
            </div>
          </div>
          <div className="bg-white p-5 rounded-2xl border border-gray-200 shadow-sm border-b-4 border-b-amber-600">
            <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Consultores Ativos</p>
            <p className="text-2xl font-black text-gray-900">{roteiros.length}</p>
            <div className="flex items-center gap-1 text-amber-600 mt-2">
              <Users className="w-3 h-3" />
              <span className="text-[10px] font-bold">Equipe de Campo</span>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* ── TABELA DE CONSULTORES ── */}
          <div className="lg:col-span-2 bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between bg-gray-50/50">
              <h3 className="font-bold text-gray-800 flex items-center gap-2">
                <Layers className="w-5 h-5 text-blue-600" /> Ranking de Performance por Consultor
              </h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-gray-50 text-gray-500 uppercase text-[10px] font-black tracking-widest">
                  <tr>
                    <th className="px-6 py-4">Consultor</th>
                    <th className="px-6 py-4 text-center">Lojas</th>
                    <th className="px-6 py-4 text-center">Visitas</th>
                    <th className="px-6 py-4 text-center">KM Est.</th>
                    <th className="px-6 py-4 text-right">Custo Est.</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {Object.entries(stats.consultorStats).sort((a, b) => b[1].km - a[1].km).map(([nome, c]) => {
                    const roteiroOriginal = roteiros.find(r => normalize(r.consultor) === normalize(nome));
                    return (
                      <tr 
                        key={nome} 
                        onClick={() => roteiroOriginal && onSelectRoteiro(roteiroOriginal.dados_roteiro)}
                        className="hover:bg-blue-50 transition-colors cursor-pointer group"
                      >
                        <td className="px-6 py-4 font-bold text-gray-700 group-hover:text-blue-700">{nome}</td>
                        <td className="px-6 py-4 text-center text-gray-600 font-medium">{c.lojas}</td>
                        <td className="px-6 py-4 text-center text-gray-600 font-medium">{c.visitas}</td>
                        <td className="px-6 py-4 text-center font-black text-blue-600">{Math.round(c.km)} km</td>
                        <td className="px-6 py-4 text-right font-black text-gray-900">
                          {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(c.km * 0.80)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* ── INSIGHTS GERAIS ── */}
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6">
            <h3 className="font-bold text-gray-800 flex items-center gap-2 mb-6">
              <Activity className="w-5 h-5 text-blue-600" /> Resumo Operacional
            </h3>
            
            <div className="space-y-6">
              <div className="space-y-2">
                <div className="flex justify-between text-xs font-bold">
                  <span className="text-gray-500 uppercase">Média de KM por Consultor</span>
                  <span className="text-gray-900">{Math.round(stats.totalKM / roteiros.length)} km</span>
                </div>
                <div className="w-full bg-gray-100 h-2 rounded-full overflow-hidden">
                  <div className="bg-blue-600 h-full" style={{ width: '70%' }} />
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex justify-between text-xs font-bold">
                  <span className="text-gray-500 uppercase">Média de Visitas por Dia (Total)</span>
                  <span className="text-gray-900">{(stats.totalVisitas / (roteiros.length * 20)).toFixed(1)}</span>
                </div>
                <div className="w-full bg-gray-100 h-2 rounded-full overflow-hidden">
                  <div className="bg-green-500 h-full" style={{ width: '85%' }} />
                </div>
              </div>

              <div className="mt-8 p-4 bg-blue-50 border border-blue-100 rounded-xl">
                <p className="text-[11px] text-blue-800 leading-relaxed italic">
                  "Esta visão consolida todos os roteiros aprovados no sistema. Use para validar o orçamento total de deslocamento da equipe e identificar disparidades de carga horária."
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* ── DESPESAS OPERACIONAIS ── */}
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 mt-6">
          <h3 className="font-bold text-gray-800 flex items-center gap-2 mb-4">
            <DollarSign className="w-5 h-5 text-green-600" /> Detalhamento de Despesas Operacionais ({mesComparacao === '03' ? 'Março' : 'Abril'})
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="p-4 bg-gray-50 border border-gray-200 rounded-xl">
              <p className="text-xs text-gray-500 font-bold uppercase">Total Declarado</p>
              <p className="text-xl font-black text-gray-900 mt-1">
                {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(globalExpenseStats.totalValor)}
              </p>
            </div>
            <div className="p-4 bg-orange-50 border border-orange-100 rounded-xl">
              <p className="text-xs text-orange-700 font-bold uppercase">Custos de Viagem</p>
              <p className="text-xl font-black text-orange-800 mt-1">
                {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(globalExpenseStats.valorViagem)}
              </p>
              <p className="text-[10px] text-orange-600 font-bold mt-1">
                {globalExpenseStats.totalValor > 0 ? ((globalExpenseStats.valorViagem / globalExpenseStats.totalValor) * 100).toFixed(1) : 0}% do total
              </p>
            </div>
            <div className="p-4 bg-blue-50 border border-blue-100 rounded-xl">
              <p className="text-xs text-blue-700 font-bold uppercase">Custos Locais (KM)</p>
              <p className="text-xl font-black text-blue-800 mt-1">
                {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(globalExpenseStats.valorLocal)}
              </p>
              <p className="text-[10px] text-blue-600 font-bold mt-1">
                {globalExpenseStats.totalValor > 0 ? ((globalExpenseStats.valorLocal / globalExpenseStats.totalValor) * 100).toFixed(1) : 0}% do total
              </p>
            </div>
          </div>

          <div className="mt-6">
            <p className="text-xs font-bold text-gray-700 mb-3 uppercase tracking-wider">Top Gastos por Categoria:</p>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {globalExpenseStats.porCategoria.length === 0 ? (
                <p className="text-xs text-gray-400 col-span-4">Sem detalhamento de categorias para este mês.</p>
              ) : (
                globalExpenseStats.porCategoria.slice(0, 8).map(({ categoria, valor }) => (
                  <div key={categoria} className="p-3 bg-gray-50 border border-gray-100 rounded-xl">
                    <p className="text-[10px] text-gray-500 font-bold truncate" title={categoria}>{categoria}</p>
                    <p className="text-sm font-black text-gray-800 mt-0.5">
                      {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(valor)}
                    </p>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
