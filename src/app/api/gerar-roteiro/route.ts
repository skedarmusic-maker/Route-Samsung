import { NextResponse } from 'next/server';
import { Loja, ConsultorLocal } from '@/lib/dataParser';
import { format, getDaysInMonth, getDay, startOfMonth } from 'date-fns';
import cityCoords from '@/lib/city_coords.json';
import { supabase } from '@/lib/supabase';
import { isInsideRodizio, getRodizioDayForConsultor } from '@/lib/rodizioSP';
import { CONFIG_CONSULTORES, matchesKeywords, ConsultorConfig } from '@/lib/configConsultores';

// Helper para normalizar strings (remover acentos e colocar em caps)
function normalize(str: string): string {
  return str.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().trim();
}

// Prioridade de cluster: A=1 (mais urgente), B=2, C=3, D=4, outros=5
function clusterPriority(cluster: string): number {
  const c = (cluster || '').toUpperCase().trim();
  if (c === 'A') return 1;
  if (c === 'B') return 2;
  if (c === 'C') return 3;
  if (c === 'D') return 4;
  return 5;
}

// Função Haversine para cálculo de distância entre coordenadas no servidor
function computeDistance(p1: { lat: number; lng: number }, p2: { lat: number; lng: number }): number {
  const R = 6371; // Raio da Terra em km
  const dLat = ((p2.lat - p1.lat) * Math.PI) / 180;
  const dLng = ((p2.lng - p1.lng) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((p1.lat * Math.PI) / 180) *
      Math.cos((p2.lat * Math.PI) / 180) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function getLojaCoords(loja: Loja): { lat: number; lng: number } | null {
  if (loja.lat && loja.lng && (loja.lat !== 0 || loja.lng !== 0)) {
    return { lat: loja.lat, lng: loja.lng };
  }
  const key = `${normalize(loja.cidade || '')}-${normalize(loja.uf || '')}`;
  return (cityCoords as any)[key] || null;
}

function getPreferenciaPeriodo(loja: Loja, config: ConsultorConfig | null): 'manha' | 'tarde' | 'livre' {
  const pdvNorm = normalize(loja.nome_pdv_novo || '');
  
  // Regras de negocio globais de turnos especiais
  if (pdvNorm.includes("FERREIRA COSTA")) {
    return 'manha';
  }
  if (pdvNorm.includes("CANOAS")) {
    return 'manha';
  }
  if (pdvNorm.includes("PORTO ALEGRE")) {
    return 'tarde';
  }

  if (!config) return 'livre';

  // 1. Verificar preferências explícitas de período
  if (config.preferenciaPeriodo) {
    if (config.preferenciaPeriodo.manha && matchesKeywords(loja.nome_pdv_novo, loja.cidade, config.preferenciaPeriodo.manha)) {
      return 'manha';
    }
    if (config.preferenciaPeriodo.tarde && matchesKeywords(loja.nome_pdv_novo, loja.cidade, config.preferenciaPeriodo.tarde)) {
      return 'tarde';
    }
  }

  // 2. Verificar regras extras de preferência de rede
  if (config.regrasExtras?.preferenciaRede) {
    for (const pref of config.regrasExtras.preferenciaRede) {
      if (matchesKeywords(loja.nome_pdv_novo, loja.cidade, pref.keywords)) {
        return pref.periodo;
      }
    }
  }

  return 'livre';
}


export interface VisitaGerada {
  data: string;           // YYYY-MM-DD
  diaSemana: string;
  lojas: LojaVisita[];
}

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
  rota?: string;
}

export interface RoteiroDia {
  data: string;
  diaSemana: string;
  feriado?: string;
  lojas: LojaVisita[];
  aviso?: string;
}

const DIAS_SEMANA = ['DOMINGO', 'SEGUNDA-FEIRA', 'TERÇA-FEIRA', 'QUARTA-FEIRA', 'QUINTA-FEIRA', 'SEXTA-FEIRA', 'SÁBADO'];

const HORARIOS_PADRAO = [
  { checkIn: '09:00', checkOut: '12:00' },
  { checkIn: '13:30', checkOut: '18:00' },
];

const HORARIO_TRES_LOJAS = [
  { checkIn: '09:00', checkOut: '11:30' },
  { checkIn: '12:00', checkOut: '14:30' },
  { checkIn: '15:00', checkOut: '18:00' },
];
const ROTA_MAP: Record<string, string> = {
  "PAULO SERGIO MARQUES DA SILVA": "SPC2",
  "LIEDY AQUINO GOMES DOS SANTOS": "SPC1",
  "MARCIO JOSE FLORES PEREIRA": "SUL_1",
  "ALEXANDRE RIBEIRO LIMA": "SPI_2",
  "DIOGO DO NASCIMENTO SANTOS": "RJ",
  "TATIANE SOUZA DOS SANTOS": "NE_1",
  "LUIZ FALCAO DE SOUZA NETO": "NE_2"
};

async function getFeriados(ano: number, uf: string): Promise<Record<string, string>> {
  const API_KEY = process.env.FERIADOS_API_KEY;
  if (!API_KEY) {
    console.warn('FERIADOS_API_KEY não encontrada no ambiente.');
    return {};
  }
  const headers = { 'Authorization': `Bearer ${API_KEY}` };
  const feriados: Record<string, string> = {};

  try {
    const resNac = await fetch(`https://feriadosapi.com/api/v1/feriados/nacionais?ano=${ano}`, { headers });
    if (resNac.ok) {
      const dataNac = await resNac.json();
      const lista = Array.isArray(dataNac) ? dataNac : (dataNac.feriados || []);
      for (const f of lista) {
        let data = f.data || f.date || f.dia;
        const nome = f.nome || f.name || f.descricao || 'Feriado Nacional';
        if (data) {
          if (data.includes('/') && data.split('/').length === 3) {
            const [d, m, y] = data.split('/');
            data = `${y}-${m}-${d}`;
          }
          feriados[data] = nome;
        }
      }
    }
  } catch (e) {
    console.warn('Erro ao buscar feriados nacionais:', e);
  }

  try {
    const resEst = await fetch(`https://feriadosapi.com/api/v1/feriados/estado/${uf}?ano=${ano}`, { headers });
    if (resEst.ok) {
      const dataEst = await resEst.json();
      const lista = Array.isArray(dataEst) ? dataEst : (dataEst.feriados || []);
      for (const f of lista) {
        let data = f.data || f.date || f.dia;
        const nome = f.nome || f.name || f.descricao || `Feriado Estadual (${uf})`;
        if (data) {
          if (data.includes('/') && data.split('/').length === 3) {
            const [d, m, y] = data.split('/');
            data = `${y}-${m}-${d}`;
          }
          feriados[data] = nome;
        }
      }
    }
  } catch (e) {
    console.warn('Erro ao buscar feriados estaduais:', e);
  }

  return feriados;
}

function getDiasUteis(ano: number, mes: number, feriados: Record<string, string>): { data: string; diaSemana: string; feriado?: string }[] {
  const diasUteis = [];
  const totalDias = getDaysInMonth(new Date(ano, mes - 1, 1));

  for (let dia = 1; dia <= totalDias; dia++) {
    const date = new Date(ano, mes - 1, dia);
    const diaSemanaNum = getDay(date);
    if (diaSemanaNum === 0 || diaSemanaNum === 6) continue;
    const dataStr = format(date, 'yyyy-MM-dd');
    const feriadoNome = feriados[dataStr];
    diasUteis.push({
      data: dataStr,
      diaSemana: DIAS_SEMANA[diaSemanaNum],
      feriado: feriadoNome,
    });
  }
  return diasUteis;
}

function distribuirLojasNoDias(
  diasDisponiveis: { data: string; diaSemana: string; feriado?: string }[],
  lojas: Loja[],
  viagem: boolean,
  ufConsultor: string,
  consultor: ConsultorLocal,
  selectedPolos: string[],
  excludedLojasIds: string[]
): RoteiroDia[] {
  const normNome = consultor.nome.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().trim();
  const config = CONFIG_CONSULTORES[normNome] || null;

  // Aplicar exames e feriados específicos por consultor
  diasDisponiveis = diasDisponiveis.map(d => {
    let feriado = d.feriado;
    if (config?.indisponibilidades && config.indisponibilidades[d.data]) {
      feriado = config.indisponibilidades[d.data];
    } else if (config?.feriadosLocais && config.feriadosLocais[d.data]) {
      feriado = config.feriadosLocais[d.data];
    }
    return { ...d, feriado };
  });

  const roteiroMap: Record<string, RoteiroDia> = {};
  diasDisponiveis.forEach(d => {
    roteiroMap[d.data] = { ...d, lojas: [] };
  });

  const getFrequencia = (periodo: string): number => {
    const freq = parseInt(periodo, 10);
    return isNaN(freq) ? 1 : freq;
  };

  const lojasComDistancia = lojas.map(l => {
    return { ...l, forcarViagem: false };
  });

  const lojasLocais = lojasComDistancia
    .filter(l => !l.forcarViagem && (!viagem || l.uf === ufConsultor || !l.uf))
    .filter(l => !excludedLojasIds.includes(`${l.nome_pdv_novo}-${l.cidade}`));
  const lojasViagemPre = lojasComDistancia.filter(l => l.forcarViagem || (viagem && l.uf && l.uf !== ufConsultor))
    .filter(l => !excludedLojasIds.includes(`${l.nome_pdv_novo}-${l.cidade}`));
  const lojasViagem = viagem ? lojasViagemPre : [];

  if (viagem && lojasViagem.length > 0) {
    let poolViagem: Loja[] = [];
    lojasViagem.forEach(loja => {
      // Para viagens, visitamos a loja uma única vez no roteiro atual para não repetir no mesmo pólo/semana
      poolViagem.push(loja);
    });

    let hubs: any[] = [];
    let unclustered = [...poolViagem];
    while (unclustered.length > 0) {
      const centerStore = unclustered.shift()!;
      const coordsCenter = getLojaCoords(centerStore) || { lat: 0, lng: 0 };
      const hub = { id: hubs.length + 1, cidadePrincipal: centerStore.cidade, uf: centerStore.uf, lojas: [centerStore] };
      let i = 0;
      while (i < unclustered.length) {
        const candidate = unclustered[i];
        const coordsCand = getLojaCoords(candidate);
        let match = false;
        if (coordsCenter.lat !== 0 && coordsCand) {
          // Raio de 350km para agrupamento de VIAGEM (restrito à mesma UF)
          if (computeDistance(coordsCenter, coordsCand) <= 350 && candidate.uf === centerStore.uf) match = true;
        } else if (candidate.uf === centerStore.uf && centerStore.uf !== '') {
          if (!coordsCand) match = true;
        }
        if (match) hub.lojas.push(unclustered.splice(i, 1)[0]);
        else i++;
      }
      hubs.push(hub);
    }

    // Filtrar por polos selecionados: se selectedPolos não está vazio, só incluir hubs cuja cidade principal está na lista.
    // TAMBÉM filtrar lojas individuais dentro de cada hub que pertençam a cidades não selecionadas.
    // FIX: normalizar ambos os lados para evitar mismatch de capitalização/acento (ex: "Bauru" vs "BAURU")
    const selectedPolosNorm = selectedPolos.map((p: string) => normalize(p));
    const hubsFiltrados = hubs.map(h => {
      if (selectedPolos.length > 0) {
        // Filtrar lojas do hub: só incluir lojas cuja cidade está nos polos selecionados (comparação normalizada)
        const lojasFiltradas = h.lojas.filter((l: Loja) => selectedPolosNorm.includes(normalize(l.cidade || '')));
        return { ...h, lojas: lojasFiltradas };
      }
      return h;
    }).filter(h => h.lojas.length > 0);
    
    // Se o usuário selecionou polos mas nenhum foi encontrado nos hubs gerados
    if (selectedPolos.length > 0 && hubsFiltrados.length === 0) {
      const primeiroDiaUtil = diasDisponiveis.find(d => !d.feriado);
      if (primeiroDiaUtil && roteiroMap[primeiroDiaUtil.data]) {
        roteiroMap[primeiroDiaUtil.data].aviso = `Atenção: Os polos selecionados (${selectedPolos.join(', ')}) não possuem lojas de viagem cadastradas para este consultor.`;
      }
    }

    const diasLivres = diasDisponiveis.filter(d => !d.feriado);
    let diaIdx = 0;
    const dataAlvoViagem = '2026-07-27';
    const temDiaAlvo = diasLivres.some(d => d.data >= dataAlvoViagem);
    if (temDiaAlvo) {
      diaIdx = diasLivres.findIndex(d => d.data >= dataAlvoViagem);
    }

    // Ordenar Hubs de Viagem usando Nearest Neighbor (Caixeiro Viajante) para criar uma rota lógica
    // Isso evita que o consultor "teleporte" de DF para ES de um dia para o outro.
    let hubsOrdenados: any[] = [];
    if (hubsFiltrados.length > 0) {
      let unvisited = [...hubsFiltrados];
      let currentLoc = { lat: consultor.lat || 0, lng: consultor.lng || 0 };
      
      while (unvisited.length > 0) {
        let nearestIdx = 0;
        let minDist = 999999;
        
        for (let i = 0; i < unvisited.length; i++) {
          const h = unvisited[i];
          const coords = getLojaCoords(h.lojas[0]) || { lat: 0, lng: 0 };
          
          if (coords.lat !== 0 && currentLoc.lat !== 0) {
            const dist = computeDistance(currentLoc, coords);
            if (dist < minDist) {
              minDist = dist;
              nearestIdx = i;
            }
          }
        }
        
        const nextHub = unvisited.splice(nearestIdx, 1)[0];
        hubsOrdenados.push(nextHub);
        
        const nextCoords = getLojaCoords(nextHub.lojas[0]);
        if (nextCoords && nextCoords.lat !== 0) {
          currentLoc = nextCoords;
        }
      }
    }

    for (const hub of hubsOrdenados) {
      // Pular para o próximo dia útil disponível
      while (diaIdx < diasLivres.length && diasLivres[diaIdx].feriado) diaIdx++;
      if (diaIdx >= diasLivres.length) break;

      // Determinar quantos dias restam na semana atual (até sexta)
      let diasNaJanela = [];
      let tempIdx = diaIdx;
      while (tempIdx < diasLivres.length && diasNaJanela.length < 5) {
        const d = diasLivres[tempIdx];
        diasNaJanela.push(d);
        if (d.diaSemana === 'SEXTA-FEIRA') break; // Viagem termina no máximo na sexta
        tempIdx++;
      }

      let filaViagem = [...hub.lojas];
      if (filaViagem.length > diasNaJanela.length * 3) {
        console.warn(`Hub ${hub.cidadePrincipal} tem mais lojas (${filaViagem.length}) do que a capacidade da janela (${diasNaJanela.length * 3}). Algumas lojas serão ignoradas.`);
      }

      let diasUsados = 0;
      for (const dia of diasNaJanela) {
        if (filaViagem.length === 0) break;
        const lojaAncora = filaViagem.shift()!;
        const coordsAncora = getLojaCoords(lojaAncora);
        let lojasDoDia = [lojaAncora];
        
        if (coordsAncora) {
          let i = 0;
          while (i < filaViagem.length && lojasDoDia.length < 3) {
            const lC = filaViagem[i];
            const cC = getLojaCoords(lC);
            // No modo VIAGEM, permitimos deslocamento de até 200km entre lojas no mesmo dia para evitar dias ociosos
            if (cC && computeDistance(coordsAncora, cC) <= 200) {
              if (!lojasDoDia.some(l => l.nome_pdv_novo === lC.nome_pdv_novo)) {
                lojasDoDia.push(filaViagem.splice(i, 1)[0]);
                continue;
              }
            }
            i++;
          }
        }

        // Otimização de Rota (Vizinho Próximo) para Viagem
        let roteiroOrdenado = [];
        if (lojasDoDia.length > 0) {
          let restante = [...lojasDoDia];
          // Começa pela loja âncora (primeira)
          let atual = restante.shift()!;
          roteiroOrdenado.push(atual);

          while (restante.length > 0) {
            const coordsAtual = getLojaCoords(atual) || { lat: 0, lng: 0 };
            let melhorIndex = 0;
            let menorDist = 9999;

            if (coordsAtual.lat !== 0) {
              restante.forEach((l, idx) => {
                const cL = getLojaCoords(l) || { lat: 0, lng: 0 };
                const d = cL.lat !== 0 ? computeDistance(coordsAtual, cL) : 999;
                if (d < menorDist) {
                  menorDist = d;
                  melhorIndex = idx;
                }
              });
            }
            atual = restante.splice(melhorIndex, 1)[0];
            roteiroOrdenado.push(atual);
          }
        }

        const horarios = roteiroOrdenado.length === 3 ? HORARIO_TRES_LOJAS : HORARIOS_PADRAO;
        
        // Ordenar por preferência de período antes de aplicar os horários no roteiro de viagem
        roteiroOrdenado.sort((a, b) => {
          const prefA = getPreferenciaPeriodo(a, config);
          const prefB = getPreferenciaPeriodo(b, config);
          if (prefA === 'manha' && prefB !== 'manha') return -1;
          if (prefB === 'manha' && prefA !== 'manha') return 1;
          if (prefA === 'tarde' && prefB !== 'tarde') return 1;
          if (prefB === 'tarde' && prefA !== 'tarde') return -1;
          return 0;
        });

        roteiroOrdenado.forEach((loja, j) => {
          roteiroMap[dia.data].lojas.push({
            nome_pdv: loja.nome_pdv_novo,
            cliente: loja.cliente,
            endereco: loja.endereco,
            cidade: loja.cidade,
            uf: loja.uf,
            cluster: loja.cluster,
            checkIn: horarios[j].checkIn,
            checkOut: horarios[j].checkOut,
            tipo: 'viagem',
            estadoViagem: loja.uf,
            rota: ROTA_MAP[loja.consultor] || loja.consultor?.split(' ')[0] || ''
          });
        });
        
        // Marcar dia como ocupado por viagem
        const dO = diasLivres.find(dl => dl.data === dia.data);
        if (dO) dO.feriado = `__viagem_HUB${hub.id}__`;
        diasUsados++;
      }
      
      // Avançar diaIdx APENAS o número de dias realmente utilizados pelo Hub.
      // Isso permite que polos próximos (ex: DF e GO) sejam agendados na mesma semana em sequência.
      diaIdx += diasUsados;
    }
  }

  const diasParaLocais = diasDisponiveis.filter(d => !d.feriado);

  // ── Aviso de cidades sem coordenadas ──────────────────────────────
  const cidadesSemCoordenadas: string[] = [];
  lojasLocais.forEach(loja => {
    const key = `${normalize(loja.cidade || '')}-${normalize(loja.uf || '')}`;
    if (!(cityCoords as any)[key] && loja.cidade) {
      const label = `${loja.cidade}-${loja.uf}`;
      if (!cidadesSemCoordenadas.includes(label)) cidadesSemCoordenadas.push(label);
    }
  });
  if (cidadesSemCoordenadas.length > 0) {
    console.warn(`[ROUTE] Cidades sem coordenadas mapeadas: ${cidadesSemCoordenadas.join(', ')}. Cálculos de distância podem ser imprecisos.`);
  }

  // ── Pool de visitas ordenado por prioridade de cluster (A→D) ──────
  const lojasLocaisOrdenadas = [...lojasLocais].sort((a, b) => clusterPriority(a.cluster) - clusterPriority(b.cluster));

  let poolVisitas: Loja[] = [];
  lojasLocaisOrdenadas.forEach(loja => {
    const freq = getFrequencia(loja.periodo);
    for (let i = 0; i < freq; i++) poolVisitas.push(loja);
  });

  // Ordenar dentro de cada cidade por prioridade de cluster
  let visitasPorCidade: Record<string, Loja[]> = {};
  poolVisitas.forEach(loja => {
    const c = normalize(loja.cidade || 'DESCONHECIDA');
    if (!visitasPorCidade[c]) visitasPorCidade[c] = [];
    visitasPorCidade[c].push(loja);
  });
  // Garantir que dentro de cada cidade, clusters A e B venham primeiro
  Object.keys(visitasPorCidade).forEach(cidade => {
    visitasPorCidade[cidade].sort((a, b) => clusterPriority(a.cluster) - clusterPriority(b.cluster));
  });

  // ── Distribuição equilibrada por semana ───────────────────────────
  // Agrupar dias úteis por semana ISO para balancear carga
  const semanas: string[][] = [];
  let semanaAtual: string[] = [];
  diasParaLocais.forEach((dia, idx) => {
    semanaAtual.push(dia.data);
    if (dia.diaSemana === 'SEXTA-FEIRA' || idx === diasParaLocais.length - 1) {
      semanas.push(semanaAtual);
      semanaAtual = [];
    }
  });
  const visitasPorSemana = Math.ceil(poolVisitas.length / Math.max(semanas.length, 1));
  console.log(`[ROUTE] Pool: ${poolVisitas.length} visitas | ${semanas.length} semanas | ~${visitasPorSemana} visitas/semana`);

  const totalVisitasNec = diasParaLocais.length * 2;
  let totalNoPool = poolVisitas.length;
  if (totalNoPool < totalVisitasNec) {
    // Tapa-buraco Inteligente: Reforço apenas com lojas a <= 150km da base do consultor
    let backup = lojasLocaisOrdenadas.filter(l => {
      const cL = getLojaCoords(l);
      if (!cL || !consultor.lat) return true;
      return computeDistance({ lat: consultor.lat, lng: consultor.lng! }, cL) <= 150;
    });
    // Fallback garantido: se nenhuma loja no raio de 150km, usa todas para não deixar dia vazio
    if (backup.length === 0) {
      backup = [...lojasLocaisOrdenadas];
    }
    let attempts = 0;
    while (totalNoPool < totalVisitasNec && backup.length > 0 && attempts < 500) {
      for (const loja of backup) {
        if (totalNoPool >= totalVisitasNec) break;
        const c = normalize(loja.cidade || 'DESCONHECIDA');
        if (!visitasPorCidade[c]) visitasPorCidade[c] = [];
        visitasPorCidade[c].push(loja);
        totalNoPool++;
      }
      attempts++;
    }
    // Re-ordenar por cluster após reforço
    Object.keys(visitasPorCidade).forEach(cidade => {
      visitasPorCidade[cidade].sort((a, b) => clusterPriority(a.cluster) - clusterPriority(b.cluster));
    });
  }

  // Ordenar cidades: primeiro por volume, mas garantindo que cidades com clusters A/B apareçam antes
  let cidadesDisponiveis = Object.keys(visitasPorCidade).sort((a, b) => {
    const melhorClusterA = Math.min(...visitasPorCidade[a].map(l => clusterPriority(l.cluster)));
    const melhorClusterB = Math.min(...visitasPorCidade[b].map(l => clusterPriority(l.cluster)));
    if (melhorClusterA !== melhorClusterB) return melhorClusterA - melhorClusterB;
    return visitasPorCidade[b].length - visitasPorCidade[a].length;
  });
  const ultimasVisitas = new Map<string, number>();
  const totalVisitasPorPdv = new Map<string, number>();
  const MIN_GAP = 3;

  const rodizioDayForConsultor = getRodizioDayForConsultor(consultor.nome);

  for (let dayIdx = 0; dayIdx < diasParaLocais.length; dayIdx++) {
    const dia = diasParaLocais[dayIdx];
    const roteiroDia = roteiroMap[dia.data];
    
    // Obter o dia da semana atual (0 = Domingo, ..., 6 = Sábado)
    const currentDayOfWeek = getDay(new Date(dia.data + 'T00:00:00'));
    const isRodizioDay = rodizioDayForConsultor !== null && currentDayOfWeek === rodizioDayForConsultor;

    if (cidadesDisponiveis.length === 0) {
      const reforco = lojasLocais.filter(l => ['B', 'C'].includes(l.cluster?.toUpperCase()));
      if (reforco.length > 0) {
        reforco.forEach(loja => {
          const c = normalize(loja.cidade || 'DESCONHECIDA');
          if (!visitasPorCidade[c]) visitasPorCidade[c] = [];
          visitasPorCidade[c].push(loja);
        });
        cidadesDisponiveis = Object.keys(visitasPorCidade).sort((a, b) => visitasPorCidade[b].length - visitasPorCidade[a].length);
      } else {
        roteiroDia.aviso = "Fim do pool de visitas: não há mais lojas locais disponíveis para agendamento neste mês.";
        continue;
      }
    }

    let cidadeAtual = cidadesDisponiveis[0];
    let lojasNaCidade = visitasPorCidade[cidadeAtual];
    const pdvsVisitadosNoDia = new Set<string>();
    let lojasAgendadasNoDia: Loja[] = [];
    let cidadeTentadaIdx = 0;

    // Nível 1: Tenta buscar lojas, avançando cidades se houver bloqueio de cooldown
    while (cidadeTentadaIdx < cidadesDisponiveis.length && lojasAgendadasNoDia.length === 0) {
      cidadeAtual = cidadesDisponiveis[cidadeTentadaIdx];
      lojasNaCidade = visitasPorCidade[cidadeAtual];

      while (lojasAgendadasNoDia.length < 2 && lojasNaCidade.length > 0) {
        const slot: number = lojasAgendadasNoDia.length; // 0 = manhã, 1 = tarde
        
        let index = lojasNaCidade.findIndex(l => {
          if (pdvsVisitadosNoDia.has(l.nome_pdv_novo)) return false;
          
          if (isRodizioDay) {
            const coords = getLojaCoords(l);
            if (coords && isInsideRodizio(coords.lat, coords.lng)) return false;
          }

          // Regra de limite de visitas mensais
          if (config?.regrasExtras?.limiteMensal) {
            let atingiuLimite = false;
            for (const lim of config.regrasExtras.limiteMensal) {
              if (matchesKeywords(l.nome_pdv_novo, l.cidade, lim.keywords)) {
                const visitasAtuais = totalVisitasPorPdv.get(l.nome_pdv_novo) || 0;
                if (visitasAtuais >= lim.limite) {
                  atingiuLimite = true;
                  break;
                }
              }
            }
            if (atingiuLimite) return false;
          }

          // Regra de período estrita
          const pref = getPreferenciaPeriodo(l, config);
          if ((slot === 0 && pref === 'tarde') || (slot === 1 && pref === 'manha')) return false;

          // Regra de cooldown (com bypass para matrizes do Márcio)
          const isMatrizRepetivel = config?.regrasExtras?.matrizesRepetiveis && 
            matchesKeywords(l.nome_pdv_novo, l.cidade, config.regrasExtras.matrizesRepetiveis);
          const lastV = ultimasVisitas.get(l.nome_pdv_novo);
          return lastV === undefined || isMatrizRepetivel || (dayIdx - lastV) >= MIN_GAP;
        });

        // Fallback: se não achar nenhuma loja com o período estrito, tenta sem o filtro de período
        if (index === -1) {
          index = lojasNaCidade.findIndex(l => {
            if (pdvsVisitadosNoDia.has(l.nome_pdv_novo)) return false;
            
            if (isRodizioDay) {
              const coords = getLojaCoords(l);
              if (coords && isInsideRodizio(coords.lat, coords.lng)) return false;
            }

            if (config?.regrasExtras?.limiteMensal) {
              let atingiuLimite = false;
              for (const lim of config.regrasExtras.limiteMensal) {
                if (matchesKeywords(l.nome_pdv_novo, l.cidade, lim.keywords)) {
                  const visitasAtuais = totalVisitasPorPdv.get(l.nome_pdv_novo) || 0;
                  if (visitasAtuais >= lim.limite) {
                    atingiuLimite = true;
                    break;
                  }
                }
              }
              if (atingiuLimite) return false;
            }

            const isMatrizRepetivel = config?.regrasExtras?.matrizesRepetiveis && 
              matchesKeywords(l.nome_pdv_novo, l.cidade, config.regrasExtras.matrizesRepetiveis);
            const lastV = ultimasVisitas.get(l.nome_pdv_novo);
            return lastV === undefined || isMatrizRepetivel || (dayIdx - lastV) >= MIN_GAP;
          });
        }

        if (index !== -1) {
          const loja = lojasNaCidade.splice(index, 1)[0];
          pdvsVisitadosNoDia.add(loja.nome_pdv_novo);
          ultimasVisitas.set(loja.nome_pdv_novo, dayIdx);
          totalVisitasPorPdv.set(loja.nome_pdv_novo, (totalVisitasPorPdv.get(loja.nome_pdv_novo) || 0) + 1);
          lojasAgendadasNoDia.push(loja);
        } else break; // Todas as lojas restantes nesta cidade estão em cooldown
      }

      if (lojasAgendadasNoDia.length === 0) {
        cidadeTentadaIdx++; // Tenta a próxima cidade
      }
    }

    // Reforço se não completou 2 lojas na mesma cidade
    if (lojasAgendadasNoDia.length > 0 && lojasAgendadasNoDia.length < 2) {
      const slot: number = lojasAgendadasNoDia.length;
      const extras = lojasLocais.filter(l => normalize(l.cidade) === cidadeAtual);
      for (const l of extras) {
        if (lojasAgendadasNoDia.length >= 2) break;
        if (pdvsVisitadosNoDia.has(l.nome_pdv_novo)) continue;

        if (isRodizioDay) {
          const coords = getLojaCoords(l);
          if (coords && isInsideRodizio(coords.lat, coords.lng)) continue;
        }

        // Limite mensal
        if (config?.regrasExtras?.limiteMensal) {
          let atingiuLimite = false;
          for (const lim of config.regrasExtras.limiteMensal) {
            if (matchesKeywords(l.nome_pdv_novo, l.cidade, lim.keywords)) {
              const visitasAtuais = totalVisitasPorPdv.get(l.nome_pdv_novo) || 0;
              if (visitasAtuais >= lim.limite) {
                atingiuLimite = true;
                break;
              }
            }
          }
          if (atingiuLimite) continue;
        }

        // Período estrito
        const pref = getPreferenciaPeriodo(l, config);
        if ((slot === 0 && pref === 'tarde') || (slot === 1 && pref === 'manha')) continue;

        // Cooldown
        const isMatrizRepetivel = config?.regrasExtras?.matrizesRepetiveis && 
          matchesKeywords(l.nome_pdv_novo, l.cidade, config.regrasExtras.matrizesRepetiveis);
        const lastV = ultimasVisitas.get(l.nome_pdv_novo);
        if (lastV === undefined || isMatrizRepetivel || (dayIdx - lastV) >= MIN_GAP) {
          pdvsVisitadosNoDia.add(l.nome_pdv_novo);
          ultimasVisitas.set(l.nome_pdv_novo, dayIdx);
          totalVisitasPorPdv.set(l.nome_pdv_novo, (totalVisitasPorPdv.get(l.nome_pdv_novo) || 0) + 1);
          lojasAgendadasNoDia.push(l);
        }
      }

      // Fallback para o reforço (ignora período se ainda tiver slot livre)
      if (lojasAgendadasNoDia.length < 2) {
        for (const l of extras) {
          if (lojasAgendadasNoDia.length >= 2) break;
          if (pdvsVisitadosNoDia.has(l.nome_pdv_novo)) continue;

          if (isRodizioDay) {
            const coords = getLojaCoords(l);
            if (coords && isInsideRodizio(coords.lat, coords.lng)) continue;
          }

          if (config?.regrasExtras?.limiteMensal) {
            let atingiuLimite = false;
            for (const lim of config.regrasExtras.limiteMensal) {
              if (matchesKeywords(l.nome_pdv_novo, l.cidade, lim.keywords)) {
                const visitasAtuais = totalVisitasPorPdv.get(l.nome_pdv_novo) || 0;
                if (visitasAtuais >= lim.limite) {
                  atingiuLimite = true;
                  break;
                }
              }
            }
            if (atingiuLimite) continue;
          }

          const isMatrizRepetivel = config?.regrasExtras?.matrizesRepetiveis && 
            matchesKeywords(l.nome_pdv_novo, l.cidade, config.regrasExtras.matrizesRepetiveis);
          const lastV = ultimasVisitas.get(l.nome_pdv_novo);
          if (lastV === undefined || isMatrizRepetivel || (dayIdx - lastV) >= MIN_GAP) {
            pdvsVisitadosNoDia.add(l.nome_pdv_novo);
            ultimasVisitas.set(l.nome_pdv_novo, dayIdx);
            totalVisitasPorPdv.set(l.nome_pdv_novo, (totalVisitasPorPdv.get(l.nome_pdv_novo) || 0) + 1);
            lojasAgendadasNoDia.push(l);
          }
        }
      }
    }

    // Nível 2: Proximidade 50km
    if (lojasAgendadasNoDia.length === 1) {
      const primeira = lojasAgendadasNoDia[0];
      const coordsP = getLojaCoords(primeira) || { lat: 0, lng: 0 };
      if (coordsP.lat !== 0) {
        let prox = lojasLocais
          .filter(l => {
            if (pdvsVisitadosNoDia.has(l.nome_pdv_novo)) return false;
            
            if (isRodizioDay) {
              const coords = getLojaCoords(l);
              if (coords && isInsideRodizio(coords.lat, coords.lng)) return false;
            }

            if (config?.regrasExtras?.limiteMensal) {
              let atingiuLimite = false;
              for (const lim of config.regrasExtras.limiteMensal) {
                if (matchesKeywords(l.nome_pdv_novo, l.cidade, lim.keywords)) {
                  const visitasAtuais = totalVisitasPorPdv.get(l.nome_pdv_novo) || 0;
                  if (visitasAtuais >= lim.limite) {
                    atingiuLimite = true;
                    break;
                  }
                }
              }
              if (atingiuLimite) return false;
            }

            // Filtro de período estrito: slot 1 (tarde) -> não agenda se preferência for manhã
            const pref = getPreferenciaPeriodo(l, config);
            if (pref === 'manha') return false;

            const isMatrizRepetivel = config?.regrasExtras?.matrizesRepetiveis && 
              matchesKeywords(l.nome_pdv_novo, l.cidade, config.regrasExtras.matrizesRepetiveis);
            const lastV = ultimasVisitas.get(l.nome_pdv_novo);
            return lastV === undefined || isMatrizRepetivel || (dayIdx - lastV) >= MIN_GAP;
          })
          .map(l => {
            const cL = getLojaCoords(l) || { lat: 0, lng: 0 };
            return { loja: l, dist: cL.lat !== 0 ? computeDistance(coordsP, cL) : 999 };
          })
          .filter(c => c.dist <= 50)
          .sort((a, b) => a.dist - b.dist);

        // Fallback: se não encontrou com período estrito/cooldown, ignora período e cooldown estrito
        if (prox.length === 0) {
          prox = lojasLocais
            .filter(l => {
              if (pdvsVisitadosNoDia.has(l.nome_pdv_novo)) return false;
              if (isRodizioDay) {
                const coords = getLojaCoords(l);
                if (coords && isInsideRodizio(coords.lat, coords.lng)) return false;
              }

              if (config?.regrasExtras?.limiteMensal) {
                let atingiuLimite = false;
                for (const lim of config.regrasExtras.limiteMensal) {
                  if (matchesKeywords(l.nome_pdv_novo, l.cidade, lim.keywords)) {
                    const visitasAtuais = totalVisitasPorPdv.get(l.nome_pdv_novo) || 0;
                    if (visitasAtuais >= lim.limite) {
                      atingiuLimite = true;
                      break;
                    }
                  }
                }
                if (atingiuLimite) return false;
              }

              return true;
            })
            .map(l => {
              const cL = getLojaCoords(l) || { lat: 0, lng: 0 };
              return { loja: l, dist: cL.lat !== 0 ? computeDistance(coordsP, cL) : 999 };
            })
            .filter(c => c.dist <= 50)
            .sort((a, b) => a.dist - b.dist);
        }

        if (prox.length > 0) {
          const l = prox[0].loja;
          pdvsVisitadosNoDia.add(l.nome_pdv_novo);
          ultimasVisitas.set(l.nome_pdv_novo, dayIdx);
          totalVisitasPorPdv.set(l.nome_pdv_novo, (totalVisitasPorPdv.get(l.nome_pdv_novo) || 0) + 1);
          lojasAgendadasNoDia.push(l);
        }
      }
    }

    // ── Otimização de Rota Local (Partindo da casa do consultor) ──
    if (lojasAgendadasNoDia.length === 2 && consultor?.lat && consultor?.lng) {
      const home = { lat: consultor.lat, lng: consultor.lng };
      const l1 = lojasAgendadasNoDia[0];
      const l2 = lojasAgendadasNoDia[1];
      const c1 = getLojaCoords(l1) || { lat: 0, lng: 0 };
      const c2 = getLojaCoords(l2) || { lat: 0, lng: 0 };

      if (c1.lat !== 0 && c2.lat !== 0) {
        const d1 = computeDistance(home, c1) + computeDistance(c1, c2);
        const d2 = computeDistance(home, c2) + computeDistance(c2, c1);
        if (d2 < d1) {
          // Só inverte se não violar a restrição de período estrita
          const pref1 = getPreferenciaPeriodo(l1, config);
          const pref2 = getPreferenciaPeriodo(l2, config);
          
          // Inverter significa: l2 na manhã (slot 0) e l1 na tarde (slot 1)
          const violou = (pref2 === 'tarde') || (pref1 === 'manha');
          if (!violou) {
            lojasAgendadasNoDia = [l2, l1];
          }
        }
      }
    }

    // Finalizar agendamento do dia
    lojasAgendadasNoDia.forEach((loja, idx) => {
      let checkOut = HORARIOS_PADRAO[idx].checkOut;
      
      // Regra específica da Tatiane: saída de Feira às 17h00 se for à tarde
      if (idx === 1 && normNome === "TATIANE SOUZA DOS SANTOS" && matchesKeywords(loja.nome_pdv_novo, loja.cidade, ["FEIRA DE SANTANA"])) {
        checkOut = "17:00";
      }

      roteiroDia.lojas.push({
        nome_pdv: loja.nome_pdv_novo,
        cliente: loja.cliente,
        endereco: loja.endereco,
        cidade: loja.cidade,
        uf: loja.uf,
        cluster: loja.cluster,
        checkIn: HORARIOS_PADRAO[idx].checkIn,
        checkOut: checkOut,
        tipo: loja.uf !== ufConsultor ? 'viagem' : 'local',
        rota: ROTA_MAP[loja.consultor] || loja.consultor?.split(' ')[0] || ''
      });
    });

    if (lojasAgendadasNoDia.length === 0) {
      roteiroDia.aviso = "Dia sem visitas: as lojas próximas estão em período de intervalo (cooldown) ou não há lojas na região.";
    }

    // Limpar cidades que não têm mais lojas
    cidadesDisponiveis = cidadesDisponiveis.filter(c => visitasPorCidade[c].length > 0);

    // Se agendamos lojas hoje, movemos as cidades tentadas (e a usada) para o fim da fila para balancear
    if (lojasAgendadasNoDia.length > 0 && cidadesDisponiveis.length > 0) {
      for (let i = 0; i <= cidadeTentadaIdx; i++) {
        if (cidadesDisponiveis.length > 0) {
          cidadesDisponiveis.push(cidadesDisponiveis.shift()!);
        }
      }
    }
  }

  return Object.values(roteiroMap).sort((a, b) => a.data.localeCompare(b.data));
}

function parsePeriodoToDays(periodo: string): number {
  // Regra unificada: 1 visita por mês (30 dias)
  return 30;
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { 
      consultor, 
      mes, 
      ano, 
      selectedClientes, 
      selectedClusters, 
      selectedPolos, 
      excludedLojasIds = [],
      selectedStatus, 
      viagem,
      dataInicio,
      dataFim,
      selectedRotasBase = [],
      includedCoberturaLojasIds = []
    } = body;
    if (!consultor || !mes || !ano) return NextResponse.json({ error: 'Parâmetros obrigatórios: consultor, mes, ano' }, { status: 400 });

    const { data: dataC, error: errorC } = await supabase.from('consultores').select('*').eq('nome', consultor).single();
    if (errorC || !dataC) return NextResponse.json({ error: `Consultor "${consultor}" não encontrado.` }, { status: 404 });

    const consultorData: ConsultorLocal = { nome: dataC.nome, endereco: dataC.endereco_completo, lat: dataC.lat, lng: dataC.lng };
    const lojasTable = process.env.NEXT_PUBLIC_LOJAS_TABLE || 'lojas_julho';
    let query = supabase.from(lojasTable).select('*');
    
    const rotasToFetch = [consultor, ...selectedRotasBase];
    const orCondition = rotasToFetch.map(r => `consultor_vinculado.eq."${r}"`).join(',');
    query = query.or(orCondition);
    const { data: dataL, error: errorL } = await query;
    if (errorL) return NextResponse.json({ error: 'Erro ao buscar lojas.' }, { status: 500 });

    // Buscar histórico de visitas para o filtro de período
    const { data: historico } = await supabase.from('historico_visitas').select('nome_pdv, ultima_visita');
    const historicoMap: Record<string, string> = {};
    if (historico) {
      historico.forEach(h => {
        historicoMap[h.nome_pdv] = h.ultima_visita;
      });
    }

    const todasLojas: Loja[] = (dataL || [])
      .filter(l => {
        // Ignorar lojas que tem periodo '0', em branco ou nulo para julho
        const p = String(l.periodo || '').trim();
        if (p === '0' || p === '') return false;
        return true;
      })
      .map(l => ({
        trader: '', cliente: l.cliente, bandeira: '', nome_pdv_novo: l.nome_pdv, cnpj: l.codigo_sap, endereco: l.endereco, canal: '', consultor: l.consultor_vinculado, cidade: l.cidade, uf: l.uf, status: l.status, cluster: l.cluster, periodo: l.periodo, lat: l.lat, lng: l.lng
      }));

    // Extrair UF da base de dados de forma robusta
    const ufConsultor = dataC.uf_base || 'SP';
    const startOfMonth = new Date(ano, mes - 1, 1);

    const lojasFiltradas = todasLojas.filter(l => {
      const isMyStore = l.consultor && l.consultor.toUpperCase().trim() === consultor.toUpperCase().trim();
      const isCoveredStore = l.consultor && selectedRotasBase.map((r: string) => r.toUpperCase().trim()).includes(l.consultor.toUpperCase().trim());
      
      if (!isMyStore && !isCoveredStore) return false;
      
      const lojaId = `${l.nome_pdv_novo}-${l.cidade}`;
      if (excludedLojasIds.includes(lojaId)) return false;

      if (isCoveredStore) {
        if (!includedCoberturaLojasIds.includes(lojaId)) return false;
      }

      if (selectedStatus && l.status.toUpperCase().trim() !== selectedStatus.toUpperCase().trim()) return false;
      if (selectedClientes?.length > 0 && !selectedClientes.includes(l.cliente)) return false;
      if (selectedClusters?.length > 0 && !selectedClusters.includes(l.cluster)) return false;
      
      // Inteligência de Período removida a pedido do usuário
      
      return true;
    });

    if (lojasFiltradas.length === 0) return NextResponse.json({ error: 'Nenhuma loja encontrada para este mês após filtros de período.' }, { status: 400 });

    const feriados = await getFeriados(ano, ufConsultor || 'SP');
    let diasUteis = [];
    if (dataInicio && dataFim) {
      const start = new Date(dataInicio + 'T00:00:00');
      const end = new Date(dataFim + 'T00:00:00');
      let current = new Date(start);
      
      while (current <= end) {
        const diaSemanaNum = getDay(current);
        if (diaSemanaNum !== 0 && diaSemanaNum !== 6) {
          const dataStr = format(current, 'yyyy-MM-dd');
          const feriadoNome = feriados[dataStr];
          diasUteis.push({
            data: dataStr,
            diaSemana: DIAS_SEMANA[diaSemanaNum],
            feriado: feriadoNome,
          });
        }
        current.setDate(current.getDate() + 1);
      }
    } else {
      diasUteis = getDiasUteis(ano, mes, feriados);
    }
    
    const diasFiltrados = diasUteis;

    const roteiro = distribuirLojasNoDias(
      diasFiltrados, 
      lojasFiltradas, 
      viagem, 
      ufConsultor, 
      consultorData, 
      selectedPolos || [],
      excludedLojasIds
    );

    return NextResponse.json({
      consultor, mes, ano, ufConsultor, totalLojas: lojasFiltradas.length, totalDiasUteis: diasUteis.filter(d => !d.feriado).length, feriados, roteiro
    });
  } catch (error: any) {
    console.error('Erro:', error);
    return NextResponse.json({ error: error.message || 'Erro interno' }, { status: 500 });
  }
}
