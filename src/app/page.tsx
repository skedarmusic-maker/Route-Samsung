'use client';

import { useEffect, useState, useMemo, useRef } from 'react';
import axios from 'axios';
import * as xlsx from 'xlsx';
import { ConsultorLocal, Loja } from '@/lib/dataParser';
import { RoteiroDia, LojaVisita } from '@/lib/types';
import dynamic from 'next/dynamic';
import {
  Calendar, Map as MapLucide, CheckCircle, Users, Loader2, AlertCircle,
  Clock, MapPin, Building2, Tag, Plane, ArrowLeft, Navigation, Save, Download,
  Activity, TrendingUp, TrendingDown, CheckSquare
} from 'lucide-react';
import SugestaoJourney from '@/components/SugestaoJourney';
import RoteirosSalvos from '@/components/RoteirosSalvos';
import DashboardIntel from '@/components/DashboardIntel';
import EfficiencyAnalysis from '@/components/EfficiencyAnalysis';
import ConsolidatedDashboard from '@/components/ConsolidatedDashboard';
import FlightSelector from '@/components/FlightSelector';
import DateRangePicker from '@/components/DateRangePicker';
import cityCoords from '@/lib/city_coords.json';
import despesasHistoricas from '@/lib/despesas_historicas.json';
import despesasHistoricasMeses from '@/lib/despesas_historicas_meses.json';
import auditKM from '@/lib/audit_km.json';
import { supabase } from '@/lib/supabase';

import { normalize, computeDistance } from '@/lib/utils';

// Carregamento dinâmico para evitar SSR do Google Maps
const MapPreview = dynamic(() => import('@/components/MapPreview'), { ssr: false });

