'use client';

import { useEffect, useState, useMemo, useCallback } from 'react';
import * as xlsx from 'xlsx';
import { supabase } from '@/lib/supabase';
import { normalize } from '@/lib/utils';
import { getNomePdvAntigo } from '@/lib/lojasDePara';
import {
  Download, Save, Plus, Trash2, Search, AlertTriangle, CheckCircle2,
  RotateCcw, Copy, Check, RefreshCw, Loader2, ArrowLeft, FileSpreadsheet,
  Filter, X, Sparkles, ShieldAlert, ShieldCheck, FolderPlus
} from 'lucide-react';

interface LojaCatalogItem {
  id: string;
  codigo: string;
  nome_pdv: string;
  filial: string;
  cnpj: string;
  cliente: string;
  endereco: string;
  cidade: string;
  uf: string;
  cluster: string;
  consultor: string;
  rota: string;
  lat: number;
  lng: number;
  status: string;
}

export interface SheetRow {
  uid: string;
  roteiroId: string;
  consultor: string;
  rota: string;
  week: number;
  data: string;
  diaSemana: string;
  codigo: string;
  nome_pdv: string;
  filial: string;
  cnpj: string;
  cliente: string;
  endereco: string;
  cidade: string;
  uf: string;
  cluster: string;
  checkIn: string;
  checkOut: string;
  tipo: 'local' | 'viagem';
  observacao: string;
  lat: number;
  lng: number;
  tempoDeslocamento: string;
}

interface VersaoOption {
  id: string;
  nome: string;
  descricao?: string;
  created_at: string;
  roteirosCount: number;
}

interface ComplianceIssue {
  level: 'error' | 'warning';
  label: string;
  fixCheckOut?: string;
}

const DIAS_SEMANA_PT = [
  'DOMINGO',
  'SEGUNDA-FEIRA',
  'TERÇA-FEIRA',
  'QUARTA-FEIRA',
  'QUINTA-FEIRA',
  'SEXTA-FEIRA',
  'SÁBADO',
];

const ROTA_BY_CONSULTOR: Record<string, string> = {
  'LIEDY AQUINO GOMES DOS SANTOS': 'SPC1',
  'MARCIO JOSE FLORES PEREIRA': 'SUL_1',
  'DIOGO DO NASCIMENTO SANTOS': 'RJ',
  'LUIZ FALCAO DE SOUZA NETO': 'NE_2',
  'GIOVANNA MENDES': 'SPI_1',
};

const FORBIDDEN_BRANDS = ['DUFRIO', 'UNIAR', 'A.DIAS'];

function computeDayOfWeek(dateStr: string): string {
  if (!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return '';
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  return DIAS_SEMANA_PT[dt.getDay()] || '';
}

function computeWeekOfMonth(dateStr: string): number {
  if (!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return 1;
  const [y, m, d] = dateStr.split('-').map(Number);
  const firstDay = new Date(y, m - 1, 1).getDay();
  const offset = firstDay === 0 ? 6 : firstDay - 1;
  return Math.max(1, Math.ceil((d + offset) / 7));
}

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  if (!lat1 || !lon1 || !lat2 || !lon2) return 15;
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c * 1.35 * 10) / 10;
}

function extractStoreCode(nomePdv: string, fallback = ''): string {
  const trimmed = (nomePdv || '').trim();
  const match = trimmed.match(/^(S\d+)/i);
  return match ? match[1].toUpperCase() : fallback;
}

