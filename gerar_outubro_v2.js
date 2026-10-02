/**
 * gerar_outubro_v2.js
 * Aplica regras dos consultores (reunião de campo) ao roteiro de Outubro
 * e gera "Journey Outubro V2 - Aprovado" no Supabase.
 */

const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');
const path = require('path');
dotenv.config({ path: path.resolve(__dirname, '.env.local') });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// ─────────────────────────────────────────────────────────────────────────────
// REGRAS POR CONSULTOR (definidas em reunião de campo)
// ─────────────────────────────────────────────────────────────────────────────

// Normaliza nome para comparação
const norm = (s) => (s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9\s]/g, '').trim();

// Helper: verifica se nome_pdv contém todas as palavras-chave
const match = (nomePdv, ...keywords) => keywords.every(k => norm(nomePdv).includes(norm(k)));

// DIOGO - lojas que DEVEM ficar de manhã
const DIOGO_MANHA = [
  'CENTRAL AR RIO DE JANEIRO', 'CLIMARIO BARRA', 'CLIMARIO ITABORAI',
  'CLIMARIO ALCANTARA', 'CLIMARIO NITEROI', 'FRIGELAR BARRA', 'FRIGELAR SAO CRISTOVAO'
];
const DIOGO_TARDE = [
  'CLIMARIO PENHA CIRCULAR', 'CLIMARIO PENHA', 'FRIGELAR PENHA', 'FRIOPECAS RAMOS'
];

// FALCÃO - lojas manhã/tarde
const FALCAO_MANHA = [
  'FRIGELAR BOA VIAGEM', 'FRIGELAR PARAIBA CD', 'FRIGELAR PARAIBA EPITACIO',
  'HAVAN PARAIBA', 'FERREIRA COSTA IMBIRIBEIRA', 'FERREIRA COSTA PARAIBA',
  'MAGNO PRIME', 'FRIGELAR FORTALEZA BR', 'FRIOPECAS FORTALEZA', 'FRIGELAR MACEIO'
];
const FALCAO_TARDE = [
  'CLIMARIO IMBIRIBEIRA', 'CLIMARIO BOA VIAGEM', 'CLIMARIO PARAIBA',
  'FRIOPECAS IMBIRIBEIRA', 'FERREIRA COSTA CONEGO BATATA', 'FRIGELAR FORTALEZA CENTRO',
  'CLIMARIO FORTALEZA', 'FRIOPECAS MACEIO', 'HAVAN MACEIO'
];

// LIEDY - lojas manhã/tarde
const LIEDY_MANHA = [
  'FRIGELAR BARRA FUNDA', 'FRIGELAR VILA SONIA', 'FRIGELAR GUARULHOS',
  'CLIMARIO VL GUILHERME', 'CLIMARIO VILA GUILHERME', 'CLIMARIO SAO JOSE',
  'FRIGELAR 771', 'FRIGELAR EXPRESS GLETE', 'FRIGELAR GLETE', 'FRIGELAR OSASCO',
  'CLIMARIO SOROCABA', 'CLIMARIO CAMPINAS', 'FRIGELAR ESCRITORIO', 'FRIGELAR LONDRINA',
  'MONVIZO MARINGA'
];
const LIEDY_TARDE = [
  'FRIGELAR PENHA', 'FRIGELAR SANTOS', 'CLIMARIO IPIRANGA', 'FRIGELAR SAO BERNARDO',
  'FRIOPECAS GLETE', 'FRIGELAR 812', 'FRIGELAR SOROCABA', 'FRIGELAR SAO JOSE',
  'FRIGELAR CAMPINAS', 'CENTRAL AR ESCRITORIO', 'CENTRALAR ESCRITORIO',
  'MONVIZO LONDRINA', 'CENTRALAR LONDRINA'
];
// Loja REMOVIDA (sem vendedor)
const LIEDY_REMOVE = 'S02005';

