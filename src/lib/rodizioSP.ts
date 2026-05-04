/**
 * Módulo para lidar com as restrições de Rodízio de Veículos em São Paulo
 * Define o polígono do Centro Expandido (Minianel Viário) e a função de checagem.
 */

// Polígono aproximado do Centro Expandido (Marginal Tietê, Marginal Pinheiros, Bandeirantes, Salim Farah Maluf)
export const CENTRO_EXPANDIDO_POLYGON = [
  { lat: -23.523589, lng: -46.744186 }, // Cebolão (Marginal Pinheiros com Tietê)
  { lat: -23.512684, lng: -46.634685 }, // Marginal Tietê perto do Anhembi
  { lat: -23.523823, lng: -46.571449 }, // Marginal Tietê com Salim Farah Maluf
  { lat: -23.584347, lng: -46.579124 }, // Salim com Anhaia Melo
  { lat: -23.606253, lng: -46.602641 }, // Juntas Provisórias
  { lat: -23.626884, lng: -46.636029 }, // Bandeirantes com Imigrantes
  { lat: -23.593649, lng: -46.724738 }, // Bandeirantes com Marginal Pinheiros
];

/**
 * Verifica se uma coordenada (lat, lng) está dentro do polígono do Centro Expandido de SP
 * Usando o algoritmo de Ray-Casting.
 */
export function isInsideRodizio(lat: number, lng: number): boolean {
  let isInside = false;
  const poly = CENTRO_EXPANDIDO_POLYGON;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i].lat, yi = poly[i].lng;
    const xj = poly[j].lat, yj = poly[j].lng;

    const intersect = ((yi > lng) !== (yj > lng))
        && (lat < (xj - xi) * (lng - yi) / (yj - yi) + xi);
    if (intersect) isInside = !isInside;
  }
  return isInside;
}

/**
 * Mapeamento dos dias de rodízio por consultor
 * A chave é o nome exato (normalizado) do consultor
 * O valor é o dia da semana retornado pelo Javascript Date.getDay() 
 * 0 = Domingo, 1 = Segunda, 2 = Terça, 3 = Quarta, 4 = Quinta, 5 = Sexta, 6 = Sábado
 */
export const RODIZIO_CONSULTORES: Record<string, number> = {
  "LIEDY AQUINO GOMES DOS SANTOS": 4, // Quinta-feira
};

/**
 * Normaliza o nome do consultor para buscar no mapa
 */
export function getRodizioDayForConsultor(nome: string): number | null {
  const normalizedNome = nome.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().trim();
  if (normalizedNome in RODIZIO_CONSULTORES) {
    return RODIZIO_CONSULTORES[normalizedNome];
  }
  return null;
}