// ─────────────────────────────────────────────────────────
// Componente auxiliar: checkbox list com "Selecionar Todos"
// ─────────────────────────────────────────────────────────
function CheckboxList({ title, options, selected, onChange }: {
  title: string;
  options: string[];
  selected: Set<string>;
  onChange: (val: Set<string>) => void;
}) {
  const allSelected = options.length > 0 && options.every(o => selected.has(o));
  const someSelected = options.some(o => selected.has(o));
  const checkAllRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (checkAllRef.current) checkAllRef.current.indeterminate = someSelected && !allSelected;
  }, [someSelected, allSelected]);

  const toggleAll = () => onChange(allSelected ? new Set() : new Set(options));
  const toggleOne = (val: string) => {
    const next = new Set(selected);
    next.has(val) ? next.delete(val) : next.add(val);
    onChange(next);
  };

  return (
    <div className="space-y-2">
      <label className="text-sm font-medium text-gray-700">{title}</label>
      <div className="border border-gray-300 rounded-lg bg-gray-50 overflow-hidden">
        <div className="flex items-center gap-2 px-3 py-2 bg-gray-100 border-b border-gray-300 cursor-pointer hover:bg-gray-200 transition-colors" onClick={toggleAll}>
          <input ref={checkAllRef} type="checkbox" readOnly checked={allSelected} className="rounded text-blue-600 pointer-events-none" />
          <span className="text-sm font-semibold text-gray-700">{allSelected ? 'Desmarcar Todos' : 'Selecionar Todos'}</span>
          <span className="ml-auto text-xs text-gray-500">{selected.size}/{options.length}</span>
        </div>
        <div className="max-h-44 overflow-y-auto p-2 space-y-1">
          {options.map(opt => (
            <label key={opt} className="flex items-center gap-2 cursor-pointer hover:bg-gray-100 rounded px-1 py-0.5">
              <input type="checkbox" checked={selected.has(opt)} onChange={() => toggleOne(opt)} className="rounded text-blue-600 focus:ring-blue-500" />
              <span className="text-sm truncate" title={opt}>{opt || '(vazio)'}</span>
            </label>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────
// Card de loja individual
// ─────────────────────────────────────────────────────────
function LojaCard({ loja, index, onBuscarVoo, chosenFlight }: { 
  loja: LojaVisita; 
  index: number; 
  onBuscarVoo?: () => void;
  chosenFlight?: any;
}) {
  const isViagem = loja.tipo === 'viagem';
  return (
    <div className={`rounded-lg border p-3 text-sm ${isViagem ? 'bg-orange-50 border-orange-200' : 'bg-blue-50 border-blue-200'}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 font-semibold text-gray-800 flex-1 min-w-0">
          <span className={`shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold text-white ${isViagem ? 'bg-orange-500' : 'bg-blue-600'}`}>{index + 1}</span>
          <span className="truncate" title={loja.nome_pdv}>{loja.nome_pdv}</span>
        </div>
        {isViagem && (
          <span className="shrink-0 flex items-center gap-1 text-xs text-orange-700 bg-orange-100 px-2 py-0.5 rounded-full">
            <Plane className="w-3 h-3" /> Viagem
          </span>
        )}
      </div>
      <div className="mt-2 grid grid-cols-2 gap-1 text-xs text-gray-600">
        <span className="flex items-center gap-1"><Building2 className="w-3 h-3 shrink-0" />{loja.cliente}</span>
        <span className="flex items-center gap-1"><Tag className="w-3 h-3 shrink-0" />Cluster: {loja.cluster}</span>
        <span className="flex items-center gap-1 col-span-2"><MapPin className="w-3 h-3 shrink-0" />{loja.cidade} - {loja.uf}</span>
        <span className="flex items-center gap-1 col-span-2"><Clock className="w-3 h-3 shrink-0" />{loja.checkIn} → {loja.checkOut}</span>
      </div>

      {isViagem && onBuscarVoo && (
        <div className="mt-3 pt-2 border-t border-orange-200/50 flex items-center justify-between">
          {chosenFlight ? (
            <div className="text-[10px] text-orange-800 font-bold">
              ✈️ {chosenFlight.airline} ({chosenFlight.departureTime}) - {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(chosenFlight.price)}
            </div>
          ) : (
            <span className="text-[10px] text-orange-600 font-medium italic">Nenhum voo vinculado</span>
          )}
          <button 
            onClick={onBuscarVoo} 
            className="text-[10px] font-bold text-orange-700 hover:text-orange-900 bg-orange-200/50 hover:bg-orange-200 px-2.5 py-1 rounded-md transition-all flex items-center gap-1"
          >
            <Plane className="w-3 h-3" /> {chosenFlight ? 'Alterar Voo' : 'Buscar Voos'}
          </button>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────
// Constantes Injetadas
// ─────────────────────────────────────────────────────────
const ROTA_MAP: Record<string, string> = {
  "PAULO SERGIO MARQUES DA SILVA": "SPC2",
  "LIEDY AQUINO GOMES DOS SANTOS": "SPC1",
  "MARCIO JOSE FLORES PEREIRA": "SUL_1",
  "ALEXANDRE RIBEIRO LIMA": "SPI_2",
  "DIOGO DO NASCIMENTO SANTOS": "RJ",
  "TATIANE SOUZA DOS SANTOS": "NE_1",
  "LUIZ FALCAO DE SOUZA NETO": "NE_2"
};

// ─────────────────────────────────────────────────────────
// Card do dia (com suporte a seleção para o mapa)
// ─────────────────────────────────────────────────────────
function DiaCard({ dia, selected, onClick, distancia, onBuscarVoo, chosenFlights }: {
  dia: RoteiroDia;
  selected: boolean;
  onClick: () => void;
  distancia?: number;
  onBuscarVoo?: (loja: LojaVisita, dia: RoteiroDia) => void;
  chosenFlights?: Record<string, any>;
}) {
  const [dataObj] = useState(() => {
    const [y, m, d] = dia.data.split('-').map(Number);
    return new Date(y, m - 1, d);
  });
  const isFeriado = !!dia.feriado && !dia.feriado.startsWith('__viagem_');
  const semLojas = dia.lojas.length === 0;
  const clickable = !isFeriado && dia.lojas.length > 0;

  return (
    <div
      onClick={clickable ? onClick : undefined}
      className={`rounded-xl border p-3 transition-all ${
        selected
          ? 'border-[#1428A0] bg-blue-50 shadow-md ring-2 ring-[#1428A0]/30'
          : isFeriado
          ? 'bg-red-50 border-red-200 opacity-70'
          : semLojas
          ? 'bg-gray-50 border-dashed border-gray-300 opacity-50'
          : 'bg-white border-gray-200 hover:border-blue-300 hover:shadow-sm cursor-pointer'
      }`}
    >
      <div className="flex items-center justify-between mb-2">
        <div>
          <p className="text-[10px] font-medium text-gray-500 uppercase tracking-wider">{dia.diaSemana}</p>
          <p className="text-base font-bold text-gray-900">
            {dataObj.getDate().toString().padStart(2, '0')}/{(dataObj.getMonth() + 1).toString().padStart(2, '0')}
          </p>
        </div>
        {isFeriado && (
          <span className="text-[10px] text-red-600 bg-red-100 px-2 py-0.5 rounded-full font-medium max-w-[130px] text-right leading-tight">{dia.feriado}</span>
        )}
        {!isFeriado && !semLojas && (
          <div className="flex items-center gap-1.5">
            {distancia !== undefined && (
              <span className="text-[10px] text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full font-semibold flex items-center gap-1">
                <Navigation className="w-2.5 h-2.5" /> {Math.round(distancia)} km
              </span>
            )}
            <span className="text-xs text-blue-600 bg-blue-100 px-2 py-0.5 rounded-full font-medium">
              {dia.lojas.length} loja{dia.lojas.length > 1 ? 's' : ''}
            </span>
          </div>
        )}
        {semLojas && !isFeriado && (
          <div className="flex flex-col items-end gap-1">
            <span className="text-xs text-gray-400">Sem visitas</span>
            {dia.aviso && (
              <span className="text-[9px] text-gray-500 italic text-right leading-tight max-w-[150px]">
                {dia.aviso}
              </span>
            )}
          </div>
        )}
      </div>

      {dia.aviso && dia.lojas.length > 0 && (
        <div className="mb-2 p-2 bg-yellow-50 border border-yellow-200 rounded text-[10px] text-yellow-700 flex items-start gap-1.5">
          <AlertCircle className="w-3 h-3 shrink-0 mt-0.5" />
          <span>{dia.aviso}</span>
        </div>
      )}

      {dia.lojas.length > 0 && (
        <div className="space-y-1.5">
          {dia.lojas.map((loja, i) => (
            <LojaCard 
              key={i} 
              loja={loja} 
              index={i} 
              onBuscarVoo={onBuscarVoo ? () => onBuscarVoo(loja, dia) : undefined}
              chosenFlight={chosenFlights?.[`${dia.data}-${loja.nome_pdv}`]}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────
// Tela de Prévia do Roteiro (com mapa integrado)
// ─────────────────────────────────────────────────────────
function PreviewRoteiro({ resultado, consultorInfo, initialCenario, onVoltar }: {
  resultado: any;
  consultorInfo: ConsultorLocal | undefined;
  initialCenario?: string;
  onVoltar: () => void;
}) {
  const totalVisitas = resultado.roteiro.reduce((acc: number, d: RoteiroDia) => acc + d.lojas.length, 0);
  const diasComVisitas = resultado.roteiro.filter((d: RoteiroDia) => d.lojas.length > 0);
  const feriadosDias = resultado.roteiro.filter((d: RoteiroDia) => d.feriado && !d.feriado.startsWith('__viagem_'));
  const mesNome = new Date(resultado.ano, resultado.mes - 1, 1).toLocaleString('pt-BR', { month: 'long', year: 'numeric' });

  // Dia selecionado para o mapa — inicializa no primeiro dia com visitas
  const [diaSelecionado, setDiaSelecionado] = useState<RoteiroDia | null>(
    () => resultado.roteiro.find((d: RoteiroDia) => d.lojas.length > 0) ?? null
  );

  const consultorCoords = useMemo(() => 
    consultorInfo ? { lat: consultorInfo.lat, lng: consultorInfo.lng } : { lat: -15.77, lng: -47.92 },
    [consultorInfo]
  );
  const consultorEndereco = consultorInfo?.endereco ?? '';

  // Estado para armazenar as distâncias calculadas por dia (cache)
  const [distancias, setDistancias] = useState<Record<string, number>>({});
  const [viewMode, setViewMode] = useState<'visualizacao' | 'eficiencia'>('visualizacao');
  const [mesComparacao, setMesComparacao] = useState<'03' | '04'>('04');
  const [isSaving, setIsSaving] = useState(false);

  // Estados para integração de busca de voos Amadeus
  const [flightModalOpen, setFlightModalOpen] = useState(false);
  const [flightTargetLoja, setFlightTargetLoja] = useState<any | null>(null);
  const [flightTargetDia, setFlightTargetDia] = useState<any | null>(null);
  const [chosenFlights, setChosenFlights] = useState<Record<string, any>>({});

  // Nome do Cenário
  const [cenarioNome, setCenarioNome] = useState(initialCenario || 'Cenário Principal');

  // Calcula KM total aproximado do roteiro
  const totalEstimatedKM = useMemo(() => {
    let total = 0;
    resultado.roteiro.forEach((dia: RoteiroDia) => {
      if (dia.lojas.length === 0) return;

      // Se o Google Maps já calculou a distância real para este dia, usamos ela com precisão máxima!
      if (distancias[dia.data] !== undefined) {
        total += distancias[dia.data];
        return;
      }

      // Estimativa inteligente usando as coordenadas das cidades
      let firstStore = dia.lojas[0];
      let firstCoords = { lat: firstStore.lat, lng: firstStore.lng };
      if (!firstCoords.lat || !firstCoords.lng) {
        const key = normalize(`${firstStore.cidade}-${firstStore.uf}`);
        const coords = (cityCoords as Record<string, any>)[key];
        if (coords) firstCoords = coords;
      }

      const distToHub = (firstCoords.lat && firstCoords.lng) 
        ? computeDistance(consultorCoords, firstCoords as { lat: number; lng: number }) 
        : 0;
      
      // Limite de 350km (Haversine) para considerar voo, já que a distância de estrada costuma ser 30% maior.
      const goesByPlane = distToHub > 350;
      
      let curr = goesByPlane ? firstCoords : consultorCoords;
      let diaEstimado = 0;
      
      dia.lojas.forEach((loja: any, idx: number) => {
        let lat = loja.lat;
        let lng = loja.lng;

        if (!lat || !lng) {
          const key = normalize(`${loja.cidade}-${loja.uf}`);
          const coords = (cityCoords as Record<string, any>)[key];
          if (coords) {
            lat = coords.lat;
            lng = coords.lng;
          }
        }

        if (lat && lng) {
          // Se for avião, assumimos 5km do hotel até a primeira loja
          if (idx === 0 && goesByPlane) {
            diaEstimado += 5; 
            curr = { lat, lng };
          } else {
            diaEstimado += computeDistance(curr as { lat: number; lng: number }, { lat, lng } as { lat: number; lng: number });
            curr = { lat, lng };
          }
        }
      });

      // Volta para casa apenas se não for avião. Se for avião, volta para o hotel (5km)
      if (!goesByPlane) {
        diaEstimado += computeDistance(curr as { lat: number; lng: number }, consultorCoords);
      } else {
        diaEstimado += 5;
      }
      
      total += (diaEstimado * 1.3); // Fator de correção de ruas (30%)
    });
    return total;
  }, [resultado.roteiro, consultorCoords, distancias]);

  // Inteligência Financeira e de Desempenho
  const despesasMes = (despesasHistoricasMeses as any)[mesComparacao] || {};
  const hist = Object.entries(despesasMes as Record<string, any>).find(
    ([key]) => {
      const kNorm = normalize(key);
      const cNorm = normalize(resultado.consultor);
      if (kNorm === cNorm) return true;
      
      const kWords = kNorm.split(/\s+/).filter(Boolean);
      const cWords = cNorm.split(/\s+/).filter(Boolean);
      
      if (kWords.length === 0 || cWords.length === 0) return false;
      
      if (kWords.length <= cWords.length) {
        return kWords.every(w => cWords.includes(w));
      } else {
        return cWords.every(w => kWords.includes(w));
      }
    }
  )?.[1] || null;
  const histKM = hist ? hist.km : null;
  const histValor = hist ? hist.valor : null;
  
  const variacaoKM = histKM ? totalEstimatedKM - histKM : null;
  const economizouKM = variacaoKM ? variacaoKM < 0 : false;
  
  const costPerKm = 0.80; // Reembolso fixado em R$ 0,80 por KM rodado
  const flightCosts = Object.values(chosenFlights).reduce((acc: number, f: any) => acc + (f?.price || 0), 0);
  const estimatedCost = (totalEstimatedKM * costPerKm) + flightCosts;
  const variacaoCusto = histValor ? estimatedCost - histValor : null;
  const economizouCusto = variacaoCusto ? variacaoCusto < 0 : false;

  const handleExport = () => {
    const dataToExport = resultado.roteiro.flatMap((dia: any) => {
      if (dia.feriado && !dia.feriado.startsWith('__viagem')) {
        return [{
          Data: dia.data,
          'Dia da Semana': dia.diaSemana,
          Consultor: resultado.consultor,
          Rota: ROTA_MAP[resultado.consultor] || '',
          'Cenário': cenarioNome,
          'Nome PDV': dia.feriado,
          'Status': 'FERIADO/FOLGA'
        }];
      }

      return dia.lojas.map((loja: any) => ({
        Data: dia.data,
        'Dia da Semana': dia.diaSemana,
        Consultor: resultado.consultor,
        Rota: loja.rota || ROTA_MAP[resultado.consultor] || '',
        'Cenário': cenarioNome,
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

    const worksheet = xlsx.utils.json_to_sheet(dataToExport);
    const workbook = xlsx.utils.book_new();
    xlsx.utils.book_append_sheet(workbook, worksheet, "Roteiro");
    
    const fileName = `Roteiro_${resultado.consultor.replace(/ /g, '_')}_${resultado.mes}_${resultado.ano}.xlsx`;
    xlsx.writeFile(workbook, fileName);
  };

  const handleAprovar = async () => {
    setIsSaving(true);
    try {
      // Adicionar métricas calculadas ao objeto antes de salvar
      const finalResultado = {
        ...resultado,
        totalEstimatedKM: totalEstimatedKM,
        estimatedCost: estimatedCost,
        totalLojas: resultado.totalLojas || resultado.roteiro.reduce((acc: number, dia: any) => acc + (dia.lojas?.length || 0), 0)
      };

      const { error } = await supabase
        .from('roteiros')
        .upsert({
          consultor: resultado.consultor,
          mes: resultado.mes,
          ano: resultado.ano,
          cenario: cenarioNome,
          dados_roteiro: finalResultado,
          status: 'APROVADO'
        }, {
          onConflict: 'consultor, mes, ano, cenario'
        });

      if (error) throw error;
      
      alert('Roteiro salvo com sucesso no banco de dados!');
      onVoltar(); // Volta para a tela inicial
    } catch (e: any) {
      console.error(e);
      alert('Erro ao salvar roteiro: ' + e.message);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 flex flex-col bg-white z-50">
      {/* ── HEADER FIXO ── */}
      <div className="px-6 py-4 bg-white border-b border-gray-200 flex items-center justify-between gap-4 shrink-0">
        <div className="flex items-center gap-4">
          <button onClick={onVoltar} className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-800 transition-colors">
            <ArrowLeft className="w-4 h-4" /> Voltar
          </button>
          <div>
            <h1 className="text-xl font-bold text-gray-900 leading-tight">Prévia do Roteiro</h1>
            <p className="text-sm text-gray-500 capitalize">{resultado.consultor} · {mesNome}</p>
          </div>
        </div>

        {/* Input para Nome do Cenário */}
        <div className="flex-1 max-w-sm mx-4">
          <input 
            type="text" 
            value={cenarioNome} 
            onChange={(e) => setCenarioNome(e.target.value)}
            placeholder="Nome do Cenário (ex: Cenário B - Viagens)"
            className="w-full text-sm font-medium p-2 border border-gray-300 rounded-lg outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200 transition-all"
          />
        </div>

        {/* SELETOR DE MÊS PARA COMPARAÇÃO */}
        <div className="flex items-center gap-3">
          <label className="text-xs font-semibold text-gray-500 uppercase tracking-widest">Base Despesas:</label>
          <select 
            value={mesComparacao} 
            onChange={(e) => setMesComparacao(e.target.value as '03' | '04')}
            className="px-3 py-1.5 bg-white border border-gray-300 rounded-xl text-xs font-bold text-gray-700 shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="03">Março/2026</option>
            <option value="04">Abril/2026</option>
          </select>

          {/* PILL TOGGLE */}
          <div className="flex bg-gray-100 p-1 rounded-xl border border-gray-200 shadow-inner">
            <button 
              onClick={() => setViewMode('visualizacao')}
              className={`flex items-center gap-2 px-6 py-1.5 rounded-lg text-xs font-bold transition-all ${viewMode === 'visualizacao' ? 'bg-white text-blue-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
            >
              <MapLucide className="w-4 h-4" /> Visualização
            </button>
            <button 
              onClick={() => setViewMode('eficiencia')}
              className={`flex items-center gap-2 px-6 py-1.5 rounded-lg text-xs font-bold transition-all ${viewMode === 'eficiencia' ? 'bg-white text-blue-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
            >
              <Activity className="w-4 h-4" /> Análise de Eficiência
            </button>
          </div>
        </div>

        {/* Resumo inline */}
        <div className="hidden md:flex items-center gap-6 text-center">
          {[
            { label: 'Lojas', value: resultado.totalLojas, color: 'text-blue-600' },
            { label: 'Visitas', value: totalVisitas, color: 'text-green-600' },
            { label: 'Dias úteis', value: diasComVisitas.length, color: 'text-gray-700' },
            { label: 'Feriados', value: feriadosDias.length, color: 'text-red-600' },
          ].map(item => (
            <div key={item.label}>
              <p className={`text-2xl font-bold ${item.color}`}>{item.value}</p>
              <p className="text-[10px] text-gray-500 uppercase tracking-wider">{item.label}</p>
            </div>
          ))}
        </div>

        <div className="flex items-center gap-3">
          <button 
            onClick={handleExport}
            className="flex items-center gap-2 px-4 py-2 bg-gray-100 text-gray-700 font-semibold rounded-xl hover:bg-gray-200 transition-all shadow-sm active:scale-95"
          >
            <Download className="w-5 h-5" /> Baixar Preview (Excel)
          </button>

          <button 
            onClick={handleAprovar}
            disabled={isSaving}
            className="flex items-center gap-2 px-5 py-2.5 bg-green-600 text-white font-semibold rounded-xl hover:bg-green-700 transition-all shadow-md shrink-0 active:scale-95 disabled:opacity-50"
          >
            {isSaving ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
            {isSaving ? 'Salvando...' : 'Aprovar e Salvar Roteiro'}
          </button>
        </div>
      </div>

      {/* ── CORPO DIVIDIDO ── */}
      <div className="flex flex-1 overflow-hidden bg-gray-50">
        {viewMode === 'visualizacao' ? (
          <div className="flex flex-1 overflow-hidden">
            {/* ── ESQUERDA: lista de dias scrollável ── */}
            <div className="w-[380px] shrink-0 overflow-y-auto bg-gray-50 border-r border-gray-200 p-4 space-y-4">
              
              {/* Card de Inteligência de Roteiro */}
              <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
                <div className="flex items-center gap-2 mb-3">
                  <Activity className="w-4 h-4 text-blue-600" />
                  <p className="text-xs font-bold text-gray-700 uppercase tracking-wider">Inteligência Logística</p>
                </div>
                
                <div className="grid grid-cols-2 gap-3 mb-3">
                  <div className="bg-gray-50 rounded-lg p-3 border border-gray-100">
                    <p className="text-[10px] text-gray-500 uppercase font-semibold">Estimativa Rota</p>
                    <p className="text-lg font-black text-blue-700">{Math.round(totalEstimatedKM)} km</p>
                  </div>
                  <div className="bg-gray-50 rounded-lg p-3 border border-gray-100">
                    <p className="text-[10px] text-gray-500 uppercase font-semibold">Custo Previsto</p>
                    <p className="text-lg font-black text-gray-800">
                      {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(estimatedCost)}
                    </p>
                  </div>
                </div>

                {hist && (
                  <div className={`rounded-lg p-3 border ${economizouCusto ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
                    <p className="text-[11px] font-bold text-gray-700 mb-1 flex items-center justify-between">
                      Comparação vs Mês Anterior
                      <span className={`text-xs ${economizouCusto ? 'text-green-600' : 'text-red-600'}`}>
                        {economizouCusto ? <TrendingDown className="w-3 h-3" /> : <TrendingUp className="w-3 h-3" />}
                      </span>
                    </p>
                    <div className="flex justify-between items-end mt-2">
                      <div>
                        <p className="text-[10px] text-gray-500">Histórico Declarado</p>
                        <p className="text-sm font-semibold text-gray-800">{Math.round(histKM)} km</p>
                      </div>
                      <div className="text-right">
                        <p className="text-[10px] text-gray-500">Economia Projetada</p>
                        <p className={`text-sm font-black ${economizouCusto ? 'text-green-600' : 'text-red-600'}`}>
                          {economizouCusto ? '-' : '+'}{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Math.abs(variacaoCusto || 0))}
                        </p>
                      </div>
                    </div>
                  </div>
                )}
                {!hist && (
                  <p className="text-[10px] text-amber-600 bg-amber-50 p-2 rounded text-center">Sem dados de despesas do mês anterior para comparar.</p>
                )}

                {/* Auditoria de Integridade de Março */}
                {resultado.consultor && auditKM[resultado.consultor as keyof typeof auditKM] && (
                  <div className="mt-4 p-4 bg-white border border-amber-200 rounded-xl shadow-sm">
                    <h3 className="text-xs font-bold text-amber-800 flex items-center gap-2 mb-3">
                      <AlertCircle className="w-3 h-3" /> AUDITORIA DE INTEGRIDADE (MARÇO)
                    </h3>
                    
                    {(() => {
                      const audit = auditKM[resultado.consultor as keyof typeof auditKM];
                      const diasSemVisita = audit.days.filter(d => d.status === 'Sem visitas').length;
                      const desvioTotal = audit.total_declared_km - audit.total_calculated_km;
                      const isCritico = diasSemVisita > 0 || desvioTotal > 100;

                      return (
                        <div className="space-y-3">
                          <div className="flex justify-between items-center bg-amber-50 p-2 rounded-lg">
                            <span className="text-[10px] text-amber-700">Dias com KM s/ Visita:</span>
                            <span className={`text-xs font-bold ${diasSemVisita > 0 ? 'text-red-600' : 'text-green-600'}`}>
                              {diasSemVisita} {diasSemVisita === 1 ? 'dia' : 'dias'}
                            </span>
                          </div>
                          
                          <div className="flex justify-between items-center bg-amber-50 p-2 rounded-lg">
                            <span className="text-[10px] text-amber-700">Desvio de Distância:</span>
                            <span className={`text-xs font-bold ${desvioTotal > 50 ? 'text-red-600' : 'text-green-600'}`}>
                              {Math.round(desvioTotal)} km
                            </span>
                          </div>

                          {isCritico && (
                            <div className="bg-red-50 p-2 rounded-lg border border-red-100">
                              <p className="text-[10px] text-red-700 leading-tight">
                                <strong>Atenção:</strong> Detectamos inconsistências entre o KM declarado e o histórico de GPS de Março.
                              </p>
                            </div>
                          )}
                        </div>
                      );
                    })()}
                  </div>
                )}
              </div>

              <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest px-1 mt-2">Clique num dia para ver no mapa</p>
              {resultado.roteiro.map((dia: RoteiroDia) => (
                <DiaCard
                  key={dia.data}
                  dia={dia}
                  selected={diaSelecionado?.data === dia.data}
                  onClick={() => setDiaSelecionado(dia)}
                  distancia={distancias[dia.data]}
                  onBuscarVoo={(loja, d) => {
                    setFlightTargetLoja(loja);
                    setFlightTargetDia(d);
                    setFlightModalOpen(true);
                  }}
                  chosenFlights={chosenFlights}
                />
              ))}
            </div>

            {/* ── DIREITA: mapa fixo ── */}
            <div className="flex-1 overflow-hidden flex flex-col">
              {diaSelecionado ? (
                <MapPreview
                  key={diaSelecionado.data} // Re-monta o mapa ao trocar de dia
                  lojas={diaSelecionado.lojas}
                  consultorCoords={consultorCoords}
                  consultorEndereco={consultorEndereco}
                  data={diaSelecionado.data}
                  diaSemana={diaSelecionado.diaSemana}
                  onDistanceCalculated={(dist) => {
                    setDistancias(prev => ({ ...prev, [diaSelecionado.data]: dist }));
                  }}
                />
              ) : (
                <div className="flex-1 flex flex-col items-center justify-center text-gray-400 gap-3">
                  <MapLucide className="w-12 h-12" />
                  <p className="text-sm">Selecione um dia na lista para ver a rota no mapa</p>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto">
            <EfficiencyAnalysis resultado={resultado} totalEstimatedKM={totalEstimatedKM} historico={hist} mesComparacao={mesComparacao} />
          </div>
        )}
        {flightModalOpen && flightTargetLoja && flightTargetDia && (
          <FlightSelector 
            originCity={consultorInfo?.cidade || 'SAO PAULO'}
            destinationCity={flightTargetLoja.cidade}
            departureDate={flightTargetDia.data}
            onSelectFlight={(price, details) => {
              setChosenFlights(prev => ({
                ...prev,
                [`${flightTargetDia.data}-${flightTargetLoja.nome_pdv}`]: details
              }));
              setFlightModalOpen(false);
            }}
            onClose={() => setFlightModalOpen(false)}
          />
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────
// Painel Principal
// ─────────────────────────────────────────────────────────
export default function ConfigurationPanel() {
  const [consultores, setConsultores] = useState<ConsultorLocal[]>([]);
  const [lojas, setLojas] = useState<Loja[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resultado, setResultado] = useState<any>(null);
  const [consultorInfo, setConsultorInfo] = useState<ConsultorLocal | undefined>(undefined);
  const [consolidatedRoutes, setConsolidatedRoutes] = useState<any[] | null>(null);

  const [selectedConsultor, setSelectedConsultor] = useState('');
  const [selectedStatus, setSelectedStatus] = useState('');
  const [viagem, setViagem] = useState(false);
  const [mes, setMes] = useState('');
  const [dataInicio, setDataInicio] = useState('');
  const [dataFim, setDataFim] = useState('');
  const [selectedRotasBase, setSelectedRotasBase] = useState<string[]>([]);
  const [selectedCoberturaLojas, setSelectedCoberturaLojas] = useState<Set<string>>(new Set());
  const [cenarioNome, setCenarioNome] = useState('Cenário Principal');

  useEffect(() => {
    setSelectedCoberturaLojas(new Set());
  }, [selectedRotasBase]);

  useEffect(() => {
    setDataInicio('');
    setDataFim('');
  }, [mes]);

  const [selectedClientes, setSelectedClientes] = useState<Set<string>>(new Set());
  const [selectedClusters, setSelectedClusters] = useState<Set<string>>(new Set());
  const [selectedPolos, setSelectedPolos] = useState<Set<string>>(new Set());
  const [selectedUFs, setSelectedUFs] = useState<Set<string>>(new Set());
  const [excludedLojasIds, setExcludedLojasIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    async function loadDataFromSupabase() {
      try {
        setLoading(true);
        
        // 1. Buscar Consultores
        const { data: dataC, error: errorC } = await supabase
          .from('consultores')
          .select('*')
          .order('nome');
        
        if (errorC) throw errorC;
        setConsultores(dataC || []);

        // 2. Buscar Lojas
        const { data: dataL, error: errorL } = await supabase
          .from('lojas')
          .select('*')
          .order('nome_pdv');
        
        if (errorL) throw errorL;
        
        // Mapear campos do banco para a interface Loja usada no frontend
        const mappedLojas = (dataL || []).map(l => ({
          cliente: l.cliente,
          nome_pdv_novo: l.nome_pdv, // Ajustado para bater com a interface do frontend
          endereco: l.endereco,
          cidade: l.cidade,
          uf: l.uf,
          cluster: l.cluster,
          periodo: l.periodo,
          status: l.status,
          consultor: l.consultor_vinculado,
          lat: l.lat,
          lng: l.lng
        }));
        
        setLojas(mappedLojas as any);
      } catch (e: any) {
        console.error(e);
        setError('Erro ao carregar dados do Supabase: ' + e.message);
      } finally {
        setLoading(false);
      }
    }
    loadDataFromSupabase();
  }, []);

  // 0. Sincronizar consultorInfo imediatamente ao selecionar no dropdown
  useEffect(() => {
    if (selectedConsultor) {
      setConsultorInfo(consultores.find(c => c.nome === selectedConsultor));
      setSelectedStatus('');
      setViagem(false);
      setExcludedLojasIds(new Set());
    } else {
      setConsultorInfo(undefined);
    }
  }, [selectedConsultor, consultores]);

  const lojasFiltradasBase = useMemo(() => {
    const normalizedSelectedRotas = selectedRotasBase.map(r => normalize(r));
    return lojas.filter(l => {
      const isMyStore = selectedConsultor && normalize(l.consultor) === normalize(selectedConsultor);
      const isCoveredStore = normalizedSelectedRotas.includes(normalize(l.consultor));
      
      if (!isMyStore && !isCoveredStore) return false;
      
      if (isCoveredStore) {
        const lojaId = `${l.nome_pdv_novo}-${l.cidade}`;
        if (!selectedCoberturaLojas.has(lojaId)) return false;
      }
      
      if (selectedStatus) {
        const sNorm = normalize(selectedStatus);
        const lStatusNorm = normalize(l.status);
        if (sNorm !== lStatusNorm) return false;
      }
      return true;
    });
  }, [lojas, selectedConsultor, selectedStatus, selectedRotasBase, selectedCoberturaLojas]);

  // 2. Calcular opções de Cluster e Cliente baseadas nas lojas filtradas acima
  const lojasFiltradasCompletas = useMemo(() => {
    return lojasFiltradasBase.filter(l => {
      if (selectedClientes.size > 0 && !selectedClientes.has(l.cliente)) return false;
      if (selectedClusters.size > 0 && !selectedClusters.has(l.cluster)) return false;
      return true;
    });
  }, [lojasFiltradasBase, selectedClientes, selectedClusters]);

  const opcoesClientes = useMemo(() => {
    return Array.from(new Set(lojasFiltradasBase.map(l => l.cliente).filter(Boolean))).sort();
  }, [lojasFiltradasBase]);

  const opcoesClusters = useMemo(() => {
    return Array.from(new Set(lojasFiltradasBase.map(l => l.cluster).filter(Boolean))).sort();
  }, [lojasFiltradasBase]);

  // 2.1 Calcular os Pólos de Viagem caso haja lojas de viagem para o consultor atual
  const polosViagem = useMemo(() => {
    if (!consultorInfo) return [];
    
    // Normalizar o dicionário de coordenadas para busca sem acentos
    const cityCoordsNormalized: Record<string, {lat: number, lng: number}> = {};
    Object.keys(cityCoords).forEach(k => {
      cityCoordsNormalized[normalize(k)] = (cityCoords as any)[k];
    });

    // Identificar lojas de viagem (mesma lógica do backend)
    let ufConsultor = 'SP';
    const ufRegex = /\s([A-Z]{2})(?:\s|,|-|$)/g;
    const matches = Array.from((consultorInfo.endereco || '').matchAll(ufRegex));
    if (matches.length > 0) ufConsultor = matches[matches.length - 1][1];

    const lojasViagemPre = lojasFiltradasCompletas.map(l => {
      const cityKey = normalize(`${l.cidade}-${l.uf}`);
      const fallbackCoords = cityCoordsNormalized[cityKey];
      
      const coords = (l.lat && l.lng && (l.lat !== 0 || l.lng !== 0)) 
        ? { lat: l.lat, lng: l.lng } 
        : fallbackCoords;
      
      if (coords && consultorInfo.lat && consultorInfo.lng) {
        const dist = computeDistance({ lat: consultorInfo.lat, lng: consultorInfo.lng }, coords);
        return { ...l, distDoConsultor: dist };
      }
      return { ...l, distDoConsultor: 0 };
    }).filter(l => {
      const ufLoja = (l.uf || '').trim().toUpperCase();
      const ufCons = (ufConsultor || '').trim().toUpperCase();
      const cidadeLojaNorm = normalize(l.cidade);
      // Tentamos extrair a cidade do consultor do endereço
      const cidadeConsNorm = normalize(consultorInfo.endereco || '').split(',').find(p => p.includes(' - ')) || '';
      
      // Consideramos viagem se:
      // 1. Distância > 35km
      // 2. UF diferente
      // 3. Cidade diferente (fallback caso não tenha coordenadas)
      const isOutraCidade = cidadeLojaNorm !== '' && !normalize(consultorInfo.endereco || '').includes(cidadeLojaNorm);
      
      return l.distDoConsultor > 35 || (ufLoja !== ufCons && ufLoja !== '') || (l.distDoConsultor === 0 && isOutraCidade);
    });

    // Agrupar em Hubs (Pólos)
    interface ViagemHub { id: number; lojas: Loja[]; ufPrincipal: string; nome: string; }
    const hubs: ViagemHub[] = [];
    let unclustered = [...lojasViagemPre];

    while (unclustered.length > 0) {
      const centerStore = unclustered.shift()!;
      const keyCenter = normalize(`${centerStore.cidade}-${centerStore.uf}`);
      const fallbackCenter = cityCoordsNormalized[keyCenter] || { lat: 0, lng: 0 };
      const coordsCenter = (centerStore.lat && centerStore.lng && (centerStore.lat !== 0 || centerStore.lng !== 0))
        ? { lat: centerStore.lat, lng: centerStore.lng }
        : fallbackCenter;
      
      const hub: ViagemHub = { 
        id: hubs.length + 1, 
        lojas: [centerStore], 
        ufPrincipal: centerStore.uf || '',
        nome: centerStore.cidade || 'Pólo Regional'
      };
      
      let i = 0;
      while (i < unclustered.length) {
        const candidate = unclustered[i];
        const keyCand = normalize(`${candidate.cidade}-${candidate.uf}`);
        const fallbackCand = cityCoordsNormalized[keyCand];
        const coordsCand = (candidate.lat && candidate.lng && (candidate.lat !== 0 || candidate.lng !== 0))
          ? { lat: candidate.lat, lng: candidate.lng }
          : fallbackCand;
        
        let shouldGroup = false;
        if (coordsCenter.lat !== 0 && coordsCand) {
          // Raio de 150km para agrupamento de VIAGEM (mais amplo que o local)
          if (computeDistance(coordsCenter, coordsCand) <= 150) shouldGroup = true;
        } 
        
        // Se for a mesma cidade, agrupa sempre (evita duplicados de SÃO PAULO)
        if (!shouldGroup && normalize(candidate.cidade || '') === normalize(centerStore.cidade || '')) {
          shouldGroup = true;
        }

        if (shouldGroup) {
          hub.lojas.push(unclustered.splice(i, 1)[0]);
          continue;
        }
        i++;
      }
      hubs.push(hub);
    }
    return hubs;
  }, [lojasFiltradasCompletas, consultorInfo]);

  const lojasVisiveisConsultor = useMemo(() => {
    const cityCoordsNormalized: Record<string, {lat: number, lng: number}> = {};
    Object.keys(cityCoords).forEach(k => {
      cityCoordsNormalized[normalize(k)] = (cityCoords as any)[k];
    });

    let filtered = lojasFiltradasCompletas.filter(l => normalize(l.consultor) === normalize(selectedConsultor));
    
    filtered = filtered.map(l => {
      const cityKey = normalize(`${l.cidade}-${l.uf}`);
      const fallbackCoords = cityCoordsNormalized[cityKey];
      
      const coords = (l.lat && l.lng && (l.lat !== 0 || l.lng !== 0)) 
        ? { lat: l.lat, lng: l.lng } 
        : fallbackCoords;
      
      if (coords && consultorInfo?.lat && consultorInfo?.lng) {
        const dist = computeDistance({ lat: consultorInfo.lat, lng: consultorInfo.lng }, coords);
        return { ...l, distDoConsultor: dist };
      }
      return { ...l, distDoConsultor: 0 };
    });

    if (viagem) {
      filtered = filtered.filter(l => {
        if (selectedUFs.size > 0 && l.uf && !selectedUFs.has(l.uf)) return false;
        
        const poloDaLoja = polosViagem.find(p => p.lojas.some(lojaPolo => `${lojaPolo.nome_pdv_novo}-${lojaPolo.cidade}` === `${l.nome_pdv_novo}-${l.cidade}`));
        if (poloDaLoja && selectedPolos.size > 0 && !selectedPolos.has(poloDaLoja.nome)) return false;
        
        return true;
      });
    }
    
    return filtered;
  }, [lojasFiltradasCompletas, selectedConsultor, viagem, selectedUFs, selectedPolos, polosViagem, consultorInfo]);

  const opcoesUFs = useMemo(() => {
    const ufs = new Set<string>();
    polosViagem.forEach(p => ufs.add(p.ufPrincipal));
    return Array.from(ufs).sort();
  }, [polosViagem]);

  // 3. Resetar seleções quando as opções mudam
  useEffect(() => {
    setSelectedPolos(new Set(polosViagem.map(p => p.nome)));
    setSelectedUFs(new Set(polosViagem.map(p => p.ufPrincipal)));
  }, [polosViagem]);

  const toggleUF = (uf: string) => {
    const newUFs = new Set(selectedUFs);
    const newPolos = new Set(selectedPolos);
    
    if (newUFs.has(uf)) {
      newUFs.delete(uf);
      // Desmarcar todos os polos desta UF
      polosViagem.filter(p => p.ufPrincipal === uf).forEach(p => newPolos.delete(p.nome));
    } else {
      newUFs.add(uf);
      // Marcar todos os polos desta UF
      polosViagem.filter(p => p.ufPrincipal === uf).forEach(p => newPolos.add(p.nome));
    }
    
    setSelectedUFs(newUFs);
    setSelectedPolos(newPolos);
  };

  // 3. Resetar seleções quando as opções mudam (opcional, mas evita seleções "fantasmas")
  useEffect(() => {
    setSelectedClientes(new Set(opcoesClientes));
  }, [opcoesClientes]);

  useEffect(() => {
    setSelectedClusters(new Set(opcoesClusters));
  }, [opcoesClusters]);

  // 4. Contagem final das lojas (Filtros Primários + Secundários)
  const lojasFiltadasCount = lojasFiltradasCompletas.length;

  const handleGenerate = async () => {
    if (!selectedConsultor || !mes) return;
    setGenerating(true);
    setError(null);

    const [anoStr, mesStr] = mes.split('-');

    try {
      const res = await axios.post('/api/gerar-roteiro', {
        consultor: selectedConsultor,
        mes: parseInt(mesStr),
        ano: parseInt(anoStr),
        selectedClientes: Array.from(selectedClientes),
        selectedClusters: Array.from(selectedClusters),
        selectedPolos: Array.from(selectedPolos),
        excludedLojasIds: Array.from(excludedLojasIds),
        selectedStatus,
        viagem,
        dataInicio,
        dataFim,
        selectedRotasBase,
        includedCoberturaLojasIds: Array.from(selectedCoberturaLojas),
      });
      setResultado(res.data);
      setConsultorInfo(consultores.find(c => c.nome === selectedConsultor));
    } catch (e: any) {
      setError(e.response?.data?.error || 'Erro ao gerar roteiro. Tente novamente.');
    } finally {
      setGenerating(false);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-screen gap-4 text-gray-500">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
        <p className="text-lg font-medium">Carregando base de dados...</p>
      </div>
    );
  }

  // Mostrar prévia se roteiro foi gerado
  if (resultado) {
    return <PreviewRoteiro resultado={resultado} consultorInfo={consultorInfo} initialCenario={cenarioNome} onVoltar={() => setResultado(null)} />;
  }

  // Mostrar Dashboard Consolidado
  if (consolidatedRoutes) {
    return (
      <ConsolidatedDashboard 
        roteiros={consolidatedRoutes} 
        consultores={consultores} 
        onVoltar={() => setConsolidatedRoutes(null)}
        onSelectRoteiro={(dados) => {
          setConsultorInfo(consultores.find(c => normalize(c.nome) === normalize(dados.consultor)));
          setResultado(dados);
          setConsolidatedRoutes(null); // Fecha o consolidado ao abrir o detalhe
        }}
      />
    );
  }

  const count = lojasFiltadasCount;

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="flex gap-0 max-w-[1400px] mx-auto">
        {/* ── Coluna Esquerda: Formulário ── */}
        <div className="flex-1 min-w-0 p-6 space-y-6">

          {error && (
            <div className="flex items-start gap-3 p-4 bg-red-50 border border-red-200 rounded-xl text-red-700">
              <AlertCircle className="w-5 h-5 mt-0.5 shrink-0" />
              <p className="text-sm">{error}</p>
            </div>
          )}

          {/* Parâmetros Principais */}
          <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
            <h2 className="text-base font-semibold mb-5 flex items-center gap-2">
              <Calendar className="w-4 h-4 text-blue-600" /> Parâmetros Principais
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-5">
              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-700 flex items-center justify-between">
                  <span className="flex items-center gap-2"><Users className="w-4 h-4" /> Consultor</span>
                  {selectedConsultor && (
                    <span className="text-[10px] bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-bold">
                      {lojas.filter(l => {
                        const isMyStore = selectedConsultor && normalize(l.consultor) === normalize(selectedConsultor);
                        const isCoveredStore = selectedRotasBase.map(r => normalize(r)).includes(normalize(l.consultor));
                        if (!isMyStore && !isCoveredStore) return false;
                        if (isCoveredStore) {
                          const lojaId = `${l.nome_pdv_novo}-${l.cidade}`;
                          if (!selectedCoberturaLojas.has(lojaId)) return false;
                        }
                        return true;
                      }).length} LOJAS NA ROTA
                    </span>
                  )}
                </label>
                <select id="select-consultor" value={selectedConsultor} onChange={e => setSelectedConsultor(e.target.value)} className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none bg-white text-sm font-medium">
                  <option value="">Selecione um consultor...</option>
                  {consultores.map(c => {
                    const countLojas = lojas.filter(l => normalize(l.consultor) === normalize(c.nome)).length;
                    return (
                      <option key={c.nome} value={c.nome}>
                        {c.nome} ({countLojas} lojas)
                      </option>
                    );
                  })}
                </select>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-700">Mês de Referência</label>
                <input id="input-mes" type="month" value={mes} onChange={e => setMes(e.target.value)} className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm" />
              </div>
              <DateRangePicker 
                mes={mes} 
                startDate={dataInicio} 
                endDate={dataFim} 
                onChange={(start, end) => {
                  setDataInicio(start);
                  setDataFim(end);
                }} 
              />
              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-700">Nome do Cenário</label>
                <input 
                  type="text" 
                  value={cenarioNome} 
                  onChange={(e) => setCenarioNome(e.target.value)} 
                  placeholder="ex: Cenário A" 
                  className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm font-medium" 
                />
              </div>
            </div>
            
            {selectedConsultor && (
              <div className="mt-4 pt-4 border-t border-gray-200">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-xs font-bold text-blue-800 uppercase flex items-center gap-2">
                    <Users className="w-4 h-4" /> Carteira de Lojas do Consultor ({selectedConsultor.split(' ')[0]}):
                  </p>
                  <button 
                    onClick={() => {
                      const lojasConsultor = lojasVisiveisConsultor;
                      const allIds = lojasConsultor.map(l => `${l.nome_pdv_novo}-${l.cidade}`);
                      const someExcluded = allIds.some(id => excludedLojasIds.has(id));
                      const nextExcl = new Set(excludedLojasIds);
                      if (someExcluded) {
                        allIds.forEach(id => nextExcl.delete(id));
                      } else {
                        allIds.forEach(id => nextExcl.add(id));
                      }
                      setExcludedLojasIds(nextExcl);
                    }}
                    className="text-[10px] font-bold text-blue-600 bg-blue-100 hover:bg-blue-200 px-2 py-1 rounded transition-colors"
                  >
                    {lojasVisiveisConsultor.map(l => `${l.nome_pdv_novo}-${l.cidade}`).every(id => excludedLojasIds.has(id)) ? 'Selecionar Todas' : 'Desmarcar Todas'}
                  </button>
                </div>
                <div className="max-h-48 overflow-y-auto pr-2 grid grid-cols-1 md:grid-cols-2 gap-2 custom-scrollbar">
                  {lojasVisiveisConsultor.map((loja, idx) => {
                    const lojaId = `${loja.nome_pdv_novo}-${loja.cidade}`;
                    const isExcluded = excludedLojasIds.has(lojaId);
                    return (
                      <label key={idx} className={`flex items-center gap-2 p-2 rounded border text-[10px] cursor-pointer transition-all ${!isExcluded ? 'bg-blue-50/50 border-blue-200' : 'bg-gray-50 border-gray-200 opacity-50 hover:opacity-100'}`}>
                        <input 
                          type="checkbox" 
                          checked={!isExcluded}
                          onChange={(e) => {
                            const nextExcl = new Set(excludedLojasIds);
                            if (e.target.checked) nextExcl.delete(lojaId);
                            else nextExcl.add(lojaId);
                            setExcludedLojasIds(nextExcl);
                          }}
                          className="rounded text-blue-600 w-3 h-3"
                        />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-semibold text-gray-700 block truncate">{loja.nome_pdv_novo}</span>
                            {(loja as any).distDoConsultor !== undefined && (loja as any).distDoConsultor > 0 && (
                              <span className="shrink-0 text-[9px] bg-blue-50 text-blue-600 font-bold px-1.5 py-0.5 rounded flex items-center gap-0.5" title="Distância aproximada da casa do consultor">
                                <Navigation className="w-2.5 h-2.5" /> {Math.round((loja as any).distDoConsultor)} km
                              </span>
                            )}
                          </div>
                          <span className="text-gray-400 block truncate">{loja.cidade} - {loja.uf} · Status: {loja.status}</span>
                        </div>
                      </label>
                    )
                  })}
                </div>
              </div>
            )}

            <div className="mt-4 p-4 bg-gray-50 border border-gray-200 rounded-lg">
              <label className="text-sm font-medium text-gray-700 flex items-center justify-between mb-2">
                <span className="flex items-center gap-2"><Users className="w-4 h-4 text-gray-500" /> Cobrir Lojas de Outra Rota (Opcional)</span>
              </label>
              <div className="flex flex-wrap gap-2 mt-2 mb-3">
                {consultores.map(c => {
                  if (c.nome === selectedConsultor) return null;
                  const isSelected = selectedRotasBase.includes(c.nome);
                  const rotaSigla = ROTA_MAP[c.nome] || c.nome.split(' ')[0];
                  const countLojas = lojas.filter(l => normalize(l.consultor) === normalize(c.nome)).length;
                  return (
                    <label key={c.nome} className={`flex items-center gap-2 p-2.5 rounded-lg border text-[11px] font-bold cursor-pointer transition-all ${isSelected ? 'bg-orange-100/80 border-orange-300 text-orange-900 shadow-sm' : 'bg-white border-gray-200 text-gray-700 hover:border-orange-200'}`}>
                      <input 
                        type="checkbox" 
                        checked={isSelected} 
                        onChange={(e) => {
                          const nextRotas = e.target.checked 
                            ? [...selectedRotasBase, c.nome] 
                            : selectedRotasBase.filter(r => r !== c.nome);
                          setSelectedRotasBase(nextRotas);
                        }} 
                        className="rounded text-orange-500 w-3.5 h-3.5" 
                      />
                      <span>ROTA {rotaSigla} ({countLojas} lojas)</span>
                    </label>
                  );
                })}
              </div>

              {selectedRotasBase.length > 0 && (
                <div className="mt-4 pt-4 border-t border-orange-200">
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-xs font-bold text-orange-800 uppercase">Selecione as lojas das rotas cobertas para incluir:</p>
                    <button 
                      onClick={() => {
                        const lojasRotas = lojas.filter(l => selectedRotasBase.map(r => normalize(r)).includes(normalize(l.consultor)));
                        const allIds = lojasRotas.map(l => `${l.nome_pdv_novo}-${l.cidade}`);
                        const someExcluded = allIds.some(id => !selectedCoberturaLojas.has(id));
                        
                        const nextSet = new Set(selectedCoberturaLojas);
                        if (someExcluded) {
                          allIds.forEach(id => nextSet.add(id));
                        } else {
                          allIds.forEach(id => nextSet.delete(id));
                        }
                        setSelectedCoberturaLojas(nextSet);
                      }}
                      className="text-[10px] font-bold text-orange-600 bg-orange-100 hover:bg-orange-200 px-2 py-1 rounded transition-colors"
                    >
                      {lojas.filter(l => selectedRotasBase.map(r => normalize(r)).includes(normalize(l.consultor))).map(l => `${l.nome_pdv_novo}-${l.cidade}`).every(id => selectedCoberturaLojas.has(id)) ? 'Desmarcar Todas' : 'Selecionar Todas'}
                    </button>
                  </div>
                  <div className="max-h-48 overflow-y-auto pr-2 grid grid-cols-1 md:grid-cols-2 gap-2 custom-scrollbar">
                    {lojas.filter(l => selectedRotasBase.map(r => normalize(r)).includes(normalize(l.consultor))).map((loja, idx) => {
                      const lojaId = `${loja.nome_pdv_novo}-${loja.cidade}`;
                      const isSelected = selectedCoberturaLojas.has(lojaId);
                      const siglaLoja = ROTA_MAP[loja.consultor] || loja.consultor?.split(' ')[0] || '';
                      return (
                        <label key={idx} className={`flex items-center gap-2 p-2 rounded border text-[10px] cursor-pointer transition-all ${isSelected ? 'bg-orange-50 border-orange-300' : 'bg-gray-50 border-gray-200 opacity-60 hover:opacity-100'}`}>
                          <input 
                            type="checkbox" 
                            checked={isSelected}
                            onChange={(e) => {
                              const nextSet = new Set(selectedCoberturaLojas);
                              if (e.target.checked) nextSet.add(lojaId);
                              else nextSet.delete(lojaId);
                              setSelectedCoberturaLojas(nextSet);
                            }}
                            className="rounded text-orange-500 w-3 h-3"
                          />
                          <div className="flex-1 min-w-0">
                            <span className="font-semibold text-gray-700 block truncate">{loja.nome_pdv_novo}</span>
                            <span className="text-gray-400 block truncate">{loja.cidade} - {loja.uf} <span className="text-orange-500 font-bold ml-1">({siglaLoja})</span></span>
                          </div>
                        </label>
                      )
                    })}
                  </div>
                  {selectedCoberturaLojas.size === 0 && (
                     <p className="text-[10px] text-red-500 mt-2 font-medium">Nenhuma loja selecionada. A geração irá ignorar estas rotas.</p>
                  )}
                </div>
              )}
            </div>
            <div className={`mt-5 flex flex-col gap-4 p-4 rounded-lg border transition-all ${viagem ? 'bg-blue-50 border-blue-300' : 'bg-gray-50 border-gray-200 hover:border-blue-200'}`}>
              <div className="flex items-center gap-4 cursor-pointer" onClick={() => setViagem(!viagem)}>
                <input type="checkbox" id="viagem" checked={viagem} readOnly className="w-5 h-5 text-blue-600 rounded pointer-events-none" />
                <div>
                  <p className={`font-medium flex items-center gap-2 text-sm ${viagem ? 'text-blue-900' : 'text-gray-700'}`}><MapLucide className="w-4 h-4" /> Incluir Rotas de Viagem</p>
                  <p className="text-xs text-gray-500 mt-0.5">Inclui lojas fora da região/estado base do consultor</p>
                </div>
              </div>

              {viagem && opcoesUFs.length > 0 && (
                <div className="flex flex-wrap gap-3 mt-2 pl-9 pt-3 border-t border-blue-100">
                  <p className="w-full text-[10px] font-bold text-blue-400 uppercase tracking-widest mb-1">Filtrar Estados da Viagem:</p>
                  {opcoesUFs.map(uf => (
                    <label key={uf} className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border cursor-pointer transition-all ${selectedUFs.has(uf) ? 'bg-blue-600 border-blue-600 text-white shadow-sm' : 'bg-white border-gray-200 text-gray-500 hover:border-blue-300'}`}>
                      <input 
                        type="checkbox" 
                        checked={selectedUFs.has(uf)} 
                        onChange={() => toggleUF(uf)}
                        className="hidden" 
                      />
                      <span className="text-xs font-black">{uf}</span>
                    </label>
                  ))}
                </div>
              )}

              {viagem && polosViagem.length > 0 && (
                <div className="pt-4 border-t border-blue-200 mt-2">
                  <p className="text-sm font-semibold text-blue-900 mb-3 flex items-center gap-2"><Navigation className="w-4 h-4" /> Selecione os Pólos Regionais:</p>
                  <div className="flex flex-wrap gap-3">
                    {polosViagem.map(polo => {
                      const isSelected = selectedPolos.has(polo.nome);
                      return (
                        <div
                          key={polo.id}
                          onClick={() => {
                            const newSet = new Set(selectedPolos);
                            const newUFs = new Set(selectedUFs);
                            if (isSelected) {
                              newSet.delete(polo.nome);
                              const outrosDessaUF = polosViagem.filter(p => p.ufPrincipal === polo.ufPrincipal && p.nome !== polo.nome);
                              const algumAindaMarcado = outrosDessaUF.some(p => newSet.has(p.nome));
                              if (!algumAindaMarcado) newUFs.delete(polo.ufPrincipal);
                            } else {
                              newSet.add(polo.nome);
                              newUFs.add(polo.ufPrincipal);
                            }
                            setSelectedPolos(newSet);
                            setSelectedUFs(newUFs);
                          }}
                          className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-all w-full md:w-[48%] ${isSelected ? 'bg-white border-blue-400 shadow-sm' : 'bg-gray-50/50 border-gray-200 opacity-60 hover:opacity-100 grayscale'}`}
                        >
                          <input type="checkbox" checked={isSelected} readOnly className="w-4 h-4 text-blue-600 rounded pointer-events-none" />
                          <div className="flex-1 min-w-0">
                            <p className={`font-medium text-xs truncate ${isSelected ? 'text-gray-900' : 'text-gray-500'}`}>
                              {polo.lojas.length === 1 ? (polo.lojas[0].nome_pdv_novo || 'Loja sem nome').split(' - ').slice(0, 2).join(' - ') : polo.nome}
                            </p>
                            <p className="text-[11px] text-gray-500 truncate">
                              {polo.lojas.length === 1 ? `📍 ${polo.lojas[0].cidade} - ${polo.lojas[0].uf}` : `${polo.lojas.length} lojas em ${Array.from(new Set(polo.lojas.map(l => l.cidade))).join(', ')}`}
                            </p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Detalhamento das Lojas dos Pólos Selecionados */}
              {viagem && selectedPolos.size > 0 && (
                <div className="pt-4 border-t border-blue-100 mt-4 bg-white/50 p-4 rounded-xl border border-blue-50">
                  <p className="text-xs font-bold text-blue-600 uppercase tracking-widest mb-4 flex items-center gap-2">
                    <CheckSquare className="w-3 h-3" /> Gestão Individual de Lojas por Pólo
                  </p>
                  <div className="space-y-4 max-h-[300px] overflow-y-auto pr-2 custom-scrollbar">
                    {polosViagem.filter(p => selectedPolos.has(p.nome)).map(polo => {
                      const allIds = polo.lojas.map(l => `${l.nome_pdv_novo}-${l.cidade}`);
                      const allExcluded = allIds.every(id => excludedLojasIds.has(id));
                      const someExcluded = allIds.some(id => excludedLojasIds.has(id));
                      
                      return (
                        <div key={polo.id} className="space-y-2">
                          <button 
                            onClick={() => {
                              const nextExcl = new Set(excludedLojasIds);
                              if (allExcluded) {
                                allIds.forEach(id => nextExcl.delete(id));
                              } else {
                                allIds.forEach(id => nextExcl.add(id));
                              }
                              setExcludedLojasIds(nextExcl);
                            }}
                            className={`text-[10px] font-black uppercase px-2 py-1 rounded inline-flex items-center gap-2 transition-all hover:scale-105 active:scale-95 ${allExcluded ? 'bg-red-100 text-red-600' : someExcluded ? 'bg-amber-100 text-amber-600' : 'bg-gray-100 text-gray-500'}`}
                          >
                            {polo.nome}
                            <span className="opacity-50">{allExcluded ? '(Desativado)' : someExcluded ? '(Parcial)' : '(Ativo)'}</span>
                          </button>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                            {polo.lojas.map((loja, idx) => {
                              const lojaId = `${loja.nome_pdv_novo}-${loja.cidade}`;
                              const isExcluded = excludedLojasIds.has(lojaId);
                              const isCovered = selectedRotasBase.map(r => normalize(r)).includes(normalize(loja.consultor));
                            return (
                              <label key={idx} className={`flex items-center gap-3 p-2 rounded-lg border text-[11px] transition-all cursor-pointer ${isExcluded ? 'bg-red-50 border-red-100 opacity-60' : isCovered ? 'bg-orange-50 border-orange-200 hover:border-orange-300 shadow-sm' : 'bg-white border-gray-100 hover:border-blue-200 shadow-sm'}`}>
                                <input 
                                  type="checkbox" 
                                  checked={!isExcluded} 
                                  onChange={() => {
                                    const nextExcl = new Set(excludedLojasIds);
                                    if (isExcluded) nextExcl.delete(lojaId);
                                    else nextExcl.add(lojaId);
                                    setExcludedLojasIds(nextExcl);
                                  }}
                                  className={`w-3.5 h-3.5 rounded ${isCovered ? 'text-orange-600' : 'text-blue-600'}`}
                                />
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center justify-between gap-2">
                                    <p className={`font-semibold truncate ${isExcluded ? 'text-gray-400' : isCovered ? 'text-orange-900' : 'text-gray-700'}`}>{loja.nome_pdv_novo}</p>
                                    {isCovered && (
                                      <span className="shrink-0 text-[8px] bg-orange-100 text-orange-700 font-bold px-1.5 py-0.5 rounded flex items-center">
                                        COBERTURA
                                      </span>
                                    )}
                                    {(loja as any).distDoConsultor !== undefined && (loja as any).distDoConsultor > 0 && !isCovered && (
                                      <span className="shrink-0 text-[9px] bg-blue-50 text-blue-600 font-bold px-1.5 py-0.5 rounded flex items-center gap-0.5" title="Distância aproximada da casa do consultor">
                                        <Navigation className="w-2.5 h-2.5" /> {Math.round((loja as any).distDoConsultor)} km
                                      </span>
                                    )}
                                  </div>
                                  <p className={`text-[10px] ${isCovered ? 'text-orange-600/80' : 'text-gray-400'}`}>{loja.cidade} - {loja.uf} · Cluster {loja.cluster}</p>
                                </div>
                              </label>
                            );
                          })}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
              {viagem && polosViagem.length === 0 && selectedConsultor && (
                <div className="pt-4 border-t border-blue-200 mt-2">
                  <p className="text-sm text-gray-600">Este consultor não possui lojas de viagem cadastradas.</p>
                </div>
              )}
            </div>
          </div>

          {/* Filtros */}
          <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-base font-semibold">Filtros da Base de Lojas</h2>
              {selectedConsultor && (
                <span className="text-xs font-medium text-blue-600 bg-blue-50 px-3 py-1 rounded-full">{count} loja{count !== 1 ? 's' : ''} selecionada{count !== 1 ? 's' : ''}</span>
              )}
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-700">Status</label>
                <select value={selectedStatus} onChange={e => setSelectedStatus(e.target.value)} className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none bg-white text-sm">
                  <option value="">Todos</option>
                  <option value="ATENDIMENTO">Ativo (Atendimento)</option>
                  <option value="NÃO ATENDIMENTO">Não Atendimento</option>
                </select>
              </div>
              <CheckboxList title="Cluster" options={opcoesClusters} selected={selectedClusters} onChange={setSelectedClusters} />
              <CheckboxList title="Cliente (Rede)" options={opcoesClientes} selected={selectedClientes} onChange={setSelectedClientes} />
            </div>
          </div>

          {/* Botão */}
          <div className="flex items-center justify-between">
            <p className="text-sm text-gray-500">
              {!selectedConsultor && '⚠️ Selecione um consultor para continuar.'}
              {selectedConsultor && !mes && '⚠️ Selecione o mês de referência.'}
              {selectedConsultor && mes && count === 0 && '⚠️ Nenhuma loja encontrada com os filtros atuais.'}
            </p>
            <button id="btn-gerar" onClick={handleGenerate} disabled={!selectedConsultor || !mes || count === 0 || generating} className="flex items-center gap-2 px-8 py-3 bg-[#1428A0] text-white font-semibold rounded-xl hover:bg-blue-800 disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-md hover:shadow-lg text-sm">
              {generating ? <><Loader2 className="w-5 h-5 animate-spin" /> Gerando roteiro...</> : <><CheckCircle className="w-5 h-5" /> Gerar Prévia de Roteiro</>}
            </button>
          </div>

          <SugestaoJourney lojas={lojas} />
          
          <div className="mt-8 pt-8 border-t border-gray-200">
            <RoteirosSalvos 
              onEdit={(dados) => {
                setConsultorInfo(consultores.find(c => normalize(c.nome) === normalize(dados.consultor)));
                setResultado(dados);
              }} 
              onViewConsolidated={(roteiros) => setConsolidatedRoutes(roteiros)}
            />
          </div>
        </div>

        {/* ── Coluna Direita: Dashboard de Inteligência ── */}
        <div className="w-80 shrink-0 p-6 border-l border-gray-200 bg-white/50 sticky top-0 h-screen overflow-y-auto">
          <DashboardIntel 
            consultor={selectedConsultor || undefined} 
            status={selectedStatus || undefined}
            clusters={Array.from(selectedClusters)}
            clientes={Array.from(selectedClientes)}
          />
        </div>
      </div>
    </div>
  );
}
