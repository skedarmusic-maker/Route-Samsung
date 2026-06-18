const axios = require('axios');

const BASE_URL = 'http://localhost:3000/api/gerar-roteiro';

async function testConsultor(nome, options = {}) {
  try {
    const payload = {
      consultor: nome,
      mes: 7,
      ano: 2026,
      viagem: true,
      dataInicio: '2026-07-06',
      dataFim: '2026-08-06',
      selectedStatus: 'ATIVO',
      selectedPolos: [],
      excludedLojasIds: [],
      ...options
    };

    console.log(`\n=== TESTANDO CONSULTOR: ${nome} ===`);
    const res = await axios.post(BASE_URL, payload);
    const data = res.data;

    console.log(`UF Base: ${data.ufConsultor}`);
    console.log(`Total Lojas Filtradas: ${data.totalLojas}`);
    console.log(`Total Dias Úteis Livres: ${data.totalDiasUteis}`);

    const roteiro = data.roteiro;
    
    // 1. Verificar indisponibilidades / feriados
    const diasComFeriadoOuIndisp = roteiro.filter(d => d.feriado);
    console.log(`Dias com feriado/indisponibilidade mapeados: ${diasComFeriadoOuIndisp.length}`);
    diasComFeriadoOuIndisp.forEach(d => {
      console.log(`  - ${d.data} (${d.diaSemana}): ${d.feriado}`);
    });

    // 2. Verificar restrições de horários e checkout
    let feiraSantanaTardeCount = 0;
    let feiraSantana17hCount = 0;
    let morningPrefOk = 0;
    let afternoonPrefOk = 0;
    let totalVisitsEvaluated = 0;
    let havanVisits = 0;

    roteiro.forEach(d => {
      d.lojas.forEach((l, idx) => {
        totalVisitsEvaluated++;
        const period = idx === 0 ? 'manha' : 'tarde';
        
        // Regra do checkout de Feira de Santana
        if (l.cidade === 'FEIRA DE SANTANA' || l.nome_pdv.includes('FEIRA DE SANTANA')) {
          if (period === 'tarde') {
            feiraSantanaTardeCount++;
            if (l.checkOut === '17:00') {
              feiraSantana17hCount++;
            }
          }
        }

        // Havan
        if (l.nome_pdv.includes('HAVAN')) {
          havanVisits++;
        }
      });
    });

    console.log(`Visitas à Havan (máx 1 no mês para Márcio): ${havanVisits}`);
    if (feiraSantanaTardeCount > 0) {
      console.log(`Visitas à Feira de Santana no período da tarde: ${feiraSantanaTardeCount}`);
      console.log(`Visitas à Feira de Santana com checkout às 17:00: ${feiraSantana17hCount}`);
    }

    // 3. Verificar cronograma de viagens do Diogo
    if (nome === 'DIOGO DO NASCIMENTO SANTOS') {
      const viagens = [];
      roteiro.forEach(d => {
        const lojasViagem = d.lojas.filter(l => l.tipo === 'viagem');
        if (lojasViagem.length > 0) {
          viagens.push({ data: d.data, lojas: lojasViagem.map(l => `${l.nome_pdv} (${l.cidade})`) });
        }
      });
      console.log(`Total de dias de viagem mapeados para o Diogo: ${viagens.length}`);
      viagens.forEach(v => {
        console.log(`  - ${v.data}: ${v.lojas.join(', ')}`);
      });
    }

  } catch (error) {
    console.error(`Erro ao testar ${nome}:`, error.response ? error.response.data : error.message);
  }
}

async function runTests() {
  await testConsultor('TATIANE SOUZA DOS SANTOS');
  await testConsultor('DIOGO DO NASCIMENTO SANTOS');
  await testConsultor('LUIZ FALCAO DE SOUZA NETO');
  await testConsultor('MARCIO JOSE FLORES PEREIRA');
}

runTests();