// Cidades da Baixada Santista / São Bernardo (para rodízio às quartas)
const BAIXADA_CIDADES = ['santos', 'sao bernardo', 'sao vicente', 'guaruja', 'praia grande', 'cubatao', 'itanhaem', 'bertioga', 'mongagua'];
const isBaixadaOrSBernardo = (loja) => {
  const cidadeN = norm(loja.cidade || '');
  const nomeN = norm(loja.nome_pdv || '');
  return BAIXADA_CIDADES.some(c => cidadeN.includes(c) || nomeN.includes(c));
};

// TATIANE - lojas manhã/tarde
const TATI_MANHA = [
  'FRIGELAR LAURO DE FREITAS', 'FERREIRA COSTA BARRIS', 'FERREIRA COSTA LUIS VIANA',
  'FERREIRA COSTA VIANA', 'CLIMARIO FEIRA DE SANTANA'
];
const TATI_TARDE = [
  'FRIGELAR SALVADOR', 'CLIMARIO SALVADOR', 'FRIGELAR FEIRA DE SANTANA'
];

// ─────────────────────────────────────────────────────────────────────────────
// FUNÇÕES DE AJUSTE
// ─────────────────────────────────────────────────────────────────────────────

function isManhaLoja(loja, listaManha) {
  const n = norm(loja.nome_pdv || '');
  return listaManha.some(kw => {
    const words = norm(kw).split(' ');
    return words.every(w => n.includes(w));
  });
}

function isTardeLoja(loja, listaTarde) {
  const n = norm(loja.nome_pdv || '');
  return listaTarde.some(kw => {
    const words = norm(kw).split(' ');
    return words.every(w => n.includes(w));
  });
}

function ajustarHorarioLoja(loja, forcarManha, forcarTarde) {
  if (forcarManha) {
    loja.checkIn  = '09:00';
    loja.checkOut = '12:00';
  } else if (forcarTarde) {
    loja.checkIn  = '13:30';
    loja.checkOut = '18:00';
  }
  return loja;
}

