// Tipos compartilhados entre o algoritmo de geração e a UI
export interface LojaVisita {
  nome_pdv: string;
  cliente: string;
  endereco: string;
  cidade: string;
  uf: string;
  cluster: string;
  checkIn: string;
  checkOut: string;
  tipo: 'local' | 'viagem';
  estadoViagem?: string;
  lat?: number;
  lng?: number;
}

export interface RoteiroDia {
  data: string;
  diaSemana: string;
  feriado?: string;
  lojas: LojaVisita[];
  aviso?: string;
}

export interface ResultadoRoteiro {
  consultor: string;
  mes: number;
  ano: number;
  ufConsultor: string;
  totalLojas: number;
  totalDiasUteis: number;
  feriados: Record<string, string>;
  roteiro: RoteiroDia[];
}
