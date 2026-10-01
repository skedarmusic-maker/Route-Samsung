// Dicionário canônico de feriados nacionais e estaduais para garantir integridade contínua
export const FERIADOS_CALENDARIO: Record<string, string> = {
  // 2026
  '2026-01-01': 'Feriado Nacional - Confraternização Universal',
  '2026-02-16': 'Carnaval',
  '2026-02-17': 'Carnaval',
  '2026-04-03': 'Feriado Nacional - Sexta-feira Santa',
  '2026-04-21': 'Feriado Nacional - Tiradentes',
  '2026-05-01': 'Feriado Nacional - Dia do Trabalho',
  '2026-06-04': 'Feriado Nacional - Corpus Christi',
  '2026-07-02': 'Feriado Estadual - Independência da Bahia',
  '2026-07-09': 'Feriado Estadual - Rev. Constitucionalista (SP)',
  '2026-07-16': 'Feriado Municipal - N. Sra. do Carmo (Recife)',
  '2026-07-20': 'Feriado Estadual - Data Magna do RJ',
  '2026-09-07': 'Feriado Nacional - Independência do Brasil',
  '2026-10-12': 'Feriado Nacional - Nossa Senhora Aparecida',
  '2026-11-02': 'Feriado Nacional - Finados',
  '2026-11-15': 'Feriado Nacional - Proclamação da República',
  '2026-11-20': 'Feriado Nacional - Dia da Consciência Negra',
  '2026-12-25': 'Feriado Nacional - Natal',
};

export function getFeriadoNome(data: string, feriadoExistente?: string | null): string | null {
  if (feriadoExistente && !feriadoExistente.startsWith('__viagem_')) {
    return feriadoExistente;
  }
  return FERIADOS_CALENDARIO[data] || null;
}

export function isDiaFeriado(data: string, feriadoExistente?: string | null): boolean {
  return !!getFeriadoNome(data, feriadoExistente);
}
