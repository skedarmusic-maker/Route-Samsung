'use client';

import { useEffect, useRef, useState } from 'react';
import { LojaVisita } from '@/lib/types';
import { Loader2, AlertCircle, Navigation } from 'lucide-react';
import { supabase } from '@/lib/supabase';

const COLORS = {
  home: '#1428A0',
  loja1: '#16A34A',
  loja2: '#EA580C',
  loja3: '#7C3AED',
  viagem: '#DC2626',
};

const storeCoordsCache: Record<string, { lat: number; lng: number }> = {};

interface Ponto {
  lat: number;
  lng: number;
  label: string;
  tipo: 'home' | 'loja';
  info: string;
  color: string;
}

interface Props {
  lojas: LojaVisita[];
  consultorEndereco: string;
  consultorCoords: { lat: number; lng: number };
  data: string;
  diaSemana: string;
  onDistanceCalculated?: (distance: number) => void;
  isManualFlight?: boolean;
}

function loadLeaflet(): Promise<any> {
  if (typeof window === 'undefined') return Promise.reject('SSR not supported');
  if ((window as any).L) return Promise.resolve((window as any).L);

  return new Promise((resolve, reject) => {
    if (!document.getElementById('leaflet-css')) {
      const link = document.createElement('link');
      link.id = 'leaflet-css';
      link.rel = 'stylesheet';
      link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
      document.head.appendChild(link);
    }

    if (!document.getElementById('leaflet-js')) {
      const script = document.createElement('script');
      script.id = 'leaflet-js';
      script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
      script.onload = () => resolve((window as any).L);
      script.onerror = (err) => reject(err);
      document.head.appendChild(script);
    } else {
      const interval = setInterval(() => {
        if ((window as any).L) {
          clearInterval(interval);
          resolve((window as any).L);
        }
      }, 50);
    }
  });
}

