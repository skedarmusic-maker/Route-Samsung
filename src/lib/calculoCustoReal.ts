import benchmark360 from './benchmark_custos_real_360.json';
import { normalize } from './utils';

export interface CustoRealBreakdown {
  kmCost: number;
  pedagioCost: number;
  estacionamentoCost: number;
  refeicoesCost: number;
  hospedagemCost: number;
  passagensCost: number;
  totalEstimadoReal: number;
  totalVisitas: number;
  custoMedioPorVisita: number;
  historicoConsultor: {
    visitasCheckin: number;
    custoMedioVisitaVexx: number;
    kmMedioVisitaVexx: number;
    valorTotalVexxAno: number;
  } | null;
  diferencaVsHistorico: number;
  economiaProjetada: boolean;
  detalhesDias: Array<{
    data: string;
    cidade: string;
    isViagemOuBateVolta: boolean;
    tipoDeslocamento: 'Local' | 'Bate-e-Volta' | 'Viagem Terrestre' | 'Aéreo';
    custoDia: number;
  }>;
}

// Capitais/Bases fixas dos consultores
const BASE_CONSULTORES: Record<string, { cidade: string; uf: string }> = {
  'LUIZ FALCAO DE SOUZA NETO': { cidade: 'Recife', uf: 'PE' },
  'LIEDY AQUINO GOMES DOS SANTOS': { cidade: 'São Paulo', uf: 'SP' },
  'GIOVANNA OLIVEIRA MENDES': { cidade: 'São Paulo', uf: 'SP' },
  'DIOGO DO NASCIMENTO SANTOS': { cidade: 'Rio de Janeiro', uf: 'RJ' },
  'MARCIO JOSE FLORES PEREIRA': { cidade: 'Curitiba', uf: 'PR' },
  'TATIANE SOUZA DOS SANTOS': { cidade: 'Salvador', uf: 'BA' },
  'ALEXANDRE RIBEIRO LIMA': { cidade: 'São Paulo', uf: 'SP' },
  'PAULO SERGIO MARQUES DA SILVA': { cidade: 'Brasília', uf: 'DF' },
  'MAURICIO CERONI RANDO': { cidade: 'São Paulo', uf: 'SP' },
  'BIBIANO RODRIGUES NETO': { cidade: 'Recife', uf: 'PE' }
};