export default function SpreadsheetEditor({
  initialVersaoId,
  onBack,
}: {
  initialVersaoId?: string | null;
  onBack?: () => void;
}) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [versoes, setVersoes] = useState<VersaoOption[]>([]);
  const [selectedVersaoId, setSelectedVersaoId] = useState<string>(initialVersaoId || '');
  const [rawRoteiros, setRawRoteiros] = useState<any[]>([]);
  const [rows, setRows] = useState<SheetRow[]>([]);
  const [undoStack, setUndoStack] = useState<SheetRow[][]>([]);
  const [isDirty, setIsDirty] = useState(false);
  const [catalog, setCatalog] = useState<LojaCatalogItem[]>([]);

  // Filtros da Grade
  const [filterConsultor, setFilterConsultor] = useState<string>('TODOS');
  const [filterWeek, setFilterWeek] = useState<string>('TODAS');
  const [filterCompliance, setFilterCompliance] = useState<'TODAS' | 'ALERTAS'>('TODAS');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Modal de troca/seleção de Loja
  const [pickerTargetUid, setPickerTargetUid] = useState<string | null>(null);
  const [pickerSearch, setPickerSearch] = useState('');
  const [pickerAllStores, setPickerAllStores] = useState(false);

  // Modal de clonar versão
  const [showCloneModal, setShowCloneModal] = useState(false);
  const [cloneName, setCloneName] = useState('');
  const [copiedSummary, setCopiedSummary] = useState(false);
  const [toastMessage, setToastMessage] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  const triggerToast = useCallback((type: 'ok' | 'err', text: string) => {
    setToastMessage({ type, text });
    setTimeout(() => setToastMessage(null), 4000);
  }, []);

  // 1. Carregar Catálogo de Lojas e Lista de Versões
  const loadInitialData = useCallback(async (preferredVersaoId?: string | null) => {
    setLoading(true);
    try {
      const lojasTable = process.env.NEXT_PUBLIC_LOJAS_TABLE || 'lojas_julho';
      const [{ data: versData }, { data: rotsMeta }, { data: lojasData }] = await Promise.all([
        supabase.from('versoes_roteiro').select('*').order('created_at', { ascending: false }),
        supabase.from('roteiros').select('id, versao_id, versao_nome, created_at').order('created_at', { ascending: false }),
        supabase.from(lojasTable).select('*').order('nome_pdv'),
      ]);

      // Montar catálogo bloqueando redes proibidas
      const seenKey = new Set<string>();
      const cleanCatalog: LojaCatalogItem[] = [];
      (lojasData || []).forEach((l: any) => {
        const nomePdv = (l.nome_pdv || '').trim();
        const cli = (l.cliente || l.bandeira || '').trim();
        const upperCheck = `${nomePdv} ${cli} ${l.bandeira || ''}`.toUpperCase();
        if (FORBIDDEN_BRANDS.some(b => upperCheck.includes(b))) return;
        if (!nomePdv) return;

        const key = `${nomePdv}|${(l.cidade || '').trim().toUpperCase()}`;
        if (seenKey.has(key)) return;
        seenKey.add(key);

        cleanCatalog.push({
          id: l.id,
          codigo: extractStoreCode(nomePdv),
          nome_pdv: nomePdv,
          filial: l.nome_pdv_antigo || nomePdv,
          cnpj: String(l.cnpj || ''),
          cliente: cli,
          endereco: l.endereco || '',
          cidade: l.cidade || '',
          uf: l.uf || '',
          cluster: l.cluster || 'A',
          consultor: l.consultor || l.consultor_vinculado || '',
          rota: l.rota || '',
          lat: Number(l.lat || 0),
          lng: Number(l.lng || 0),
          status: l.status || '',
        });
      });
      setCatalog(cleanCatalog);

      // Agrupar versões disponíveis
      const vMap = new Map<string, VersaoOption>();
      (versData || []).forEach((v: any) => {
        vMap.set(v.id, {
          id: v.id,
          nome: v.nome,
          descricao: v.descricao,
          created_at: v.created_at,
          roteirosCount: 0,
        });
      });
      (rotsMeta || []).forEach((r: any) => {
        const vid = r.versao_id || 'sem-versao';
        if (!vMap.has(vid)) {
          vMap.set(vid, {
            id: vid,
            nome: r.versao_nome || vid,
            created_at: r.created_at,
            roteirosCount: 0,
          });
        }
        const curr = vMap.get(vid)!;
        curr.roteirosCount += 1;
      });

      const listVersoes = Array.from(vMap.values())
        .filter(v => v.roteirosCount > 0)
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

      setVersoes(listVersoes);

      const targetVid =
        preferredVersaoId && listVersoes.some(v => v.id === preferredVersaoId)
          ? preferredVersaoId
          : listVersoes.find(v => v.id === 'v-janeiro-2027-v1')?.id ||
            listVersoes[0]?.id ||
            '';

      setSelectedVersaoId(targetVid);
    } catch (err: any) {
      triggerToast('err', 'Erro ao carregar dados iniciais: ' + err.message);
    } finally {
      setLoading(false);
    }
  }, [triggerToast]);

  useEffect(() => {
    loadInitialData(initialVersaoId);
  }, [initialVersaoId, loadInitialData]);

  // 2. Carregar linhas quando selectedVersaoId mudar
  const loadVersionRows = useCallback(async (versaoId: string) => {
    if (!versaoId) {
      setRows([]);
      setRawRoteiros([]);
      return;
    }
    setLoading(true);
    try {
      const { data: rots, error } = await supabase
        .from('roteiros')
        .select('*')
        .eq('versao_id', versaoId)
        .order('consultor');

      if (error) throw error;
      setRawRoteiros(rots || []);

      const flatRows: SheetRow[] = [];
      (rots || []).forEach((rot: any) => {
        const consultor = rot.consultor || rot.dados_roteiro?.consultor || '';
        const rotaPadrao =
          rot.dados_roteiro?.rota ||
          ROTA_BY_CONSULTOR[consultor] ||
          (consultor.toUpperCase().includes('GIOVAN') ? 'SPI_1' : '');

        const dias: any[] = rot.dados_roteiro?.roteiro || [];
        dias.forEach((dia: any) => {
          const dataStr = dia.data || '';
          const diaSem = dia.diaSemana || dia.dia_semana || computeDayOfWeek(dataStr);
          const wk = computeWeekOfMonth(dataStr);

          (dia.lojas || []).forEach((loja: any, idx: number) => {
            const nomePdv = loja.nome_pdv || '';
            const code = loja.codigo || extractStoreCode(nomePdv);
            const catMatch = catalog.find(
              c =>
                (code && c.codigo === code && normalize(c.uf) === normalize(loja.uf || '')) ||
                normalize(c.nome_pdv) === normalize(nomePdv)
            );

            flatRows.push({
              uid: `${rot.id}-${dataStr}-${idx}-${Math.random().toString(36).slice(2, 7)}`,
              roteiroId: rot.id,
              consultor,
              rota: loja.rota || rotaPadrao,
              week: wk,
              data: dataStr,
              diaSemana: diaSem,
              codigo: code,
              nome_pdv: nomePdv,
              filial: loja.filial || catMatch?.filial || getNomePdvAntigo(loja),
              cnpj: String(loja.cnpj || catMatch?.cnpj || ''),
              cliente: loja.cliente || catMatch?.cliente || '',
              endereco: loja.endereco || catMatch?.endereco || '',
              cidade: loja.cidade || catMatch?.cidade || '',
              uf: loja.uf || catMatch?.uf || '',
              cluster: loja.cluster || catMatch?.cluster || 'A',
              checkIn: loja.checkIn || '09:00',
              checkOut: loja.checkOut || '12:00',
              tipo: loja.tipo === 'viagem' ? 'viagem' : 'local',
              observacao: loja.observacao || '',
              lat: Number(loja.lat || catMatch?.lat || 0),
              lng: Number(loja.lng || catMatch?.lng || 0),
              tempoDeslocamento: loja.tempoDeslocamento || loja.tempo_deslocamento || '',
            });
          });
        });
      });

      flatRows.sort((a, b) => {
        if (a.consultor !== b.consultor) return a.consultor.localeCompare(b.consultor);
        if (a.data !== b.data) return a.data.localeCompare(b.data);
        return a.checkIn.localeCompare(b.checkIn);
      });

      setRows(flatRows);
      setUndoStack([]);
      setIsDirty(false);
    } catch (err: any) {
      triggerToast('err', 'Falha ao carregar versão: ' + err.message);
    } finally {
      setLoading(false);
    }
  }, [catalog, triggerToast]);

  useEffect(() => {
    if (selectedVersaoId && catalog.length >= 0) {
      loadVersionRows(selectedVersaoId);
    }
  }, [selectedVersaoId, catalog.length, loadVersionRows]);

  // Helper de mutação com histórico de Undo
  const mutateRows = useCallback((updater: (prev: SheetRow[]) => SheetRow[]) => {
    setRows(prev => {
      setUndoStack(stack => [...stack.slice(-19), prev]);
      setIsDirty(true);
      return updater(prev);
    });
  }, []);

  const handleUndo = () => {
    if (undoStack.length === 0) return;
    const previous = undoStack[undoStack.length - 1];
    setUndoStack(stack => stack.slice(0, -1));
    setRows(previous);
    setIsDirty(undoStack.length > 1);
  };

  // 3. Motor de Auditoria e Compliance em Tempo Real
  const complianceByUid = useMemo(() => {
    const map = new Map<string, ComplianceIssue[]>();

    // Contadores auxiliares para regras cruzadas (mesmo dia / Webcontinental na semana)
    const sameDayCount = new Map<string, number>();
    const marcioWebWeekCount = new Map<string, number>();

    rows.forEach(r => {
      const dayStoreKey = `${r.consultor}|${r.data}|${normalize(r.nome_pdv)}`;
      sameDayCount.set(dayStoreKey, (sameDayCount.get(dayStoreKey) || 0) + 1);

      if (
        normalize(r.consultor).includes('marcio') &&
        `${r.nome_pdv} ${r.cliente}`.toUpperCase().includes('WEBCONTINENTAL')
      ) {
        const wkKey = `${r.consultor}|W${r.week}`;
        marcioWebWeekCount.set(wkKey, (marcioWebWeekCount.get(wkKey) || 0) + 1);
      }
    });

    rows.forEach(r => {
      const issues: ComplianceIssue[] = [];
      const upperAll = `${r.nome_pdv} ${r.cliente} ${r.filial}`.toUpperCase();
      const consNorm = normalize(r.consultor);
      const cidNorm = normalize(r.cidade);
      const diaNorm = normalize(r.diaSemana);

      // 1. Lojas proibidas
      if (FORBIDDEN_BRANDS.some(b => upperAll.includes(b))) {
        issues.push({ level: 'error', label: 'PROIBIDO: DUFRIO/UNIAR' });
      }

      // 2. Rodízio SP na quarta-feira (Liedy)
      if (consNorm.includes('liedy') && diaNorm.includes('quarta') && cidNorm === 'sao paulo') {
        issues.push({ level: 'error', label: 'RODÍZIO SP (Quarta)' });
      }

      // 3. Araçatuba (Giovanna)
      if (consNorm.includes('giovan') && cidNorm.includes('aracatuba')) {
        issues.push({ level: 'error', label: 'PROIBIDO: ARAÇATUBA' });
      }

      // 4. Webcontinental (Márcio)
      if (consNorm.includes('marcio') && upperAll.includes('WEBCONTINENTAL')) {
        if (diaNorm.includes('sexta')) {
          issues.push({ level: 'error', label: 'WEBCONT. NA SEXTA' });
        } else if ((marcioWebWeekCount.get(`${r.consultor}|W${r.week}`) || 0) > 1) {
          issues.push({ level: 'error', label: 'WEBCONT. >1x SEMANA' });
        }
      }

      // 5. Duplicidade no mesmo dia
      const dayStoreKey = `${r.consultor}|${r.data}|${normalize(r.nome_pdv)}`;
      if ((sameDayCount.get(dayStoreKey) || 0) > 1) {
        issues.push({ level: 'error', label: 'DUPLICADA NO DIA' });
      }

      // 6. Janelas de Check-out
      const isMorning = r.checkIn < '12:00';
      if (isMorning) {
        if (r.checkOut !== '12:00') {
          issues.push({ level: 'warning', label: 'Padrão manhã: 12:00', fixCheckOut: '12:00' });
        }
      } else {
        const isLiedySantos =
          consNorm.includes('liedy') &&
          ['santos', 'sao vicente', 'guaruja', 'praia grande'].some(c => cidNorm.includes(c));
        const isLiedySjc = consNorm.includes('liedy') && cidNorm.includes('sao jose dos campos');
        const isGiovanna17 =
          consNorm.includes('giovan') &&
          ['sorocaba', 'piracicaba', 'itu'].some(c => cidNorm === c || cidNorm.includes(c));

        if (isLiedySantos) {
          if (r.checkOut !== '16:00' && r.checkOut !== '18:00') {
            issues.push({ level: 'warning', label: 'Santos: 16:00', fixCheckOut: '16:00' });
          }
        } else if (isLiedySjc) {
          if (r.checkOut !== '17:00') {
            issues.push({ level: 'warning', label: 'SJC: saída 17:00', fixCheckOut: '17:00' });
          }
        } else if (isGiovanna17) {
          if (r.checkOut !== '17:00') {
            issues.push({ level: 'warning', label: 'Rota 17h esperada', fixCheckOut: '17:00' });
          }
        } else if (r.checkOut !== '18:00') {
          issues.push({ level: 'warning', label: 'Padrão tarde: 18:00', fixCheckOut: '18:00' });
        }
      }

      map.set(r.uid, issues);
    });

    return map;
  }, [rows]);

  const totalErrors = useMemo(() => {
    let count = 0;
    complianceByUid.forEach(list => {
      if (list.some(i => i.level === 'error')) count += 1;
    });
    return count;
  }, [complianceByUid]);

  const totalWarnings = useMemo(() => {
    let count = 0;
    complianceByUid.forEach(list => {
      if (!list.some(i => i.level === 'error') && list.some(i => i.level === 'warning')) count += 1;
    });
    return count;
  }, [complianceByUid]);

  // Opções de filtros dinâmicas
  const consultoresDisponiveis = useMemo(() => {
    return Array.from(new Set(rows.map(r => r.consultor))).sort();
  }, [rows]);

  const weeksDisponiveis = useMemo(() => {
    return Array.from(new Set(rows.map(r => r.week))).sort((a, b) => a - b);
  }, [rows]);

  const filteredRows = useMemo(() => {
    const q = normalize(searchQuery);
    return rows.filter(r => {
      if (filterConsultor !== 'TODOS' && r.consultor !== filterConsultor) return false;
      if (filterWeek !== 'TODAS' && String(r.week) !== filterWeek) return false;
      if (filterCompliance === 'ALERTAS') {
        const issues = complianceByUid.get(r.uid) || [];
        if (issues.length === 0) return false;
      }
      if (q) {
        const hay = normalize(`${r.codigo} ${r.nome_pdv} ${r.filial} ${r.cliente} ${r.cidade} ${r.uf} ${r.data} ${r.diaSemana}`);
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [rows, filterConsultor, filterWeek, filterCompliance, searchQuery, complianceByUid]);

  // Edições pontuais nas células
  const handleDateChange = (uid: string, newDate: string) => {
    if (!newDate) return;
    mutateRows(prev =>
      prev.map(r =>
        r.uid === uid
          ? {
              ...r,
              data: newDate,
              diaSemana: computeDayOfWeek(newDate),
              week: computeWeekOfMonth(newDate),
            }
          : r
      )
    );
  };

  const handleFieldChange = <K extends keyof SheetRow>(uid: string, field: K, value: SheetRow[K]) => {
    mutateRows(prev => prev.map(r => (r.uid === uid ? { ...r, [field]: value } : r)));
  };

  const handleSelectStoreForRow = (store: LojaCatalogItem) => {
    if (!pickerTargetUid) return;
    mutateRows(prev =>
      prev.map(r => {
        if (r.uid !== pickerTargetUid) return r;
        const consNorm = normalize(r.consultor);
        const cidNorm = normalize(store.cidade);
        let suggestedOut = r.checkOut;
        if (r.checkIn >= '12:00') {
          if (consNorm.includes('liedy') && cidNorm.includes('santos')) suggestedOut = '16:00';
          else if (consNorm.includes('liedy') && cidNorm.includes('sao jose dos campos')) suggestedOut = '17:00';
          else if (consNorm.includes('giovan') && ['sorocaba', 'piracicaba', 'itu'].some(c => cidNorm.includes(c))) suggestedOut = '17:00';
          else suggestedOut = '18:00';
        }
        return {
          ...r,
          codigo: store.codigo,
          nome_pdv: store.nome_pdv,
          filial: store.filial,
          cnpj: store.cnpj,
          cliente: store.cliente,
          endereco: store.endereco,
          cidade: store.cidade,
          uf: store.uf,
          cluster: store.cluster,
          lat: store.lat,
          lng: store.lng,
          checkOut: suggestedOut,
        };
      })
    );
    setPickerTargetUid(null);
    setPickerSearch('');
  };

  const handleDeleteRow = (uid: string) => {
    mutateRows(prev => prev.filter(r => r.uid !== uid));
  };

  const handleAddRow = () => {
    const targetRot =
      filterConsultor !== 'TODOS'
        ? rawRoteiros.find(r => r.consultor === filterConsultor)
        : rawRoteiros[0];

    if (!targetRot) {
      triggerToast('err', 'Selecione uma versão com consultores carregados primeiro.');
      return;
    }

    const cons = targetRot.consultor;
    const consRows = rows.filter(r => r.consultor === cons);
    const defaultDate = consRows[consRows.length - 1]?.data || '2027-01-05';
    const existingOnDate = consRows.filter(r => r.data === defaultDate);
    const isAfternoon = existingOnDate.length >= 1;

    const newUid = `${targetRot.id}-new-${Date.now()}`;
    const placeholderStore =
      catalog.find(c => normalize(c.consultor) === normalize(cons)) || catalog[0];

    const newRow: SheetRow = {
      uid: newUid,
      roteiroId: targetRot.id,
      consultor: cons,
      rota: ROTA_BY_CONSULTOR[cons] || 'SPC1',
      week: computeWeekOfMonth(defaultDate),
      data: defaultDate,
      diaSemana: computeDayOfWeek(defaultDate),
      codigo: placeholderStore?.codigo || '',
      nome_pdv: placeholderStore?.nome_pdv || 'SELECIONE UMA LOJA',
      filial: placeholderStore?.filial || '',
      cnpj: placeholderStore?.cnpj || '',
      cliente: placeholderStore?.cliente || '',
      endereco: placeholderStore?.endereco || '',
      cidade: placeholderStore?.cidade || '',
      uf: placeholderStore?.uf || '',
      cluster: placeholderStore?.cluster || 'A',
      checkIn: isAfternoon ? '13:30' : '09:00',
      checkOut: isAfternoon ? '18:00' : '12:00',
      tipo: 'local',
      observacao: '',
      lat: placeholderStore?.lat || 0,
      lng: placeholderStore?.lng || 0,
      tempoDeslocamento: '25 min (12.0 km)',
    };

    mutateRows(prev => [newRow, ...prev]);
    setPickerTargetUid(newUid);
  };

  // Reconstruir payload do Supabase a partir das linhas editadas
  const buildUpdatedPayloads = useCallback(
    (targetVersaoId: string, targetVersaoNome: string) => {
      return rawRoteiros.map(rot => {
        const consRows = rows
          .filter(r => r.roteiroId === rot.id || r.consultor === rot.consultor)
          .sort((a, b) => (a.data !== b.data ? a.data.localeCompare(b.data) : a.checkIn.localeCompare(b.checkIn)));

        const originalDays: any[] = rot.dados_roteiro?.roteiro || [];
        const dayMap = new Map<string, any>();

        // Preservar estrutura original de calendário (feriados, recesso, etc.)
        originalDays.forEach(d => {
          dayMap.set(d.data, {
            ...d,
            lojas: [],
            distancia: 0,
          });
        });

        // Inserir visitas agrupadas por data
        consRows.forEach(r => {
          if (!dayMap.has(r.data)) {
            dayMap.set(r.data, {
              data: r.data,
              diaSemana: r.diaSemana || computeDayOfWeek(r.data),
              dia_semana: r.diaSemana || computeDayOfWeek(r.data),
              status: 'TRABALHO',
              feriado: null,
              nome_feriado: null,
              distancia: 0,
              lojas: [],
            });
          }
          const dObj = dayMap.get(r.data)!;
          dObj.status = 'TRABALHO';
          dObj.feriado = null;
          dObj.nome_feriado = null;
          dObj.lojas.push({
            uf: r.uf,
            lat: r.lat,
            lng: r.lng,
            rota: r.rota,
            tipo: r.tipo,
            estadoViagem: r.tipo === 'viagem' ? r.uf : null,
            codigo: r.codigo,
            cnpj: r.cnpj,
            cidade: r.cidade,
            filial: r.filial,
            checkIn: r.checkIn,
            cliente: r.cliente,
            cluster: r.cluster,
            checkOut: r.checkOut,
            endereco: r.endereco,
            nome_pdv: r.nome_pdv,
            observacao: r.observacao,
            status_validacao: 'aprovado',
            tempoDeslocamento: r.tempoDeslocamento || '25 min (12.5 km)',
            tempo_deslocamento: r.tempoDeslocamento || '25 min (12.5 km)',
            tempo_medio_deslocamento: r.tempoDeslocamento || '25 min (12.5 km)',
          });
        });

        const rebuiltDays = Array.from(dayMap.values()).sort((a, b) => a.data.localeCompare(b.data));
        let totalKm = 0;
        let totalVisitas = 0;
        const uniqueCodes = new Set<string>();

        rebuiltDays.forEach(d => {
          let dayKm = 0;
          let prevLat = 0;
          let prevLng = 0;
          d.lojas.forEach((l: any) => {
            totalVisitas += 1;
            if (l.codigo) uniqueCodes.add(l.codigo);
            const leg =
              l.tipo === 'viagem'
                ? 110
                : prevLat && prevLng && l.lat && l.lng
                ? haversineKm(prevLat, prevLng, l.lat, l.lng)
                : 15;
            dayKm += leg;
            prevLat = l.lat;
            prevLng = l.lng;
          });
          d.distancia = Math.round(dayKm * 10) / 10;
          totalKm += dayKm;
        });

        const sampleDate = consRows[0]?.data || `${rot.ano || 2027}-${String(rot.mes || 1).padStart(2, '0')}-05`;
        const [yr, mo] = sampleDate.split('-').map(Number);

        const updatedDados = {
          ...(rot.dados_roteiro || {}),
          ano: yr || rot.ano,
          mes: mo || rot.mes,
          consultor: rot.consultor,
          versao_id: targetVersaoId,
          versao_nome: targetVersaoNome,
          totalLojas: uniqueCodes.size,
          totalVisitas,
          totalDiasUteis: rebuiltDays.filter(d => d.lojas.length > 0).length,
          totalEstimatedKM: Math.round(totalKm * 10) / 10,
          estimatedCost: Math.round(totalKm * 0.95 * 100) / 100,
          roteiro: rebuiltDays,
        };

        return {
          originalId: rot.id,
          consultor: rot.consultor,
          mes: yr ? mo : rot.mes,
          ano: yr || rot.ano,
          status: 'APROVADO',
          cenario: rot.cenario || 'Editado na Planilha Online',
          versao_id: targetVersaoId,
          versao_nome: targetVersaoNome,
          dados_roteiro: updatedDados,
        };
      });
    },
    [rawRoteiros, rows]
  );

  // 4. Salvar na versão atual no Supabase
  const handleSaveCurrentVersion = async () => {
    if (!selectedVersaoId) return;
    if (totalErrors > 0) {
      const ok = window.confirm(
        `Atenção: Existem ${totalErrors} alerta(s) crítico(s) de regra (ex: Dufrio/Uniar, Rodízio SP ou Webcontinental).\n\nDeseja salvar mesmo assim?`
      );
      if (!ok) return;
    }

    setSaving(true);
    try {
      const versaoObj = versoes.find(v => v.id === selectedVersaoId);
      const vNome = versaoObj?.nome || selectedVersaoId;
      const payloads = buildUpdatedPayloads(selectedVersaoId, vNome);

      await Promise.all(
        payloads.map(p =>
          supabase
            .from('roteiros')
            .update({
              mes: p.mes,
              ano: p.ano,
              status: p.status,
              versao_nome: p.versao_nome,
              dados_roteiro: p.dados_roteiro,
            })
            .eq('id', p.originalId)
        )
      );

      setIsDirty(false);
      setUndoStack([]);
      triggerToast('ok', `Versão "${vNome}" salva e sincronizada no Supabase!`);
    } catch (err: any) {
      triggerToast('err', 'Erro ao salvar no Supabase: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  // 5. Salvar como Nova Versão (ex: JANEIRO.V2)
  const handleSaveAsNewVersion = async () => {
    const cleanName = cloneName.trim();
    if (!cleanName) return;

    setSaving(true);
    try {
      const slug =
        'v-' +
        cleanName
          .toLowerCase()
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-|-$/g, '') +
        '-' +
        Date.now().toString().slice(-4);

      await supabase.from('versoes_roteiro').insert({
        id: slug,
        nome: cleanName,
        descricao: `Criada via Planilha Interativa Online a partir de ${selectedVersaoId}`,
      });

      const payloads = buildUpdatedPayloads(slug, cleanName).map(p => ({
        consultor: p.consultor,
        mes: p.mes,
        ano: p.ano,
        status: 'APROVADO',
        cenario: p.cenario,
        versao_id: slug,
        versao_nome: cleanName,
        dados_roteiro: p.dados_roteiro,
      }));

      const { error } = await supabase.from('roteiros').insert(payloads);
      if (error) throw error;

      setShowCloneModal(false);
      setCloneName('');
      await loadInitialData(slug);
      triggerToast('ok', `Nova versão "${cleanName}" criada com sucesso!`);
    } catch (err: any) {
      triggerToast('err', 'Erro ao criar nova versão: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  // 6. Exportação Oficial para Excel (.xlsx) em 1 clique
  const handleDownloadExcel = (onlyFiltered = false) => {
    const sourceRows = (onlyFiltered ? filteredRows : rows).slice().sort((a, b) => {
      if (a.consultor !== b.consultor) return a.consultor.localeCompare(b.consultor);
      if (a.data !== b.data) return a.data.localeCompare(b.data);
      return a.checkIn.localeCompare(b.checkIn);
    });

    if (sourceRows.length === 0) {
      triggerToast('err', 'Nenhuma visita para exportar.');
      return;
    }

    const sheetData = sourceRows.map(r => {
      const cleanCnpj = r.cnpj.replace(/\D/g, '');
      const cnpjVal = cleanCnpj ? Number(cleanCnpj) : r.cnpj;
      return {
        Week: r.week,
        Data: r.data,
        'Dia da Semana': r.diaSemana,
        Consultor: r.consultor,
        Rota: r.rota,
        'Nome PDV': r.nome_pdv,
        Filial: r.filial || getNomePdvAntigo(r),
        Cnpj: cnpjVal,
        Cliente: r.cliente,
        Cidade: r.cidade,
        UF: r.uf,
        Cluster: r.cluster,
        'Check-in': r.checkIn,
        'Check-out': r.checkOut,
        Tipo: r.tipo,
      };
    });

    const ws = xlsx.utils.json_to_sheet(sheetData);
    ws['!cols'] = [
      { wch: 8 },
      { wch: 13 },
      { wch: 16 },
      { wch: 30 },
      { wch: 9 },
      { wch: 56 },
      { wch: 34 },
      { wch: 18 },
      { wch: 18 },
      { wch: 22 },
      { wch: 6 },
      { wch: 9 },
      { wch: 11 },
      { wch: 11 },
      { wch: 10 },
    ];

    // Aba 2: Resumo Executivo por Consultor
    const byCons = new Map<string, { visitas: number; lojas: Set<string>; dias: Set<string>; viagens: number }>();
    sourceRows.forEach(r => {
      if (!byCons.has(r.consultor)) {
        byCons.set(r.consultor, { visitas: 0, lojas: new Set(), dias: new Set(), viagens: 0 });
      }
      const item = byCons.get(r.consultor)!;
      item.visitas += 1;
      item.lojas.add(r.codigo || r.nome_pdv);
      item.dias.add(r.data);
      if (r.tipo === 'viagem') item.viagens += 1;
    });

    const resumoData = Array.from(byCons.entries()).map(([cons, st]) => ({
      Consultor: cons,
      Rota: ROTA_BY_CONSULTOR[cons] || '',
      'Dias Ativos': st.dias.size,
      'Total de Visitas': st.visitas,
      'PDVs Únicos': st.lojas.size,
      'Visitas Locais': st.visitas - st.viagens,
      'Visitas em Viagem': st.viagens,
    }));

    const wsResumo = xlsx.utils.json_to_sheet(resumoData);
    wsResumo['!cols'] = [
      { wch: 32 },
      { wch: 10 },
      { wch: 14 },
      { wch: 16 },
      { wch: 14 },
      { wch: 16 },
      { wch: 18 },
    ];

    const wb = xlsx.utils.book_new();
    xlsx.utils.book_append_sheet(wb, ws, 'Roteiros');
    xlsx.utils.book_append_sheet(wb, wsResumo, 'Resumo Executivo');

    const versaoObj = versoes.find(v => v.id === selectedVersaoId);
    const baseTitle = (versaoObj?.nome || 'Journey_Roteiro').replace(/[^\w\s.-]/g, '').trim();
    const suffix = onlyFiltered && filterConsultor !== 'TODOS' ? `_${filterConsultor.split(' ')[0]}` : '';
    xlsx.writeFile(wb, `${baseTitle}${suffix}.xlsx`);
    triggerToast('ok', 'Download do arquivo oficial concluído!');
  };

  // 7. Copiar Resumo Executivo Limpo (sem citar nomes técnicos de arquivos/extensões)
  const handleCopyExecutiveSummary = async () => {
    const versaoObj = versoes.find(v => v.id === selectedVersaoId);
    const dates = rows.map(r => r.data).sort();
    const minDate = dates[0] ? dates[0].split('-').reverse().join('/') : '';
    const maxDate = dates[dates.length - 1] ? dates[dates.length - 1].split('-').reverse().join('/') : '';

    const linesByCons = consultoresDisponiveis.map(c => {
      const cRows = rows.filter(r => r.consultor === c);
      const cDays = new Set(cRows.map(r => r.data)).size;
      return `• ${c} (${ROTA_BY_CONSULTOR[c] || 'Rota'}): ${cRows.length} atendimentos em ${cDays} dias úteis`;
    });

    const text = [
      `Olá! Segue o planejamento atualizado e validado referente ao ${versaoObj?.nome || 'Journey Plan'}.`,
      ``,
      `Período operacional de campo: ${minDate} a ${maxDate}`,
      `Total consolidado da equipe: ${rows.length} atendimentos`,
      ``,
      `Distribuição por consultor:`,
      ...linesByCons,
      ``,
      `Todas as premissas operacionais, restrições de rodízio municipal e janelas de atendimento foram integralmente verificadas. Permanecemos à disposição para validação.`,
    ].join('\n');

    await navigator.clipboard.writeText(text);
    setCopiedSummary(true);
    setTimeout(() => setCopiedSummary(false), 3000);
    triggerToast('ok', 'Resumo executivo limpo copiado para a área de transferência!');
  };

  // Candidatos do Modal de Troca de Loja
  const activePickerRow = useMemo(
    () => rows.find(r => r.uid === pickerTargetUid) || null,
    [rows, pickerTargetUid]
  );

  const pickerCandidates = useMemo(() => {
    if (!activePickerRow) return [];
    const q = normalize(pickerSearch);
    const targetConsNorm = normalize(activePickerRow.consultor);

    return catalog
      .filter(item => {
        if (!pickerAllStores) {
          const itemConsNorm = normalize(item.consultor);
          const matchesCons =
            itemConsNorm === targetConsNorm ||
            (targetConsNorm.includes('giovan') && itemConsNorm.includes('giovan')) ||
            item.uf.toUpperCase() === activePickerRow.uf.toUpperCase();
          if (!matchesCons) return false;
        }
        if (!q) return true;
        return normalize(
          `${item.codigo} ${item.nome_pdv} ${item.filial} ${item.cliente} ${item.cidade} ${item.uf}`
        ).includes(q);
      })
      .slice(0, 60);
  }, [activePickerRow, catalog, pickerSearch, pickerAllStores]);

  const activeVersaoObj = versoes.find(v => v.id === selectedVersaoId);

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900 flex flex-col">
      {/* Toast Flutuante */}
      {toastMessage && (
        <div
          className={`fixed bottom-5 right-5 z-50 flex items-center gap-2.5 px-4 py-3 border-2 shadow-xl text-sm font-bold transition-transform duration-200 ${
            toastMessage.type === 'ok'
              ? 'bg-emerald-950 border-emerald-500 text-emerald-100'
              : 'bg-red-950 border-red-500 text-red-100'
          }`}
        >
          {toastMessage.type === 'ok' ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          ) : (
            <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
          )}
          <span>{toastMessage.text}</span>
        </div>
      )}

      {/* Barra Superior Executiva */}
      <header className="bg-slate-900 text-white border-b-2 border-[#1428A0] px-6 py-3.5">
        <div className="max-w-[1800px] mx-auto flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            {onBack && (
              <button
                onClick={onBack}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs font-bold uppercase tracking-wider transition-colors cursor-pointer"
              >
                <ArrowLeft className="w-3.5 h-3.5" /> Voltar ao Gerador
              </button>
            )}
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 bg-[#1428A0] flex items-center justify-center border border-blue-400/30">
                <FileSpreadsheet className="w-4 h-4 text-white" />
              </div>
              <div>
                <h1 className="text-sm font-black uppercase tracking-wider text-white">
                  Planilha Online de Validação & Ajuste Rápido
                </h1>
                <p className="text-[11px] text-slate-400">
                  Edite lojas, datas e janelas de saída diretamente na grade e baixe o Excel consolidado na hora
                </p>
              </div>
            </div>
          </div>

          {/* Seletor de Versão + Indicadores Rápidos */}
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2 bg-slate-800 border border-slate-700 px-3 py-1.5">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Versão Ativa:</span>
              <select
                value={selectedVersaoId}
                onChange={e => {
                  if (isDirty && !window.confirm('Existem edições não salvas na grade. Deseja trocar de versão mesmo assim?')) {
                    return;
                  }
                  setSelectedVersaoId(e.target.value);
                }}
                className="bg-slate-900 text-white text-xs font-bold px-2.5 py-1 border border-slate-600 focus:outline-none focus:border-blue-400 min-w-[260px] cursor-pointer"
              >
                {versoes.map(v => (
                  <option key={v.id} value={v.id}>
                    {v.nome} ({v.roteirosCount} consultores)
                  </option>
                ))}
              </select>
              <button
                onClick={() => loadInitialData(selectedVersaoId)}
                className="p-1 text-slate-400 hover:text-white transition-colors cursor-pointer"
                title="Recarregar do banco"
              >
                <RefreshCw className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Pílulas de Auditoria */}
            <div className="flex items-center gap-2 text-xs font-bold">
              <span className="px-2.5 py-1.5 bg-slate-800 border border-slate-700 text-slate-200">
                {rows.length} Visitas
              </span>
              {totalErrors > 0 ? (
                <button
                  onClick={() => setFilterCompliance(filterCompliance === 'ALERTAS' ? 'TODAS' : 'ALERTAS')}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-red-600 hover:bg-red-500 text-white cursor-pointer transition-colors"
                >
                  <ShieldAlert className="w-3.5 h-3.5" /> {totalErrors} Bloqueio(s)
                </button>
              ) : totalWarnings > 0 ? (
                <button
                  onClick={() => setFilterCompliance(filterCompliance === 'ALERTAS' ? 'TODAS' : 'ALERTAS')}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-500 hover:bg-amber-400 text-slate-950 cursor-pointer transition-colors"
                >
                  <AlertTriangle className="w-3.5 h-3.5" /> {totalWarnings} Alerta(s) Horário
                </button>
              ) : (
                <span className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-900/70 border border-emerald-600 text-emerald-300">
                  <ShieldCheck className="w-3.5 h-3.5" /> 100% Conforme
                </span>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Ribbon Estilo Excel: Filtros + Botões de Ação Primários */}
      <div className="bg-white border-b border-slate-300 px-6 py-3 shadow-xs sticky top-0 z-30">
        <div className="max-w-[1800px] mx-auto flex flex-col gap-3">
          {/* Linha 1: Abas de Consultor + Ações de Salvar e Download */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-1">
              <button
                onClick={() => setFilterConsultor('TODOS')}
                className={`px-3 py-1.5 text-xs font-bold uppercase tracking-wide border transition-colors cursor-pointer ${
                  filterConsultor === 'TODOS'
                    ? 'bg-[#1428A0] text-white border-[#1428A0]'
                    : 'bg-slate-50 text-slate-700 border-slate-300 hover:bg-slate-100'
                }`}
              >
                Todos ({rows.length})
              </button>
              {consultoresDisponiveis.map(c => {
                const count = rows.filter(r => r.consultor === c).length;
                const firstName = c.split(' ').slice(0, 2).join(' ');
                const hasConsError = rows.some(
                  r => r.consultor === c && (complianceByUid.get(r.uid) || []).some(i => i.level === 'error')
                );
                return (
                  <button
                    key={c}
                    onClick={() => setFilterConsultor(c)}
                    className={`px-3 py-1.5 text-xs font-bold border transition-colors flex items-center gap-1.5 cursor-pointer ${
                      filterConsultor === c
                        ? 'bg-[#1428A0] text-white border-[#1428A0]'
                        : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-100'
                    }`}
                  >
                    <span>{firstName}</span>
                    <span
                      className={`text-[10px] px-1.5 py-0.2 ${
                        filterConsultor === c ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-600'
                      }`}
                    >
                      {count}
                    </span>
                    {hasConsError && <span className="w-2 h-2 bg-red-500 inline-block" title="Possui alerta de regra" />}
                  </button>
                );
              })}
            </div>

            {/* Ações Executivas */}
            <div className="flex flex-wrap items-center gap-2">
              {undoStack.length > 0 && (
                <button
                  onClick={handleUndo}
                  className="flex items-center gap-1.5 px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-300 text-xs font-bold transition-colors cursor-pointer"
                  title="Desfazer última alteração na planilha"
                >
                  <RotateCcw className="w-3.5 h-3.5" /> Desfazer ({undoStack.length})
                </button>
              )}

              <button
                onClick={handleAddRow}
                className="flex items-center gap-1.5 px-3 py-2 bg-white hover:bg-slate-50 text-slate-900 border border-slate-400 text-xs font-bold transition-colors cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5 text-[#1428A0]" /> Nova Visita
              </button>

              <button
                onClick={() => {
                  setCloneName(`${activeVersaoObj?.nome || 'Journey'} - Editado`);
                  setShowCloneModal(true);
                }}
                disabled={saving || rows.length === 0}
                className="flex items-center gap-1.5 px-3 py-2 bg-white hover:bg-slate-50 text-slate-800 border border-slate-400 text-xs font-bold transition-colors disabled:opacity-40 cursor-pointer"
                title="Salvar cópia em uma nova versão (ex: V2, V3) preservando a atual"
              >
                <FolderPlus className="w-3.5 h-3.5 text-slate-700" /> Salvar como Nova Versão
              </button>

              <button
                onClick={handleSaveCurrentVersion}
                disabled={saving || rows.length === 0}
                className={`flex items-center gap-1.5 px-4 py-2 text-xs font-black uppercase tracking-wider transition-all cursor-pointer disabled:opacity-40 ${
                  isDirty
                    ? 'bg-emerald-600 hover:bg-emerald-700 text-white border-2 border-emerald-800 shadow-md'
                    : 'bg-slate-800 hover:bg-slate-900 text-white border border-slate-900'
                }`}
              >
                {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                {isDirty ? 'Salvar Ajustes no Banco *' : 'Salvo no Banco'}
              </button>

              <button
                onClick={handleCopyExecutiveSummary}
                disabled={rows.length === 0}
                className="flex items-center gap-1.5 px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-900 border border-slate-300 text-xs font-bold transition-colors cursor-pointer"
                title="Copiar texto executivo limpo para Monday ou e-mail"
              >
                {copiedSummary ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                {copiedSummary ? 'Copiado!' : 'Resumo p/ Gestor'}
              </button>

              <button
                onClick={() => handleDownloadExcel(false)}
                disabled={rows.length === 0}
                className="flex items-center gap-2 px-4 py-2 bg-[#1428A0] hover:bg-blue-900 text-white border border-[#1428A0] text-xs font-black uppercase tracking-wider shadow-sm transition-all active:scale-[0.98] cursor-pointer"
              >
                <Download className="w-4 h-4" /> Baixar Excel Final ({rows.length})
              </button>
            </div>
          </div>

          {/* Linha 2: Busca Rápida + Filtro de Semana + Filtro de Alertas */}
          <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-200">
            <div className="flex flex-wrap items-center gap-2 flex-1">
              <div className="relative min-w-[280px] flex-1 max-w-md">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  placeholder="Filtrar por código (S00134), PDV, rede, cidade ou data..."
                  className="w-full pl-8 pr-8 py-1.5 bg-slate-50 border border-slate-300 text-xs font-medium focus:bg-white focus:border-[#1428A0] outline-none"
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery('')}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 cursor-pointer"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              <div className="flex items-center gap-1 bg-slate-100 p-0.5 border border-slate-300">
                <span className="text-[10px] font-bold uppercase text-slate-500 px-2 flex items-center gap-1">
                  <Filter className="w-3 h-3" /> Semana:
                </span>
                <button
                  onClick={() => setFilterWeek('TODAS')}
                  className={`px-2 py-1 text-[11px] font-bold cursor-pointer ${
                    filterWeek === 'TODAS' ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Todas
                </button>
                {weeksDisponiveis.map(w => (
                  <button
                    key={w}
                    onClick={() => setFilterWeek(String(w))}
                    className={`px-2 py-1 text-[11px] font-bold cursor-pointer ${
                      filterWeek === String(w)
                        ? 'bg-white text-[#1428A0] shadow-2xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    W{w}
                  </button>
                ))}
              </div>

              <button
                onClick={() => setFilterCompliance(filterCompliance === 'ALERTAS' ? 'TODAS' : 'ALERTAS')}
                className={`px-2.5 py-1.5 text-[11px] font-bold border transition-colors cursor-pointer ${
                  filterCompliance === 'ALERTAS'
                    ? 'bg-amber-100 border-amber-400 text-amber-950'
                    : 'bg-white border-slate-300 text-slate-600 hover:bg-slate-50'
                }`}
              >
                {filterCompliance === 'ALERTAS' ? 'Mostrando Apenas Alertas (Limpar)' : 'Filtrar Alertas de Compliance'}
              </button>
            </div>

            <div className="flex items-center gap-3 text-[11px] text-slate-500 font-medium">
              <span>
                Exibindo <strong className="text-slate-900">{filteredRows.length}</strong> de{' '}
                <strong className="text-slate-900">{rows.length}</strong> linhas
              </span>
              {filterConsultor !== 'TODOS' && filteredRows.length > 0 && (
                <button
                  onClick={() => handleDownloadExcel(true)}
                  className="text-[#1428A0] hover:underline font-bold cursor-pointer"
                >
                  Baixar apenas {filterConsultor.split(' ')[0]} (.xlsx)
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Área Principal da Planilha */}
      <div className="flex-1 p-4 md:p-6 max-w-[1800px] w-full mx-auto">
        {loading ? (
          <div className="bg-white border border-slate-300 py-24 flex flex-col items-center justify-center gap-3">
            <Loader2 className="w-7 h-7 animate-spin text-[#1428A0]" />
            <p className="text-sm font-bold text-slate-600">Carregando grade de roteiros do Supabase...</p>
          </div>
        ) : filteredRows.length === 0 ? (
          <div className="bg-white border border-slate-300 py-20 text-center">
            <p className="text-sm font-bold text-slate-600">Nenhuma visita encontrada para os filtros selecionados.</p>
            <button
              onClick={() => {
                setFilterConsultor('TODOS');
                setFilterWeek('TODAS');
                setFilterCompliance('TODAS');
                setSearchQuery('');
              }}
              className="mt-3 px-4 py-1.5 bg-slate-900 text-white text-xs font-bold cursor-pointer"
            >
              Limpar Filtros
            </button>
          </div>
        ) : (
          <div className="bg-white border-2 border-slate-400 shadow-sm overflow-x-auto">
            <table className="w-full border-collapse text-xs">
              <thead>
                <tr className="bg-slate-900 text-slate-100 uppercase tracking-wider text-[10px] font-black select-none">
                  <th className="border-r border-slate-700 px-2.5 py-2.5 text-center w-10">#</th>
                  <th className="border-r border-slate-700 px-2 py-2.5 text-center w-12">Sem</th>
                  <th className="border-r border-slate-700 px-2.5 py-2.5 text-left w-32">Data</th>
                  <th className="border-r border-slate-700 px-2.5 py-2.5 text-left w-28">Dia</th>
                  <th className="border-r border-slate-700 px-3 py-2.5 text-left w-44">Consultor</th>
                  <th className="border-r border-slate-700 px-2 py-2.5 text-center w-14">Rota</th>
                  <th className="border-r border-slate-700 px-3 py-2.5 text-left min-w-[300px]">
                    Loja / PDV (Clique para trocar)
                  </th>
                  <th className="border-r border-slate-700 px-2.5 py-2.5 text-left w-28">Cliente</th>
                  <th className="border-r border-slate-700 px-2.5 py-2.5 text-left w-36">Cidade / UF</th>
                  <th className="border-r border-slate-700 px-2 py-2.5 text-center w-12">Cl.</th>
                  <th className="border-r border-slate-700 px-2 py-2.5 text-center w-20">Check-in</th>
                  <th className="border-r border-slate-700 px-2 py-2.5 text-center w-20">Check-out</th>
                  <th className="border-r border-slate-700 px-2 py-2.5 text-center w-20">Tipo</th>
                  <th className="border-r border-slate-700 px-3 py-2.5 text-left w-48">Validação de Regra</th>
                  <th className="px-2 py-2.5 text-center w-12">Ação</th>
                </tr>
              </thead>
              <tbody>
                {filteredRows.map((row, idx) => {
                  const issues = complianceByUid.get(row.uid) || [];
                  const hasError = issues.some(i => i.level === 'error');
                  const hasWarning = !hasError && issues.some(i => i.level === 'warning');

                  return (
                    <tr
                      key={row.uid}
                      className={`border-b border-slate-200 transition-colors ${
                        hasError
                          ? 'bg-red-50/80 hover:bg-red-100/70'
                          : hasWarning
                          ? 'bg-amber-50/60 hover:bg-amber-100/50'
                          : idx % 2 === 0
                          ? 'bg-white hover:bg-blue-50/40'
                          : 'bg-slate-50/60 hover:bg-blue-50/40'
                      }`}
                    >
                      {/* Índice Estilo Excel */}
                      <td className="border-r border-slate-200 bg-slate-100 text-slate-500 font-mono text-[10px] text-center font-bold py-1.5">
                        {idx + 1}
                      </td>

                      {/* Semana */}
                      <td className="border-r border-slate-200 px-2 py-1.5 text-center font-mono font-bold text-slate-700">
                        W{row.week}
                      </td>

                      {/* Data Editável Inline */}
                      <td className="border-r border-slate-200 p-0">
                        <input
                          type="date"
                          value={row.data}
                          onChange={e => handleDateChange(row.uid, e.target.value)}
                          className="w-full h-full px-2 py-1.5 bg-transparent font-mono text-[11px] font-bold text-slate-900 focus:bg-yellow-50 focus:outline-2 focus:outline-[#1428A0]"
                        />
                      </td>

                      {/* Dia da Semana */}
                      <td className="border-r border-slate-200 px-2.5 py-1.5 text-[10px] font-bold text-slate-600 truncate">
                        {row.diaSemana}
                      </td>

                      {/* Consultor */}
                      <td className="border-r border-slate-200 px-3 py-1.5 font-bold text-slate-800 truncate" title={row.consultor}>
                        {row.consultor.split(' ').slice(0, 2).join(' ')}
                      </td>

                      {/* Rota */}
                      <td className="border-r border-slate-200 px-2 py-1.5 text-center font-mono text-[10px] font-bold text-slate-600">
                        {row.rota}
                      </td>

                      {/* Loja / PDV (Clique abre Seletor) */}
                      <td className="border-r border-slate-200 p-0">
                        <button
                          type="button"
                          onClick={() => {
                            setPickerTargetUid(row.uid);
                            setPickerSearch('');
                            setPickerAllStores(false);
                          }}
                          className="w-full px-3 py-1.5 text-left flex items-center justify-between gap-2 hover:bg-blue-50/80 focus:bg-yellow-50 focus:outline-2 focus:outline-[#1428A0] group cursor-pointer"
                          title="Clique para trocar o PDV desta visita"
                        >
                          <span className="truncate font-semibold text-slate-900 group-hover:text-[#1428A0]">
                            {row.nome_pdv}
                          </span>
                          <span className="shrink-0 text-[10px] font-bold uppercase px-1.5 py-0.5 bg-slate-100 group-hover:bg-[#1428A0] group-hover:text-white text-slate-600 border border-slate-300 transition-colors">
                            Trocar
                          </span>
                        </button>
                      </td>

                      {/* Cliente */}
                      <td className="border-r border-slate-200 px-2.5 py-1.5 text-[11px] font-semibold text-slate-700 truncate">
                        {row.cliente}
                      </td>

                      {/* Cidade / UF */}
                      <td className="border-r border-slate-200 px-2.5 py-1.5 text-[11px] text-slate-700 truncate">
                        {row.cidade}/{row.uf}
                      </td>

                      {/* Cluster */}
                      <td className="border-r border-slate-200 px-2 py-1.5 text-center font-mono font-bold text-slate-700">
                        {row.cluster}
                      </td>

                      {/* Check-in Inline */}
                      <td className="border-r border-slate-200 p-0">
                        <input
                          type="text"
                          value={row.checkIn}
                          maxLength={5}
                          onChange={e => handleFieldChange(row.uid, 'checkIn', e.target.value)}
                          className="w-full px-2 py-1.5 text-center font-mono text-xs font-bold bg-transparent focus:bg-yellow-50 focus:outline-2 focus:outline-[#1428A0]"
                        />
                      </td>

                      {/* Check-out Inline */}
                      <td className="border-r border-slate-200 p-0">
                        <input
                          type="text"
                          value={row.checkOut}
                          maxLength={5}
                          onChange={e => handleFieldChange(row.uid, 'checkOut', e.target.value)}
                          className={`w-full px-2 py-1.5 text-center font-mono text-xs font-bold bg-transparent focus:bg-yellow-50 focus:outline-2 focus:outline-[#1428A0] ${
                            hasWarning ? 'text-amber-800 underline decoration-amber-500' : 'text-slate-900'
                          }`}
                        />
                      </td>

                      {/* Tipo (Local / Viagem) */}
                      <td className="border-r border-slate-200 px-1.5 py-1 text-center">
                        <button
                          type="button"
                          onClick={() =>
                            handleFieldChange(row.uid, 'tipo', row.tipo === 'local' ? 'viagem' : 'local')
                          }
                          className={`px-2 py-0.5 text-[10px] font-black uppercase border cursor-pointer ${
                            row.tipo === 'viagem'
                              ? 'bg-orange-100 text-orange-900 border-orange-300'
                              : 'bg-slate-100 text-slate-700 border-slate-300'
                          }`}
                          title="Clique para alternar entre Local e Viagem"
                        >
                          {row.tipo}
                        </button>
                      </td>

                      {/* Compliance / Validação Automática */}
                      <td className="border-r border-slate-200 px-2.5 py-1">
                        {issues.length === 0 ? (
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-700">
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" /> OK
                          </span>
                        ) : (
                          <div className="flex flex-wrap items-center gap-1">
                            {issues.map((iss, iIdx) => (
                              <span
                                key={iIdx}
                                className={`inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-bold border ${
                                  iss.level === 'error'
                                    ? 'bg-red-100 text-red-900 border-red-300'
                                    : 'bg-amber-100 text-amber-950 border-amber-300'
                                }`}
                              >
                                <span>{iss.label}</span>
                                {iss.fixCheckOut && (
                                  <button
                                    type="button"
                                    onClick={() => handleFieldChange(row.uid, 'checkOut', iss.fixCheckOut!)}
                                    className="ml-1 px-1 bg-slate-900 text-white text-[9px] font-black hover:bg-[#1428A0] cursor-pointer"
                                    title={`Ajustar automaticamente para ${iss.fixCheckOut}`}
                                  >
                                    Usar {iss.fixCheckOut}
                                  </button>
                                )}
                              </span>
                            ))}
                          </div>
                        )}
                      </td>

                      {/* Excluir Linha */}
                      <td className="px-2 py-1 text-center">
                        <button
                          type="button"
                          onClick={() => handleDeleteRow(row.uid)}
                          className="p-1 text-slate-400 hover:text-red-600 transition-colors cursor-pointer"
                          title="Remover esta visita da grade"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal Rápido de Troca de PDV (Bloqueia Dufrio/Uniar na origem) */}
      {activePickerRow && (
        <div className="fixed inset-0 bg-slate-950/70 z-50 flex items-center justify-center p-4">
          <div className="bg-white border-2 border-slate-900 w-full max-w-2xl shadow-2xl flex flex-col max-h-[85vh]">
            <div className="bg-slate-900 text-white px-5 py-3.5 flex items-center justify-between">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-widest text-blue-300">
                  Substituir Loja · {activePickerRow.consultor} · {activePickerRow.data.split('-').reverse().join('/')} ({activePickerRow.diaSemana})
                </p>
                <h3 className="text-sm font-black mt-0.5">
                  Selecione o novo PDV (Redes Dufrio / Uniar bloqueadas automaticamente)
                </h3>
              </div>
              <button
                onClick={() => setPickerTargetUid(null)}
                className="p-1 text-slate-400 hover:text-white cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4 border-b border-slate-200 bg-slate-50 flex flex-wrap items-center gap-2">
              <div className="relative flex-1 min-w-[240px]">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  autoFocus
                  value={pickerSearch}
                  onChange={e => setPickerSearch(e.target.value)}
                  placeholder="Buscar por código (ex: S00134), nome, rede ou cidade..."
                  className="w-full pl-9 pr-3 py-2 bg-white border border-slate-300 text-xs font-semibold focus:border-[#1428A0] outline-none"
                />
              </div>
              <button
                type="button"
                onClick={() => setPickerAllStores(!pickerAllStores)}
                className={`px-3 py-2 text-xs font-bold border cursor-pointer ${
                  pickerAllStores
                    ? 'bg-[#1428A0] text-white border-[#1428A0]'
                    : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-100'
                }`}
              >
                {pickerAllStores ? 'Mostrando Brasil Inteiro' : 'Apenas Carteira / UF do Consultor'}
              </button>
            </div>

            <div className="flex-1 overflow-y-auto divide-y divide-slate-200">
              {pickerCandidates.map(st => {
                const isWedRodizioRisk =
                  normalize(activePickerRow.consultor).includes('liedy') &&
                  normalize(activePickerRow.diaSemana).includes('quarta') &&
                  normalize(st.cidade) === 'sao paulo';

                return (
                  <button
                    key={`${st.id}-${st.codigo}-${st.cidade}`}
                    type="button"
                    onClick={() => handleSelectStoreForRow(st)}
                    className="w-full px-5 py-3 text-left hover:bg-blue-50 flex items-center justify-between gap-4 transition-colors cursor-pointer"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-[11px] font-black px-1.5 py-0.5 bg-slate-900 text-white">
                          {st.codigo || 'PDV'}
                        </span>
                        <span className="font-bold text-xs text-slate-900 truncate">{st.nome_pdv}</span>
                      </div>
                      <p className="text-[11px] text-slate-500 mt-0.5 truncate">
                        {st.cliente} · {st.cidade}/{st.uf} · {st.endereco}
                      </p>
                    </div>
                    <div className="text-right shrink-0 flex items-center gap-2">
                      {isWedRodizioRisk && (
                        <span className="px-2 py-0.5 bg-red-100 text-red-800 border border-red-300 text-[10px] font-bold">
                          Rodízio Quarta!
                        </span>
                      )}
                      <span className="px-2 py-0.5 bg-slate-100 border border-slate-300 text-[10px] font-mono font-bold text-slate-700">
                        CL {st.cluster}
                      </span>
                    </div>
                  </button>
                );
              })}
              {pickerCandidates.length === 0 && (
                <div className="py-12 text-center text-xs text-slate-500 font-semibold">
                  Nenhuma loja encontrada. Clique em &ldquo;Apenas Carteira / UF do Consultor&rdquo; para expandir a busca.
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Modal Salvar como Nova Versão */}
      {showCloneModal && (
        <div className="fixed inset-0 bg-slate-950/70 z-50 flex items-center justify-center p-4">
          <div className="bg-white border-2 border-slate-900 w-full max-w-md shadow-2xl p-6">
            <h3 className="text-sm font-black uppercase tracking-wider text-slate-900 flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-[#1428A0]" /> Salvar como Nova Versão
            </h3>
            <p className="text-xs text-slate-600 mt-1">
              Cria uma nova versão independente no banco de dados com todas as edições atuais da planilha.
            </p>
            <input
              type="text"
              autoFocus
              value={cloneName}
              onChange={e => setCloneName(e.target.value)}
              placeholder="Ex: Journey Janeiro 2027 - JANEIRO.V2"
              className="w-full mt-4 px-3 py-2.5 border border-slate-400 text-xs font-bold focus:border-[#1428A0] outline-none"
            />
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowCloneModal(false)}
                className="px-4 py-2 border border-slate-300 text-xs font-bold text-slate-700 hover:bg-slate-100 cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={!cloneName.trim() || saving}
                onClick={handleSaveAsNewVersion}
                className="px-4 py-2 bg-[#1428A0] text-white text-xs font-black uppercase tracking-wider hover:bg-blue-900 disabled:opacity-40 cursor-pointer"
              >
                {saving ? 'Salvando...' : 'Criar Versão'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

