'use client';

import React, { useState, useMemo } from 'react';
import axios from 'axios';
import { Navigation, Loader2, Users } from 'lucide-react';
import { Loja } from '@/lib/dataParser';
import cityCoords from '@/lib/city_coords.json';

interface SugestaoJourneyProps {
  lojas?: Loja[];
}

interface ConsultorSugestao {
  nome: string;
  endereco: string;
  distanciaKm: number;
  durationHours?: number;
  aeroportoOrigem?: string;
  aeroportoDestino?: string;
  estimativaCusto: {
    total: number;
    voo: number;
    km: number;
    kmReferencia: number;
    kmDetalhe?: string;
    hospedagem: number;
    tipo: 'Aéreo' | 'Terrestre';
    isRealPrice: boolean;
    sourceVoo?: string;
    iataRoute?: string;
    isRealHotel?: boolean;
    isRoad?: boolean;
  };
}

export default function SugestaoJourney({ lojas = [] }: SugestaoJourneyProps) {
  const [selectedUF, setSelectedUF] = useState<string>('');
  const [selectedCidade, setSelectedCidade] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);
  const [sugestoes, setSugestoes] = useState<ConsultorSugestao[]>([]);
  const [error, setError] = useState<string>('');

  // Extrair UFs únicas
  const ufsUnicas = useMemo(() => {
    if (lojas && lojas.length > 0) {
      const ufs = new Set<string>();
      lojas.forEach(l => {
        if (l.uf) ufs.add(l.uf.toUpperCase().trim());
      });
      return Array.from(ufs).sort();
    }
    const ufs = new Set<string>();
    Object.keys(cityCoords).forEach(key => {
      const parts = key.split('-');
      if (parts.length === 2 && parts[1]) {
        ufs.add(parts[1].toUpperCase().trim());
      }
    });
    return Array.from(ufs).sort();
  }, [lojas]);

  // Filtrar cidades com base na UF selecionada
  const cidadesFiltradas = useMemo(() => {
    if (!selectedUF) return [];
    if (lojas && lojas.length > 0) {
      const cidades = new Set<string>();
      lojas.forEach(l => {
        if (l.uf && l.uf.toUpperCase().trim() === selectedUF.toUpperCase().trim() && l.cidade) {
          cidades.add(l.cidade.trim());
        }
      });
      return Array.from(cidades).sort();
    }
    const cidades: string[] = [];
    Object.keys(cityCoords).forEach(key => {
      const parts = key.split('-');
      if (parts.length === 2 && parts[1].toUpperCase().trim() === selectedUF.toUpperCase().trim()) {
        cidades.push(parts[0].trim());
      }
    });
    return cidades.sort();
  }, [selectedUF, lojas]);

  const handleBuscar = async () => {
    if (!selectedCidade || !selectedUF) return;
    setLoading(true);
    setError('');
    setSugestoes([]);

    try {
      const res = await axios.get(`/api/sugestao?cidade=${encodeURIComponent(selectedCidade)}&uf=${encodeURIComponent(selectedUF)}`);
      setSugestoes(res.data);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Erro ao buscar sugestões.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200 mt-8">
      <div className="mb-6">
        <h2 className="text-xl font-semibold flex items-center gap-2 text-indigo-900">
          <Navigation className="w-5 h-5 text-indigo-600" /> Otimizador de Journey
        </h2>
        <p className="text-sm text-gray-500 mt-1">
          Analise o custo-benefício real integrando KM, voos e diárias estimadas.
        </p>
      </div>

      <div className="flex flex-col md:flex-row gap-4 items-end bg-indigo-50/50 p-4 rounded-xl border border-indigo-100/50">
        <div className="w-full md:w-32 space-y-2">
          <label className="text-xs font-bold text-indigo-900/60 uppercase tracking-wider flex items-center gap-2">
            Estado (UF)
          </label>
          <select
            value={selectedUF}
            onChange={e => { setSelectedUF(e.target.value); setSelectedCidade(''); }}
            className="w-full p-2.5 border border-indigo-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none bg-white text-sm font-medium"
          >
            <option value="">UF</option>
            {ufsUnicas.map(uf => (
              <option key={uf} value={uf}>{uf}</option>
            ))}
          </select>
        </div>

        <div className="flex-1 w-full space-y-2">
          <label className="text-xs font-bold text-indigo-900/60 uppercase tracking-wider flex items-center gap-2">
            Cidade / Região
          </label>
          <select
            value={selectedCidade}
            onChange={e => setSelectedCidade(e.target.value)}
            disabled={!selectedUF}
            className="w-full p-2.5 border border-indigo-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none bg-white text-sm font-medium disabled:opacity-50"
          >
            <option value="">{selectedUF ? 'Escolha uma cidade...' : 'Selecione a UF primeiro'}</option>
            {cidadesFiltradas.map(c => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>

        <button
          onClick={handleBuscar}
          disabled={!selectedCidade || loading}
          className="w-full md:w-auto px-8 py-2.5 bg-indigo-600 text-white font-bold rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2 shadow-md shadow-indigo-200"
        >
          {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Analisar'}
        </button>
      </div>

      {error && <p className="text-red-600 text-sm mt-4 font-medium">⚠️ {error}</p>}

      {sugestoes.length > 0 && (
        <div className="mt-8 space-y-4">
          <h3 className="text-sm font-bold text-gray-700 flex items-center gap-2 border-b pb-2">
            <Users className="w-4 h-4" /> Top Consultores por Custo-Benefício
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {sugestoes.map((s, idx) => (
              <div key={s.nome} className={`p-5 rounded-2xl border transition-all ${idx === 0 ? 'bg-indigo-50 border-indigo-200 shadow-md ring-1 ring-indigo-200' : 'bg-gray-50 border-gray-100 hover:bg-white hover:shadow-sm'}`}>
                <div className="flex justify-between items-start mb-3">
                  <div className="min-w-0">
                    <span className={`text-xs font-bold uppercase tracking-wider ${idx === 0 ? 'text-indigo-600' : 'text-gray-400'}`}>
                      {idx + 1}º Recomendado
                    </span>
                    <h4 className={`font-bold text-lg truncate ${idx === 0 ? 'text-indigo-900' : 'text-gray-800'}`}>
                      {s.nome}
                    </h4>
                  </div>
                  <div className="text-right shrink-0">
                    <p className={`text-xl font-black ${idx === 0 ? 'text-indigo-700' : 'text-gray-700'}`}>
                      R$ {s.estimativaCusto.total}
                    </p>
                    <p className="text-[10px] text-gray-500 font-medium">ESTIMATIVA TOTAL</p>
                  </div>
                </div>

                <div className="space-y-2 mb-4 bg-white/50 rounded-xl p-3 border border-white/50">
                  <div className="flex justify-between text-xs items-center">
                    <span className="text-gray-500">Distância Total:</span>
                    <span className="font-bold text-gray-700">
                      {s.distanciaKm} km {s.estimativaCusto.isRoad ? <span className="text-[10px] font-normal text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded border border-blue-100">Rodoviário</span> : ''}
                    </span>
                  </div>
                  <div className="flex justify-between text-[11px]">
                    <span className="text-gray-400">
                      {s.estimativaCusto.tipo === 'Aéreo' ? '🚗 Deslocamento / Traslado:' : '🚗 Deslocamento KM:'}
                    </span>
                    <span className="text-gray-600 font-medium">
                      R$ {s.estimativaCusto.km} ({s.estimativaCusto.kmReferencia}km {s.estimativaCusto.kmDetalhe ? `· ${s.estimativaCusto.kmDetalhe}` : ''})
                    </span>
                  </div>
                  {s.estimativaCusto.voo > 0 && (
                    <div className="flex justify-between text-[11px] font-medium items-center">
                      <span className="text-blue-600">✈️ Passagem Aérea:</span>
                      <div className="flex items-center gap-1.5">
                        <span className={`text-[9px] px-1.5 py-0.5 rounded font-bold uppercase ${s.estimativaCusto.isRealPrice ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'}`}>
                          {s.estimativaCusto.sourceVoo || (s.estimativaCusto.isRealPrice ? 'GOOGLE FLIGHTS' : 'ESTIMATIVA')}
                        </span>
                        <span className="text-blue-600 font-bold">R$ {s.estimativaCusto.voo}</span>
                      </div>
                    </div>
                  )}
                  {s.estimativaCusto.hospedagem > 0 && (
                    <div className="flex justify-between text-[11px] font-medium items-center">
                      <span className="text-amber-600">🏨 Hospedagem/Diária:</span>
                      <div className="flex items-center gap-1.5">
                        {s.estimativaCusto.isRealHotel && (
                          <span className="bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded text-[8px] font-black tracking-tighter">
                            BOOKING.COM
                          </span>
                        )}
                        <span className="text-amber-600 font-medium">R$ {s.estimativaCusto.hospedagem}</span>
                      </div>
                    </div>
                  )}
                </div>

                <div className="space-y-1">
                  <p className="text-[10px] text-gray-500 font-medium flex items-center justify-between">
                    <span>📍 Base: <span className="text-gray-700 font-bold">{s.endereco || 'Cidade Base'}</span></span>
                    {s.aeroportoOrigem && (
                      <span className="text-[9px] font-medium text-indigo-600 bg-indigo-50 px-1.5 py-0.5 rounded border border-indigo-100">
                        🛫 {s.aeroportoOrigem}
                      </span>
                    )}
                  </p>
                </div>

                {idx === 0 && (
                  <div className="mt-4 pt-3 border-t border-indigo-100 flex items-center justify-between">
                    <span className="text-[10px] font-bold text-indigo-500 uppercase tracking-widest">🏆 Opção mais barata</span>
                    <div className="w-2 h-2 rounded-full bg-indigo-500 animate-pulse"></div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
