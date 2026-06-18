const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');
const path = require('path');
const xlsx = require('xlsx');
const { format, getDay, addDays } = require('date-fns');

dotenv.config({ path: path.resolve(__dirname, '.env.local') });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!url || !key) {
  console.error('Erro: Credentials not found in .env.local');
  process.exit(1);
}

const supabase = createClient(url, key);

// Configurações de Feriados, Indisponibilidades, Preferências Manhã/Tarde
const CONFIG_CONSULTORES = {
  "TATIANE SOUZA DOS SANTOS": {
    indisponibilidades: {
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
        "CLIMA RIO BELO HORIZONTE",
        "CLIMARIO BELO HORIZONTE",
        "FRIGELAR BELO HORIZONTE",
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
        "FRIOPECAS BELO HORIZONTE",
        "UNIS BELO HORIZONTE",
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
    preferenciaPeriodo: {
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

const GLOBAL_FERIADOS = {
  // SP Feriado
  "2026-07-09": "Revolução Constitucionalista de 1932 (SP)"
};

const ROTA_MAP = {
  "PAULO SERGIO MARQUES DA SILVA": "SPC2",
  "LIEDY AQUINO GOMES DOS SANTOS": "SPC1",
  "MARCIO JOSE FLORES PEREIRA": "SUL_1",
  "ALEXANDRE RIBEIRO LIMA": "SPI_2",
  "DIOGO DO NASCIMENTO SANTOS": "RJ",
  "TATIANE SOUZA DOS SANTOS": "NE_1",
  "LUIZ FALCAO DE SOUZA NETO": "NE_2"
};

const UF_CONSULTOR = {
  "ALEXANDRE RIBEIRO LIMA": "SP",
  "DIOGO DO NASCIMENTO SANTOS": "RJ",
  "LIEDY AQUINO GOMES DOS SANTOS": "SP",
  "LUIZ FALCAO DE SOUZA NETO": "PE",
  "MARCIO JOSE FLORES PEREIRA": "RS",
  "TATIANE SOUZA DOS SANTOS": "BA",
  "PAULO SERGIO MARQUES DA SILVA": "SP"
};

const HORARIOS_PADRAO = [
  { checkIn: '09:00', checkOut: '12:00' },
  { checkIn: '13:30', checkOut: '18:00' },
];

const HORARIO_TRES_LOJAS = [
  { checkIn: '09:00', checkOut: '11:30' },
  { checkIn: '12:00', checkOut: '14:30' },
  { checkIn: '15:00', checkOut: '18:00' },
];

const CENTRO_EXPANDIDO_POLYGON = [
  { lat: -23.523589, lng: -46.744186 },
  { lat: -23.512684, lng: -46.634685 },
  { lat: -23.523823, lng: -46.571449 },
  { lat: -23.584347, lng: -46.579124 },
  { lat: -23.606253, lng: -46.602641 },
  { lat: -23.626884, lng: -46.636029 },
  { lat: -23.593649, lng: -46.724738 },
];

function isInsideRodizio(lat, lng) {
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

function normalize(str) {
  return (str || '').normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().trim();
}

function cluster_pri(cluster) {
  const c = (cluster || '').toUpperCase().trim();
  if (c === 'A') return 1;
  if (c === 'B') return 2;
  if (c === 'C') return 3;
  if (c === 'D') return 4;
  return 5;
}

function matchesKeywords(nomePdv, cidade, keywords) {
  const normPdv = normalize(nomePdv);
  const normCidade = normalize(cidade);
  return keywords.some(kw => {
    const normKw = normalize(kw);
    return normPdv.includes(normKw) || normCidade.includes(normKw);
  });
}

function getPreferenciaPeriodo(loja, config) {
  if (!config) return 'livre';
  if (config.preferenciaPeriodo) {
    if (config.preferenciaPeriodo.manha && matchesKeywords(loja.nome_pdv, loja.cidade, config.preferenciaPeriodo.manha)) {
      return 'manha';
    }
    if (config.preferenciaPeriodo.tarde && matchesKeywords(loja.nome_pdv, loja.cidade, config.preferenciaPeriodo.tarde)) {
      return 'tarde';
    }
  }
  if (config.regrasExtras?.preferenciaRede) {
    for (const pref of config.regrasExtras.preferenciaRede) {
      if (matchesKeywords(loja.nome_pdv, loja.cidade, pref.keywords)) {
        return pref.periodo;
      }
    }
  }
  return 'livre';
}

function computeDistance(p1, p2) {
  const R = 6371;
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

function extractSapCode(str) {
  if (!str) return null;
  const match = str.match(/S\d{5}/i);
  return match ? match[0].toUpperCase() : null;
}

function getDiasUteis(startStr, endStr, feriadosLocais = {}, isSpBase = false) {
  const start = new Date(startStr + 'T00:00:00');
  const end = new Date(endStr + 'T00:00:00');
  let current = new Date(start);
  const dias = [];

  while (current <= end) {
    const diaSemanaNum = getDay(current);
    if (diaSemanaNum !== 0 && diaSemanaNum !== 6) {
      const dataStr = format(current, 'yyyy-MM-dd');
      let feriado = null;
      if (feriadosLocais[dataStr]) {
        feriado = feriadosLocais[dataStr];
      } else if (GLOBAL_FERIADOS[dataStr] && isSpBase) {
        feriado = GLOBAL_FERIADOS[dataStr];
      }
      dias.push({
        data: dataStr,
        diaSemana: ['DOMINGO', 'SEGUNDA-FEIRA', 'TERÇA-FEIRA', 'QUARTA-FEIRA', 'QUINTA-FEIRA', 'SEXTA-FEIRA', 'SÁBADO'][diaSemanaNum],
        feriado: feriado || undefined
      });
    }
    current = addDays(current, 1);
  }
  return dias;
}

function calcularTotalKM(roteiro, consultorCoords) {
  let totalKm = 0;
  for (const dia of roteiro) {
    const lojas = dia.lojas || [];
    if (lojas.length === 0) continue;

    const first = lojas[0];
    let fc = { lat: first.lat, lng: first.lng };
    if (!fc.lat || !fc.lng) continue;

    const distHub = (consultorCoords.lat && fc.lat) ? computeDistance(consultorCoords, fc) : 0;
    const goesByPlane = distHub > 350;
    let curr = goesByPlane ? fc : consultorCoords;
    let diaEst = 0;

    for (let idx = 0; idx < lojas.length; idx++) {
      const loja = lojas[idx];
      const lat = loja.lat;
      const lng = loja.lng;
      if (lat && lng) {
        if (idx === 0 && goesByPlane) {
          diaEst += 5.0;
          curr = { lat, lng };
        } else {
          if (curr.lat && curr.lng) {
            diaEst += computeDistance(curr, { lat, lng });
          }
          curr = { lat, lng };
        }
      }
    }

    if (!goesByPlane && curr.lat && consultorCoords.lat) {
      diaEst += computeDistance(curr, consultorCoords);
    } else if (goesByPlane) {
      diaEst += 5.0;
    }

    totalKm += diaEst * 1.3;
  }
  return totalKm;
}

async function main() {
  console.log('=== GERADOR DE JP JULHO 2026 V1.0 ===');
  
  // 1. Carregar todas as lojas de lojas_julho do Supabase
  console.log('Carregando lojas de lojas_julho...');
  const { data: dbLojas, error: errorL } = await supabase.from('lojas_julho').select('*');
  if (errorL) {
    console.error('Erro ao carregar lojas_julho:', errorL);
    process.exit(1);
  }
  console.log(`  Carregadas ${dbLojas.length} lojas do banco.`);

  // 2. Carregar consultores do banco
  console.log('Carregando consultores...');
  const { data: dbConsultores, error: errorC } = await supabase.from('consultores').select('*');
  if (errorC) {
    console.error('Erro ao carregar consultores:', errorC);
    process.exit(1);
  }
  const consultoresMap = {};
  dbConsultores.forEach(c => {
    consultoresMap[normalize(c.nome)] = {
      nome: c.nome,
      lat: c.lat ? parseFloat(c.lat) : 0,
      lng: c.lng ? parseFloat(c.lng) : 0,
      uf_base: c.uf_base || 'SP'
    };
  });
  console.log(`  Carregados ${dbConsultores.length} consultores.`);

  // 3. Ler arquivo de Junho "Journey Junho - V3  Umovme - ref.xlsx"
  console.log('Lendo Journey Junho - V3  Umovme - ref.xlsx...');
  const workbook = xlsx.readFile('../Journey Junho - V3  Umovme - ref.xlsx');
  const sheet = workbook.Sheets['Roteiros'];
  const juneRows = xlsx.utils.sheet_to_json(sheet);
  console.log(`  Lidas ${juneRows.length} linhas de junho.`);

  // Mapear visitas de junho que não são viagem por consultor
  const juneLocalVisitsMap = {};
  juneRows.forEach(row => {
    const consultor = row['Consultor'];
    const tipo = row['Tipo'];
    const nomePdv = row['Nome PDV'];
    if (!consultor || !nomePdv) return;

    const isViagem = tipo && tipo.toString().toUpperCase().includes('VIAGEM');
    if (!isViagem) {
      const cNorm = normalize(consultor);
      if (!juneLocalVisitsMap[cNorm]) juneLocalVisitsMap[cNorm] = [];
      juneLocalVisitsMap[cNorm].push({
        nome_pdv: nomePdv,
        cliente: row['Cliente'] || '',
        cidade: row['Cidade'] || '',
        uf: row['UF'] || '',
        cluster: row['Cluster'] || ''
      });
    }
  });

  const CONSULTORES_ALVO = [
    "ALEXANDRE RIBEIRO LIMA",
    "DIOGO DO NASCIMENTO SANTOS",
    "LIEDY AQUINO GOMES DOS SANTOS",
    "LUIZ FALCAO DE SOUZA NETO",
    "MARCIO JOSE FLORES PEREIRA",
    "TATIANE SOUZA DOS SANTOS"
  ];

  const cenario = 'JP Julho 2026 - V1.0';
  const versaoId = 'jp-julho-v1.0';
  const versaoNome = 'JP Julho 2026 - V1.0';

  for (const cName of CONSULTORES_ALVO) {
    const cNorm = normalize(cName);
    const consultorInfo = consultoresMap[cNorm];
    if (!consultorInfo) {
      console.warn(`Aviso: Consultor ${cName} não encontrado na base.`);
      continue;
    }

    const ufConsultor = consultorInfo.uf_base;
    const homeCoords = { lat: consultorInfo.lat, lng: consultorInfo.lng };
    const config = CONFIG_CONSULTORES[cName] || null;

    console.log(`\nProcessando consultor: ${cName} (UF Base: ${ufConsultor})`);

    if (cNorm === "ALEXANDRE RIBEIRO LIMA") {
      console.log(`  Carregando roteiro validado JULHO V1.00 para Alexandre diretamente do Supabase...`);
      const searchUrl = `${url}/rest/v1/roteiros?consultor=eq.${encodeURIComponent(cName)}&cenario=eq.JULHO%20V1.00`;
      const searchHeaders = {
        apikey: key,
        Authorization: `Bearer ${key}`
      };
      
      try {
        const searchRes = await fetch(searchUrl, { headers: searchHeaders });
        if (searchRes.ok) {
          const rows = await searchRes.json();
          if (rows && rows.length > 0) {
            const originalPayload = rows[0].dados_roteiro;
            const originalRoteiro = originalPayload.roteiro || [];
            
            // Garantir que contenha o dia 2026-08-07 com as duas lojas de SJRP
            const temDia07 = originalRoteiro.some(d => d.data === '2026-08-07');
            if (!temDia07) {
              const lojaFrigelar = dbLojas.find(l => extractSapCode(l.nome_pdv) === 'S08446');
              const lojaHavan = dbLojas.find(l => extractSapCode(l.nome_pdv) === 'S04766');
              
              const lojasDia07 = [];
              if (lojaFrigelar) {
                lojasDia07.push({
                  nome_pdv: lojaFrigelar.nome_pdv,
                  cliente: lojaFrigelar.cliente,
                  endereco: lojaFrigelar.endereco || '',
                  cidade: lojaFrigelar.cidade || '',
                  uf: lojaFrigelar.uf || '',
                  cluster: lojaFrigelar.cluster || '',
                  checkIn: '09:00',
                  checkOut: '12:00',
                  tipo: 'local',
                  rota: ROTA_MAP[cName] || '',
                  lat: lojaFrigelar.lat ? parseFloat(lojaFrigelar.lat) : 0,
                  lng: lojaFrigelar.lng ? parseFloat(lojaFrigelar.lng) : 0
                });
              }
              if (lojaHavan) {
                lojasDia07.push({
                  nome_pdv: lojaHavan.nome_pdv,
                  cliente: lojaHavan.cliente,
                  endereco: lojaHavan.endereco || '',
                  cidade: lojaHavan.cidade || '',
                  uf: lojaHavan.uf || '',
                  cluster: lojaHavan.cluster || '',
                  checkIn: '13:30',
                  checkOut: '16:00',
                  tipo: 'local',
                  rota: ROTA_MAP[cName] || '',
                  lat: lojaHavan.lat ? parseFloat(lojaHavan.lat) : 0,
                  lng: lojaHavan.lng ? parseFloat(lojaHavan.lng) : 0
                });
              }
              
              originalRoteiro.push({
                data: '2026-08-07',
                diaSemana: 'SEXTA-FEIRA',
                lojas: lojasDia07
              });
            }
            
            originalRoteiro.sort((a, b) => a.data.localeCompare(b.data));
            
            const totalLojasVis = originalRoteiro.reduce((acc, curr) => acc + curr.lojas.length, 0);
            const totalKm = calcularTotalKM(originalRoteiro, homeCoords);
            const estimatedCost = totalKm * 0.80;
            
            const resultadoPayload = {
              ...originalPayload,
              totalLojas: totalLojasVis,
              totalDiasUteis: originalRoteiro.length,
              roteiro: originalRoteiro,
              totalEstimatedKM: totalKm,
              estimatedCost
            };
            
            console.log(`  Roteiro de Alexandre importado com sucesso. Total visitas: ${totalLojasVis}. KM: ${totalKm.toFixed(1)}`);
            
            const payloadSupabase = {
              consultor: cName,
              mes: 7,
              ano: 2026,
              cenario,
              versao_id: versaoId,
              versao_nome: versaoNome,
              dados_roteiro: resultadoPayload,
              status: 'APROVADO'
            };

            const checkUrl = `${url}/rest/v1/roteiros?consultor=eq.${encodeURIComponent(cName)}&mes=eq.7&ano=eq.2026&cenario=eq.${encodeURIComponent(cenario)}`;
            const checkRes = await fetch(checkUrl, { headers: searchHeaders });
            if (checkRes.ok) {
              const exist = await checkRes.json();
              if (exist && exist.length > 0) {
                const rowId = exist[0].id;
                const patchUrl = `${url}/rest/v1/roteiros?id=eq.${rowId}`;
                const patchRes = await fetch(patchUrl, {
                  method: 'PATCH',
                  headers: {
                    ...searchHeaders,
                    'Content-Type': 'application/json',
                    'Prefer': 'return=representation'
                  },
                  body: JSON.stringify(payloadSupabase)
                });
                if (patchRes.ok) {
                  console.log(`  [OK] Roteiro de ${cName} atualizado com sucesso no Supabase (copiado de JULHO V1.00).`);
                } else {
                  console.error(`  [ERRO] Falha ao atualizar roteiro de ${cName}:`, await patchRes.text());
                }
              } else {
                const postUrl = `${url}/rest/v1/roteiros`;
                const postRes = await fetch(postUrl, {
                  method: 'POST',
                  headers: {
                    ...searchHeaders,
                    'Content-Type': 'application/json',
                    'Prefer': 'return=representation'
                  },
                  body: JSON.stringify(payloadSupabase)
                });
                if (postRes.ok) {
                  console.log(`  [OK] Roteiro de ${cName} cadastrado com sucesso no Supabase (copiado de JULHO V1.00).`);
                } else {
                  console.error(`  [ERRO] Falha ao cadastrar roteiro de ${cName}:`, await postRes.text());
                }
              }
            } else {
              console.error('Erro na checagem do Supabase:', await checkRes.text());
            }
            
            continue;
          } else {
            console.error(`  [ERRO] Roteiro JULHO V1.00 não encontrado para Alexandre. Executando geração padrão.`);
          }
        } else {
          console.error(`  [ERRO] Falha ao consultar Supabase para Alexandre:`, await searchRes.text());
        }
      } catch (err) {
        console.error(`  [ERRO] Exceção ao processar Alexandre:`, err);
      }
    }

    // 1. Filtrar lojas do consultor no banco
    const cDbLojas = dbLojas.filter(l => l.consultor_vinculado && normalize(l.consultor_vinculado) === cNorm);
    const cDbAtivas = cDbLojas.filter(l => l.status === 'ATIVO');
    console.log(`  Lojas do consultor: ${cDbLojas.length} | Ativas para Julho: ${cDbAtivas.length}`);

    // Separar em viagem e locais
    const activeLocalLojas = [];
    const activeViagemLojas = [];

    cDbAtivas.forEach(l => {
      const isViagem = (l.uf && l.uf !== ufConsultor) || (l.forcar_viagem === true);
      const lObj = {
        nome_pdv: l.nome_pdv,
        cliente: l.cliente,
        endereco: l.endereco || '',
        cidade: l.cidade || '',
        uf: l.uf || '',
        cluster: l.cluster || '',
        periodo: l.periodo || '1',
        lat: l.lat ? parseFloat(l.lat) : 0,
        lng: l.lng ? parseFloat(l.lng) : 0,
        isViagem
      };
      if (isViagem) {
        activeViagemLojas.push(lObj);
      } else {
        activeLocalLojas.push(lObj);
      }
    });

    console.log(`  Lojas locais ativas: ${activeLocalLojas.length} | Lojas viagem ativas: ${activeViagemLojas.length}`);

    // Pools de agendamento de julho
    const poolPlanejadoLocal = [];
    activeLocalLojas.forEach(l => {
      const freq = parseInt(l.periodo, 10);
      const limit = isNaN(freq) ? 1 : freq;
      for (let i = 0; i < limit; i++) {
        poolPlanejadoLocal.push({ ...l });
      }
    });

    const poolPlanejadoViagem = [];
    activeViagemLojas.forEach(l => {
      const freq = parseInt(l.periodo, 10);
      const limit = isNaN(freq) ? 1 : freq;
      for (let i = 0; i < limit; i++) {
        poolPlanejadoViagem.push({ ...l });
      }
    });

    // 2. Pool de visitas locais de junho (Umovme ref)
    const juneLocalVisitsRaw = juneLocalVisitsMap[cNorm] || [];
    const poolJunhoLocal = [];
    juneLocalVisitsRaw.forEach(vis => {
      // Buscar a loja em lojas_julho para pegar as informações completas de coordenadas/endereço
      const sapCodeVis = extractSapCode(vis.nome_pdv);
      let matchedLoja = null;
      if (sapCodeVis) {
        matchedLoja = dbLojas.find(l => extractSapCode(l.nome_pdv) === sapCodeVis);
      } else {
        matchedLoja = dbLojas.find(l => normalize(l.nome_pdv) === normalize(vis.nome_pdv));
      }

      const lObj = {
        nome_pdv: matchedLoja ? matchedLoja.nome_pdv : vis.nome_pdv,
        cliente: matchedLoja ? matchedLoja.cliente : vis.cliente,
        endereco: matchedLoja ? matchedLoja.endereco || '' : '',
        cidade: matchedLoja ? matchedLoja.cidade || '' : vis.cidade,
        uf: matchedLoja ? matchedLoja.uf || '' : vis.uf,
        cluster: matchedLoja ? matchedLoja.cluster || '' : vis.cluster,
        periodo: '0',
        lat: matchedLoja && matchedLoja.lat ? parseFloat(matchedLoja.lat) : 0,
        lng: matchedLoja && matchedLoja.lng ? parseFloat(matchedLoja.lng) : 0,
        isViagem: false,
        isJunhoBackup: true
      };

      if (!lObj.lat || !lObj.lng) {
        // Fallback coordinates from cityCoords
        const cityKey = `${normalize(lObj.cidade)}-${normalize(lObj.uf)}`;
        const cityCoord = require('./src/lib/city_coords.json')[cityKey];
        if (cityCoord) {
          lObj.lat = cityCoord.lat;
          lObj.lng = cityCoord.lng;
        }
      }

      // Calcular distância até a residência do consultor para validar se é local
      const dist = (lObj.lat && homeCoords.lat) ? computeDistance(homeCoords, lObj) : 999;
      const storeUf = normalize(lObj.uf);
      const consultantUf = normalize(ufConsultor);

      // Apenas adicionar se for da mesma UF base do consultor E no máximo 120km de distância (limite local)
      if (storeUf === consultantUf && dist <= 120) {
        poolJunhoLocal.push(lObj);
      } else {
        console.log(`  [Filtro Apoio] Ignorando loja de apoio ${lObj.nome_pdv} (${lObj.cidade} - ${lObj.uf}) para ${cName} pois fica fora da UF ou excede 120km (Dist: ${dist.toFixed(1)} km)`);
      }
    });

    console.log(`  Pool planejado local: ${poolPlanejadoLocal.length} | Pool planejado viagem: ${poolPlanejadoViagem.length}`);
    console.log(`  Pool de backup junho local: ${poolJunhoLocal.length}`);

    // 3. Montar calendário
    const isSpBase = (ufConsultor === 'SP');
    const feriadosLocais = config?.feriadosLocais || {};
    const diasUteis = getDiasUteis('2026-07-06', '2026-08-07', feriadosLocais, isSpBase);
    console.log(`  Dias úteis no período: ${diasUteis.length}`);

    const roteiroMap = {};
    diasUteis.forEach(d => {
      roteiroMap[d.data] = { ...d, lojas: [] };
    });

    // 4. Agendar Viagens
    const diasLivresParaViagem = diasUteis.filter(d => !d.feriado);
    
    // Viagens Diogo no final do período
    let diaViagemIdx = 0;
    if (cNorm === "DIOGO DO NASCIMENTO SANTOS") {
      const dataAlvo = '2026-07-27';
      const temAlvo = diasLivresParaViagem.some(d => d.data >= dataAlvo);
      if (temAlvo) {
        diaViagemIdx = diasLivresParaViagem.findIndex(d => d.data >= dataAlvo);
      }
    }

    if (poolPlanejadoViagem.length > 0) {
      console.log(`  Agendando viagens...`);
      // Agrupamento simples de viagens em hubs por UF e proximidade
      let hubs = [];
      let unvisited = [...poolPlanejadoViagem];
      while (unvisited.length > 0) {
        const center = unvisited.shift();
        const hub = { cidadePrincipal: center.cidade, uf: center.uf, lojas: [center] };
        let i = 0;
        while (i < unvisited.length) {
          const candidate = unvisited[i];
          if (candidate.uf === center.uf && (computeDistance(center, candidate) <= 350 || center.uf === '')) {
            hub.lojas.push(unvisited.splice(i, 1)[0]);
          } else {
            i++;
          }
        }
        hubs.push(hub);
      }

      // Ordenar hubs por proximidade da base
      hubs = hubs.sort((a, b) => {
        const distA = computeDistance(homeCoords, a.lojas[0]);
        const distB = computeDistance(homeCoords, b.lojas[0]);
        return distA - distB;
      });

      for (const hub of hubs) {
        while (diaViagemIdx < diasLivresParaViagem.length && diasLivresParaViagem[diaViagemIdx].feriado) {
          diaViagemIdx++;
        }
        if (diaViagemIdx >= diasLivresParaViagem.length) break;

        // Determinar janela semanal até sexta-feira
        const diasJanela = [];
        let tempIdx = diaViagemIdx;
        while (tempIdx < diasLivresParaViagem.length && diasJanela.length < 5) {
          const d = diasLivresParaViagem[tempIdx];
          diasJanela.push(d);
          if (d.diaSemana === 'SEXTA-FEIRA') break;
          tempIdx++;
        }

        let filaViagem = [...hub.lojas];
        let diasUsados = 0;

        for (const dia of diasJanela) {
          if (filaViagem.length === 0) break;
          const lojaAncora = filaViagem.shift();
          const lojasDoDia = [lojaAncora];

          let i = 0;
          while (i < filaViagem.length && lojasDoDia.length < 3) {
            const cand = filaViagem[i];
            if (computeDistance(lojaAncora, cand) <= 200) {
              lojasDoDia.push(filaViagem.splice(i, 1)[0]);
            } else {
              i++;
            }
          }

          const horarios = lojasDoDia.length === 3 ? HORARIO_TRES_LOJAS : HORARIOS_PADRAO;
          lojasDoDia.forEach((loja, slotIdx) => {
            roteiroMap[dia.data].lojas.push({
              nome_pdv: loja.nome_pdv,
              cliente: loja.cliente,
              endereco: loja.endereco,
              cidade: loja.cidade,
              uf: loja.uf,
              cluster: loja.cluster,
              checkIn: horarios[slotIdx].checkIn,
              checkOut: horarios[slotIdx].checkOut,
              tipo: 'viagem',
              estadoViagem: loja.uf,
              rota: ROTA_MAP[cName] || '',
              lat: loja.lat,
              lng: loja.lng
            });
          });

          // Marcar dia como ocupado por viagem
          const dObj = diasLivresParaViagem.find(dl => dl.data === dia.data);
          if (dObj) {
            dObj.feriado = `__viagem_HUB_${hub.cidadePrincipal}__`;
          }
          diasUsados++;
        }

        diaViagemIdx += diasUsados;
      }
    }

    // 5. Agendar Visitas Locais (Planejado de Julho + Backup de Junho)
    const diasLocais = diasUteis.filter(d => !d.feriado);
    console.log(`  Dias locais disponíveis: ${diasLocais.length}`);

    const rodizioDay = isSpBase ? (cName.includes("LIEDY") ? 3 : null) : null;
    const ultimasVisitas = new Map();
    const totalVisitasPorPdv = new Map();
    const MIN_GAP = 3;

    // Distribuir pool local planejado de julho primeiro
    let localPool = [...poolPlanejadoLocal].sort((a, b) => cluster_pri(a.cluster) - cluster_pri(b.cluster));
    
    // Lista de apoio local ordenada por distância
    let backupPool = [...poolJunhoLocal].map(l => {
      const dist = (l.lat && homeCoords.lat) ? computeDistance(homeCoords, l) : 999;
      return { ...l, _calculated_dist: dist };
    }).sort((a, b) => a._calculated_dist - b._calculated_dist);

    for (let dayIdx = 0; dayIdx < diasLocais.length; dayIdx++) {
      const dia = diasLocais[dayIdx];
      const currentDayOfWeek = getDay(new Date(dia.data + 'T00:00:00'));
      const isRodizioDay = rodizioDay !== null && currentDayOfWeek === rodizioDay;

      // Slot 0 (Manhã) e Slot 1 (Tarde)
      for (let slot = 0; slot < 2; slot++) {
        // A. Procurar no pool planejado de julho
        let chosenLoja = null;
        let chosenIndex = -1;

        chosenIndex = localPool.findIndex(l => {
          if (isRodizioDay && l.lat && isInsideRodizio(l.lat, l.lng)) return false;

          // Limite mensal de visitas (Havan)
          if (config?.regrasExtras?.limiteMensal) {
            let atingiuLimite = false;
            for (const lim of config.regrasExtras.limiteMensal) {
              if (matchesKeywords(l.nome_pdv, l.cidade, lim.keywords)) {
                const visitasAtuais = totalVisitasPorPdv.get(l.nome_pdv) || 0;
                if (visitasAtuais >= lim.limite) {
                  atingiuLimite = true;
                  break;
                }
              }
            }
            if (atingiuLimite) return false;
          }

          // Período estrito
          const pref = getPreferenciaPeriodo(l, config);
          if (slot === 0 && pref === 'tarde') return false;
          if (slot === 1 && pref === 'manha') return false;

          // Cooldown
          const isMatriz = config?.regrasExtras?.matrizesRepetiveis && matchesKeywords(l.nome_pdv, l.cidade, config.regrasExtras.matrizesRepetiveis);
          const lastV = ultimasVisitas.get(l.nome_pdv);
          return lastV === undefined || isMatriz || (dayIdx - lastV) >= MIN_GAP;
        });

        // Fallback período
        if (chosenIndex === -1) {
          chosenIndex = localPool.findIndex(l => {
            if (isRodizioDay && l.lat && isInsideRodizio(l.lat, l.lng)) return false;
            if (config?.regrasExtras?.limiteMensal) {
              let atingiuLimite = false;
              for (const lim of config.regrasExtras.limiteMensal) {
                if (matchesKeywords(l.nome_pdv, l.cidade, lim.keywords)) {
                  const visitasAtuais = totalVisitasPorPdv.get(l.nome_pdv) || 0;
                  if (visitasAtuais >= lim.limite) {
                    atingiuLimite = true;
                    break;
                  }
                }
              }
              if (atingiuLimite) return false;
            }
            const isMatriz = config?.regrasExtras?.matrizesRepetiveis && matchesKeywords(l.nome_pdv, l.cidade, config.regrasExtras.matrizesRepetiveis);
            const lastV = ultimasVisitas.get(l.nome_pdv);
            return lastV === undefined || isMatriz || (dayIdx - lastV) >= MIN_GAP;
          });
        }

        if (chosenIndex !== -1) {
          chosenLoja = localPool.splice(chosenIndex, 1)[0];
        } else {
          // B. Procurar no pool de backup do roteiro de junho
          chosenIndex = backupPool.findIndex(l => {
            if (isRodizioDay && l.lat && isInsideRodizio(l.lat, l.lng)) return false;

            if (config?.regrasExtras?.limiteMensal) {
              let atingiuLimite = false;
              for (const lim of config.regrasExtras.limiteMensal) {
                if (matchesKeywords(l.nome_pdv, l.cidade, lim.keywords)) {
                  const visitasAtuais = totalVisitasPorPdv.get(l.nome_pdv) || 0;
                  if (visitasAtuais >= lim.limite) {
                    atingiuLimite = true;
                    break;
                  }
                }
              }
              if (atingiuLimite) return false;
            }

            const pref = getPreferenciaPeriodo(l, config);
            if (slot === 0 && pref === 'tarde') return false;
            if (slot === 1 && pref === 'manha') return false;

            const isMatriz = config?.regrasExtras?.matrizesRepetiveis && matchesKeywords(l.nome_pdv, l.cidade, config.regrasExtras.matrizesRepetiveis);
            const lastV = ultimasVisitas.get(l.nome_pdv);
            return lastV === undefined || isMatriz || (dayIdx - lastV) >= MIN_GAP;
          });

          // Fallback backup
          if (chosenIndex === -1) {
            chosenIndex = backupPool.findIndex(l => {
              if (isRodizioDay && l.lat && isInsideRodizio(l.lat, l.lng)) return false;
              
              if (config?.regrasExtras?.limiteMensal) {
                let atingiuLimite = false;
                for (const lim of config.regrasExtras.limiteMensal) {
                  if (matchesKeywords(l.nome_pdv, l.cidade, lim.keywords)) {
                    const visitasAtuais = totalVisitasPorPdv.get(l.nome_pdv) || 0;
                    if (visitasAtuais >= lim.limite) {
                      atingiuLimite = true;
                      break;
                    }
                  }
                }
                if (atingiuLimite) return false;
              }

              return true;
            });
          }

          if (chosenIndex !== -1) {
            // Remove a loja da lista e clona
            chosenLoja = backupPool.splice(chosenIndex, 1)[0];
          }
        }

        if (chosenLoja) {
          ultimasVisitas.set(chosenLoja.nome_pdv, dayIdx);
          totalVisitasPorPdv.set(chosenLoja.nome_pdv, (totalVisitasPorPdv.get(chosenLoja.nome_pdv) || 0) + 1);

          let checkOutTime = HORARIOS_PADRAO[slot].checkOut;
          if (slot === 1 && cNorm === "TATIANE SOUZA DOS SANTOS" && matchesKeywords(chosenLoja.nome_pdv, chosenLoja.cidade, ["FEIRA DE SANTANA"])) {
            checkOutTime = "17:00";
          }

          roteiroMap[dia.data].lojas.push({
            nome_pdv: chosenLoja.nome_pdv,
            cliente: chosenLoja.cliente,
            endereco: chosenLoja.endereco || '',
            cidade: chosenLoja.cidade,
            uf: chosenLoja.uf,
            cluster: chosenLoja.cluster,
            checkIn: HORARIOS_PADRAO[slot].checkIn,
            checkOut: checkOutTime,
            tipo: chosenLoja.isJunhoBackup ? 'apoio' : 'local',
            rota: ROTA_MAP[cName] || '',
            lat: chosenLoja.lat,
            lng: chosenLoja.lng
          });
        }
      }

      // Otimização final de rota do dia
      const lojasDia = roteiroMap[dia.data].lojas;
      if (lojasDia.length === 2 && homeCoords.lat) {
        const l1 = lojasDia[0];
        const l2 = lojasDia[1];
        if (l1.lat && l2.lat) {
          const d1 = computeDistance(homeCoords, l1) + computeDistance(l1, l2);
          const d2 = computeDistance(homeCoords, l2) + computeDistance(l2, l1);
          if (d2 < d1) {
            const pref1 = getPreferenciaPeriodo(l1, config);
            const pref2 = getPreferenciaPeriodo(l2, config);
            const violou = (pref2 === 'tarde') || (pref1 === 'manha');
            if (!violou) {
              // Swap checkIn/checkOut times
              const tIn1 = l1.checkIn, tOut1 = l1.checkOut;
              const tIn2 = l2.checkIn, tOut2 = l2.checkOut;
              l1.checkIn = tIn2; l1.checkOut = tOut2;
              l2.checkIn = tIn1; l2.checkOut = tOut1;
              roteiroMap[dia.data].lojas = [l2, l1];
            }
          }
        }
      }
    }

    // 6. Preparar resultado final e cálculo de KM/Custo
    const totalRoteiro = Object.values(roteiroMap).sort((a, b) => a.data.localeCompare(b.data));
    const totalLojasVis = totalRoteiro.reduce((acc, curr) => acc + curr.lojas.length, 0);
    const totalKm = calcularTotalKM(totalRoteiro, homeCoords);
    const estimatedCost = totalKm * 0.80;

    const resultadoPayload = {
      consultor: cName,
      mes: 7,
      ano: 2026,
      ufConsultor,
      totalLojas: totalLojasVis,
      totalDiasUteis: totalRoteiro.length,
      feriados: feriadosLocais,
      roteiro: totalRoteiro,
      totalEstimatedKM: totalKm,
      estimatedCost
    };

    console.log(`  Roteiro gerado: ${totalLojasVis} visitas no total.`);
    console.log(`  KM Estimado: ${totalKm.toFixed(1)} km | Custo Estimado: R$ ${estimatedCost.toFixed(2)}`);

    // 7. Fazer upload para a tabela roteiros no Supabase
    const payloadSupabase = {
      consultor: cName,
      mes: 7,
      ano: 2026,
      cenario,
      versao_id: versaoId,
      versao_nome: versaoNome,
      dados_roteiro: resultadoPayload,
      status: 'APROVADO'
    };

    // Verificar se já existe e fazer patch ou post
    const checkUrl = `${url}/rest/v1/roteiros?consultor=eq.${encodeURIComponent(cName)}&mes=eq.7&ano=eq.2026&cenario=eq.${encodeURIComponent(cenario)}`;
    const checkHeaders = {
      apikey: key,
      Authorization: `Bearer ${key}`
    };

    try {
      const checkRes = await fetch(checkUrl, { headers: checkHeaders });
      if (checkRes.ok) {
        const exist = await checkRes.json();
        if (exist && exist.length > 0) {
          const rowId = exist[0].id;
          const patchUrl = `${url}/rest/v1/roteiros?id=eq.${rowId}`;
          const patchRes = await fetch(patchUrl, {
            method: 'PATCH',
            headers: {
              ...checkHeaders,
              'Content-Type': 'application/json',
              'Prefer': 'return=representation'
            },
            body: JSON.stringify(payloadSupabase)
          });
          if (patchRes.ok) {
            console.log(`  [OK] Roteiro de ${cName} atualizado com sucesso no Supabase.`);
          } else {
            console.error(`  [ERRO] Falha ao atualizar roteiro de ${cName}:`, await patchRes.text());
          }
        } else {
          const postUrl = `${url}/rest/v1/roteiros`;
          const postRes = await fetch(postUrl, {
            method: 'POST',
            headers: {
              ...checkHeaders,
              'Content-Type': 'application/json',
              'Prefer': 'return=representation'
            },
            body: JSON.stringify(payloadSupabase)
          });
          if (postRes.ok) {
            console.log(`  [OK] Roteiro de ${cName} cadastrado com sucesso no Supabase.`);
          } else {
            console.error(`  [ERRO] Falha ao cadastrar roteiro de ${cName}:`, await postRes.text());
          }
        }
      } else {
        console.error('Erro na checagem do Supabase:', await checkRes.text());
      }
    } catch (e) {
      console.error('Erro ao conectar ao Supabase:', e);
    }
  }

  console.log('\n=== PROCESSO CONCLUÍDO COM SUCESSO! ===');
}

main();
