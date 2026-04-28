'use client';

import React, { useState, useEffect } from 'react';
import { Plane, AlertTriangle, Check, Search, Calendar, MapPin } from 'lucide-react';
import airports from '@/lib/airports.json';
import { normalize } from '@/lib/utils';

interface FlightSelectorProps {
  originCity: string;
  destinationCity: string;
  departureDate: string;
  onSelectFlight: (price: number, flightDetails: any) => void;
  onClose: () => void;
}

export default function FlightSelector({ originCity, destinationCity, departureDate, onSelectFlight, onClose }: FlightSelectorProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [flights, setFlights] = useState<any[]>([]);
  const [selectedFlight, setSelectedFlight] = useState<any | null>(null);
  const [isMock, setIsMock] = useState(false);

  // Mapear cidades para IATA
  const originIATA = (airports as Record<string, string>)[normalize(originCity)] || 'GRU';
  const destinationIATA = (airports as Record<string, string>)[normalize(destinationCity)] || 'SSA';

  useEffect(() => {
    async function fetchFlights() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/voos?origin=${originIATA}&destination=${destinationIATA}&date=${departureDate}`);
        const data = await res.json();
        
        if (data.error) throw new Error(data.error);

        setFlights(data.offers || []);
        setIsMock(data.isMock);
      } catch (err: any) {
        setError(err.message || 'Falha ao obter voos');
      } finally {
        setLoading(false);
      }
    }

    if (originIATA && destinationIATA && departureDate) {
      fetchFlights();
    }
  }, [originIATA, destinationIATA, departureDate]);

  const handleConfirmSelection = () => {
    if (selectedFlight) {
      onSelectFlight(selectedFlight.price, selectedFlight);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-xl shadow-2xl border border-gray-100 flex flex-col overflow-hidden max-h-[90vh]">
        
        {/* Header */}
        <div className="bg-[#1428A0] text-white p-5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Plane className="w-6 h-6 animate-pulse" />
            <div>
              <h3 className="font-black text-lg">Busca de Voos Inteligente</h3>
              <p className="text-xs text-blue-200 font-medium">Conectando aeroportos locais e regionais</p>
            </div>
          </div>
          <button onClick={onClose} className="text-white/80 hover:text-white font-bold text-sm bg-white/10 hover:bg-white/20 px-3 py-1.5 rounded-xl transition-all">
            Cancelar
          </button>
        </div>

        {/* Info Route Bar */}
        <div className="bg-gray-50 px-6 py-4 border-b border-gray-200 flex items-center justify-between text-xs font-bold text-gray-700">
          <div className="flex items-center gap-2">
            <MapPin className="w-4 h-4 text-gray-400" />
            <span>{originCity} (<span className="text-blue-600 font-extrabold">{originIATA}</span>)</span>
            <span className="text-gray-400">➔</span>
            <span>{destinationCity} (<span className="text-blue-600 font-extrabold">{destinationIATA}</span>)</span>
          </div>
          <div className="flex items-center gap-1.5 bg-blue-50 border border-blue-100 text-blue-700 px-2 py-1 rounded-md">
            <Calendar className="w-3.5 h-3.5" />
            <span>{departureDate}</span>
          </div>
        </div>

        {/* Flight Options Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {isMock && (
            <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 p-3 rounded-xl text-[11px] text-amber-800 font-medium mb-2">
              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
              <span>Usando ambiente de simulação. Verifique as chaves e cota da API de Voos em <code>.env.local</code> para obter dados reais.</span>
            </div>
          )}

          {loading && (
            <div className="flex flex-col items-center justify-center py-12 space-y-3">
              <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-[#1428A0]" />
              <p className="text-xs font-bold text-gray-400 animate-pulse">Pesquisando opções aéreas disponíveis...</p>
            </div>
          )}

          {error && (
            <div className="flex items-center gap-2 bg-red-50 border border-red-200 p-4 rounded-xl text-xs text-red-700 font-medium">
              <AlertTriangle className="w-5 h-5 text-red-600 shrink-0" />
              <span>Erro ao pesquisar voos: {error}</span>
            </div>
          )}

          {!loading && !error && flights.length === 0 && (
            <div className="text-center py-12 text-gray-400">
              <Search className="w-12 h-12 mx-auto text-gray-200 mb-3" />
              <p className="text-sm font-bold">Nenhuma oferta encontrada para essa rota e data.</p>
              <p className="text-xs mt-1">Experimente outra data ou verifique os códigos dos aeroportos.</p>
            </div>
          )}

          {!loading && !error && flights.map((flight) => {
            const isSelected = selectedFlight?.id === flight.id;
            return (
              <div 
                key={flight.id}
                onClick={() => setSelectedFlight(flight)}
                className={`p-4 rounded-2xl border transition-all cursor-pointer flex items-center justify-between ${
                  isSelected 
                    ? 'border-[#1428A0] bg-blue-50/50 shadow-md ring-2 ring-blue-100' 
                    : 'border-gray-200 hover:border-blue-300 bg-white hover:shadow-sm'
                }`}
              >
                <div className="flex items-center gap-4">
                  <div className={`p-3 rounded-xl ${isSelected ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600'}`}>
                    <Plane className="w-5 h-5" />
                  </div>
                  <div>
                    <p className="text-sm font-black text-gray-800">{flight.airline}</p>
                    <p className="text-[11px] text-gray-500 font-medium">{flight.flightNumber} • {flight.stops === 0 ? 'Voo Direto' : `${flight.stops} parada`}</p>
                    <div className="flex items-center gap-2 mt-1.5">
                      <span className="text-xs font-black text-gray-700">{flight.departureTime}</span>
                      <span className="text-[10px] text-gray-400">➔</span>
                      <span className="text-xs font-black text-gray-700">{flight.arrivalTime}</span>
                      <span className="text-[10px] text-gray-400">({flight.duration})</span>
                    </div>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-base font-black text-gray-900">
                    {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(flight.price)}
                  </p>
                  <span className="text-[9px] text-gray-400 uppercase font-black">Por Adulto</span>
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer actions */}
        <div className="p-4 border-t border-gray-100 bg-gray-50/50 flex justify-end">
          <button
            onClick={handleConfirmSelection}
            disabled={!selectedFlight}
            className={`flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-bold text-white transition-all shadow-md active:scale-95 ${
              selectedFlight 
                ? 'bg-[#1428A0] hover:bg-blue-800' 
                : 'bg-gray-300 cursor-not-allowed shadow-none'
            }`}
          >
            <Check className="w-4 h-4" /> Vincular ao Itinerário
          </button>
        </div>

      </div>
    </div>
  );
}