function computeDistance(p1: { lat: number; lng: number }, p2: { lat: number; lng: number }): number {
  const R = 6371;
  const dLat = ((p2.lat - p1.lat) * Math.PI) / 180;
  const dLng = ((p2.lng - p1.lng) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((p1.lat * Math.PI) / 180) *
      Math.cos((p2.lat * Math.PI) / 180) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

async function getStoreCoords(loja: LojaVisita): Promise<{ lat: number; lng: number } | null> {
  if (loja.lat && loja.lng) {
    return { lat: Number(loja.lat), lng: Number(loja.lng) };
  }

  const cacheKey = loja.nome_pdv || `${loja.cliente}_${loja.cidade}`;
  if (storeCoordsCache[cacheKey]) {
    return storeCoordsCache[cacheKey];
  }

  // Extrai o código da loja se existir (ex: "S04991" de "S04991 - CLIMA RIO...")
  const codeMatch = (loja.nome_pdv || '').match(/S\d{5}/i);
  const storeCode = codeMatch ? codeMatch[0] : null;

  try {
    const table = process.env.NEXT_PUBLIC_LOJAS_TABLE || 'lojas_julho';
    
    // 1. Busca por Código da Loja (S04991)
    if (storeCode) {
      const { data } = await supabase
        .from(table)
        .select('lat, lng')
        .ilike('nome_pdv', `%${storeCode}%`)
        .not('lat', 'is', null)
        .limit(1);

      if (data && data.length > 0 && data[0].lat && data[0].lng) {
        const coords = { lat: Number(data[0].lat), lng: Number(data[0].lng) };
        storeCoordsCache[cacheKey] = coords;
        return coords;
      }
    }

    // 2. Busca por nome_pdv exato
    if (loja.nome_pdv) {
      const { data } = await supabase
        .from(table)
        .select('lat, lng')
        .eq('nome_pdv', loja.nome_pdv)
        .not('lat', 'is', null)
        .limit(1);

      if (data && data.length > 0 && data[0].lat && data[0].lng) {
        const coords = { lat: Number(data[0].lat), lng: Number(data[0].lng) };
        storeCoordsCache[cacheKey] = coords;
        return coords;
      }
    }
  } catch (err) {
    console.warn('Erro ao buscar lat/lng no Supabase:', err);
  }

  // 3. Geocodificação Nominatim com cidade e UF para garantir a localização correta
  try {
    const addr = `${loja.cliente || loja.nome_pdv}, ${loja.cidade} - ${loja.uf}, Brasil`;
    const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(addr)}`);
    if (res.ok) {
      const items = await res.json();
      if (items && items.length > 0) {
        const coords = { lat: parseFloat(items[0].lat), lng: parseFloat(items[0].lon) };
        storeCoordsCache[cacheKey] = coords;
        return coords;
      }
    }
  } catch {}

  return null;
}

export default function MapPreview({ lojas, consultorEndereco, consultorCoords, data, diaSemana, onDistanceCalculated, isManualFlight }: Props) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const leafletMapInstance = useRef<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState('Carregando mapa...');

  const dataFormatada = (() => {
    const [y, m, d] = data.split('-').map(Number);
    return new Date(y, m - 1, d).toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' });
  })();

  useEffect(() => {
    let isMounted = true;

    async function initMap() {
      if (!mapContainerRef.current || lojas.length === 0) {
        setLoading(false);
        return;
      }

      try {
        setStatusMessage('Carregando mapa...');
        const L = await loadLeaflet();

        if (!isMounted) return;

        if (leafletMapInstance.current) {
          leafletMapInstance.current.remove();
          leafletMapInstance.current = null;
        }

        const map = L.map(mapContainerRef.current, {
          zoomControl: true,
          attributionControl: false
        }).setView([consultorCoords.lat, consultorCoords.lng], 11);

        leafletMapInstance.current = map;

        // OpenStreetMap Standard Tile Server (100% livre)
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          maxZoom: 19,
          attribution: '&copy; OpenStreetMap contributors',
        }).addTo(map);

        const lojasOrdenadas = [...lojas].sort((a, b) => {
          const tA = a.checkIn || '00:00';
          const tB = b.checkIn || '00:00';
          return tA.localeCompare(tB);
        });

        const pontos: Ponto[] = [];
        const bounds: [number, number][] = [];

        // Residência do Consultor
        pontos.push({
          lat: consultorCoords.lat,
          lng: consultorCoords.lng,
          label: '⌂',
          tipo: 'home',
          info: `<b>Residência do Consultor</b><br/>${consultorEndereco}`,
          color: COLORS.home,
        });
        bounds.push([consultorCoords.lat, consultorCoords.lng]);

        const lojaColors = [COLORS.loja1, COLORS.loja2, COLORS.loja3];

        for (let i = 0; i < lojasOrdenadas.length; i++) {
          const loja = lojasOrdenadas[i];
          if (!isMounted) return;

          setStatusMessage(`Localizando ${i + 1}/${lojasOrdenadas.length}: ${loja.cliente}...`);
          const coords = await getStoreCoords(loja);

          if (coords && coords.lat && coords.lng) {
            pontos.push({
              lat: coords.lat,
              lng: coords.lng,
              label: String(i + 1),
              tipo: 'loja',
              info: `<div style="font-family:sans-serif;max-width:220px;padding:4px;">
                <b style="font-size:13px;color:#111;">${loja.nome_pdv}</b><br/>
                <span style="color:#555;">${loja.cliente} · Cluster ${loja.cluster}</span><br/>
                <span style="color:#555;">📍 ${loja.cidade} - ${loja.uf}</span><br/>
                <span style="color:#1428A0;font-weight:bold;">🕐 ${loja.checkIn} → ${loja.checkOut}</span>
                ${loja.tipo === 'viagem' ? '<br/><span style="color:#DC2626;font-weight:bold;">✈️ Viagem</span>' : ''}
              </div>`,
              color: loja.tipo === 'viagem' ? COLORS.viagem : lojaColors[i % lojaColors.length],
            });
            bounds.push([coords.lat, coords.lng]);
          }
        }

        if (!isMounted) return;

        // Desenhar Marcadores
        for (const ponto of pontos) {
          const customIcon = L.divIcon({
            className: 'custom-leaflet-pin',
            html: `<div style="
              background-color: ${ponto.color};
              width: 28px;
              height: 28px;
              border-radius: 50%;
              border: 2.5px solid #ffffff;
              color: #ffffff;
              font-weight: bold;
              font-size: 13px;
              display: flex;
              align-items: center;
              justify-content: center;
              box-shadow: 0 2px 6px rgba(0,0,0,0.35);
              font-family: sans-serif;
            ">${ponto.label}</div>`,
            iconSize: [28, 28],
            iconAnchor: [14, 14],
            popupAnchor: [0, -14],
          });

          const marker = L.marker([ponto.lat, ponto.lng], { icon: customIcon }).addTo(map);
          marker.bindPopup(ponto.info);
        }

        if (bounds.length > 0) {
          map.fitBounds(bounds, { padding: [40, 40] });
        }

        // Desenhar a linha do trajeto (Polyline / OSRM)
        if (pontos.length > 1) {
          setStatusMessage('Traçando linha de trajeto...');
          const distToFirst = computeDistance(pontos[0], pontos[1]);
          const goesByPlane = isManualFlight || distToFirst > 350;

          let routePoints: { lat: number; lng: number }[] = [];
          if (goesByPlane) {
            routePoints = pontos.slice(1);
          } else {
            routePoints = [...pontos, pontos[0]];
          }

          const coordsString = routePoints.map(p => `${p.lng},${p.lat}`).join(';');

          let routeDrawn = false;
          try {
            const osrmRes = await fetch(`/api/osrm?coords=${encodeURIComponent(coordsString)}`);
            if (osrmRes.ok) {
              const osrmData = await osrmRes.json();
              if (osrmData.code === 'Ok' && osrmData.routes?.[0]) {
                const route = osrmData.routes[0];
                const latLngs = route.geometry.coordinates.map((c: [number, number]) => [c[1], c[0]]);

                L.polyline(latLngs, {
                  color: goesByPlane ? '#DC2626' : '#1428A0',
                  weight: 5,
                  opacity: 0.85,
                  lineJoin: 'round'
                }).addTo(map);

                routeDrawn = true;
                let totalRealDist = route.distance / 1000;
                if (goesByPlane) totalRealDist += 10;
                if (onDistanceCalculated) onDistanceCalculated(totalRealDist);
              }
            }
          } catch (e) {
            console.warn('Erro ao obter rota OSRM:', e);
          }

          // Se o OSRM falhar, desenha a linha conectando os pontos diretamente no mapa
          if (!routeDrawn) {
            const lineCoordinates: [number, number][] = routePoints.map(p => [p.lat, p.lng]);
            L.polyline(lineCoordinates, {
              color: goesByPlane ? '#DC2626' : '#1428A0',
              weight: 4,
              opacity: 0.8,
              dashArray: '6, 6'
            }).addTo(map);

            let dist = 0;
            for (let i = 0; i < routePoints.length - 1; i++) {
              dist += computeDistance(routePoints[i], routePoints[i + 1]);
            }
            if (onDistanceCalculated) onDistanceCalculated(dist * 1.25);
          }
        }

        setStatusMessage('');
        setLoading(false);
      } catch (err: any) {
        if (isMounted) {
          setError(`Erro ao carregar mapa: ${err.message || err}`);
          setLoading(false);
        }
      }
    }

    initMap();

    return () => {
      isMounted = false;
      if (leafletMapInstance.current) {
        leafletMapInstance.current.remove();
        leafletMapInstance.current = null;
      }
    };
  }, [lojas, consultorCoords, consultorEndereco, isManualFlight]);

  return (
    <div className="flex flex-col h-full">
      <div className="p-4 bg-gray-800 text-white rounded-t-xl">
        <p className="text-xs text-gray-400 uppercase tracking-widest">Mapa do Dia (OpenStreetMap)</p>
        <p className="font-semibold capitalize">{dataFormatada}</p>
        <div className="flex gap-4 mt-2 text-xs">
          <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-[#1428A0] inline-block" /> Residência</span>
          <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-[#16A34A] inline-block" /> 1ª Visita</span>
          <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-[#EA580C] inline-block" /> 2ª Visita</span>
        </div>
      </div>

      <div className="relative flex-1 min-h-[400px] rounded-b-xl overflow-hidden bg-gray-100">
        {(loading || statusMessage) && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-white/90 z-10 gap-3">
            <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
            <p className="text-sm text-gray-600 text-center px-4">{statusMessage || 'Carregando...'}</p>
          </div>
        )}

        {error && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-white z-10 gap-3 p-6">
            <AlertCircle className="w-8 h-8 text-red-500" />
            <p className="text-sm text-red-600 text-center">{error}</p>
            <button
              onClick={() => { window.location.reload(); }}
              className="text-xs text-blue-600 underline mt-2"
            >
              Tentar novamente
            </button>
          </div>
        )}

        {lojas.length === 0 && !loading && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-gray-400">
            <Navigation className="w-10 h-10" />
            <p className="text-sm">Selecione um dia com visitas para ver no mapa</p>
          </div>
        )}

        <div ref={mapContainerRef} className="w-full h-full min-h-[400px] z-0" />
      </div>
    </div>
  );
}
