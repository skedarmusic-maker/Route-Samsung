'use client';

import React, { useState, useEffect } from 'react';
import { Hotel, AlertTriangle, Check, Search, Calendar, MapPin, Star, ExternalLink } from 'lucide-react';

interface HotelSelectorProps {
  city: string;
  checkin: string;
  checkout: string;
  onSelectHotel: (price: number, hotelDetails: any) => void;
  onClose: () => void;
}

export default function HotelSelector({ city, checkin, checkout, onSelectHotel, onClose }: HotelSelectorProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hotels, setHotels] = useState<any[]>([]);
  const [selectedHotel, setSelectedHotel] = useState<any | null>(null);
  const [mockReason, setMockReason] = useState<string | null>(null);

  useEffect(() => {
    async function fetchHotels() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch('/api/hoteis', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ city, checkin, checkout }),
        });
        const data = await res.json();
        
        if (data.error) throw new Error(data.error);

        setHotels(data.hotels || []);
        setMockReason(data.mockReason || null);
      } catch (err: any) {
        setError(err.message || 'Falha ao obter hotéis');
      } finally {
        setLoading(false);
      }
    }

    if (city && checkin && checkout) {
      fetchHotels();
    }
  }, [city, checkin, checkout]);

  const handleConfirmSelection = () => {
    if (selectedHotel) {
      onSelectHotel(selectedHotel.price, selectedHotel);
    }
  };

  const nights = Math.ceil((new Date(checkout).getTime() - new Date(checkin).getTime()) / (1000 * 60 * 60 * 24));

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-xl shadow-2xl border border-gray-100 flex flex-col overflow-hidden max-h-[90vh]">
        
        {/* Header */}
        <div className="bg-[#1428A0] text-white p-5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Hotel className="w-6 h-6 animate-pulse" />
            <div>
              <h3 className="font-black text-lg">🏨 Hospedagem no Destino</h3>
              <p className="text-xs opacity-75 font-medium">Buscando as melhores ofertas em {city}</p>
            </div>
          </div>
          <button onClick={onClose} className="text-white/80 hover:text-white font-bold text-sm bg-white/10 hover:bg-white/20 px-3 py-1.5 rounded-xl transition-all">
            Cancelar
          </button>
        </div>

        {/* Info Period Bar */}
        <div className="bg-gray-50 px-6 py-4 border-b border-gray-200 flex items-center justify-between text-xs font-bold text-gray-700">
          <div className="flex items-center gap-2">
            <MapPin className="w-4 h-4 text-gray-400" />
            <span>{city}</span>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-1.5 bg-blue-50 border border-blue-100 text-blue-700 px-2 py-1 rounded-md">
              <Calendar className="w-3.5 h-3.5" />
              <span>{new Date(checkin).toLocaleDateString('pt-BR')} ➔ {new Date(checkout).toLocaleDateString('pt-BR')}</span>
            </div>
            <span className="text-gray-400 font-black uppercase tracking-tighter">{nights} {nights === 1 ? 'Diária' : 'Diárias'}</span>
          </div>
        </div>

        {/* Hotel Options Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {mockReason && (
            <div className="flex flex-col gap-1 bg-amber-50 border border-amber-200 p-3 rounded-xl text-[11px] text-amber-800 font-medium mb-2">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                <span>Usando dados simulados ou parciais.</span>
              </div>
              <p className="ml-6 text-[10px] opacity-75 font-bold">Motivo: {mockReason}</p>
            </div>
          )}

          {loading && (
            <div className="flex flex-col items-center justify-center py-12 space-y-3">
              <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-[#1428A0]" />
              <p className="text-xs font-bold text-gray-400 animate-pulse">Pesquisando hotéis disponíveis no Booking.com...</p>
            </div>
          )}

          {error && (
            <div className="flex items-center gap-2 bg-red-50 border border-red-200 p-4 rounded-xl text-xs text-red-700 font-medium">
              <AlertTriangle className="w-5 h-5 text-red-600 shrink-0" />
              <span>Erro: {error}</span>
            </div>
          )}

          {!loading && !error && hotels.length === 0 && (
            <div className="text-center py-12 text-gray-400">
              <Search className="w-12 h-12 mx-auto text-gray-200 mb-3" />
              <p className="text-sm font-bold">Nenhuma oferta de hotel encontrada para essa cidade e data.</p>
            </div>
          )}

          {!loading && !error && hotels.map((hotel) => {
            const isSelected = selectedHotel?.id === hotel.id;
            return (
              <div 
                key={hotel.id}
                onClick={() => setSelectedHotel(hotel)}
                className={`p-4 rounded-2xl border transition-all cursor-pointer flex gap-4 ${
                  isSelected 
                    ? 'border-[#1428A0] bg-blue-50/50 shadow-md ring-2 ring-blue-100' 
                    : 'border-gray-200 hover:border-blue-300 bg-white hover:shadow-sm'
                }`}
              >
                {hotel.imageUrl && (
                  <div className="w-20 h-20 rounded-xl overflow-hidden shrink-0 border border-gray-100 shadow-inner">
                    <img src={hotel.imageUrl} alt={hotel.name} className="w-full h-full object-cover" />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <h4 className="text-sm font-black text-gray-800 truncate leading-tight">{hotel.name}</h4>
                    {hotel.reviewScore && (
                      <div className="flex items-center gap-1 bg-green-100 text-green-700 px-1.5 py-0.5 rounded-md text-[10px] font-black shrink-0">
                        <Star className="w-2.5 h-2.5 fill-current" />
                        {hotel.reviewScore}
                      </div>
                    )}
                  </div>
                  <p className="text-[10px] text-gray-500 font-medium truncate mt-0.5 flex items-center gap-1">
                    <MapPin className="w-2.5 h-2.5" /> {hotel.address}
                  </p>
                  
                  <div className="mt-3 flex items-end justify-between">
                    <div className="text-[10px] text-gray-400 font-bold uppercase">
                      Min. total (est.)
                    </div>
                    <div className="text-right">
                      <p className="text-lg font-black text-gray-900 leading-none">
                        {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: hotel.currency || 'BRL' }).format(hotel.price)}
                      </p>
                      <span className="text-[9px] text-gray-400 font-black uppercase tracking-tighter">Total para {nights} {nights === 1 ? 'noite' : 'noites'}</span>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer actions */}
        <div className="p-4 border-t border-gray-100 bg-gray-50/50 flex justify-end">
          <button
            onClick={handleConfirmSelection}
            disabled={!selectedHotel}
            className={`flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-bold text-white transition-all shadow-md active:scale-95 ${
              selectedHotel 
                ? 'bg-[#1428A0] hover:bg-blue-800' 
                : 'bg-gray-300 cursor-not-allowed shadow-none'
            }`}
          >
            <Check className="w-4 h-4" /> Vincular Hospedagem
          </button>
        </div>

      </div>
    </div>
  );
}
