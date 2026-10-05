'use client';

import React, { useMemo, useState } from 'react';
import { 
  TrendingUp, Users, Map, DollarSign, Activity, 
  ArrowLeft, Download, Layers, CheckCircle2,
  Eye, X, Search, FileCode, Filter, ChevronRight, PieChart, Sparkles
} from 'lucide-react';
import * as xlsx from 'xlsx';
import dynamic from 'next/dynamic';

// Carregamento dinâmico do mapa consolidado (apenas leitura/visualização)
const MapPreview = dynamic(() => import('@/components/MapPreview'), { ssr: false });

import cityCoords from '@/lib/city_coords.json';
import { normalize, computeDistance } from '@/lib/utils';
import despesasHistoricasMeses from '@/lib/despesas_historicas_meses.json';
import { getFeriadoNome } from '@/lib/feriados';

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

const MES_OPCOES = [
  { id: '09', label: 'Setembro/2026 (Vexpenses + QT380)', short: 'Set/26' },
  { id: '08', label: 'Agosto/2026 (Vexpenses)', short: 'Ago/26' },
  { id: '07', label: 'Julho/2026 (Vexpenses)', short: 'Jul/26' },
  { id: '06', label: 'Junho/2026 (Vexpenses)', short: 'Jun/26' },
  { id: '05', label: 'Maio/2026 (Vexpenses)', short: 'Mai/26' },
  { id: '04', label: 'Abril/2026', short: 'Abr/26' },
  { id: '03', label: 'Março/2026', short: 'Mar/26' },
];

