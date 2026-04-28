import fs from 'fs';
import path from 'path';
import * as xlsx from 'xlsx';

// Caminhos baseados na raiz do workspace, um nível acima da pasta do app Next.js
const BASE_DIR = path.resolve(process.cwd(), '..');
const CADASTRO_FILE = path.join(BASE_DIR, 'Cadastro_Locais.csv');
const LOJAS_FILE = path.join(BASE_DIR, 'Protrade I Samsung AC I Reestruturação (base de lojas).xlsx');

export interface ConsultorLocal {
  nome: string;
  endereco: string;
  lat: number;
  lng: number;
}

export interface Loja {
  trader: string;
  cliente: string;
  bandeira: string;
  nome_pdv_novo: string;
  cnpj: string;
  endereco: string;
  canal: string;
  consultor: string;
  cidade: string;
  uf: string;
  status: string;
  cluster: string;
  periodo: string;
  lat?: number;
  lng?: number;
}

export async function getConsultoresLocais(): Promise<ConsultorLocal[]> {
  if (!fs.existsSync(CADASTRO_FILE)) {
    throw new Error(`Arquivo não encontrado: ${CADASTRO_FILE}`);
  }

  const content = fs.readFileSync(CADASTRO_FILE, 'utf-8');
  const lines = content.split('\n').filter(line => line.trim() !== '');
  
  const consultores: ConsultorLocal[] = [];
  
  // Pular o cabeçalho (Name;Endereço Residencial;Coordenadas)
  for (let i = 1; i < lines.length; i++) {
    const [nome, endereco, coordenadas] = lines[i].split(';');
    if (nome && endereco && coordenadas) {
      const [latStr, lngStr] = coordenadas.split(',');
      consultores.push({
        nome: nome.trim(),
        endereco: endereco.trim(),
        lat: parseFloat(latStr.trim()),
        lng: parseFloat(lngStr.trim())
      });
    }
  }

  return consultores;
}

export async function getLojas(): Promise<Loja[]> {
  if (!fs.existsSync(LOJAS_FILE)) {
    throw new Error(`Arquivo não encontrado: ${LOJAS_FILE}`);
  }

  const fileBuffer = fs.readFileSync(LOJAS_FILE);
  const workbook = xlsx.read(fileBuffer, { type: 'buffer' });
  const sheetName = workbook.SheetNames[0]; // Pega a primeira aba
  const sheet = workbook.Sheets[sheetName];
  
  // Converte a aba para JSON array
  const rawData = xlsx.utils.sheet_to_json(sheet) as any[];
  
  return rawData.map(row => ({
    trader: row['TRADER'] || '',
    cliente: row['CLIENTE'] || '',
    bandeira: row['BANDEIRA'] || '',
    nome_pdv_novo: row['NOME PDV NOVO'] || '',
    cnpj: row['CNPJ'] ? row['CNPJ'].toString() : '',
    endereco: row['ENDEREÇO'] || '',
    canal: row['CANAL'] || '',
    consultor: row['CONSULTOR'] || '',
    cidade: row['CIDADE'] || '',
    uf: row['UF'] || '',
    status: row['STATUS (ATIVO / NÃO ATIVO)'] || '',
    cluster: row['CLUSTER'] || '',
    periodo: row['PERIODO'] || '',
  }));
}
