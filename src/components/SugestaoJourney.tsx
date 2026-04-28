'use client';

import { useState } from 'react';
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
}

export default function SugestaoJourney({ lojas }: SugestaoJourneyProps) {
  const [selectedCidade, setSelectedCidade] = useState<string>('');
  const [sugestoes, setSugestoes] = useState<ConsultorDistancia[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Extrair cidades únicas para o select
  const cidadesUnicas = Array.from(
    new Set(lojas.filter(l => l.cidade && l.uf).map(l => `${l.cidade}-${l.uf}`))
  ).sort();

  const handleBuscar = async () => {
    if (!selectedCidade) return;
    setLoading(true);
    setError('');
    setSugestoes([]);

    const [cidade, uf] = selectedCidade.split('-');

    try {
      const res = await axios.get(`/api/sugestao?cidade=${encodeURIComponent(cidade)}&uf=${encodeURIComponent(uf)}`);
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
          Descubra qual consultor é o mais eficiente (menor distância) para atender uma região específica.
        </p>
      </div>

      <div className="flex flex-col md:flex-row gap-4 items-end">
        <div className="flex-1 w-full space-y-2">
          <label className="text-sm font-medium text-gray-700 flex items-center gap-2">
            <MapPin className="w-4 h-4" /> Selecione a Cidade/Região
          </label>
          <select 
            value={selectedCidade} 
            onChange={e => setSelectedCidade(e.target.value)} 
            className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none bg-white"
          >
            <option value="">Escolha uma cidade...</option>
            {cidadesUnicas.map(c => (
              <option key={c} value={c}>{c.replace('-', ' - ')}</option>
            ))}
          </select>
        </div>
        <button 
          onClick={handleBuscar}
          disabled={!selectedCidade || loading}
          className="px-6 py-3 bg-indigo-600 text-white font-semibold rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center gap-2 shadow-sm"
        >
          {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Analisar Consultores'}
        </button>
      </div>

      {error && <p className="text-red-600 text-sm mt-4">{error}</p>}

      {sugestoes.length > 0 && (
        <div className="mt-6 space-y-4">
          <h3 className="text-sm font-bold text-gray-700 flex items-center gap-2 border-b pb-2">
            <Users className="w-4 h-4" /> Top Consultores Recomendados
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {sugestoes.map((s, idx) => (
              <div key={s.nome} className={`p-4 rounded-xl border ${idx === 0 ? 'bg-indigo-50 border-indigo-200 shadow-sm' : 'bg-gray-50 border-gray-100'}`}>
                <div className="flex justify-between items-start mb-2">
                  <span className={`font-bold ${idx === 0 ? 'text-indigo-800' : 'text-gray-800'}`}>
                    {idx + 1}º {s.nome}
                  </span>
                  <span className={`text-xs font-bold px-2 py-1 rounded-full ${idx === 0 ? 'bg-indigo-200 text-indigo-900' : 'bg-gray-200 text-gray-700'}`}>
                    {s.distanciaKm} km
                  </span>
                </div>
                <p className="text-xs text-gray-500 line-clamp-2" title={s.endereco}>{s.endereco}</p>
                {idx === 0 && (
                  <p className="text-[10px] font-semibold text-indigo-600 mt-3 uppercase tracking-wider">
                    ✨ Maior Eficiência
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
