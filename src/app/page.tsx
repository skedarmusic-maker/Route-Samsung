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
  Activity, TrendingUp, TrendingDown, CheckSquare, Trash2, PlusCircle, Search
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
function LojaCard({ loja, index, onBuscarVoo, chosenFlight, onRemove, onTimeChange }: { 
  loja: LojaVisita; 
  index: number; 
  onBuscarVoo?: () => void;
  chosenFlight?: any;
  onRemove?: () => void;
  onTimeChange?: (checkIn: string, checkOut: string) => void;
}) {
  const isViagem = loja.tipo === 'viagem';
  return (
    <div className={`group rounded-lg border p-3 text-sm transition-all ${isViagem ? 'bg-orange-50 border-orange-200' : 'bg-blue-50 border-blue-200'}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 font-semibold text-gray-800 flex-1 min-w-0">
          <span className={`shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold text-white ${isViagem ? 'bg-orange-500' : 'bg-blue-600'}`}>{index + 1}</span>
          <span className="truncate" title={loja.nome_pdv}>{loja.nome_pdv}</span>
        </div>
        <div className="flex items-center gap-1">
          {onRemove && (
            <button 
              onClick={(e) => { e.stopPropagation(); onRemove(); }}
              className="opacity-0 group-hover:opacity-100 p-1 hover:bg-red-100 rounded text-red-400 hover:text-red-600 transition-all"
              title="Remover esta visita"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
          {isViagem && (
            <span className="shrink-0 flex items-center gap-1 text-xs text-orange-700 bg-orange-100 px-2 py-0.5 rounded-full">
              <Plane className="w-3 h-3" /> Viagem
            </span>
          )}
        </div>
      </div>
      <div className="mt-2 grid grid-cols-2 gap-x-2 gap-y-1 text-xs text-gray-600">
        <span className="flex items-center gap-1"><Building2 className="w-3 h-3 shrink-0" />{loja.cliente}</span>
        <span className="flex items-center gap-1"><Tag className="w-3 h-3 shrink-0" />Cluster: {loja.cluster}</span>
        <span className="flex items-center gap-1 col-span-2"><MapPin className="w-3 h-3 shrink-0" />{loja.cidade} - {loja.uf}</span>
        
        <div className="flex items-center gap-1 col-span-2 mt-0.5">
          <Clock className="w-3 h-3 shrink-0" />
          <div className="flex items-center gap-0.5 bg-white/50 border border-gray-200 rounded px-1 px-1.5 py-0.5">
            <input 
              type="text" 
              value={loja.checkIn} 
              onChange={(e) => onTimeChange?.(e.target.value, loja.checkOut)}
              className="w-9 bg-transparent border-none outline-none text-[11px] font-bold text-gray-700 text-center focus:ring-0 p-0"
              maxLength={5}
            />
            <span className="text-gray-400">→</span>
            <input 
              type="text" 
              value={loja.checkOut} 
              onChange={(e) => onTimeChange?.(loja.checkIn, e.target.value)}
              className="w-9 bg-transparent border-none outline-none text-[11px] font-bold text-gray-700 text-center focus:ring-0 p-0"
              maxLength={5}
            />
          </div>
        </div>
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
function DiaCard({ 
  dia, 
  selected, 
  onClick, 
  distancia, 
  onBuscarVoo, 
  chosenFlights,
  onSwapDays,
  outrosDias,
  onRemoveLoja,
  onAddStore,
  onTimeChange
}: {
  dia: RoteiroDia;
  selected: boolean;
  onClick: () => void;
  distancia?: number;
  onBuscarVoo?: (loja: LojaVisita, dia: RoteiroDia) => void;
  chosenFlights?: Record<string, any>;
  onSwapDays?: (dataA: string, dataB: string) => void;
  outrosDias?: { data: string; diaSemana: string }[];
  onRemoveLoja?: (data: string, lojaNome: string) => void;
  onAddStore?: (dia: RoteiroDia) => void;
  onTimeChange?: (data: string, lojaNome: string, checkIn: string, checkOut: string) => void;
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
          <div className="flex items-center gap-2 mt-0.5">
            <p className="text-base font-bold text-gray-900">
              {dataObj.getDate().toString().padStart(2, '0')}/{(dataObj.getMonth() + 1).toString().padStart(2, '0')}
            </p>
            {onSwapDays && outrosDias && (
              <select
                value={dia.data}
                onChange={(e) => {
                  const targetData = e.target.value;
                  if (targetData !== dia.data) {
                    onSwapDays(dia.data, targetData);
                  }
                }}
                onClick={(e) => e.stopPropagation()} // Impede disparar o select do mapa
                className="text-[10px] bg-gray-100 border border-gray-200 rounded px-1.5 py-0.5 font-bold text-blue-600 focus:outline-none focus:ring-1 focus:ring-blue-500 cursor-pointer hover:bg-blue-50 transition-colors"
                title="Trocar visitas com outro dia"
              >
                <option value={dia.data}>Trocar...</option>
                {outrosDias
                  .filter(o => o.data !== dia.data)
                  .map(o => {
                    const [oy, om, od] = o.data.split('-').map(Number);
                    const oDateStr = `${od.toString().padStart(2, '0')}/${om.toString().padStart(2, '0')}`;
                    return (
                      <option key={o.data} value={o.data}>
                        com {oDateStr} ({o.diaSemana.substring(0, 3)})
                      </option>
                    );
                  })}
              </select>
            )}
          </div>
        </div>
        {isFeriado && (
          <span className="text-[10px] text-red-600 bg-red-100 px-2 py-0.5 rounded-full font-medium max-w-[130px] text-right leading-tight">{dia.feriado}</span>
        )}
        {!isFeriado && (
          <div className="flex items-center gap-1.5">
            {onAddStore && dia.lojas.length < 3 && (
              <button 
                onClick={(e) => { e.stopPropagation(); onAddStore(dia); }}
                className="p-1.5 bg-blue-100 text-blue-600 rounded-lg hover:bg-blue-200 transition-all flex items-center gap-1 text-[10px] font-bold shadow-sm"
                title="Adicionar Loja Extra"
              >
                <PlusCircle className="w-3 h-3" /> Add Loja
              </button>
            )}
            {!semLojas && distancia !== undefined && (
              <span className="text-[10px] text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full font-semibold flex items-center gap-1">
                <Navigation className="w-2.5 h-2.5" /> {Math.round(distancia)} km
              </span>
            )}
            {!semLojas && (
              <span className="text-xs text-blue-600 bg-blue-100 px-2 py-0.5 rounded-full font-medium">
                {dia.lojas.length} loja{dia.lojas.length > 1 ? 's' : ''}
              </span>
            )}
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
              onRemove={onRemoveLoja ? () => onRemoveLoja(dia.data, loja.nome_pdv) : undefined}
              onTimeChange={onTimeChange ? (cin, cout) => onTimeChange(dia.data, loja.nome_pdv, cin, cout) : undefined}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────
// Modal para adicionar loja extra
// ─────────────────────────────────────────────────────────
function AddStoreModal({ 
  dia, 
  lojasBase, 
  consultorNome,
  alreadyVisitedNames,
  onSelect, 
  onClose 
}: { 
  dia: RoteiroDia; 
  lojasBase: Loja[]; 
  consultorNome: string;
  alreadyVisitedNames: Set<string>;
  onSelect: (loja: Loja) => void; 
  onClose: () => void;
}) {
  const [search, setSearch] = useState('');
  
  // Coordenadas de referência do dia (primeira loja)
  const refStore = dia.lojas[0];
  const refCoords = useMemo(() => {
    if (!refStore) return null;
    if (refStore.lat && refStore.lng) return { lat: refStore.lat, lng: refStore.lng };
    const key = normalize(`${refStore.cidade}-${refStore.uf}`);
    return (cityCoords as Record<string, any>)[key] || null;
  }, [refStore]);

  const candidates = useMemo(() => {
    return lojasBase
      .filter(l => !alreadyVisitedNames.has(l.nome_pdv_novo))
      .filter(l => normalize(l.consultor) === normalize(consultorNome)) // Filtra pela base do consultor
      .map(l => {
        const mesmaCidade = refStore && normalize(l.cidade) === normalize(refStore.cidade);
        let lat = l.lat;
        let lng = l.lng;
        if (!lat || !lng) {
          const key = normalize(`${l.cidade}-${l.uf}`);
          const coords = (cityCoords as Record<string, any>)[key];
          if (coords) { lat = coords.lat; lng = coords.lng; }
        }
        
        let dist = 9999;
        if (mesmaCidade) {
          dist = 0; // Se for na mesma cidade, distância é 0 (otimizado)
        } else if (refCoords && lat && lng) {
          dist = computeDistance(refCoords, { lat, lng });
        }

        return { ...l, dist };
      })
      .filter(l => {
        const s = normalize(search);
        if (!s) {
          // Se não houver busca, mostrar lojas da mesma cidade ou raio de 100km
          const mesmaCidade = refStore && normalize(l.cidade) === normalize(refStore.cidade);
          return mesmaCidade || l.dist < 100;
        }
        return normalize(l.nome_pdv_novo).includes(s) || normalize(l.cidade).includes(s) || normalize(l.cliente || '').includes(s);
      })
      .sort((a, b) => a.dist - b.dist)
      .slice(0, 25);
  }, [lojasBase, alreadyVisitedNames, refCoords, refStore, search, consultorNome]);

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[10000] flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl w-full max-w-2xl flex flex-col shadow-2xl overflow-hidden border border-gray-200 animate-in zoom-in-95 duration-200">
        <div className="p-6 border-b border-gray-100 flex items-center justify-between bg-blue-50/50">
          <div>
            <h3 className="text-xl font-bold text-blue-900 flex items-center gap-2">
              <PlusCircle className="w-6 h-6 text-blue-600" /> Adicionar Loja Extra
            </h3>
            <p className="text-sm text-blue-600/70 mt-1">Dia {dia.data.split('-').reverse().slice(0,2).join('/')} · Sugerindo lojas próximas a {refStore?.cidade || 'Base'}</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-white rounded-full transition-colors text-gray-400 hover:text-gray-600">
            <Activity className="w-6 h-6 rotate-90" />
          </button>
        </div>

        <div className="p-4 border-b border-gray-50 bg-white">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input 
              type="text" 
              placeholder="Buscar por nome, cidade ou rede..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 transition-all text-sm"
              autoFocus
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 custom-scrollbar min-h-[300px] max-h-[500px]">
          <div className="grid grid-cols-1 gap-2">
            {candidates.map((l, idx) => (
              <button 
                key={idx}
                onClick={() => onSelect(l)}
                className="flex items-center gap-4 p-4 rounded-2xl border border-gray-100 bg-white hover:border-blue-300 hover:bg-blue-50/50 transition-all text-left group"
              >
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-gray-800 text-sm group-hover:text-blue-700 transition-colors">{l.nome_pdv_novo}</p>
                  <p className="text-xs text-gray-500 mt-0.5">{l.cliente} · {l.cidade} - {l.uf}</p>
                </div>
                <div className="text-right shrink-0">
                  <span className={`text-[10px] font-black px-2 py-1 rounded-lg uppercase ${l.dist < 20 ? 'bg-green-100 text-green-700' : l.dist < 50 ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-500'}`}>
                    {l.dist >= 9999 ? '-- km' : `${Math.round(l.dist)} km`}
                  </span>
                  <p className="text-[9px] text-gray-400 mt-1 font-bold">CLUSTER {l.cluster}</p>
                </div>
              </button>
            ))}
            {candidates.length === 0 && (
              <div className="py-12 text-center text-gray-400">
                <Search className="w-8 h-8 mx-auto mb-3 opacity-20" />
                <p className="text-sm">Nenhuma loja disponível encontrada.</p>
              </div>
            )}
          </div>
        </div>

        <div className="p-4 bg-gray-50 border-t border-gray-100 flex justify-end">
          <button onClick={onClose} className="px-8 py-2.5 bg-white text-gray-600 font-bold border border-gray-200 rounded-xl hover:bg-gray-100 transition-all active:scale-95">
            Cancelar
          </button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────
// Tela de Prévia do Roteiro (com mapa integrado)
// ─────────────────────────────────────────────────────────
function PreviewRoteiro({ resultado, consultorInfo, lojasBase, initialCenario, onVoltar }: {
  resultado: any;
  consultorInfo: ConsultorLocal | undefined;
  lojasBase: Loja[];
  initialCenario?: string;
  onVoltar: () => void;
}) {
  const [roteiroState, setRoteiroState] = useState<RoteiroDia[]>(resultado.roteiro);

  const totalVisitas = roteiroState.reduce((acc: number, d: RoteiroDia) => acc + d.lojas.length, 0);
  const diasComVisitas = roteiroState.filter((d: RoteiroDia) => d.lojas.length > 0);
  const feriadosDias = roteiroState.filter((d: RoteiroDia) => d.feriado && !d.feriado.startsWith('__viagem_'));
  const mesNome = new Date(resultado.ano, resultado.mes - 1, 1).toLocaleString('pt-BR', { month: 'long', year: 'numeric' });

  // Dia selecionado para o mapa — inicializa no primeiro dia com visitas
  const [diaSelecionado, setDiaSelecionado] = useState<RoteiroDia | null>(
    () => roteiroState.find((d: RoteiroDia) => d.lojas.length > 0) ?? null
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

  // Estado para modal de adicionar loja
  const [addStoreDia, setAddStoreDia] = useState<RoteiroDia | null>(null);

  const handleRemoveLoja = (data: string, lojaNome: string) => {
    if (!window.confirm(`Deseja remover a visita à loja "${lojaNome}"?`)) return;
    
    setRoteiroState(prev => prev.map(dia => {
      if (dia.data === data) {
        return { ...dia, lojas: dia.lojas.filter(l => l.nome_pdv !== lojaNome) };
      }
      return dia;
    }));
    
    setDistancias(prev => {
      const next = { ...prev };
      delete next[data];
      return next;
    });

    if (diaSelecionado?.data === data) {
      setTimeout(() => {
        setDiaSelecionado(prev => prev ? { ...prev, lojas: prev.lojas.filter(l => l.nome_pdv !== lojaNome) } : null);
      }, 0);
    }
  };

  const handleAddLojaToDia = (loja: Loja) => {
    if (!addStoreDia) return;
    
    const count = addStoreDia.lojas.length;
    const times = [
      { in: "09:00", out: "12:00" },
      { in: "13:30", out: "16:00" },
      { in: "16:30", out: "18:30" }
    ];
    const t = times[count] || times[2];

    const novaVisita: LojaVisita = {
      nome_pdv: loja.nome_pdv_novo,
      cliente: loja.cliente,
      endereco: loja.endereco || '',
      cidade: loja.cidade,
      uf: loja.uf,
      cluster: loja.cluster,
      tipo: normalize(loja.uf) !== normalize(consultorInfo?.uf_base || '') ? 'viagem' : 'local',
      checkIn: t.in,
      checkOut: t.out,
      lat: loja.lat,
      lng: loja.lng,
      estadoViagem: normalize(loja.uf) !== normalize(consultorInfo?.uf_base || '') ? 'EXTERNO' : undefined
    };

    setRoteiroState(prev => prev.map(dia => {
      if (dia.data === addStoreDia.data) {
        return { ...dia, lojas: [...dia.lojas, novaVisita] };
      }
      return dia;
    }));
    
    setDistancias(prev => {
      const next = { ...prev };
      delete next[addStoreDia.data];
      return next;
    });
    
    if (diaSelecionado?.data === addStoreDia.data) {
       setTimeout(() => {
         setDiaSelecionado(prev => prev ? { ...prev, lojas: [...prev.lojas, novaVisita] } : null);
       }, 0);
    }

    setAddStoreDia(null);
  };

  const handleTimeChange = (data: string, lojaNome: string, checkIn: string, checkOut: string) => {
    setRoteiroState(prev => prev.map(dia => {
      if (dia.data === data) {
        return {
          ...dia,
          lojas: dia.lojas.map(l => {
            if (l.nome_pdv === lojaNome) {
              return { ...l, checkIn, checkOut };
            }
            return l;
          })
        };
      }
      return dia;
    }));

    if (diaSelecionado?.data === data) {
       setTimeout(() => {
         setDiaSelecionado(prev => prev ? {
           ...prev,
           lojas: prev.lojas.map(l => l.nome_pdv === lojaNome ? { ...l, checkIn, checkOut } : l)
         } : null);
       }, 0);
    }
  };

  const alreadyVisitedNames = useMemo(() => {
    const names = new Set<string>();
    roteiroState.forEach(d => d.lojas.forEach(l => names.add(l.nome_pdv)));
    return names;
  }, [roteiroState]);

  const handleSwapDays = (dataA: string, dataB: string) => {
    setRoteiroState(prev => {
      const next = [...prev];
      const indexA = next.findIndex(d => d.data === dataA);
      const indexB = next.findIndex(d => d.data === dataB);
      
      if (indexA !== -1 && indexB !== -1) {
        const tempLojas = next[indexA].lojas;
        const tempFeriado = next[indexA].feriado;
        const tempAviso = next[indexA].aviso;
        
        next[indexA] = {
          ...next[indexA],
          lojas: next[indexB].lojas,
          feriado: next[indexB].feriado,
          aviso: next[indexB].aviso
        };
        
        next[indexB] = {
          ...next[indexB],
          lojas: tempLojas,
          feriado: tempFeriado,
          aviso: tempAviso
        };
        
        if (diaSelecionado && (diaSelecionado.data === dataA || diaSelecionado.data === dataB)) {
          setTimeout(() => {
            setDiaSelecionado(next.find(d => d.data === diaSelecionado.data) || null);
          }, 0);
        }
      }
      return next;
    });

    setDistancias(prev => {
      const next = { ...prev };
      delete next[dataA];
      delete next[dataB];
      return next;
    });
  };

  // Calcula KM total aproximado do roteiro
  const totalEstimatedKM = useMemo(() => {
    let total = 0;
    roteiroState.forEach((dia: RoteiroDia) => {
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
  }, [roteiroState, consultorCoords, distancias]);

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
    const dataToExport = roteiroState.flatMap((dia: any) => {
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
        totalLojas: resultado.totalLojas || roteiroState.reduce((acc: number, dia: any) => acc + (dia.lojas?.length || 0), 0),
        roteiro: roteiroState
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
              {roteiroState.map((dia: RoteiroDia) => (
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
                  onSwapDays={handleSwapDays}
                  outrosDias={roteiroState.map(d => ({ data: d.data, diaSemana: d.diaSemana }))}
                  onRemoveLoja={handleRemoveLoja}
                  onAddStore={setAddStoreDia}
                  onTimeChange={handleTimeChange}
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

        {addStoreDia && (
          <AddStoreModal 
            dia={addStoreDia}
            lojasBase={lojasBase}
            consultorNome={resultado.consultor}
            alreadyVisitedNames={alreadyVisitedNames}
            onSelect={handleAddLojaToDia}
            onClose={() => setAddStoreDia(null)}
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
  const [ufFiltroCobertura, setUfFiltroCobertura] = useState<string>('');

  useEffect(() => {
    setSelectedCoberturaLojas(new Set());
    setUfFiltroCobertura('');
  }, [selectedRotasBase]);

  useEffect(() => {
    setDataInicio('');
    setDataFim('');
  }, [mes]);

  const [selectedClientes, setSelectedClientes] = useState<Set<string>>(new Set());
  const [selectedClusters, setSelectedClusters] = useState<Set<string>>(new Set());
  const [selectedCanais, setSelectedCanais] = useState<Set<string>>(new Set());
  const [selectedPolos, setSelectedPolos] = useState<Set<string>>(new Set());
  const [selectedUFs, setSelectedUFs] = useState<Set<string>>(new Set());
  const [excludedLojasIds, setExcludedLojasIds] = useState<Set<string>>(new Set());
  const [filtroCarteira, setFiltroCarteira] = useState('');
  const [filtroPolos, setFiltroPolos] = useState('');

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
        
        const forbiddenClients = ['A.DIAS', 'DUFRIO', 'UNIAR'];
        const mappedLojas = (dataL || [])
          .filter(l => !l.cliente || !forbiddenClients.includes(l.cliente.toUpperCase().trim()))
          .map(l => ({
            cliente: l.cliente,
            nome_pdv_novo: l.nome_pdv, // Ajustado para bater com a interface do frontend
            endereco: l.endereco,
            cidade: l.cidade,
            uf: l.uf,
            cluster: l.cluster,
            canal: l.canal,
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
      if (selectedCanais.size > 0 && !selectedCanais.has(l.canal)) return false;
      return true;
    });
  }, [lojasFiltradasBase, selectedClientes, selectedClusters, selectedCanais]);

  const opcoesClientes = useMemo(() => {
    return Array.from(new Set(lojasFiltradasBase.map(l => l.cliente).filter(Boolean))).sort();
  }, [lojasFiltradasBase]);

  const opcoesClusters = useMemo(() => {
    return Array.from(new Set(lojasFiltradasBase.map(l => l.cluster).filter(Boolean))).sort();
  }, [lojasFiltradasBase]);

  const opcoesCanais = useMemo(() => {
    return Array.from(new Set(lojasFiltradasBase.map(l => l.canal).filter(Boolean))).sort();
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
          // Raio de 150km para agrupamento de VIAGEM e mesma UF
          if (computeDistance(coordsCenter, coordsCand) <= 150 && candidate.uf === centerStore.uf) shouldGroup = true;
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

  const lojasVisiveisFiltradas = useMemo(() => {
    if (!filtroCarteira) return lojasVisiveisConsultor;
    const search = normalize(filtroCarteira);
    return lojasVisiveisConsultor.filter(l => 
      normalize(l.nome_pdv_novo || '').includes(search) || 
      normalize(l.cidade || '').includes(search) || 
      normalize(l.uf || '').includes(search)
    );
  }, [lojasVisiveisConsultor, filtroCarteira]);

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

  useEffect(() => {
    setSelectedCanais(new Set(opcoesCanais));
  }, [opcoesCanais]);

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
    return <PreviewRoteiro resultado={resultado} consultorInfo={consultorInfo} lojasBase={lojas} initialCenario={cenarioNome} onVoltar={() => setResultado(null)} />;
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
                <div className="flex items-center justify-between mb-3 gap-3 flex-wrap">
                  <p className="text-xs font-bold text-blue-800 uppercase flex items-center gap-2">
                    <Users className="w-4 h-4" /> Carteira de Lojas do Consultor ({selectedConsultor.split(' ')[0]}):
                  </p>
                  <div className="flex items-center gap-2 flex-1 md:flex-initial">
                    <input 
                      type="text" 
                      value={filtroCarteira} 
                      onChange={(e) => setFiltroCarteira(e.target.value)} 
                      placeholder="Buscar por loja, cidade ou UF..." 
                      className="px-2 py-1 text-[10px] border border-gray-300 rounded focus:ring-1 focus:ring-blue-500 outline-none w-full md:w-48 font-medium" 
                    />
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
                      className="text-[10px] whitespace-nowrap font-bold text-blue-600 bg-blue-100 hover:bg-blue-200 px-2 py-1 rounded transition-colors"
                    >
                      {lojasVisiveisConsultor.map(l => `${l.nome_pdv_novo}-${l.cidade}`).every(id => excludedLojasIds.has(id)) ? 'Selecionar Todas' : 'Desmarcar Todas'}
                    </button>
                  </div>
                </div>
                <div className="max-h-48 overflow-y-auto pr-2 grid grid-cols-1 md:grid-cols-2 gap-2 custom-scrollbar">
                  {lojasVisiveisFiltradas.map((loja, idx) => {
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

              {selectedRotasBase.length > 0 && (() => {
                const lojasRotas = lojas.filter(l => selectedRotasBase.map(r => normalize(r)).includes(normalize(l.consultor)));
                const ufsCobertura = Array.from(new Set(lojasRotas.map(l => l.uf?.toUpperCase().trim()).filter(Boolean))).sort();
                
                const lojasVisiveis = lojasRotas.filter(l => !ufFiltroCobertura || l.uf?.toUpperCase().trim() === ufFiltroCobertura.toUpperCase().trim());
                const allVisibleIds = lojasVisiveis.map(l => `${l.nome_pdv_novo}-${l.cidade}`);
                const someVisibleExcluded = allVisibleIds.some(id => !selectedCoberturaLojas.has(id));
                
                return (
                  <div className="mt-4 pt-4 border-t border-orange-200">
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 mb-3">
                      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                        <p className="text-xs font-bold text-orange-800 uppercase">Selecione as lojas das rotas cobertas para incluir:</p>
                        
                        {ufsCobertura.length > 1 && (
                          <div className="flex items-center gap-2 bg-orange-50 border border-orange-200 rounded-xl px-3 py-1 shadow-sm">
                            <span className="text-[10px] font-bold text-orange-700 uppercase">Filtrar por UF:</span>
                            <select
                              value={ufFiltroCobertura}
                              onChange={(e) => setUfFiltroCobertura(e.target.value)}
                              className="text-[11px] font-bold bg-white border border-orange-200 rounded-lg px-2 py-1 text-orange-800 focus:outline-none focus:ring-2 focus:ring-orange-500 cursor-pointer shadow-inner"
                            >
                              <option value="">Todos os Estados</option>
                              {ufsCobertura.map(uf => (
                                <option key={uf} value={uf}>{uf}</option>
                              ))}
                            </select>
                          </div>
                        )}
                      </div>

                      <button 
                        type="button"
                        onClick={() => {
                          const nextSet = new Set(selectedCoberturaLojas);
                          if (someVisibleExcluded) {
                            allVisibleIds.forEach(id => nextSet.add(id));
                          } else {
                            allVisibleIds.forEach(id => nextSet.delete(id));
                          }
                          setSelectedCoberturaLojas(nextSet);
                        }}
                        className="text-xs font-bold text-orange-700 bg-orange-100 hover:bg-orange-200 px-3 py-1.5 rounded-xl transition-all shadow-sm active:scale-95"
                      >
                        {someVisibleExcluded ? 'Selecionar Todas Visíveis' : 'Desmarcar Todas Visíveis'}
                      </button>
                    </div>
                    
                    <div className="max-h-48 overflow-y-auto pr-2 grid grid-cols-1 md:grid-cols-2 gap-2 custom-scrollbar">
                      {lojasVisiveis.map((loja, idx) => {
                        const lojaId = `${loja.nome_pdv_novo}-${loja.cidade}`;
                        const isSelected = selectedCoberturaLojas.has(lojaId);
                        const siglaLoja = ROTA_MAP[loja.consultor] || loja.consultor?.split(' ')[0] || '';
                        return (
                          <label key={idx} className={`flex items-center gap-2.5 p-2.5 rounded-xl border text-[11px] cursor-pointer transition-all ${isSelected ? 'bg-orange-50 border-orange-300 shadow-sm' : 'bg-white border-gray-100 opacity-70 hover:opacity-100 hover:border-orange-200'}`}>
                            <input 
                              type="checkbox" 
                              checked={isSelected}
                              onChange={(e) => {
                                const nextSet = new Set(selectedCoberturaLojas);
                                if (e.target.checked) nextSet.add(lojaId);
                                else nextSet.delete(lojaId);
                                setSelectedCoberturaLojas(nextSet);
                              }}
                              className="rounded text-orange-500 w-3.5 h-3.5"
                            />
                            <div className="flex-1 min-w-0">
                              <span className="font-semibold text-gray-800 block truncate">{loja.nome_pdv_novo}</span>
                              <span className="text-gray-400 font-medium block truncate mt-0.5">{loja.cidade} - {loja.uf} <span className="text-orange-500 font-bold ml-1">({siglaLoja})</span></span>
                            </div>
                          </label>
                        )
                      })}
                    </div>
                    {selectedCoberturaLojas.size === 0 && (
                       <p className="text-xs text-red-500 mt-2 font-medium">Nenhuma loja selecionada. A geração irá ignorar estas rotas.</p>
                    )}
                  </div>
                )
              })()}
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
                  <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
                    <p className="text-xs font-bold text-blue-600 uppercase tracking-widest flex items-center gap-2">
                      <CheckSquare className="w-3 h-3" /> Gestão Individual de Lojas por Pólo
                    </p>
                    <input 
                      type="text" 
                      value={filtroPolos} 
                      onChange={(e) => setFiltroPolos(e.target.value)} 
                      placeholder="Buscar por loja ou cidade..." 
                      className="px-2 py-1 text-[10px] border border-gray-200 rounded focus:ring-1 focus:ring-blue-400 outline-none w-full md:w-48 font-medium bg-white" 
                    />
                  </div>
                  <div className="space-y-4 max-h-[300px] overflow-y-auto pr-2 custom-scrollbar">
                    {polosViagem.filter(p => selectedPolos.has(p.nome)).map(polo => {
                      let lojasPolo = polo.lojas;
                      if (filtroPolos) {
                        const search = normalize(filtroPolos);
                        lojasPolo = lojasPolo.filter(l => 
                          normalize(l.nome_pdv_novo || '').includes(search) || 
                          normalize(l.cidade || '').includes(search)
                        );
                      }
                      if (lojasPolo.length === 0) return null;
                      
                      const allIds = lojasPolo.map(l => `${l.nome_pdv_novo}-${l.cidade}`);
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
                            {lojasPolo.map((loja, idx) => {
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
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-700">Status</label>
                <select value={selectedStatus} onChange={e => setSelectedStatus(e.target.value)} className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none bg-white text-sm">
                  <option value="">Todos</option>
                  <option value="ATENDIMENTO">Ativo (Atendimento)</option>
                  <option value="NÃO ATENDIMENTO">Não Atendimento</option>
                </select>
              </div>
              <CheckboxList title="Canal" options={opcoesCanais} selected={selectedCanais} onChange={setSelectedCanais} />
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
            canais={Array.from(selectedCanais)}
          />
        </div>
      </div>
    </div>
  );
}
