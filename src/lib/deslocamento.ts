/**
 * Utilitário para estimativa e padronização do tempo de deslocamento
 */
export function getTempoEstimadoFallback(loja: any, indexNoDia: number, dia?: any): string {
  if (loja?.tempoDeslocamento && loja.tempoDeslocamento !== '—' && loja.tempoDeslocamento.trim() !== '') {
    return loja.tempoDeslocamento;
  }
  
  // Segunda ou terceira visita no mesmo dia
  if (indexNoDia > 0) {
    return '15 min (5 km)';
  }
  
  // Primeira visita saindo da base
  const cidade = (loja?.cidade || '').toUpperCase().trim();
  if (cidade.includes('CAMPINAS')) return '20 min (8 km)';
  if (cidade.includes('SOROCABA')) return '1h15 (88 km)';
  if (cidade.includes('PIRACICABA')) return '55 min (67 km)';
  if (cidade.includes('ITU')) return '45 min (52 km)';
  if (cidade.includes('RIBEIRAO') || cidade.includes('RIBEIRÃO')) return '2h10 (173 km)';
  if (cidade.includes('BAURU')) return '2h50 (235 km)';
  if (cidade.includes('ARACATUBA') || cidade.includes('ARAÇATUBA')) {
    return dia?.isManualFlight ? 'Voo Aéreo / Deslocamento Local (5 km)' : '4h30 (385 km)';
  }
  if (dia?.isManualFlight) return 'Voo Aéreo / Deslocamento Local (5 km)';
  return '30 min (15 km)';
}
