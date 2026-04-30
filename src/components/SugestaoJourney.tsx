'use client';

import { useState, useMemo } from 'react';
import axios from 'axios';
import { MapPin, Navigation, Loader2, Users } from 'lucide-react';
import { Loja } from '@/lib/dataParser';

interface SugestaoJourneyProps {
  lojas: Loja[];
}

interface ConsultorDistancia {
  nome: string;
  endereco: string;
  distanciaKm: number;
  estimativaCusto: {
    total: number;
    voo: number;
    km: number;
    kmReferencia: number;
    hospedagem: number;
    tipo: 'Aéreo' | 'Terrestre';
    isRealPrice?: boolean;
  };
}

export default function SugestaoJourney({ lojas }: SugestaoJourneyProps) {
  const [selectedUF, setSelectedUF] = useState<string>('');
  const [selectedCidade, setSelectedCidade] = useState<string>('');
  const [sugestoes, setSugestoes] = useState<ConsultorDistancia[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Extrair UFs únicas
  const ufsUnicas = Array.from(
    new Set(lojas.filter(l => l.uf).map(l => l.uf))
  ).sort();

  // Extrair cidades filtradas por UF
  const cidadesFiltradas = useMemo(() => {
    if (!selectedUF) return [];
    return Array.from(
      new Set(lojas.filter(l => l.uf === selectedUF && l.cidade).map(l => l.cidade))
    ).sort();
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
                  <div className="flex justify-between text-xs">
                    <span className="text-gray-500">Distância Total:</span>
                    <span className="font-bold text-gray-700">{s.distanciaKm} km</span>
                  </div>
                  <div className="flex justify-between text-[11px]">
                    <span className="text-gray-400">
                      {s.estimativaCusto.tipo === 'Aéreo' ? '🚗 Deslocamento Local:' : '🚗 Deslocamento KM:'}
                    </span>
                    <span className="text-gray-600 font-medium">
                      R$ {s.estimativaCusto.km} ({s.estimativaCusto.kmReferencia}km)
                    </span>
                  </div>
                  {s.estimativaCusto.voo > 0 && (
                    <div className="flex justify-between text-[11px] font-medium items-center">
                      <span className="text-blue-600">✈️ Passagem Aérea:</span>
                      <div className="flex items-center gap-2">
                        {s.estimativaCusto.isRealPrice ? (
                          <span className="text-[9px] bg-green-100 text-green-700 px-1.5 py-0.5 rounded font-bold">GOOGLE FLIGHTS</span>
                        ) : (
                          <span className="text-[9px] bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded font-bold">ESTIMATIVA</span>
                        )}
                        <span className="text-blue-600">R$ {s.estimativaCusto.voo}</span>
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
                        <span className="text-amber-600">R$ {s.estimativaCusto.hospedagem}</span>
                      </div>
                    </div>
                  )}
                </div>

                <p className="text-[10px] text-gray-400 italic mb-1">Base: {s.endereco?.split(',')[1] || 'Cidade Base'}</p>
                
                {idx === 0 && (
                  <div className="mt-4 pt-3 border-t border-indigo-100 flex items-center justify-between">
                    <span className="text-[10px] font-bold text-indigo-500 uppercase tracking-widest">✨ Opção mais barata</span>
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