export default function ConsolidatedDashboard({ roteiros, consultores, onVoltar, onSelectRoteiro }: ConsolidatedDashboardProps) {
  const [mesComparacao, setMesComparacao] = useState<string>('09');
  const [showModalDespesas, setShowModalDespesas] = useState<boolean>(false);
  const [selectedConsultorModal, setSelectedConsultorModal] = useState<string>('todos');
  const [searchTermModal, setSearchTermModal] = useState<string>('');

  const mesAtualInfo = useMemo(() => {
    return MES_OPCOES.find(m => m.id === mesComparacao) || MES_OPCOES[0];
  }, [mesComparacao]);

  const pastMonthStats = useMemo(() => {
    const data = (despesasHistoricasMeses as any)[mesComparacao] || {};
    let pastKMTotal = 0;
    let pastCostTotal = 0;
    let pastKMActive = 0;
    let pastCostActive = 0;

    const consultoresAtivosNomes = roteiros.map(r => normalize(r.consultor));

    Object.entries(data).forEach(([consultor, info]: [string, any]) => {
      const k = info.km || 0;
      const v = info.valor || 0;
      pastKMTotal += k;
      pastCostTotal += v;

      if (consultoresAtivosNomes.includes(normalize(consultor))) {
        pastKMActive += k;
        pastCostActive += v;
      }
    });

    return { pastKMTotal, pastCostTotal, pastKMActive, pastCostActive };
  }, [mesComparacao, roteiros]);

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

  const microDespesasData = useMemo(() => {
    const rawData = (despesasHistoricasMeses as any)[mesComparacao] || {};
    const items: Array<{
      consultor: string;
      categoria: string;
      valor: number;
      isViagem: boolean;
    }> = [];

    const consultorTotals: Record<string, { total: number; km: number; viagem: number; local: number; count: number }> = {};

    Object.entries(rawData).forEach(([consultor, info]: [string, any]) => {
      const vTotal = info.valor || 0;
      const kTotal = info.km || 0;
      let totalViagem = 0;
      let totalLocal = 0;
      let count = 0;

      if (info.detalhes) {
        Object.entries(info.detalhes).forEach(([cat, val]: [string, any]) => {
          count++;
          const catNorm = cat.toLowerCase();
          const isViag = (
            catNorm.includes('viagem') || 
            catNorm.includes('pedágio') || 
            catNorm.includes('pedagio') || 
            catNorm.includes('estacionamento') || 
            catNorm.includes('hospedagem') ||
            catNorm.includes('aéreo') ||
            catNorm.includes('aereo') ||
            catNorm.includes('rodoviário') ||
            catNorm.includes('rodoviario') ||
            catNorm.includes('jantar') ||
            catNorm.includes('almoço') ||
            catNorm.includes('café')
          );

          if (isViag) totalViagem += val;
          else totalLocal += val;

          items.push({
            consultor,
            categoria: cat,
            valor: val,
            isViagem: isViag
          });
        });
      } else {
        count = 1;
        totalLocal = vTotal;
        items.push({
          consultor,
          categoria: 'Percurso / Reembolso KM',
          valor: vTotal,
          isViagem: false
        });
      }

      consultorTotals[consultor] = {
        total: vTotal,
        km: kTotal,
        viagem: totalViagem,
        local: totalLocal,
        count
      };
    });

    return { items, consultorTotals, rawData };
  }, [mesComparacao]);

  const stats = useMemo(() => {
    let totalKM = 0;
    let totalLojas = 0;
    let totalVisitas = 0;
    const consultorStats: Record<string, { km: number, visitas: number, lojas: number, custo: number }> = {};

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

      // Se já temos o custo total salvo (incluindo voos), usamos ele. 
      // Caso contrário, calculamos apenas KM.
      const custoRoteiro = d.estimatedCost || (km * 0.80);

      consultorStats[r.consultor] = {
        km: (consultorStats[r.consultor]?.km || 0) + km,
        visitas: (consultorStats[r.consultor]?.visitas || 0) + visitas,
        lojas: (consultorStats[r.consultor]?.lojas || 0) + (d.totalLojas || 0),
        custo: (consultorStats[r.consultor]?.custo || 0) + custoRoteiro
      };
    });

    const totalCost = Object.values(consultorStats).reduce((acc, c) => acc + (c as any).custo, 0);

    return {
      totalKM,
      totalLojas,
      totalVisitas,
      consultorStats,
      totalCost
    };
  }, [roteiros, consultores]);

  const exportDynamicExpensesHTML = () => {
    const mesLabel = mesAtualInfo.label;
    const mesShort = mesAtualInfo.short;
    const jpMes = roteiros[0]?.mes ? String(roteiros[0]?.mes).padStart(2, '0') : '10';
    const jpAno = roteiros[0]?.ano || 2026;
    const jpLabel = `Outubro/${jpAno}`;
    const jpShort = `Out/${String(jpAno).slice(2)}`;

    // Monta dados consolidados por consultor para comparativo
    const comparisonRows = Object.entries(stats.consultorStats)
      .sort((a, b) => b[1].km - a[1].km)
      .map(([nome, c]) => {
        const roteiroOriginal = roteiros.find(r => normalize(r.consultor) === normalize(nome));
        const mesData = (despesasHistoricasMeses as any)[mesComparacao] || {};
        const hist = Object.entries(mesData).find(([k]) => normalize(k) === normalize(nome))?.[1] as any;
        const kmHist = hist?.km || 0;
        const valorHist = hist?.valor || 0;
        const variacao = valorHist > 0 ? c.custo - valorHist : 0;
        const economizou = variacao < 0;
        const extraCosts = roteiroOriginal?.dados_roteiro?.extraCosts || {};
        const parking = extraCosts.parking || extraCosts.other || 0;

        const agendaDias = (roteiroOriginal?.dados_roteiro?.roteiro || []).map((dia: any) => {
          const feriadoNome = getFeriadoNome(dia.data, dia.feriado);
          return {
            data: dia.data,
            diaSemana: dia.diaSemana,
            feriado: feriadoNome,
            lojas: (dia.lojas || []).map((l: any) => ({
              nome_pdv: l.nome_pdv,
              cliente: l.cliente,
              cidade: l.cidade,
              uf: l.uf,
              tipo: l.tipo === 'viagem' ? `Viagem (${l.estadoViagem || ''})` : 'Local',
              checkIn: l.checkIn,
              checkOut: l.checkOut
            }))
          };
        });

        return {
          nome,
          bancoHoras: roteiroOriginal?.dados_roteiro?.bancoHoras || 'N/A',
          lojas: c.lojas,
          visitas: c.visitas,
          jpKm: Math.round(c.km),
          jpCusto: c.custo,
          histKm: Math.round(kmHist),
          histCusto: valorHist,
          variacao,
          economizou,
          extraCosts: parking,
          agendaDias
        };
      });

    const totalJPCost = stats.totalCost;
    const totalJPKm = Math.round(stats.totalKM);
    const totalHistCost = pastMonthStats.pastCostActive > 0 ? pastMonthStats.pastCostActive : globalExpenseStats.totalValor;
    const totalHistKm = Math.round(pastMonthStats.pastKMActive > 0 ? pastMonthStats.pastKMActive : pastMonthStats.pastKMTotal);
    const diffCost = totalJPCost - totalHistCost;
    const isGlobalEconomy = diffCost < 0;
    const rawData = microDespesasData.rawData;

    const htmlContent = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Relatório Executivo Consolidado - JP ${jpLabel} vs Histórico ${mesLabel}</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800;900&display=swap" rel="stylesheet">
  <style>
    body { font-family: 'Inter', sans-serif; }
    @media print {
      .no-print { display: none !important; }
      body { background-color: white !important; padding: 0 !important; }
    }
  </style>
</head>
<body class="bg-slate-100 min-h-screen text-gray-800 p-3 md:p-8">
  <div class="max-w-7xl mx-auto bg-white rounded-3xl shadow-xl border border-gray-200 overflow-hidden">
    
    <!-- ── HEADER ── -->
    <div class="bg-gradient-to-r from-slate-900 via-blue-950 to-slate-900 text-white p-6 md:p-8">
      <div class="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div class="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-500/20 text-blue-300 text-xs font-bold mb-2">
            PROTRADE & SAMSUNG | RELATÓRIO EXECUTIVO INTEGRADO
          </div>
          <h1 class="text-2xl md:text-3xl font-black">Planejamento de Rotas (JP) vs Histórico Real</h1>
          <p class="text-blue-200 text-sm mt-1">
            Projeção: <span class="font-bold text-white">${jpLabel}</span> • Comparação Base: <span class="font-bold text-white">${mesLabel}</span>
          </p>
        </div>
        <div class="flex items-center gap-3 no-print">
          <button onclick="window.print()" class="px-4 py-2.5 bg-white/10 hover:bg-white/20 text-white text-xs font-bold rounded-xl border border-white/20 transition-all">
            🖨️ Imprimir / PDF
          </button>
        </div>
      </div>

      <!-- Global KPI Cards in Header -->
      <div class="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4 mt-6">
        <div class="bg-white/10 backdrop-blur-md p-4 rounded-2xl border border-white/10">
          <p class="text-[10px] font-black uppercase text-blue-300">Investimento Total JP (${jpShort})</p>
          <p class="text-xl md:text-2xl font-black text-white mt-0.5">
            ${new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(totalJPCost)}
          </p>
          <p class="text-[10px] text-blue-200 font-semibold mt-0.5">${totalJPKm.toLocaleString('pt-BR')} km planejados</p>
        </div>

        <div class="bg-white/10 backdrop-blur-md p-4 rounded-2xl border border-white/10">
          <p class="text-[10px] font-black uppercase text-gray-300">Custo Histórico Real (${mesShort})</p>
          <p class="text-xl md:text-2xl font-black text-white mt-0.5">
            ${new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(totalHistCost)}
          </p>
          <p class="text-[10px] text-gray-300 font-semibold mt-0.5">${totalHistKm.toLocaleString('pt-BR')} km realizados</p>
        </div>

        <div class="bg-white/10 backdrop-blur-md p-4 rounded-2xl border border-white/10">
          <p class="text-[10px] font-black uppercase ${isGlobalEconomy ? 'text-green-300' : 'text-amber-300'}">
            ${isGlobalEconomy ? 'Economia Estimada' : 'Variação Projetada'}
          </p>
          <p class="text-xl md:text-2xl font-black ${isGlobalEconomy ? 'text-green-400' : 'text-amber-300'} mt-0.5">
            ${isGlobalEconomy ? '' : '+'}${new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(diffCost)}
          </p>
          <p class="text-[10px] ${isGlobalEconomy ? 'text-green-300' : 'text-amber-200'} font-semibold mt-0.5">
            ${totalHistCost > 0 ? ((diffCost / totalHistCost) * 100).toFixed(1) : 0}% vs ${mesShort}
          </p>
        </div>

        <div class="bg-white/10 backdrop-blur-md p-4 rounded-2xl border border-white/10">
          <p class="text-[10px] font-black uppercase text-purple-300">Cobertura de Campo</p>
          <p class="text-xl md:text-2xl font-black text-white mt-0.5">
            ${stats.totalLojas} PDVs
          </p>
          <p class="text-[10px] text-purple-200 font-semibold mt-0.5">${roteiros.length} Consultores • ${stats.totalVisitas} Visitas</p>
        </div>
      </div>
    </div>

    <!-- ── NAVIGATION TABS ── -->
    <div class="px-6 py-4 bg-gray-50 border-b border-gray-200 flex flex-wrap gap-2 items-center justify-between no-print">
      <div class="flex flex-wrap gap-2" id="main-nav-tabs">
        <button onclick="setTab('comparativo')" id="tab-btn-comparativo" class="px-5 py-2.5 rounded-xl text-xs font-black transition-all bg-blue-600 text-white shadow-md">
          📊 1. Comparativo Executivo (JP vs Histórico)
        </button>
        <button onclick="setTab('despesas')" id="tab-btn-despesas" class="px-5 py-2.5 rounded-xl text-xs font-black transition-all bg-white text-gray-700 hover:bg-gray-200 border border-gray-200">
          🧾 2. Detalhamento Micro Despesas (${mesShort})
        </button>
        <button onclick="setTab('agenda')" id="tab-btn-agenda" class="px-5 py-2.5 rounded-xl text-xs font-black transition-all bg-white text-gray-700 hover:bg-gray-200 border border-gray-200">
          🗺️ 3. Grade de Visitas & Roteiro JP (${jpShort})
        </button>
      </div>
    </div>

    <!-- ── TAB 1: COMPARATIVO GERAL ── -->
    <div id="tab-content-comparativo" class="p-6 md:p-8 space-y-6">
      <div class="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
        <div class="px-6 py-4 bg-gray-50 border-b border-gray-200 flex flex-col md:flex-row md:items-center justify-between gap-2">
          <div>
            <h3 class="font-bold text-gray-900 text-sm uppercase tracking-wider">Tabela Comparativa Individualizada por Consultor</h3>
            <p class="text-xs text-gray-500">Comparação direta entre os roteiros planejados para ${jpLabel} e as despesas reais de ${mesLabel}</p>
          </div>
          <span class="text-xs font-bold text-blue-700 bg-blue-50 px-3 py-1 rounded-lg border border-blue-200">${comparisonRows.length} Consultores Ativos</span>
        </div>
        
        <div class="overflow-x-auto">
          <table class="w-full text-left text-xs">
            <thead class="bg-gray-100 text-gray-600 font-black uppercase text-[10px] tracking-wider border-b border-gray-200">
              <tr>
                <th class="px-4 py-3.5">Consultor</th>
                <th class="px-3 py-3.5 text-center">Banco Horas</th>
                <th class="px-3 py-3.5 text-center">PDVs</th>
                <th class="px-3 py-3.5 text-center">Visitas</th>
                <th class="px-4 py-3.5 text-center bg-blue-50 text-blue-900">KM ${jpShort} (Est.)</th>
                <th class="px-4 py-3.5 text-center bg-gray-100 text-gray-800">KM ${mesShort} (Real)</th>
                <th class="px-4 py-3.5 text-right bg-blue-50 text-blue-900">Custo ${jpShort} (Est.)</th>
                <th class="px-4 py-3.5 text-right bg-gray-100 text-gray-800">Custo ${mesShort} (Real)</th>
                <th class="px-4 py-3.5 text-right">Variação R$</th>
                <th class="px-4 py-3.5 text-center no-print">Ações Rápidas</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-gray-100" id="comparativo-table-body"></tbody>
          </table>
        </div>
      </div>
    </div>

    <!-- ── TAB 2: DETALHAMENTO MICRO DESPESAS ── -->
    <div id="tab-content-despesas" class="p-6 md:p-8 space-y-6 hidden">
      <div class="bg-gray-50 p-4 rounded-2xl border border-gray-200 flex flex-col md:flex-row gap-3 items-center justify-between">
        <div class="flex flex-wrap gap-1.5" id="despesas-consultor-tabs"></div>
        <input type="text" id="search-despesas" placeholder="🔍 Buscar lançamento ou valor..." class="px-4 py-2 bg-white border border-gray-300 rounded-xl text-xs font-semibold w-full md:w-64 focus:outline-none focus:ring-2 focus:ring-blue-600">
      </div>

      <div id="despesas-kpi-banner"></div>

      <div class="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
        <div class="px-6 py-4 bg-gray-50 border-b border-gray-200 flex justify-between items-center">
          <h3 class="font-bold text-gray-800 text-xs uppercase tracking-wider">Lançamentos Analíticos de Despesas (${mesLabel})</h3>
          <span class="text-xs text-gray-500 font-semibold" id="despesas-count">-- itens</span>
        </div>
        <div class="overflow-x-auto">
          <table class="w-full text-left text-xs">
            <thead class="bg-gray-100 text-gray-600 font-black uppercase text-[10px] tracking-wider border-b border-gray-200">
              <tr>
                <th class="px-4 py-3">Consultor</th>
                <th class="px-4 py-3">Categoria / Descrição</th>
                <th class="px-4 py-3 text-center">Tipo</th>
                <th class="px-4 py-3 text-right">Valor (R$)</th>
                <th class="px-4 py-3 text-right">% do Consultor</th>
              </tr>
            </thead>
            <tbody id="despesas-table-body" class="divide-y divide-gray-100"></tbody>
          </table>
        </div>
      </div>
    </div>

    <!-- ── TAB 3: GRADE DE VISITAS JP ── -->
    <div id="tab-content-agenda" class="p-6 md:p-8 space-y-6 hidden">
      <div class="bg-gray-50 p-4 rounded-2xl border border-gray-200 flex flex-col md:flex-row gap-3 items-center justify-between">
        <div class="flex flex-wrap gap-1.5" id="agenda-consultor-tabs"></div>
        <input type="text" id="search-agenda" placeholder="🔍 Filtrar loja, cliente, cidade..." class="px-4 py-2 bg-white border border-gray-300 rounded-xl text-xs font-semibold w-full md:w-64 focus:outline-none focus:ring-2 focus:ring-blue-600">
      </div>

      <div id="agenda-kpi-banner"></div>

      <div class="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
        <div class="px-6 py-4 bg-gray-50 border-b border-gray-200 flex justify-between items-center">
          <h3 class="font-bold text-gray-800 text-xs uppercase tracking-wider">Cronograma de Visitas Planejadas (${jpLabel})</h3>
          <span class="text-xs text-gray-500 font-semibold" id="agenda-count">-- visitas</span>
        </div>
        <div class="overflow-x-auto">
          <table class="w-full text-left text-xs">
            <thead class="bg-gray-100 text-gray-600 font-black uppercase text-[10px] tracking-wider border-b border-gray-200">
              <tr>
                <th class="px-4 py-3">Data / Dia</th>
                <th class="px-4 py-3">Consultor</th>
                <th class="px-4 py-3">PDV / Nome da Loja</th>
                <th class="px-4 py-3">Cliente / Rede</th>
                <th class="px-4 py-3">Cidade / UF</th>
                <th class="px-4 py-3 text-center">Horário</th>
                <th class="px-4 py-3 text-center">Tipo</th>
              </tr>
            </thead>
            <tbody id="agenda-table-body" class="divide-y divide-gray-100"></tbody>
          </table>
        </div>
      </div>
    </div>

    <!-- ── FOOTER ── -->
    <div class="bg-gray-50 px-6 py-4 border-t border-gray-200 text-center text-xs text-gray-500 font-semibold flex flex-col md:flex-row justify-between items-center gap-2">
      <span>Protrade Marketing • Sistema de Roteirização Samsung AC</span>
      <span>Base de Despesas: Vexpenses + QT380 | Base JP: Otimizador de Rotas Samsung</span>
    </div>

  </div>

  <!-- ── DATA & SCRIPT ── -->
  <script>
    const compData = ${JSON.stringify(comparisonRows)};
    const rawDespesas = ${JSON.stringify(rawData)};
    const jpLabel = "${jpLabel}";
    const jpShort = "${jpShort}";
    const mesLabel = "${mesLabel}";
    const mesShort = "${mesShort}";

    let currentTab = 'comparativo';
    let activeDespesasConsultor = 'todos';
    let activeAgendaConsultor = compData[0]?.nome || 'todos';
    let searchDespesasQuery = '';
    let searchAgendaQuery = '';

    function formatBRL(v) {
      return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0);
    }

    function setTab(tab) {
      currentTab = tab;
      ['comparativo', 'despesas', 'agenda'].forEach(t => {
        const btn = document.getElementById('tab-btn-' + t);
        const content = document.getElementById('tab-content-' + t);
        if (t === tab) {
          btn.className = 'px-5 py-2.5 rounded-xl text-xs font-black transition-all bg-blue-600 text-white shadow-md';
          content.classList.remove('hidden');
        } else {
          btn.className = 'px-5 py-2.5 rounded-xl text-xs font-black transition-all bg-white text-gray-700 hover:bg-gray-200 border border-gray-200';
          content.classList.add('hidden');
        }
      });
      if (tab === 'comparativo') renderComparativo();
      if (tab === 'despesas') { renderDespesasTabs(); renderDespesas(); }
      if (tab === 'agenda') { renderAgendaTabs(); renderAgenda(); }
    }

    function renderComparativo() {
      const tbody = document.getElementById('comparativo-table-body');
      let html = '';
      compData.forEach(row => {
        const varColor = row.economizou ? 'bg-green-100 text-green-800' : (row.histCusto > 0 ? 'bg-red-100 text-red-800' : 'text-gray-400');
        const varPrefix = row.economizou ? '' : '+';
        html += \`
          <tr class="hover:bg-blue-50/50 transition-colors">
            <td class="px-4 py-3.5 font-bold text-gray-900">\${row.nome}</td>
            <td class="px-3 py-3.5 text-center font-bold text-orange-600">\${row.bancoHoras}</td>
            <td class="px-3 py-3.5 text-center font-semibold text-gray-700">\${row.lojas}</td>
            <td class="px-3 py-3.5 text-center font-semibold text-gray-700">\${row.visitas}</td>
            <td class="px-4 py-3.5 text-center font-black text-blue-700 bg-blue-50/40">\${row.jpKm} km</td>
            <td class="px-4 py-3.5 text-center font-bold text-gray-600 bg-gray-50/60">\${row.histKm > 0 ? row.histKm + ' km' : '—'}</td>
            <td class="px-4 py-3.5 text-right font-black text-gray-900 bg-blue-50/40">\${formatBRL(row.jpCusto)}</td>
            <td class="px-4 py-3.5 text-right font-bold text-gray-700 bg-gray-50/60">\${row.histCusto > 0 ? formatBRL(row.histCusto) : '—'}</td>
            <td class="px-4 py-3.5 text-right font-black">
              \${row.histCusto > 0 ? \`<span class="inline-flex px-2 py-0.5 rounded text-[11px] font-bold \${varColor}">\${varPrefix}\${formatBRL(row.variacao)}</span>\` : '—'}
            </td>
            <td class="px-4 py-3.5 text-center no-print">
              <div class="flex items-center justify-center gap-1.5">
                <button onclick="goToDespesas('\${row.nome}')" class="px-2 py-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 rounded-lg text-[10px] font-bold" title="Ver lançamentos de despesas">
                  Micro Despesas
                </button>
                <button onclick="goToAgenda('\${row.nome}')" class="px-2 py-1 bg-blue-50 hover:bg-blue-100 text-blue-800 border border-blue-200 rounded-lg text-[10px] font-bold" title="Ver grade de visitas do roteiro">
                  Ver Visitas
                </button>
              </div>
            </td>
          </tr>
        \`;
      });
      tbody.innerHTML = html;
    }

    function goToDespesas(nome) {
      activeDespesasConsultor = nome;
      setTab('despesas');
    }

    function goToAgenda(nome) {
      activeAgendaConsultor = nome;
      setTab('agenda');
    }

    function renderDespesasTabs() {
      const container = document.getElementById('despesas-consultor-tabs');
      let html = \`<button onclick="setDespesasConsultor('todos')" class="px-3 py-1.5 rounded-xl text-xs font-bold transition-all \${activeDespesasConsultor === 'todos' ? 'bg-blue-600 text-white shadow-md' : 'bg-white text-gray-600 hover:bg-gray-200 border border-gray-200'}">Todos os Consultores</button>\`;
      
      Object.keys(rawDespesas).forEach(c => {
        const val = rawDespesas[c].valor || 0;
        const shortName = c.split(' ')[0] + ' ' + (c.split(' ')[1] || '');
        html += \`<button onclick="setDespesasConsultor('\${c}')" class="px-3 py-1.5 rounded-xl text-xs font-bold transition-all \${activeDespesasConsultor === c ? 'bg-blue-600 text-white shadow-md' : 'bg-white text-gray-600 hover:bg-gray-200 border border-gray-200'}">\${shortName} (\${formatBRL(val)})</button>\`;
      });
      container.innerHTML = html;
    }

    function setDespesasConsultor(c) {
      activeDespesasConsultor = c;
      renderDespesasTabs();
      renderDespesas();
    }

    function renderDespesas() {
      const items = [];
      let totalFiltered = 0;
      let totalViagem = 0;
      let totalLocal = 0;

      Object.entries(rawDespesas).forEach(([consultor, info]) => {
        if (activeDespesasConsultor !== 'todos' && activeDespesasConsultor !== consultor) return;
        const consultorTotal = info.valor || 0;

        if (info.detalhes) {
          Object.entries(info.detalhes).forEach(([cat, val]) => {
            const catNorm = cat.toLowerCase();
            const isViagem = catNorm.includes('viagem') || catNorm.includes('pedágio') || catNorm.includes('pedagio') || catNorm.includes('estacionamento') || catNorm.includes('hospedagem') || catNorm.includes('aéreo') || catNorm.includes('aereo') || catNorm.includes('rodoviário') || catNorm.includes('rodoviario') || catNorm.includes('jantar') || catNorm.includes('almoço') || catNorm.includes('café');
            
            if (searchDespesasQuery && !cat.toLowerCase().includes(searchDespesasQuery) && !consultor.toLowerCase().includes(searchDespesasQuery)) return;

            items.push({
              consultor,
              categoria: cat,
              valor: val,
              isViagem,
              pct: consultorTotal > 0 ? (val / consultorTotal) * 100 : 0
            });
            totalFiltered += val;
            if (isViagem) totalViagem += val;
            else totalLocal += val;
          });
        } else {
          if (searchDespesasQuery && !consultor.toLowerCase().includes(searchDespesasQuery)) return;
          items.push({
            consultor,
            categoria: 'Percurso / KM Declarado',
            valor: info.valor || 0,
            isViagem: false,
            pct: 100
          });
          totalFiltered += info.valor || 0;
          totalLocal += info.valor || 0;
        }
      });

      // KPI banner with JP Comparison for the selected consultant
      const compTarget = compData.find(c => c.nome === activeDespesasConsultor);
      let comparisonBannerHtml = '';
      if (compTarget) {
        const econ = compTarget.economizou;
        comparisonBannerHtml = \`
          <div class="p-4 bg-gradient-to-r from-blue-900 to-indigo-950 text-white rounded-2xl shadow-md border border-blue-800 flex flex-col md:flex-row justify-between items-center gap-3">
            <div>
              <p class="text-[10px] font-black uppercase text-blue-300">Comparativo Direto de \${compTarget.nome}</p>
              <h4 class="text-base font-black">Planejamento JP (\${jpShort}): \${formatBRL(compTarget.jpCusto)} (\${compTarget.jpKm} km)</h4>
            </div>
            <div class="flex items-center gap-4 text-right">
              <div>
                <p class="text-[10px] font-bold text-gray-300">Histórico Real (\${mesShort})</p>
                <p class="text-sm font-bold text-white">\${formatBRL(compTarget.histCusto)} (\${compTarget.histKm} km)</p>
              </div>
              <div class="px-3 py-1.5 rounded-xl font-black text-xs \${econ ? 'bg-green-500/30 text-green-300 border border-green-400/40' : 'bg-red-500/30 text-red-300 border border-red-400/40'}">
                \${econ ? 'Economia: ' : 'Variação: '}\${formatBRL(compTarget.variacao)}
              </div>
            </div>
          </div>
        \`;
      }

      document.getElementById('despesas-kpi-banner').innerHTML = \`
        \${comparisonBannerHtml}
        <div class="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
          <div class="p-4 bg-gray-50 border border-gray-200 rounded-2xl">
            <p class="text-[10px] font-black uppercase text-gray-500">Total Histórico Selecionado</p>
            <p class="text-xl font-black text-gray-900 mt-1">\${formatBRL(totalFiltered)}</p>
          </div>
          <div class="p-4 bg-orange-50 border border-orange-200 rounded-2xl">
            <p class="text-[10px] font-black uppercase text-orange-700">Custos de Viagem & Estadias</p>
            <p class="text-xl font-black text-orange-900 mt-1">\${formatBRL(totalViagem)}</p>
            <p class="text-[10px] font-bold text-orange-600 mt-0.5">\${totalFiltered > 0 ? ((totalViagem / totalFiltered) * 100).toFixed(1) : 0}% do selecionado</p>
          </div>
          <div class="p-4 bg-blue-50 border border-blue-200 rounded-2xl">
            <p class="text-[10px] font-black uppercase text-blue-700">Custos Locais / KM</p>
            <p class="text-xl font-black text-blue-900 mt-1">\${formatBRL(totalLocal)}</p>
            <p class="text-[10px] font-bold text-blue-600 mt-0.5">\${totalFiltered > 0 ? ((totalLocal / totalFiltered) * 100).toFixed(1) : 0}% do selecionado</p>
          </div>
        </div>
      \`;

      document.getElementById('despesas-count').innerText = items.length + ' lançamentos';

      const tbody = document.getElementById('despesas-table-body');
      if (items.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" class="p-6 text-center text-gray-400 font-medium">Nenhum item de despesa encontrado.</td></tr>';
        return;
      }

      items.sort((a, b) => b.valor - a.valor);
      let tbodyHtml = '';
      items.forEach(item => {
        tbodyHtml += \`
          <tr class="hover:bg-blue-50/50 transition-colors">
            <td class="px-4 py-3 font-bold text-gray-900">\${item.consultor}</td>
            <td class="px-4 py-3 font-medium text-gray-700">\${item.categoria}</td>
            <td class="px-4 py-3 text-center">
              <span class="inline-block px-2 py-0.5 rounded-full text-[10px] font-bold \${item.isViagem ? 'bg-orange-100 text-orange-800' : 'bg-blue-100 text-blue-800'}">
                \${item.isViagem ? 'Viagem' : 'Local'}
              </span>
            </td>
            <td class="px-4 py-3 text-right font-black text-gray-900">\${formatBRL(item.valor)}</td>
            <td class="px-4 py-3 text-right font-bold text-gray-500">\${item.pct.toFixed(1)}%</td>
          </tr>
        \`;
      });
      tbody.innerHTML = tbodyHtml;
    }

    function renderAgendaTabs() {
      const container = document.getElementById('agenda-consultor-tabs');
      let html = '';
      compData.forEach(c => {
        const shortName = c.nome.split(' ')[0] + ' ' + (c.nome.split(' ')[1] || '');
        html += \`<button onclick="setAgendaConsultor('\${c.nome}')" class="px-3 py-1.5 rounded-xl text-xs font-bold transition-all \${activeAgendaConsultor === c.nome ? 'bg-blue-600 text-white shadow-md' : 'bg-white text-gray-600 hover:bg-gray-200 border border-gray-200'}">\${shortName} (\${c.visitas} vis)</button>\`;
      });
      container.innerHTML = html;
    }

    function setAgendaConsultor(nome) {
      activeAgendaConsultor = nome;
      renderAgendaTabs();
      renderAgenda();
    }

    function renderAgenda() {
      const target = compData.find(c => c.nome === activeAgendaConsultor) || compData[0];
      if (!target) return;

      document.getElementById('agenda-kpi-banner').innerHTML = \`
        <div class="p-4 bg-gradient-to-r from-slate-900 to-blue-950 text-white rounded-2xl shadow-md border border-slate-800 flex flex-col md:flex-row justify-between items-center gap-3">
          <div>
            <div class="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-blue-500/20 text-blue-300 text-[10px] font-bold uppercase mb-1">
              Roteiro Aprovado • \${jpLabel}
            </div>
            <h4 class="text-lg font-black">\${target.nome}</h4>
            <p class="text-xs text-blue-200">Banco de Horas: \${target.bancoHoras}</p>
          </div>
          <div class="grid grid-cols-2 md:grid-cols-4 gap-3 text-center">
            <div class="bg-white/10 px-3 py-2 rounded-xl">
              <p class="text-[9px] uppercase font-bold text-gray-300">PDVs Únicos</p>
              <p class="text-base font-black text-white">\${target.lojas}</p>
            </div>
            <div class="bg-white/10 px-3 py-2 rounded-xl">
              <p class="text-[9px] uppercase font-bold text-gray-300">Total Visitas</p>
              <p class="text-base font-black text-white">\${target.visitas}</p>
            </div>
            <div class="bg-white/10 px-3 py-2 rounded-xl">
              <p class="text-[9px] uppercase font-bold text-gray-300">KM Estimado</p>
              <p class="text-base font-black text-blue-300">\${target.jpKm} km</p>
            </div>
            <div class="bg-white/10 px-3 py-2 rounded-xl">
              <p class="text-[9px] uppercase font-bold text-gray-300">Custo Total</p>
              <p class="text-base font-black text-green-400">\${formatBRL(target.jpCusto)}</p>
            </div>
          </div>
        </div>
      \`;

      const rows = [];
      (target.agendaDias || []).forEach(dia => {
        if (dia.feriado) {
          if (!searchAgendaQuery || dia.feriado.toLowerCase().includes(searchAgendaQuery)) {
            rows.push({
              data: dia.data,
              diaSemana: dia.diaSemana,
              pdv: dia.feriado,
              cliente: 'FOLGA / FERIADO',
              cidade: '—',
              uf: '—',
              horario: '—',
              tipo: 'Feriado/Folga'
            });
          }
          return;
        }

        (dia.lojas || []).forEach(l => {
          if (searchAgendaQuery) {
            const q = searchAgendaQuery.toLowerCase();
            const match = l.nome_pdv.toLowerCase().includes(q) || 
                          l.cliente.toLowerCase().includes(q) || 
                          l.cidade.toLowerCase().includes(q) || 
                          dia.data.includes(q);
            if (!match) return;
          }

          rows.push({
            data: dia.data,
            diaSemana: dia.diaSemana,
            pdv: l.nome_pdv,
            cliente: l.cliente,
            cidade: l.cidade,
            uf: l.uf,
            horario: (l.checkIn && l.checkOut) ? \`\${l.checkIn} - \${l.checkOut}\` : '09:00 - 18:00',
            tipo: l.tipo
          });
        });
      });

      document.getElementById('agenda-count').innerText = rows.length + ' paradas agendadas';

      const tbody = document.getElementById('agenda-table-body');
      if (rows.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" class="p-6 text-center text-gray-400 font-medium">Nenhuma visita encontrada.</td></tr>';
        return;
      }

      let tbodyHtml = '';
      rows.forEach(r => {
        const isFeriado = r.tipo === 'Feriado/Folga';
        const isViag = r.tipo.toLowerCase().includes('viagem');
        tbodyHtml += \`
          <tr class="hover:bg-blue-50/50 transition-colors \${isFeriado ? 'bg-orange-50/50' : ''}">
            <td class="px-4 py-3 font-bold text-gray-900 whitespace-nowrap">\${r.data} <span class="text-[10px] text-gray-500 font-normal">(\${r.diaSemana})</span></td>
            <td class="px-4 py-3 font-semibold text-gray-800">\${target.nome}</td>
            <td class="px-4 py-3 font-bold text-gray-900">\${r.pdv}</td>
            <td class="px-4 py-3 font-medium text-gray-600">\${r.cliente}</td>
            <td class="px-4 py-3 text-gray-700 font-medium">\${r.cidade} / \${r.uf}</td>
            <td class="px-4 py-3 text-center text-gray-500 font-bold">\${r.horario}</td>
            <td class="px-4 py-3 text-center">
              <span class="inline-block px-2 py-0.5 rounded-full text-[10px] font-bold \${
                isFeriado ? 'bg-amber-100 text-amber-800' : (isViag ? 'bg-orange-100 text-orange-800' : 'bg-blue-100 text-blue-800')
              }">
                \${r.tipo}
              </span>
            </td>
          </tr>
        \`;
      });
      tbody.innerHTML = tbodyHtml;
    }

    document.getElementById('search-despesas').addEventListener('input', (e) => {
      searchDespesasQuery = e.target.value.toLowerCase();
      renderDespesas();
    });

    document.getElementById('search-agenda').addEventListener('input', (e) => {
      searchAgendaQuery = e.target.value.toLowerCase();
      renderAgenda();
    });

    // Initialize
    renderComparativo();
  </script>
</body>
</html>`;

    const blob = new Blob([htmlContent], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `Relatorio_Consolidado_JP_${jpShort.replace('/', '_')}_vs_${mesShort.replace('/', '_')}.html`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleExportAll = () => {
    const dataToExport = roteiros.flatMap((r) => {
      const resultado = r.dados_roteiro;
      if (!resultado || !resultado.roteiro) return [];

      return resultado.roteiro.flatMap((dia: any) => {
        const feriadoNome = getFeriadoNome(dia.data, dia.feriado);
        if (feriadoNome) {
          return [{
            Data: dia.data,
            'Dia da Semana': dia.diaSemana,
            Consultor: r.consultor,
            'Banco de Horas': r.dados_roteiro?.bancoHoras || 'N/A',
            'Nome PDV': feriadoNome,
            'Status': 'FERIADO/FOLGA'
          }];
        }

        return dia.lojas.map((loja: any) => ({
          Data: dia.data,
          'Dia da Semana': dia.diaSemana,
          Consultor: r.consultor,
          'Banco de Horas': r.dados_roteiro?.bancoHoras || 'N/A',
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

    const resumoCustosData = Object.entries(stats.consultorStats).map(([nome, c]) => {
      const roteiroOriginal = roteiros.find(r => normalize(r.consultor) === normalize(nome));
      const d = roteiroOriginal?.dados_roteiro || {};
      const extraCosts = d.extraCosts || {};
      const parking = extraCosts.parking || extraCosts.other || 0;
      const kmEst = Math.round(c.km);
      const custoKM = c.km * 0.80;
      const totalCost = c.custo;
      
      let obs = [];
      if (parking > 0) {
        obs.push(`Estacionamento/Eventos: R$ ${parking.toFixed(2)} (Febrava)`);
      }

      return {
        'Consultor': nome,
        'Banco de Horas': d.bancoHoras || 'N/A',
        'Total Lojas': c.lojas,
        'Total Visitas': c.visitas,
        'KM Estimado': kmEst,
        'Custo KM (R$ 0,80)': Number(custoKM.toFixed(2)),
        'Custos Extras / Eventos (R$)': Number(parking.toFixed(2)),
        'Custo Total Estimado (R$)': Number(totalCost.toFixed(2)),
        'Observações': obs.join(' | ') || 'Nenhum'
      };
    });

    const wsResumo = xlsx.utils.json_to_sheet(resumoCustosData);
    xlsx.utils.book_append_sheet(workbook, wsResumo, "Resumo e Custos");

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
              onChange={(e) => setMesComparacao(e.target.value)}
              className="bg-transparent text-xs font-bold text-gray-700 focus:outline-none cursor-pointer"
            >
              {MES_OPCOES.map(m => (
                <option key={m.id} value={m.id}>{m.label}</option>
              ))}
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
              <span className="text-[9px] font-bold text-gray-500" title={`Equipe Ativa: ${Math.round(pastMonthStats.pastKMActive)} km | Frota Total: ${Math.round(pastMonthStats.pastKMTotal)} km`}>
                vs {Math.round(pastMonthStats.pastKMActive)} km ({mesAtualInfo.short})
              </span>
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
              <span className="text-[9px] font-bold text-gray-500" title={`Equipe Ativa: R$ ${pastMonthStats.pastCostActive.toFixed(2)} | Frota Total: R$ ${pastMonthStats.pastCostTotal.toFixed(2)}`}>
                vs {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(pastMonthStats.pastCostActive)}
              </span>
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
                <thead className="bg-gray-50 text-gray-500 uppercase text-[10px] font-black tracking-widest border-b border-gray-200">
                  <tr>
                    <th className="px-5 py-3.5">Consultor</th>
                    <th className="px-3 py-3.5 text-center">Banco Horas</th>
                    <th className="px-3 py-3.5 text-center">Visitas</th>
                    <th className="px-4 py-3.5 text-center bg-blue-50/60 text-blue-900">KM Out/26 (Est.)</th>
                    <th className="px-4 py-3.5 text-center bg-gray-100/70 text-gray-700">KM {mesAtualInfo.short} (Real)</th>
                    <th className="px-4 py-3.5 text-right bg-blue-50/60 text-blue-900">Custo Out/26 (Est.)</th>
                    <th className="px-4 py-3.5 text-right bg-gray-100/70 text-gray-700">Custo {mesAtualInfo.short} (Real)</th>
                    <th className="px-4 py-3.5 text-right">Variação R$</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {Object.entries(stats.consultorStats).sort((a, b) => b[1].km - a[1].km).map(([nome, c]) => {
                    const roteiroOriginal = roteiros.find(r => normalize(r.consultor) === normalize(nome));
                    const mesData = (despesasHistoricasMeses as any)[mesComparacao] || {};
                    const hist = Object.entries(mesData).find(([k]) => normalize(k) === normalize(nome))?.[1] as any;
                    
                    const kmHist = hist?.km || 0;
                    const valorHist = hist?.valor || 0;
                    const variacao = valorHist > 0 ? c.custo - valorHist : 0;
                    const economizou = variacao < 0;

                    return (
                      <tr 
                        key={nome} 
                        onClick={() => roteiroOriginal && onSelectRoteiro(roteiroOriginal.dados_roteiro)}
                        className="hover:bg-blue-50 transition-colors cursor-pointer group"
                      >
                        <td className="px-5 py-4 font-bold text-gray-800 group-hover:text-blue-700">{nome}</td>
                        <td className="px-3 py-4 text-center font-bold text-orange-600 text-xs">{roteiroOriginal?.dados_roteiro?.bancoHoras || 'N/A'}</td>
                        <td className="px-3 py-4 text-center text-gray-600 font-medium text-xs">{c.visitas}</td>
                        <td className="px-4 py-4 text-center font-black text-blue-700 bg-blue-50/30">{Math.round(c.km)} km</td>
                        <td className="px-4 py-4 text-center font-bold text-gray-600 bg-gray-50/50">{kmHist > 0 ? `${Math.round(kmHist)} km` : '—'}</td>
                        <td className="px-4 py-4 text-right font-black text-gray-900 bg-blue-50/30">
                          {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(c.custo)}
                          {((roteiroOriginal?.dados_roteiro?.extraCosts?.parking || roteiroOriginal?.dados_roteiro?.extraCosts?.other || 0) > 0) && (
                            <span className="block text-[10px] font-semibold text-amber-600">
                              + R$ {Number(roteiroOriginal?.dados_roteiro?.extraCosts?.parking || roteiroOriginal?.dados_roteiro?.extraCosts?.other).toFixed(2)} (Febrava)
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-4 text-right font-bold text-gray-700 bg-gray-50/50">
                          {valorHist > 0 ? (
                            <div className="flex items-center justify-end gap-1">
                              <span>{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(valorHist)}</span>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setSelectedConsultorModal(nome);
                                  setShowModalDespesas(true);
                                }}
                                className="text-[10px] font-bold text-blue-600 hover:text-blue-800 bg-blue-50 px-1.5 py-0.5 rounded border border-blue-200"
                                title="Ver micro detalhamento de custos"
                              >
                                micro
                              </button>
                            </div>
                          ) : '—'}
                        </td>
                        <td className="px-4 py-4 text-right font-black">
                          {valorHist > 0 ? (
                            <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-bold ${economizou ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                              {economizou ? '' : '+'}{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(variacao)}
                            </span>
                          ) : '—'}
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
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
            <h3 className="font-bold text-gray-800 flex items-center gap-2">
              <DollarSign className="w-5 h-5 text-green-600" /> Detalhamento de Despesas Operacionais ({mesAtualInfo.label.split(' ')[0]})
            </h3>
            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={() => { setSelectedConsultorModal('todos'); setShowModalDespesas(true); }}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-xl shadow-sm transition-all active:scale-95"
              >
                <Eye className="w-4 h-4 text-blue-200" /> Ver Micro Detalhado por Consultor
              </button>
              <button
                onClick={exportDynamicExpensesHTML}
                className="flex items-center gap-2 px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl shadow-sm transition-all active:scale-95"
                title="Baixar Arquivo HTML Dinâmico Interativo"
              >
                <FileCode className="w-4 h-4 text-emerald-200" /> HTML Dinâmico
              </button>
            </div>
          </div>

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

      {/* ── MODAL MICRO DETALHAMENTO DE DESPESAS ── */}
      {showModalDespesas && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-white w-full max-w-5xl max-h-[90vh] rounded-3xl shadow-2xl border border-gray-100 flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
            {/* Modal Header */}
            <div className="bg-gradient-to-r from-slate-900 via-blue-950 to-slate-900 text-white p-6 flex items-center justify-between shrink-0">
              <div>
                <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-blue-500/20 text-blue-300 text-[10px] font-bold uppercase tracking-wider mb-1">
                  <Sparkles className="w-3 h-3 text-blue-400" /> Auditoria Micro de Custos
                </div>
                <h2 className="text-xl font-black text-white flex items-center gap-2">
                  Detalhamento de Despesas Operacionais — {mesAtualInfo.label}
                </h2>
                <p className="text-xs text-blue-200 mt-0.5">Visão micro individualizada por consultor (Vexpenses e QT380)</p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={exportDynamicExpensesHTML}
                  className="flex items-center gap-1.5 px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl shadow-sm transition-all"
                  title="Baixar Arquivo HTML Dinâmico Interativo"
                >
                  <FileCode className="w-4 h-4" /> Exportar HTML
                </button>
                <button
                  onClick={() => setShowModalDespesas(false)}
                  className="p-2 hover:bg-white/10 rounded-full text-gray-300 hover:text-white transition-colors"
                >
                  <X className="w-6 h-6" />
                </button>
              </div>
            </div>

            {/* Modal Subheader / Filters */}
            <div className="p-4 bg-gray-50 border-b border-gray-200 flex flex-col md:flex-row gap-3 items-center justify-between shrink-0">
              {/* Consultant Selector Tabs */}
              <div className="flex flex-wrap gap-1.5 w-full md:w-auto">
                <button
                  onClick={() => setSelectedConsultorModal('todos')}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                    selectedConsultorModal === 'todos' 
                      ? 'bg-blue-600 text-white shadow-md' 
                      : 'bg-white text-gray-600 hover:bg-gray-200 border border-gray-200'
                  }`}
                >
                  Todos os Consultores
                </button>
                {Object.keys(microDespesasData.rawData).map((cNome) => {
                  const info = microDespesasData.rawData[cNome];
                  const isSelected = selectedConsultorModal === cNome;
                  const shortName = cNome.split(' ')[0] + ' ' + (cNome.split(' ')[1] || '');
                  return (
                    <button
                      key={cNome}
                      onClick={() => setSelectedConsultorModal(cNome)}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                        isSelected 
                          ? 'bg-blue-600 text-white shadow-md' 
                          : 'bg-white text-gray-600 hover:bg-gray-200 border border-gray-200'
                      }`}
                    >
                      {shortName} ({new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(info.valor || 0)})
                    </button>
                  );
                })}
              </div>

              {/* Search Bar */}
              <div className="relative w-full md:w-64">
                <Search className="w-4 h-4 text-gray-400 absolute left-3 top-2.5" />
                <input
                  type="text"
                  value={searchTermModal}
                  onChange={(e) => setSearchTermModal(e.target.value)}
                  placeholder="Buscar categoria ou valor..."
                  className="w-full pl-9 pr-4 py-1.5 bg-white border border-gray-300 rounded-xl text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-blue-600"
                />
              </div>
            </div>

            {/* Modal Content / Table */}
            <div className="p-6 overflow-y-auto space-y-6">
              {/* Filtered Summary KPIs */}
              {(() => {
                const filteredItems = microDespesasData.items.filter(item => {
                  const matchConsultor = selectedConsultorModal === 'todos' || item.consultor === selectedConsultorModal;
                  const matchSearch = !searchTermModal || 
                    item.categoria.toLowerCase().includes(searchTermModal.toLowerCase()) || 
                    item.consultor.toLowerCase().includes(searchTermModal.toLowerCase());
                  return matchConsultor && matchSearch;
                });

                const totalVal = filteredItems.reduce((acc, curr) => acc + curr.valor, 0);
                const viagemVal = filteredItems.filter(i => i.isViagem).reduce((acc, curr) => acc + curr.valor, 0);
                const localVal = filteredItems.filter(i => !i.isViagem).reduce((acc, curr) => acc + curr.valor, 0);

                let bannerComparativo = null;
                if (selectedConsultorModal !== 'todos') {
                  const cStat = stats.consultorStats[selectedConsultorModal];
                  const histData = (despesasHistoricasMeses as any)[mesComparacao] || {};
                  const hist = Object.entries(histData).find(([k]) => normalize(k) === normalize(selectedConsultorModal))?.[1] as any;
                  const histValor = hist?.valor || 0;
                  const histKm = hist?.km || 0;
                  const jpCusto = cStat?.custo || 0;
                  const jpKm = cStat?.km || 0;
                  const diff = jpCusto - histValor;
                  const economizou = diff < 0;

                  bannerComparativo = (
                    <div className="p-4 bg-gradient-to-r from-slate-900 to-blue-950 text-white rounded-2xl shadow-md border border-slate-800 flex flex-col md:flex-row justify-between items-center gap-3">
                      <div>
                        <div className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-blue-500/20 text-blue-300 text-[10px] font-bold uppercase mb-1">
                          Comparativo Direto com Planejamento JP (Out/26)
                        </div>
                        <h4 className="text-base font-black text-white">{selectedConsultorModal}</h4>
                        <p className="text-xs text-blue-200">
                          Projetado JP: <span className="font-bold text-white">{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(jpCusto)}</span> ({Math.round(jpKm)} km, {cStat?.lojas || 0} PDVs)
                        </p>
                      </div>
                      <div className="flex items-center gap-4">
                        <div className="text-right">
                          <p className="text-[10px] font-bold text-gray-300 uppercase">Real {mesAtualInfo.short}</p>
                          <p className="text-sm font-black text-white">{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(histValor)} ({Math.round(histKm)} km)</p>
                        </div>
                        {histValor > 0 && (
                          <div className={`px-3 py-1.5 rounded-xl font-black text-xs ${economizou ? 'bg-green-500/30 text-green-300 border border-green-400/40' : 'bg-red-500/30 text-red-300 border border-red-400/40'}`}>
                            {economizou ? 'Economia: ' : 'Variação: '}{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(diff)}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                } else {
                  const histActiveCost = pastMonthStats.pastCostActive > 0 ? pastMonthStats.pastCostActive : globalExpenseStats.totalValor;
                  const diffGlobal = stats.totalCost - histActiveCost;
                  const isEconomy = diffGlobal < 0;

                  bannerComparativo = (
                    <div className="p-4 bg-gradient-to-r from-slate-900 to-blue-950 text-white rounded-2xl shadow-md border border-slate-800 flex flex-col md:flex-row justify-between items-center gap-3">
                      <div>
                        <div className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-blue-500/20 text-blue-300 text-[10px] font-bold uppercase mb-1">
                          Consolidado Geral da Frota
                        </div>
                        <h4 className="text-base font-black text-white">Todos os Consultores Ativos ({roteiros.length})</h4>
                        <p className="text-xs text-blue-200">
                          Total Projetado JP: <span className="font-bold text-white">{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(stats.totalCost)}</span> ({Math.round(stats.totalKM)} km)
                        </p>
                      </div>
                      <div className="flex items-center gap-4">
                        <div className="text-right">
                          <p className="text-[10px] font-bold text-gray-300 uppercase">Total Real {mesAtualInfo.short}</p>
                          <p className="text-sm font-black text-white">
                            {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(histActiveCost)}
                          </p>
                        </div>
                        <div className={`px-3 py-1.5 rounded-xl font-black text-xs ${isEconomy ? 'bg-green-500/30 text-green-300 border border-green-400/40' : 'bg-amber-500/30 text-amber-300 border border-amber-400/40'}`}>
                          {isEconomy ? 'Economia: ' : 'Variação: '}{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(diffGlobal)}
                        </div>
                      </div>
                    </div>
                  );
                }

                return (
                  <>
                    {bannerComparativo}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div className="p-4 bg-gray-50 border border-gray-200 rounded-2xl">
                        <p className="text-[10px] font-black uppercase text-gray-500">Total Selecionado</p>
                        <p className="text-xl font-black text-gray-900 mt-1">
                          {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(totalVal)}
                        </p>
                      </div>
                      <div className="p-4 bg-orange-50 border border-orange-200 rounded-2xl">
                        <p className="text-[10px] font-black uppercase text-orange-700">Custos de Viagem & Passagens</p>
                        <p className="text-xl font-black text-orange-900 mt-1">
                          {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(viagemVal)}
                        </p>
                        <p className="text-[10px] font-bold text-orange-600 mt-0.5">
                          {totalVal > 0 ? ((viagemVal / totalVal) * 100).toFixed(1) : 0}% do selecionado
                        </p>
                      </div>
                      <div className="p-4 bg-blue-50 border border-blue-200 rounded-2xl">
                        <p className="text-[10px] font-black uppercase text-blue-700">Custos Locais / KM</p>
                        <p className="text-xl font-black text-blue-900 mt-1">
                          {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(localVal)}
                        </p>
                        <p className="text-[10px] font-bold text-blue-600 mt-0.5">
                          {totalVal > 0 ? ((localVal / totalVal) * 100).toFixed(1) : 0}% do selecionado
                        </p>
                      </div>
                    </div>

                    {/* Table of Expenses */}
                    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
                      <div className="px-6 py-4 bg-gray-50/70 border-b border-gray-200 flex justify-between items-center">
                        <h4 className="font-bold text-gray-800 text-xs uppercase tracking-wider">
                          {selectedConsultorModal === 'todos' ? 'Lançamentos Detalhados de Todos os Consultores' : `Lançamentos Detalhados de ${selectedConsultorModal}`}
                        </h4>
                        <span className="text-xs font-bold text-gray-500">{filteredItems.length} registros</span>
                      </div>
                      <div className="overflow-x-auto">
                        <table className="w-full text-left text-xs">
                          <thead className="bg-gray-100/80 text-gray-600 font-black uppercase text-[10px] tracking-wider border-b border-gray-200">
                            <tr>
                              <th className="px-5 py-3.5">Consultor</th>
                              <th className="px-5 py-3.5">Categoria / Item de Despesa</th>
                              <th className="px-4 py-3.5 text-center">Tipo</th>
                              <th className="px-5 py-3.5 text-right">Valor (R$)</th>
                              <th className="px-5 py-3.5 text-right">% no Consultor</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-100">
                            {filteredItems.length === 0 ? (
                              <tr>
                                <td colSpan={5} className="px-6 py-8 text-center text-gray-400 font-medium">
                                  Nenhum item de despesa encontrado para os filtros selecionados.
                                </td>
                              </tr>
                            ) : (
                              filteredItems.sort((a, b) => b.valor - a.valor).map((item, idx) => {
                                const cTotal = microDespesasData.rawData[item.consultor]?.valor || 0;
                                const pct = cTotal > 0 ? (item.valor / cTotal) * 100 : 0;
                                return (
                                  <tr key={idx} className="hover:bg-blue-50/40 transition-colors">
                                    <td className="px-5 py-3.5 font-bold text-gray-900">{item.consultor}</td>
                                    <td className="px-5 py-3.5 font-medium text-gray-700">{item.categoria}</td>
                                    <td className="px-4 py-3.5 text-center">
                                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                                        item.isViagem ? 'bg-orange-100 text-orange-800' : 'bg-blue-100 text-blue-800'
                                      }`}>
                                        {item.isViagem ? 'Viagem' : 'Local'}
                                      </span>
                                    </td>
                                    <td className="px-5 py-3.5 text-right font-black text-gray-900">
                                      {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(item.valor)}
                                    </td>
                                    <td className="px-5 py-3.5 text-right font-bold text-gray-500">
                                      {pct.toFixed(1)}%
                                    </td>
                                  </tr>
                                );
                              })
                            )}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </>
                );
              })()}
            </div>

            {/* Modal Footer */}
            <div className="bg-gray-50 px-6 py-4 border-t border-gray-200 flex justify-between items-center text-xs shrink-0">
              <span className="text-gray-500 font-medium">Fonte de dados: Vexpenses V2 / QT380 Planilha Mês Anterior</span>
              <button
                onClick={() => setShowModalDespesas(false)}
                className="px-5 py-2 bg-gray-900 hover:bg-black text-white font-bold rounded-xl shadow-sm transition-all"
              >
                Fechar Visualização
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
