'use client';

import { useEffect, useRef, useState } from 'react';
import { setOptions, importLibrary } from '@googlemaps/js-api-loader';
import { LojaVisita } from '@/lib/types';
import { Loader2, AlertCircle, Navigation } from 'lucide-react';

const GOOGLE_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY!;

const COLORS = {
  home: '#1428A0',
  loja1: '#16A34A',
  loja2: '#EA580C',
  loja3: '#7C3AED',
  viagem: '#DC2626',
};

// ─────────────────────────────────────────────────────────
// Singleton: Garante que a API do Google Maps seja carregada
// UMA ÚNICA VEZ para todo o ciclo de vida da aplicação.
// Isso evita o erro intermitente ao trocar de dia rapidamente.
// ─────────────────────────────────────────────────────────
let mapsApiPromise: Promise<void> | null = null;

function loadMapsApi(): Promise<void> {
  if (!mapsApiPromise) {
    mapsApiPromise = (async () => {
      setOptions({ key: GOOGLE_KEY });
      await importLibrary('maps');
      await importLibrary('marker');
    })();
  }
  return mapsApiPromise;
}

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
}

async function geocodeAddress(address: string): Promise<{ lat: number; lng: number } | null> {
  try {
    const res = await fetch(`/api/geocode?address=${encodeURIComponent(address)}`);
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
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

export default function MapPreview({ lojas, consultorEndereco, consultorCoords, data, diaSemana, onDistanceCalculated }: Props) {
  const mapRef = useRef<HTMLDivElement>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [geocodingStatus, setGeocodingStatus] = useState('Carregando mapa...');

  const dataFormatada = (() => {
    const [y, m, d] = data.split('-').map(Number);
    return new Date(y, m - 1, d).toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' });
  })();

  useEffect(() => {
    let isMounted = true;
    const markersRef: google.maps.Marker[] = [];

    async function initMap() {
      if (!mapRef.current || lojas.length === 0) {
        setLoading(false);
        return;
      }

      try {
        setGeocodingStatus('Carregando Google Maps...');

        // Aguarda o singleton — nunca chama setOptions duas vezes
        await loadMapsApi();

        if (!isMounted) return;

        const map = new google.maps.Map(mapRef.current!, {
          center: consultorCoords,
          zoom: 10,
          mapTypeId: 'roadmap',
          styles: [
            { featureType: 'poi', stylers: [{ visibility: 'off' }] },
            { featureType: 'transit', stylers: [{ visibility: 'off' }] },
          ],
          zoomControl: true,
          streetViewControl: false,
          fullscreenControl: true,
        });

        const bounds = new google.maps.LatLngBounds();
        const pontos: Ponto[] = [];

        // Residência
        pontos.push({
          lat: consultorCoords.lat,
          lng: consultorCoords.lng,
          label: '⌂',
          tipo: 'home',
          info: `<b>Residência do Consultor</b><br/>${consultorEndereco}`,
          color: COLORS.home,
        });
        bounds.extend(consultorCoords);

        // Geocodificar lojas
        const lojaColors = [COLORS.loja1, COLORS.loja2, COLORS.loja3];
        for (let i = 0; i < lojas.length; i++) {
          const loja = lojas[i];
          if (!isMounted) return;

          setGeocodingStatus(`Localizando ${i + 1}/${lojas.length}: ${loja.cliente}...`);

          const addr = loja.endereco
            ? `${loja.endereco}, ${loja.cidade} - ${loja.uf}, Brasil`
            : `${loja.nome_pdv}, ${loja.cidade} - ${loja.uf}, Brasil`;

          const coords = await geocodeAddress(addr);
          if (!coords || !isMounted) continue;

          pontos.push({
            lat: coords.lat,
            lng: coords.lng,
            label: String(i + 1),
            tipo: 'loja',
            info: `<div style="font-family:sans-serif;max-width:220px;">
              <b style="font-size:13px;">${loja.nome_pdv}</b><br/>
              <span style="color:#666;">${loja.cliente} · Cluster ${loja.cluster}</span><br/>
              <span style="color:#666;">📍 ${loja.cidade} - ${loja.uf}</span><br/>
              <span style="color:#1428A0;">🕐 ${loja.checkIn} → ${loja.checkOut}</span>
              ${loja.tipo === 'viagem' ? '<br/><span style="color:#DC2626;">✈️ Viagem</span>' : ''}
            </div>`,
            color: loja.tipo === 'viagem' ? COLORS.viagem : lojaColors[i % lojaColors.length],
          });
          bounds.extend(coords);
        }

        if (!isMounted) return;

        // Marcadores
        const infoWindow = new google.maps.InfoWindow();
        for (const ponto of pontos) {
          const isHome = ponto.tipo === 'home';
          const marker = new google.maps.Marker({
            position: { lat: ponto.lat, lng: ponto.lng },
            map,
            icon: {
              path: google.maps.SymbolPath.CIRCLE,
              fillColor: ponto.color,
              fillOpacity: 1,
              strokeColor: '#fff',
              strokeWeight: 2.5,
              scale: isHome ? 14 : 12,
            },
            label: { text: ponto.label, color: '#fff', fontSize: '12px', fontWeight: 'bold' },
          });
          markersRef.push(marker);
          marker.addListener('click', () => {
            infoWindow.setContent(ponto.info);
            infoWindow.open(map, marker);
          });
        }

        // 5. Obter Distância Real e Rota via Google APIs
        if (pontos.length > 1) {
          const distToFirst = computeDistance(pontos[0], pontos[1]);
          const goesByPlane = distToFirst > 350;

          const directionsService = new google.maps.DirectionsService();
          const directionsRenderer = new google.maps.DirectionsRenderer({
            map,
            suppressMarkers: true,
            polylineOptions: {
              strokeColor: goesByPlane ? '#DC2626' : '#1428A0', // Vermelho para vôo, azul para carro
              strokeOpacity: 0.8,
              strokeWeight: 4
            }
          });

          let origin: google.maps.LatLng;
          let destination: google.maps.LatLng;
          let waypoints: google.maps.DirectionsWaypoint[] = [];

          if (goesByPlane) {
            // Se for avião, a rota é entre a primeira e a última loja
            origin = new google.maps.LatLng(pontos[1].lat, pontos[1].lng);
            destination = new google.maps.LatLng(pontos[pontos.length - 1].lat, pontos[pontos.length - 1].lng);
            if (pontos.length > 3) {
              waypoints = pontos.slice(2, -1).map(p => ({
                location: new google.maps.LatLng(p.lat, p.lng),
                stopover: true
              }));
            }
          } else {
            // Rota padrão (carro): Casa -> Lojas -> Casa
            origin = new google.maps.LatLng(pontos[0].lat, pontos[0].lng);
            destination = origin;
            waypoints = pontos.slice(1).map(p => ({
              location: new google.maps.LatLng(p.lat, p.lng),
              stopover: true
            }));
          }

          directionsService.route({
            origin,
            destination,
            waypoints,
            travelMode: google.maps.TravelMode.DRIVING,
            optimizeWaypoints: false
          }, (result, status) => {
            if (status === google.maps.DirectionsStatus.OK && result) {
              directionsRenderer.setDirections(result);
              
              // Calcular distância total real somando as pernas (legs)
              let totalRealDist = 0;
              result.routes[0].legs.forEach(leg => {
                if (leg.distance) totalRealDist += leg.distance.value;
              });
              
              if (onDistanceCalculated) {
                onDistanceCalculated(totalRealDist / 1000); // Converte metros para KM
              }
            } else {
              // Fallback para Polyline e Haversine se a Directions API falhar
              console.warn('Directions API falhou, usando fallback matemático:', status);
              new google.maps.Polyline({
                path: pontos.map(p => ({ lat: p.lat, lng: p.lng })),
                geodesic: true,
                strokeColor: '#1428A0',
                strokeOpacity: 0.7,
                strokeWeight: 3,
                map,
              });

              let dist = 0;
              if (goesByPlane) {
                // Apenas entre as lojas
                for (let i = 1; i < pontos.length - 1; i++) dist += computeDistance(pontos[i], pontos[i + 1]);
              } else {
                for (let i = 0; i < pontos.length - 1; i++) dist += computeDistance(pontos[i], pontos[i + 1]);
                dist += computeDistance(pontos[pontos.length - 1], pontos[0]);
              }
              if (onDistanceCalculated) onDistanceCalculated(dist * 1.3);
            }
          });
        }

        setGeocodingStatus('');
        setLoading(false);
      } catch (e: any) {
        if (isMounted) {
          setError(`Erro ao carregar mapa: ${e.message}`);
          setLoading(false);
        }
      }
    }

    initMap();

    return () => {
      isMounted = false;
      markersRef.forEach(m => m.setMap(null));
    };
  }, [lojas, consultorCoords, consultorEndereco]);

  return (
    <div className="flex flex-col h-full">
      <div className="p-4 bg-gray-800 text-white rounded-t-xl">
        <p className="text-xs text-gray-400 uppercase tracking-widest">Mapa do Dia</p>
        <p className="font-semibold capitalize">{dataFormatada}</p>
        <div className="flex gap-4 mt-2 text-xs">
          <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-[#1428A0] inline-block" /> Residência</span>
          <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-[#16A34A] inline-block" /> 1ª Visita</span>
          <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-[#EA580C] inline-block" /> 2ª Visita</span>
        </div>
      </div>

      <div className="relative flex-1 min-h-[400px] rounded-b-xl overflow-hidden bg-gray-100">
        {(loading || geocodingStatus) && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-white/90 z-10 gap-3">
            <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
            <p className="text-sm text-gray-600 text-center px-4">{geocodingStatus || 'Carregando...'}</p>
          </div>
        )}

        {error && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-white z-10 gap-3 p-6">
            <AlertCircle className="w-8 h-8 text-red-500" />
            <p className="text-sm text-red-600 text-center">{error}</p>
            <button
              onClick={() => { mapsApiPromise = null; window.location.reload(); }}
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

        <div ref={mapRef} className="w-full h-full min-h-[400px]" />
      </div>
    </div>
  );
}
