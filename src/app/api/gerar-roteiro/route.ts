import { NextResponse } from 'next/server';
import { Loja, ConsultorLocal } from '@/lib/dataParser';
import { format, getDaysInMonth, getDay, startOfMonth } from 'date-fns';
import cityCoords from '@/lib/city_coords.json';
import { supabase } from '@/lib/supabase';

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
  const roteiroMap: Record<string, RoteiroDia> = {};
  diasDisponiveis.forEach(d => {
    roteiroMap[d.data] = { ...d, lojas: [] };
  });

  const getFrequencia = (periodo: string): number => {
    return 1;
  };

  const lojasComDistancia = lojas.map(l => {
    const coords = getLojaCoords(l);
    if (coords && consultor.lat && consultor.lng) {
      const dist = computeDistance({ lat: consultor.lat, lng: consultor.lng }, coords);
      if (dist > 250) return { ...l, forcarViagem: true, distanciaEstimada: dist };
    }
    return { ...l, forcarViagem: false };
  });

  const lojasLocais = lojasComDistancia
    .filter(l => !l.forcarViagem && (l.uf === ufConsultor || !l.uf))
    .filter(l => !excludedLojasIds.includes(`${l.nome_pdv_novo}-${l.cidade}`));
  const lojasViagemPre = lojasComDistancia.filter(l => l.forcarViagem || (l.uf && l.uf !== ufConsultor))
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
    const hubsFiltrados = hubs.map(h => {
      if (selectedPolos.length > 0) {
        // Filtrar lojas do hub: só incluir lojas cuja cidade está nos polos selecionados
        const lojasFiltradas = h.lojas.filter((l: Loja) => selectedPolos.includes(l.cidade));
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
    // Reforço mantendo prioridade de cluster
    const backup = [...lojasLocaisOrdenadas];
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
  const MIN_GAP = 3;

  for (let dayIdx = 0; dayIdx < diasParaLocais.length; dayIdx++) {
    const dia = diasParaLocais[dayIdx];
    const roteiroDia = roteiroMap[dia.data];
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
        const index = lojasNaCidade.findIndex(l => {
          if (pdvsVisitadosNoDia.has(l.nome_pdv_novo)) return false;
          const lastV = ultimasVisitas.get(l.nome_pdv_novo);
          return lastV === undefined || (dayIdx - lastV) >= MIN_GAP;
        });
        if (index !== -1) {
          const loja = lojasNaCidade.splice(index, 1)[0];
          pdvsVisitadosNoDia.add(loja.nome_pdv_novo);
          ultimasVisitas.set(loja.nome_pdv_novo, dayIdx);
          lojasAgendadasNoDia.push(loja);
        } else break; // Todas as lojas restantes nesta cidade estão em cooldown
      }

      if (lojasAgendadasNoDia.length === 0) {
        cidadeTentadaIdx++; // Tenta a próxima cidade
      }
    }

    // Reforço se não completou 2 lojas na mesma cidade
    if (lojasAgendadasNoDia.length > 0 && lojasAgendadasNoDia.length < 2) {
      const extras = lojasLocais.filter(l => normalize(l.cidade) === cidadeAtual);
      for (const l of extras) {
        if (lojasAgendadasNoDia.length >= 2) break;
        if (pdvsVisitadosNoDia.has(l.nome_pdv_novo)) continue;
        const lastV = ultimasVisitas.get(l.nome_pdv_novo);
        if (lastV === undefined || (dayIdx - lastV) >= MIN_GAP) {
          pdvsVisitadosNoDia.add(l.nome_pdv_novo);
          ultimasVisitas.set(l.nome_pdv_novo, dayIdx);
          lojasAgendadasNoDia.push(l);
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
            const lastV = ultimasVisitas.get(l.nome_pdv_novo);
            return lastV === undefined || (dayIdx - lastV) >= MIN_GAP;
          })
          .map(l => {
            const cL = getLojaCoords(l) || { lat: 0, lng: 0 };
            return { loja: l, dist: cL.lat !== 0 ? computeDistance(coordsP, cL) : 999 };
          })
          .filter(c => c.dist <= 50)
          .sort((a, b) => a.dist - b.dist);

        // Fallback: se não encontrou loja por causa do MIN_GAP, ignora a regra para não deixar o dia com 1 loja só
        if (prox.length === 0) {
          prox = lojasLocais
            .filter(l => !pdvsVisitadosNoDia.has(l.nome_pdv_novo))
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
        if (d2 < d1) lojasAgendadasNoDia = [l2, l1];
      }
    }

    // Finalizar agendamento do dia
    lojasAgendadasNoDia.forEach((loja, idx) => {
      roteiroDia.lojas.push({
        nome_pdv: loja.nome_pdv_novo,
        cliente: loja.cliente,
        endereco: loja.endereco,
        cidade: loja.cidade,
        uf: loja.uf,
        cluster: loja.cluster,
        checkIn: HORARIOS_PADRAO[idx].checkIn,
        checkOut: HORARIOS_PADRAO[idx].checkOut,
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
    let query = supabase.from('lojas').select('*');
    
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

    const forbiddenClients = ['A.DIAS', 'DUFRIO', 'UNIAR'];
    const todasLojas: Loja[] = (dataL || [])
      .filter(l => !l.cliente || !forbiddenClients.includes(l.cliente.toUpperCase().trim()))
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