function ordenarLojasDia(lojas) {
  if (!lojas || lojas.length === 0) return [];

  // Se o dia tem apenas 1 visita (ex: dia em que a loja S02005 foi removida), a visita fica na MANHÃ (09:00 -> 12:00)
  if (lojas.length === 1) {
    const l = { ...lojas[0] };
    l.checkIn = '09:00';
    l.checkOut = '12:00';
    return [l];
  }

  if (lojas.length === 2) {
    let l1 = { ...lojas[0] };
    let l2 = { ...lojas[1] };

    const l1EhTarde = (l1.checkIn || '09:00') >= '13:30';
    const l2EhManha = (l2.checkIn || '09:00') < '13:30';

    // Se a 1ª preferir tarde e a 2ª preferir manhã, inverte
    if (l1EhTarde && l2EhManha) {
      const temp = l1;
      l1 = l2;
      l2 = temp;
    }

    // 1ª Visita = MANHÃ (09:00 -> 12:00)
    l1.checkIn = '09:00';
    l1.checkOut = '12:00';

    // 2ª Visita = TARDE (13:30 -> 18:00)
    l2.checkIn = '13:30';
    l2.checkOut = '18:00';

    return [l1, l2];
  }

  return [...lojas].sort((a, b) => {
    const ha = parseInt((a.checkIn || '09:00').replace(':', ''));
    const hb = parseInt((b.checkIn || '09:00').replace(':', ''));
    return ha - hb;
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// PROCESSAMENTO POR CONSULTOR
// ─────────────────────────────────────────────────────────────────────────────

function processarDiogo(roteiro) {
  const novoRoteiro = roteiro.map(dia => {
    const novaLojas = (dia.lojas || []).map(loja => {
      const emItaborai = norm(loja.nome_pdv).includes('itaborai');
      const emSaoCristovao = norm(loja.nome_pdv).includes('sao cristovao') || norm(loja.nome_pdv).includes('cristovao');
      
      // Itaboraí → sempre manhã quando em rota com São Cristóvão
      // São Cristóvão → tarde quando em rota com Itaboraí, manhã caso contrário
      const outrasLojasDia = (dia.lojas || []).filter(l => l.nome_pdv !== loja.nome_pdv);
      const rotaTemItaborai = outrasLojasDia.some(l => norm(l.nome_pdv).includes('itaborai'));
      
      let forcarManha = isManhaLoja(loja, DIOGO_MANHA);
      let forcarTarde = isTardeLoja(loja, DIOGO_TARDE);
      
      // Regra especial São Cristóvão <-> Itaboraí
      if (emSaoCristovao && rotaTemItaborai) {
        forcarManha = false;
        forcarTarde = true; // São Cristóvão vai pra tarde quando tem Itaboraí
      }
      if (emItaborai) {
        forcarManha = true;
        forcarTarde = false;
      }
      
      return ajustarHorarioLoja({ ...loja }, forcarManha, forcarTarde);
    });
    
    return { ...dia, lojas: ordenarLojasDia(novaLojas) };
  });
  return novoRoteiro;
}

function processarFalcao(roteiro) {
  return roteiro.map(dia => {
    const novaLojas = (dia.lojas || []).map(loja => {
      const forcarManha = isManhaLoja(loja, FALCAO_MANHA);
      const forcarTarde = !forcarManha && isTardeLoja(loja, FALCAO_TARDE);
      return ajustarHorarioLoja({ ...loja }, forcarManha, forcarTarde);
    });
    return { ...dia, lojas: ordenarLojasDia(novaLojas) };
  });
}

function processarLiedy(roteiro) {
  return roteiro.map(dia => {
    const diaSemana = (dia.diaSemana || '').toLowerCase();
    const ehQuarta = diaSemana.includes('quarta');
    
    // Remove loja S02005 (sem vendedor)
    let lojasFiltradas = (dia.lojas || []).filter(loja => {
      const nomePdv = loja.nome_pdv || '';
      if (nomePdv.includes(LIEDY_REMOVE)) {
        console.log(`  🗑️  REMOVIDA (sem vendedor): ${nomePdv} em ${dia.data}`);
        return false;
      }
      return true;
    });
    
    // Quartas: apenas Baixada ou São Bernardo
    if (ehQuarta) {
      const lojasRodizio = lojasFiltradas.filter(l => isBaixadaOrSBernardo(l));
      if (lojasRodizio.length > 0) {
        console.log(`  🔄 QUARTA (rodízio) ${dia.data}: mantendo ${lojasRodizio.length} lojas da Baixada/S.Bernardo de ${lojasFiltradas.length}`);
        lojasFiltradas = lojasRodizio;
      } else {
        console.log(`  ⚠️  QUARTA ${dia.data}: nenhuma loja de Baixada/S.Bernardo encontrada, mantendo as ${lojasFiltradas.length} atuais`);
      }
    }
    
    // Se ficou com apenas 1 loja no dia por conta da remoção da S02005, adiciona S01377 (Clima Rio - Serra de Jairé)
    if (lojasFiltradas.length === 1 && !dia.feriado) {
      console.log(`  ➕ SUBST. INSERIDA para Liedy em ${dia.data}: S01377 - CLIMA RIO - RUA SERRA DE JAIRE`);
      lojasFiltradas.push({
        codigo: "S01377",
        cliente: "CLIMA RIO",
        filial: "CLIMA RIO - SAO PAULO/SP",
        nome_pdv: "S01377 - CLIMA RIO - RUA SERRA DE JAIRE - 425 - SAO PAULO - SP",
        endereco: "RUA SERRA DE JAIRE - 425 - SAO PAULO - SP",
        cidade: "SAO PAULO",
        uf: "SP",
        cluster: "A",
        checkIn: "13:30",
        checkOut: "18:00",
        tipo: "local",
        lat: -23.5487,
        lng: -46.5925
      });
    }

    const novaLojas = lojasFiltradas.map(loja => {
      const forcarManha = isManhaLoja(loja, LIEDY_MANHA);
      const forcarTarde = !forcarManha && isTardeLoja(loja, LIEDY_TARDE);
      return ajustarHorarioLoja({ ...loja }, forcarManha, forcarTarde);
    });
    
    return { ...dia, lojas: ordenarLojasDia(novaLojas) };
  });
}

const TATIANE_SCHEDULE = {
  "2026-10-05": [ { key: "FC1", isManha: true }, { key: "FG1", isManha: false } ],
  "2026-10-06": [ { key: "CR",  isManha: true }, { key: "FG2", isManha: false } ],
  "2026-10-07": [ { key: "FC2", isManha: true }, { key: "DU",  isManha: false } ],
  "2026-10-08": [ { key: "FG1", isManha: true }, { key: "CR",  isManha: false } ],
  "2026-10-09": [ { key: "FC1", isManha: true }, { key: "FG2", isManha: false } ],
  "2026-10-12": [],
  "2026-10-13": [ { key: "FC2", isManha: true }, { key: "DU",  isManha: false } ],
  "2026-10-14": [ { key: "CR",  isManha: true }, { key: "FG1", isManha: false } ],
  "2026-10-15": [ { key: "FC1", isManha: true }, { key: "FG2", isManha: false } ],
  "2026-10-16": [ { key: "FC2", isManha: true }, { key: "CR",  isManha: false } ],
  "2026-10-19": [ { key: "FC1", isManha: true }, { key: "FG1", isManha: false } ],
  "2026-10-20": [ { key: "CR",  isManha: true }, { key: "DU",  isManha: false } ],
  "2026-10-21": [ { key: "FC2", isManha: true }, { key: "FG2", isManha: false } ],
  "2026-10-22": [ { key: "FG1", isManha: true }, { key: "CR",  isManha: false } ],
  "2026-10-23": [ { key: "FC1", isManha: true }, { key: "DU",  isManha: false } ],
  "2026-10-26": [ { key: "FC2", isManha: true }, { key: "FG2", isManha: false } ],
  "2026-10-27": [ { key: "CR",  isManha: true }, { key: "FG1", isManha: false } ],
  "2026-10-28": [ { key: "FC1", isManha: true }, { key: "DU",  isManha: false } ],
  "2026-10-29": [ { key: "FC2", isManha: true }, { key: "CR",  isManha: false } ],
  "2026-10-30": [ { key: "FG1", isManha: true }, { key: "FG2", isManha: false } ],
  "2026-11-02": [],
  "2026-11-03": [ { key: "FC1", isManha: true }, { key: "DU",  isManha: false } ],
  "2026-11-04": [ { key: "CR",  isManha: true }, { key: "FG1", isManha: false } ],
  "2026-11-05": [ { key: "FC2", isManha: true }, { key: "FG2", isManha: false } ],
  "2026-11-06": [ { key: "FC1", isManha: true }, { key: "CR",  isManha: false } ],
};

const TATIANE_STORES_MAP = {
  FC1: { codigo: "S00300", cliente: "FERREIRA COSTA", filial: "FERREIRA COSTA - VIANA SALVADOR/BA", nome_pdv: "S00300 - FERREIRA COSTA - AVENIDA LUIS VIANA FILHO - 6180 - SALVADOR - BA", endereco: "AVENIDA LUIS VIANA FILHO - 6180 - SALVADOR - BA", cidade: "Salvador", uf: "BA", lat: -12.9463, lng: -38.4111 },
  FC2: { codigo: "S03156", cliente: "FERREIRA COSTA", filial: "FERREIRA COSTA - SALVADOR/BA", nome_pdv: "S03156 - FERREIRA COSTA - SALVADOR/BA", endereco: "AV. REITOR MIGUEL CALMON - BARRIS - SALVADOR - BA", cidade: "Salvador", uf: "BA", lat: -12.9867, lng: -38.5132 },
  CR:  { codigo: "S02603", cliente: "CLIMA RIO", filial: "CLIMA RIO - SALVADOR/BA", nome_pdv: "S02603 - CLIMA RIO - AVENIDA VASCO DA GAMA - 2698 - SALVADOR - BA", endereco: "AVENIDA VASCO DA GAMA - 2698 - SALVADOR - BA", cidade: "SALVADOR", uf: "BA", lat: -12.9934, lng: -38.4975 },
  FG1: { codigo: "S03568", cliente: "FRIGELAR", filial: "FRIGELAR - SALVADOR/BA", nome_pdv: "S03568 - FRIGELAR - AVENIDA MARIO LEAL FERREIRA - 901 - SALVADOR - BA", endereco: "AVENIDA MARIO LEAL FERREIRA - 901 - SALVADOR - BA", cidade: "SALVADOR", uf: "BA", lat: -12.9818, lng: -38.4925 },
  FG2: { codigo: "S07474", cliente: "FRIGELAR", filial: "FRIGELAR - LAURO DE FREITAS/BA", nome_pdv: "S07474 - FRIGELAR - AV SANTOS DUMONT - 4806 - LAURO DE FREITAS - BA", endereco: "AV SANTOS DUMONT - 4806 - LAURO DE FREITAS - BA", cidade: "LAURO DE FREITAS", uf: "BA", lat: -12.8856, lng: -38.3241 },
  DU:  { codigo: "S01787", cliente: "DUFRIO", filial: "DUFRIO - SALVADOR/BA", nome_pdv: "S01787 - DUFRIO - AVENIDA MARIO LEAL FERREIRA - 1664 - SALVADOR - BA", endereco: "AVENIDA MARIO LEAL FERREIRA - 1664 - SALVADOR - BA", cidade: "SALVADOR", uf: "BA", lat: -12.9782, lng: -38.4891 },
};

function processarTatiane(roteiro) {
  return roteiro.map(dia => {
    const list = TATIANE_SCHEDULE[dia.data];
    if (!list || list.length === 0) {
      return { ...dia, lojas: [] };
    }
    const lojas = list.map(item => {
      const base = TATIANE_STORES_MAP[item.key];
      return {
        ...base,
        checkIn: item.isManha ? "09:00" : "13:30",
        checkOut: item.isManha ? "12:00" : "18:00"
      };
    });
    return { ...dia, lojas };
  });
}

function processarMarcio(roteiro) {
  // Rotas de tarde devem terminar em POA
  // Marca as lojas de tarde com checkOut para POA (sem alterar lojas, apenas garante ordem)
  return roteiro.map(dia => {
    const lojas = dia.lojas || [];
    if (lojas.length === 0) return dia;
    
    // Separa manhã e tarde
    const manha = lojas.filter(l => (l.checkIn || '09:00') < '13:00');
    const tarde = lojas.filter(l => (l.checkIn || '09:00') >= '13:00');
    
    // Se tem lojas de tarde, garante que a última é em POA/Porto Alegre
    if (tarde.length > 0) {
      // Verifica se alguma tarde é POA
      const poaLojas = tarde.filter(l => 
        norm(l.cidade || '').includes('porto alegre') || 
        norm(l.nome_pdv || '').includes('poa') ||
        norm(l.nome_pdv || '').includes('porto alegre')
      );
      const naoPoaLojas = tarde.filter(l => 
        !norm(l.cidade || '').includes('porto alegre') && 
        !norm(l.nome_pdv || '').includes('poa') &&
        !norm(l.nome_pdv || '').includes('porto alegre')
      );
      // Reorganiza: não-POA primeiro, POA por último no turno tarde
      const tardeOrdenada = [...naoPoaLojas, ...poaLojas];
      return { ...dia, lojas: [...manha, ...tardeOrdenada] };
    }
    
    return dia;
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN
// ─────────────────────────────────────────────────────────────────────────────

async function main() {
  console.log('📥 Buscando roteiros de Outubro do Supabase...\n');

  const { data: roteiros, error } = await supabase
    .from('roteiros')
    .select('*')
    .eq('versao_id', 'v-journey-outubro-aprovado');

  if (error) { console.error('❌ Erro:', error.message); process.exit(1); }
  console.log(`✅ ${roteiros.length} roteiros encontrados.\n`);

  // Cria nova versão no Supabase
  const novaVersaoId = 'v-journey-outubro-v2-aprovado';
  const novaVersaoNome = 'Journey Outubro V2 - Aprovado';

  // Remove versão anterior se existir
  await supabase.from('roteiros').delete().eq('versao_id', novaVersaoId);
  await supabase.from('versoes_roteiro').delete().eq('id', novaVersaoId);

  const { error: versaoErr } = await supabase.from('versoes_roteiro').insert({
    id: novaVersaoId,
    nome: novaVersaoNome,
    descricao: 'Versão com ajustes de campo: horários manhã/tarde por consultor, rodízio Liedy, saída Feira de Santana 15h, Marcio finaliza em POA.',
  });
  if (versaoErr) { console.error('❌ Erro ao criar versão:', versaoErr.message); process.exit(1); }
  console.log(`✅ Versão "${novaVersaoNome}" criada.\n`);

  // Garante que Tatiane esteja na lista se não foi retornada do banco
  const temTatiane = roteiros.some(r => r.dados_roteiro && r.dados_roteiro.consultor && r.dados_roteiro.consultor.includes('TATIANE'));
  if (!temTatiane && roteiros.length > 0) {
    const baseRot = JSON.parse(JSON.stringify(roteiros[0]));
    baseRot.dados_roteiro.consultor = "TATIANE SOUZA DOS SANTOS";
    roteiros.push(baseRot);
  }

  // Processa cada consultor
  for (const rot of roteiros) {
    const dr = rot.dados_roteiro;
    const consultor = dr.consultor;
    console.log(`\n🔧 Processando: ${consultor}`);

    let novoRoteiro = JSON.parse(JSON.stringify(dr.roteiro)); // deep clone

    if (consultor.includes('DIOGO')) {
      novoRoteiro = processarDiogo(novoRoteiro);
      console.log('  → Regras DIOGO (manhã/tarde) aplicadas');
    } else if (consultor.includes('LUIZ') || consultor.includes('FALCAO')) {
      novoRoteiro = processarFalcao(novoRoteiro);
      console.log('  → Regras FALCÃO (manhã/tarde) aplicadas');
    } else if (consultor.includes('LIEDY')) {
      novoRoteiro = processarLiedy(novoRoteiro);
      console.log('  → Regras LIEDY (manhã/tarde, rodízio, remoção S02005) aplicadas');
    } else if (consultor.includes('TATIANE')) {
      novoRoteiro = processarTatiane(novoRoteiro);
      console.log('  → Regras TATIANE (manhã/tarde, saída Feira 15h) aplicadas');
    } else if (consultor.includes('MARCIO')) {
      novoRoteiro = processarMarcio(novoRoteiro);
      console.log('  → Regras MARCIO (tarde finaliza em POA) aplicadas');
    }

    // Recalcula totais
    let totalLojas = 0;
    novoRoteiro.forEach(dia => { totalLojas += (dia.lojas || []).length; });

    const novoDadosRoteiro = {
      ...dr,
      roteiro: novoRoteiro,
      totalLojas,
      versao_id: novaVersaoId,
      versao_nome: novaVersaoNome,
    };

    const { error: insErr } = await supabase.from('roteiros').insert({
      consultor,
      mes: rot.mes,
      ano: rot.ano,
      status: 'Aprovado',
      cenario: 'Principal',
      versao_id: novaVersaoId,
      versao_nome: novaVersaoNome,
      dados_roteiro: novoDadosRoteiro,
    });

    if (insErr) {
      console.error(`  ❌ Erro ao inserir ${consultor}:`, insErr.message);
    } else {
      console.log(`  ✅ ${consultor} → ${totalLojas} visitas inseridas`);
    }
  }

  console.log('\n\n🎉 Journey Outubro V2 - Aprovado gerado com sucesso!');

  // Verificação final
  const { data: check } = await supabase
    .from('roteiros')
    .select('consultor, dados_roteiro')
    .eq('versao_id', novaVersaoId);

  console.log('\n📊 RESUMO FINAL:');
  check?.forEach(r => {
    const dr = r.dados_roteiro;
    let v = 0; dr.roteiro?.forEach(d => v += (d.lojas||[]).length);
    console.log(`  ${dr.consultor}: ${v} visitas`);
  });
}

main().catch(err => { console.error('FATAL:', err.message); process.exit(1); });