export function calcularCustoRealEstimado(
  nomeConsultor: string,
  roteiro: any[],
  totalEstimatedKM: number,
  chosenFlights: Record<string, any> = {},
  chosenHotels: Record<string, any> = {},
  manualFlights: Record<string, boolean> = {}
): CustoRealBreakdown {
  const cNorm = normalize(nomeConsultor || '');
  
  // Buscar histórico do consultor no benchmark 360
  const consultoresBench = (benchmark360 as any).consultores || {};
  let histMatch: any = null;
  
  for (const [key, val] of Object.entries(consultoresBench)) {
    const kNorm = normalize(key);
    if (kNorm === cNorm || kNorm.includes(cNorm) || cNorm.includes(kNorm)) {
      histMatch = val;
      break;
    }
  }

  // Base do consultor
  let baseConsultor = { cidade: 'São Paulo', uf: 'SP' };
  for (const [k, v] of Object.entries(BASE_CONSULTORES)) {
    if (normalize(k) === cNorm || cNorm.includes(normalize(k))) {
      baseConsultor = v;
      break;
    }
  }

  const parametrosGerais = (benchmark360 as any).geral_operacao_samsung_ac || {
    taxa_reembolso_km: 0.80,
    jantar_viagem_medio: 48.04,
    cafe_viagem_medio: 18.82,
    diaria_alimentacao_viagem: 66.86,
    estacionamento_medio_pago: 43.38,
    pedagio_praca_medio: 9.30
  };

  const costPerKm = parametrosGerais.taxa_reembolso_km || 0.80;
  const kmCost = Math.round(totalEstimatedKM * costPerKm * 100) / 100;

  let pedagioCost = 0;
  let estacionamentoCost = 0;
  let refeicoesCost = 0;
  let hospedagemCost = 0;
  let passagensCost = 0;
  let totalVisitas = 0;

  const detalhesDias: any[] = [];

  // Somar voos e hotéis manuais já selecionados
  Object.values(chosenFlights).forEach((f: any) => {
    if (f?.price) passagensCost += Number(f.price);
  });
  Object.values(chosenHotels).forEach((h: any) => {
    if (h?.price) hospedagemCost += Number(h.price);
  });

  // Percorrer cada dia do roteiro
  (roteiro || []).forEach((dia: any) => {
    const lojas = dia.lojas || [];
    if (lojas.length === 0) return;

    totalVisitas += lojas.length;
    let custoDia = 0;

    const primeiraLoja = lojas[0];
    const cidadeLoja = primeiraLoja.cidade || '';
    const ufLoja = primeiraLoja.uf || '';
    const isPlane = manualFlights[dia.data] || dia.goesByPlane || false;

    const ehMesmaCidade = normalize(cidadeLoja) === normalize(baseConsultor.cidade);
    const ehMesmoEstado = normalize(ufLoja) === normalize(baseConsultor.uf);

    let tipoDeslocamento: 'Local' | 'Bate-e-Volta' | 'Viagem Terrestre' | 'Aéreo' = 'Local';
    let isViagem = false;

    if (isPlane) {
      tipoDeslocamento = 'Aéreo';
      isViagem = true;
      // Diária de alimentação em viagem aérea
      refeicoesCost += parametrosGerais.diaria_alimentacao_viagem;
      custoDia += parametrosGerais.diaria_alimentacao_viagem;

      // Se não escolheu hotel manualmente, provisiona média da praça
      if (Object.keys(chosenHotels).length === 0) {
        const hoteisPraca = (benchmark360 as any).hospedagem_homologada_compras || {};
        const cidadeUpper = cidadeLoja.toUpperCase();
        const hotelEstimado = hoteisPraca[cidadeUpper]?.media_diaria || 380;
        hospedagemCost += hotelEstimado;
        custoDia += hotelEstimado;
      }
    } else if (!ehMesmaCidade && !ehMesmoEstado) {
      // Ex: Recife -> João Pessoa (PE -> PB) ou SP -> Curitiba
      isViagem = true;
      const isBateVolta = lojas.some((l: any) => l.cidade?.toLowerCase().includes('joão pessoa') || l.cidade?.toLowerCase().includes('campinas') || l.cidade?.toLowerCase().includes('sorocaba'));
      
      if (isBateVolta || cidadeLoja.toLowerCase().includes('joão pessoa')) {
        tipoDeslocamento = 'Bate-e-Volta';
        // Jantar em viagem homologado
        refeicoesCost += parametrosGerais.jantar_viagem_medio;
        custoDia += parametrosGerais.jantar_viagem_medio;
      } else {
        tipoDeslocamento = 'Viagem Terrestre';
        refeicoesCost += parametrosGerais.diaria_alimentacao_viagem;
        custoDia += parametrosGerais.diaria_alimentacao_viagem;
      }
    } else if (!ehMesmaCidade && ehMesmoEstado) {
      // Ex: São Paulo -> Campinas / Sorocaba / Ribeirão Preto / Araçatuba
      const cidNorm = normalize(cidadeLoja);
      if (cidNorm.includes('aracatuba') || cidNorm.includes('ribeirao') || cidNorm.includes('sao jose do rio preto')) {
        tipoDeslocamento = 'Viagem Terrestre';
        isViagem = true;
        refeicoesCost += parametrosGerais.diaria_alimentacao_viagem;
        custoDia += parametrosGerais.diaria_alimentacao_viagem;

        // Se for Araçatuba/RP, estimativa de rodoviário ou hotel homologado (R$ 384)
        if (Object.keys(chosenHotels).length === 0) {
          const hoteisPraca = (benchmark360 as any).hospedagem_homologada_compras || {};
          const hotelEstimado = hoteisPraca['ARAÇATUBA']?.media_diaria || 384;
          hospedagemCost += hotelEstimado;
          custoDia += hotelEstimado;
        }
      } else if (cidNorm.includes('campinas') || cidNorm.includes('sorocaba') || cidNorm.includes('niteroi') || cidNorm.includes('santos')) {
        tipoDeslocamento = 'Bate-e-Volta';
        // Pedágios reais da rota (Castelo Branco, Anhanguera ou Ponte Rio-Niterói)
        const pedagioDia = baseConsultor.uf === 'SP' ? 18.60 : 13.20;
        pedagioCost += pedagioDia;
        custoDia += pedagioDia;
      }
    } else {
      // Atendimento Local
      tipoDeslocamento = 'Local';
      // Se for Rio de Janeiro ou SP centro com shopping, provisionar estacionamento médio calibrado
      const temShopping = lojas.some((l: any) => {
        const n = normalize(l.nome_pdv || '');
        return n.includes('shopping') || n.includes('barra') || n.includes('penha') || n.includes('central ar');
      });
      if (temShopping && (baseConsultor.cidade === 'Rio de Janeiro' || baseConsultor.cidade === 'São Paulo')) {
        estacionamentoCost += (parametrosGerais.estacionamento_medio_pago * 0.5); // fator ponderado
        custoDia += (parametrosGerais.estacionamento_medio_pago * 0.5);
      }
    }

    detalhesDias.push({
      data: dia.data,
      cidade: cidadeLoja,
      isViagemOuBateVolta: isViagem,
      tipoDeslocamento,
      custoDia: Math.round(custoDia * 100) / 100
    });
  });

  const totalEstimadoReal = Math.round(
    (kmCost + pedagioCost + estacionamentoCost + refeicoesCost + hospedagemCost + passagensCost) * 100
  ) / 100;

  const custoMedioPorVisita = totalVisitas > 0 ? Math.round((totalEstimadoReal / totalVisitas) * 100) / 100 : 0;

  let historicoConsultor = null;
  let diferencaVsHistorico = 0;
  let economiaProjetada = false;

  if (histMatch) {
    historicoConsultor = {
      visitasCheckin: histMatch.visitas_checkin_realizadas || 0,
      custoMedioVisitaVexx: histMatch.custo_medio_visita || 0,
      kmMedioVisitaVexx: histMatch.km_medio_visita || 0,
      valorTotalVexxAno: histMatch.valor_total_vexx || 0
    };

    const custoHistoricoProjetado = histMatch.custo_medio_visita * totalVisitas;
    diferencaVsHistorico = Math.round((totalEstimadoReal - custoHistoricoProjetado) * 100) / 100;
    economiaProjetada = diferencaVsHistorico < 0;
  }

  return {
    kmCost,
    pedagioCost: Math.round(pedagioCost * 100) / 100,
    estacionamentoCost: Math.round(estacionamentoCost * 100) / 100,
    refeicoesCost: Math.round(refeicoesCost * 100) / 100,
    hospedagemCost: Math.round(hospedagemCost * 100) / 100,
    passagensCost: Math.round(passagensCost * 100) / 100,
    totalEstimadoReal,
    totalVisitas,
    custoMedioPorVisita,
    historicoConsultor,
    diferencaVsHistorico,
    economiaProjetada,
    detalhesDias
  };
}
