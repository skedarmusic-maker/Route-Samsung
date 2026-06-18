// Configurações específicas para os consultores (Feriados regionais, exames, preferências de horários e viagens)

export interface ConsultorConfig {
  nome: string;
  // Indisponibilidades / Folgas / Exames (Data: YYYY-MM-DD -> Descrição/Motivo)
  indisponibilidades?: Record<string, string>;
  // Feriados regionais / específicos do consultor (Data: YYYY-MM-DD -> Nome do feriado)
  feriadosLocais?: Record<string, string>;
  // Preferências de horários (Lista de palavras-chave para identificar o PDV)
  preferenciaPeriodo?: {
    manha: string[];
    tarde: string[];
  };
  // Regras de viagem específicas
  viagemConfig?: {
    // Palavras-chave de cidades ou PDVs que são bate e volta (sem pernoite)
    bateVolta?: string[];
    // Palavras-chave de cidades ou PDVs que são com pernoite
    pernoite?: string[];
  };
  // Regras extras para o algoritmo
  regrasExtras?: {
    // Matrizes que podem repetir na mesma semana (ignora cooldown padrão se necessário)
    matrizesRepetiveis?: string[];
    // Frequência limite mensal para certos tipos de lojas (ex: Havan = 1 vez no mês)
    limiteMensal?: {
      keywords: string[];
      limite: number;
    }[];
    // Preferência de período para certas redes (ex: Havan preferencialmente pela manhã)
    preferenciaRede?: {
      keywords: string[];
      periodo: 'manha' | 'tarde';
    }[];
  };
}

export const CONFIG_CONSULTORES: Record<string, ConsultorConfig> = {
  "TATIANE SOUZA DOS SANTOS": {
    nome: "TATIANE SOUZA DOS SANTOS",
    indisponibilidades: {
      "2026-06-15": "Hemograma",
      "2026-06-17": "Obstetra",
      "2026-06-26": "Ecocardiograma Fetal",
      "2026-07-08": "Consulta Nutricionista"
    },
    feriadosLocais: {
      "2026-07-02": "Independência da Bahia (Salvador)"
    },
    preferenciaPeriodo: {
      manha: [
        "FRIGELAR LAURO DE FREITAS",
        "FERREIRA COSTA BARRIS",
        "FERREIRA COSTA AV LUIS VIANA",
        "CLIMA RIO FEIRA DE SANTANA",
        "CLIMARIO FEIRA DE SANTANA"
      ],
      tarde: [
        "FRIGELAR SALVADOR",
        "CLIMA RIO SALVADOR",
        "CLIMARIO SALVADOR",
        "FRIGELAR FEIRA DE SANTANA"
      ]
    }
  },
  "DIOGO DO NASCIMENTO SANTOS": {
    nome: "DIOGO DO NASCIMENTO SANTOS",
    feriadosLocais: {
      "2026-07-20": "Data Magna do Estado do Rio de Janeiro"
    },
    preferenciaPeriodo: {
      manha: [
        "CENTRAL AR RIO DE JANEIRO",
        "CLIMA RIO BARRA",
        "CLIMARIO BARRA",
        "CLIMA RIO ITABORAI",
        "CLIMARIO ITABORAI",
        "CLIMA RIO ALCANTARA",
        "CLIMARIO ALCANTARA",
        "CLIMA RIO NITEROI",
        "CLIMARIO NITEROI",
        "FRIGELAR BARRA",
        // Aéreos MG
        "CLIMA RIO BELO HORIZONTE",
        "CLIMARIO BELO HORIZONTE",
        "FRIGELAR BELO HORIZONTE",
        // Aéreos ES
        "FRIGELAR VITORIA",
        "FRIOPECAS SERRA CD"
      ],
      tarde: [
        "CLIMA RIO PENHA CIRCULAR",
        "CLIMARIO PENHA CIRCULAR",
        "CLIMA RIO PENHA",
        "CLIMARIO PENHA",
        "FRIGELAR PENHA",
        "FRIGELAR SAO CRISTOVAO",
        "FRIGELAR S. CRISTOVAO",
        "FRIOPECAS RAMOS",
        // Aéreos MG
        "FRIOPECAS BELO HORIZONTE",
        "UNIS BELO HORIZONTE",
        // Aéreos ES
        "FRIGELAR VILA VELHA",
        "CLIMA RIO VITORIA",
        "CLIMARIO VITORIA"
      ]
    },
    viagemConfig: {
      bateVolta: ["LAGOS"],
      pernoite: ["CAMPOS DOS GOYTACAZES", "JUIZ DE FORA"]
    }
  },
  "LUIZ FALCAO DE SOUZA NETO": {
    nome: "LUIZ FALCAO DE SOUZA NETO",
    feriadosLocais: {
      "2026-07-16": "Nossa Senhora do Carmo (Recife)"
    },
    preferenciaPeriodo: {
      manha: [
        "FRIGELAR BOA VIAGEM",
        "FRIGELAR PARAIBA CD",
        "FRIGELAR JOAO PESSOA CD",
        "FRIGELAR PARAIBA EPITACIO",
        "HAVAN PARAIBA",
        "HAVAN JOAO PESSOA",
        "FERREIRA COSTA IMBIRIBEIRA",
        "FERREIRA COSTA PARAIBA",
        "FERREIRA COSTA JOAO PESSOA",
        "MAGNO PRIME",
        "FRIGELAR FORTALEZA BR",
        "FRIOPECAS FORTALEZA",
        "FRIGELAR MACEIO"
      ],
      tarde: [
        "CLIMA RIO IMBIRIBEIRA",
        "CLIMARIO IMBIRIBEIRA",
        "CLIMA RIO BOA VIAGEM",
        "CLIMARIO BOA VIAGEM",
        "CLIMA RIO PARAIBA",
        "CLIMARIO PARAIBA",
        "CLIMA RIO JOAO PESSOA",
        "CLIMARIO JOAO PESSOA",
        "FRIOPECAS IMBIRIBEIRA",
        "FERREIRA COSTA CONEGO",
        "FERREIRA COSTA BARATA",
        "FRIGELAR FORTALEZA CENTRO",
        "CLIMA RIO FORTALEZA",
        "CLIMARIO FORTALEZA",
        "FRIOPECAS MACEIO",
        "HAVAN MACEIO"
      ]
    }
  },
  "MARCIO JOSE FLORES PEREIRA": {
    nome: "MARCIO JOSE FLORES PEREIRA",
    preferenciaPeriodo: {
      // Regras de manhã do Márcio
      manha: [
        "FRIGELAR NOVO HAMBURGO"
      ],
      tarde: []
    },
    regrasExtras: {
      matrizesRepetiveis: [
        "FRIGELAR PERNAMBUCO 2273",
        "WEBCONTINENTAL"
      ],
      limiteMensal: [
        { keywords: ["HAVAN"], limite: 1 }
      ],
      preferenciaRede: [
        { keywords: ["HAVAN"], periodo: "manha" }
      ]
    }
  }
};

/**
 * Helper para verificar se um determinado PDV/loja bate com alguma das palavras-chave da lista
 */
export function matchesKeywords(nomePdv: string, cidade: string, keywords: string[]): boolean {
  const normPdv = nomePdv.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase();
  const normCidade = cidade.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase();
  
  return keywords.some(kw => {
    const normKw = kw.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase();
    return normPdv.includes(normKw) || normCidade.includes(normKw);
  });
}
