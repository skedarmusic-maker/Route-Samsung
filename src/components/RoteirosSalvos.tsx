'use client';

import { useEffect, useState, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import {
  Loader2, Download, RefreshCw, FileText, Calendar as CalendarIcon,
  User, Edit, Trash2, Activity, ChevronRight, ChevronLeft, Tag,
  BarChart3, Package, Clock, AlertCircle
} from 'lucide-react';
import * as xlsx from 'xlsx';

interface RoteiroSalvo {
  id: string;
  consultor: string;
  mes: number;
  ano: number;
  cenario?: string;
  status: string;
  created_at: string;
  versao_id?: string;
  versao_nome?: string;
  dados_roteiro: any;
}

interface Versao {
  id: string;
  nome: string;
  descricao?: string;
  created_at: string;
}

const ROTA_MAP: Record<string, string> = {
  "PAULO SERGIO MARQUES DA SILVA": "SPC2",
  "LIEDY AQUINO GOMES DOS SANTOS": "SPC1",
  "MARCIO JOSE FLORES PEREIRA": "SUL_1",
  "ALEXANDRE RIBEIRO LIMA": "SPI_2",
  "DIOGO DO NASCIMENTO SANTOS": "RJ",
  "TATIANE SOUZA DOS SANTOS": "NE_1",
  "LUIZ FALCAO DE SOUZA NETO": "NE_2"
};

const MESES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

export default function RoteirosSalvos({ onEdit, onViewConsolidated }: {
  onEdit?: (roteiro: any) => void;
  onViewConsolidated?: (roteiros: any[]) => void;
}) {
  const [roteiros, setRoteiros] = useState<RoteiroSalvo[]>([]);
  const [versoes, setVersoes] = useState<Versao[]>([]);
  const [loading, setLoading] = useState(true);
  const [versaoAtiva, setVersaoAtiva] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [deletingVersaoId, setDeletingVersaoId] = useState<string | null>(null);

  const fetchTudo = async () => {
    setLoading(true);
    try {
      const [{ data: rots }, { data: vers }] = await Promise.all([
        supabase.from('roteiros').select('*').order('created_at', { ascending: false }),
        supabase.from('versoes_roteiro').select('*').order('created_at', { ascending: false }),
      ]);
      setRoteiros(rots || []);
      setVersoes(vers || []);
    } catch (e: any) {
      console.error('Erro ao buscar dados:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchTudo(); }, []);

  // Mescla versões oficiais com versões 'descobertas' nos roteiros
  const todasVersoesAgrupadas = useMemo(() => {
    const vMap = new Map<string, any>();
    
    // 1. Adiciona versões oficiais do banco
    versoes.forEach(v => vMap.set(v.id, { ...v, rots: [] }));
    
    // 2. Distribui roteiros e descobre versões órfãs
    roteiros.forEach(r => {
      const vid = r.versao_id || 'sem-versao';
      if (!vMap.has(vid)) {
        vMap.set(vid, { 
          id: vid, 
          nome: r.versao_nome || (vid === 'sem-versao' ? 'Sem Versão' : `Versão ${vid}`),
          created_at: r.created_at,
          rots: [] 
        });
      }
      vMap.get(vid).rots.push(r);
    });
    
    return Array.from(vMap.values()).sort((a, b) => 
      new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );
  }, [roteiros, versoes]);

  const roteirosDaVersao = useMemo(() => {
    if (!versaoAtiva) return [];
    const v = todasVersoesAgrupadas.find(v => v.id === versaoAtiva);
    return v?.rots || [];
  }, [versaoAtiva, todasVersoesAgrupadas]);

  const versaoAtivaObj = todasVersoesAgrupadas.find(v => v.id === versaoAtiva);

  const calcKmTotal = (rots: RoteiroSalvo[]) => {
    return rots.reduce((sum, r) => sum + (r.dados_roteiro?.totalEstimatedKM || 0), 0);
  };

  const calcCustoTotal = (rots: RoteiroSalvo[]) => {
    return rots.reduce((sum, r) => sum + (r.dados_roteiro?.estimatedCost || 0), 0);
  };

  const handleDelete = async (id: string, consultor: string) => {
    if (!window.confirm(`Apagar roteiro de ${consultor}?`)) return;
    try {
      await supabase.from('roteiros').delete().eq('id', id);
      setRoteiros(prev => prev.filter(r => r.id !== id));
    } catch (e: any) {
      alert('Erro ao apagar: ' + e.message);
    }
  };

  const handleDeleteVersao = async (versaoId: string, versaoNome: string) => {
    const rotsNaVersao = (todasVersoesAgrupadas.find(v => v.id === versaoId))?.rots || [];
    if (!window.confirm(
      `Tem certeza que deseja excluir a versão "${versaoNome}"?\n\n` +
      `${rotsNaVersao.length > 0 ? `⚠️ Os ${rotsNaVersao.length} roteiro(s) desta versão serão movidos para "V0 - Legado".` : 'Esta versão está vazia.'}`
    )) return;

    setDeletingVersaoId(versaoId);
    try {
      if (rotsNaVersao.length > 0) {
        await supabase.from('roteiros')
          .update({ versao_id: 'v0-legado', versao_nome: 'V0 - Legado' })
          .eq('versao_id', versaoId);
      }
      await supabase.from('versoes_roteiro').delete().eq('id', versaoId);
      await fetchTudo();
    } catch (e: any) {
      alert('Erro ao excluir versão: ' + e.message);
    } finally {
      setDeletingVersaoId(null);
    }
  };

  const handleExportVersao = (rots: RoteiroSalvo[], versaoNome: string) => {
    const alvo = selectedIds.size > 0 ? rots.filter(r => selectedIds.has(r.id)) : rots;
    if (alvo.length === 0) return;

    const dataToExport = alvo.flatMap((r) => {
      const resultado = r.dados_roteiro;
      if (!resultado || !resultado.roteiro) return [];
      return resultado.roteiro.flatMap((dia: any) => {
        if (dia.feriado && !dia.feriado.startsWith('__viagem')) {
          return [{ Data: dia.data, 'Dia da Semana': dia.diaSemana, Consultor: resultado.consultor, Rota: ROTA_MAP[resultado.consultor] || '', Versão: versaoNome, Cenário: r.cenario || 'Principal', 'Nome PDV': dia.feriado, Status: 'FERIADO/FOLGA' }];
        }
        return (dia.lojas || []).map((loja: any) => ({
          Data: dia.data, 'Dia da Semana': dia.diaSemana,
          Consultor: resultado.consultor, Rota: loja.rota || ROTA_MAP[resultado.consultor] || '',
          Versão: versaoNome, Cenário: r.cenario || 'Principal',
          'Nome PDV': loja.nome_pdv, Cliente: loja.cliente,
          Cidade: loja.cidade, UF: loja.uf, Cluster: loja.cluster,
          'Check-in': loja.checkIn, 'Check-out': loja.checkOut,
          Tipo: loja.tipo === 'viagem' ? `Viagem (${loja.estadoViagem})` : 'Local'
        }));
      });
    });

    const ws = xlsx.utils.json_to_sheet(dataToExport);
    const wb = xlsx.utils.book_new();
    xlsx.utils.book_append_sheet(wb, ws, 'Roteiros');
    xlsx.writeFile(wb, `Route_${versaoNome.replace(/\s+/g, '_')}.xlsx`);
  };

  if (loading) {
    return (
      <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200 mt-8 flex justify-center py-16">
        <Loader2 className="w-6 h-6 animate-spin text-blue-500" />
      </div>
    );
  }

  if (versaoAtiva) {
    const rots = roteirosDaVersao;
    const allSelected = selectedIds.size === rots.length && rots.length > 0;
    const selecionados = rots.filter((r: RoteiroSalvo) => selectedIds.has(r.id));

    return (
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 mt-8 overflow-hidden">
        <div className="px-6 py-4 bg-gradient-to-r from-blue-600 to-blue-700 text-white flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <button onClick={() => { setVersaoAtiva(null); setSelectedIds(new Set()); }} className="flex items-center gap-1.5 text-white/80 hover:text-white text-sm transition-colors">
              <ChevronLeft className="w-4 h-4" /> Versões
            </button>
            <span className="text-white/40">/</span>
            <div className="flex items-center gap-2">
              <Tag className="w-4 h-4 text-blue-200" />
              <span className="font-bold">{versaoAtivaObj?.nome || versaoAtiva}</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => onViewConsolidated?.(selecionados.length > 0 ? selecionados.map((r: RoteiroSalvo) => r.dados_roteiro) : rots.map((r: RoteiroSalvo) => r.dados_roteiro))} disabled={rots.length === 0} className="flex items-center gap-2 px-3 py-1.5 bg-white/15 hover:bg-white/25 rounded-lg text-sm font-medium transition-colors disabled:opacity-50">
              <Activity className="w-4 h-4" /> Dashboard {selecionados.length > 0 && `(${selecionados.length})`}
            </button>
            <button onClick={() => handleExportVersao(rots, versaoAtivaObj?.nome || '')} disabled={rots.length === 0} className="flex items-center gap-2 px-3 py-1.5 bg-white/15 hover:bg-white/25 rounded-lg text-sm font-medium transition-colors disabled:opacity-50">
              <Download className="w-4 h-4" /> Baixar {selecionados.length > 0 ? `(${selecionados.length})` : `(${rots.length})`}
            </button>
          </div>
        </div>

        {versaoAtivaObj?.descricao && (
          <div className="px-6 py-2 bg-blue-50 border-b border-blue-100 text-sm text-blue-700">{versaoAtivaObj.descricao}</div>
        )}

        <div className="grid grid-cols-3 divide-x divide-gray-100 border-b border-gray-100">
          <div className="px-6 py-4 text-center">
            <p className="text-2xl font-bold text-gray-900">{rots.length}</p>
            <p className="text-xs text-gray-500 mt-0.5">Roteiros</p>
          </div>
          <div className="px-6 py-4 text-center">
            <p className="text-2xl font-bold text-gray-900">{calcKmTotal(rots).toLocaleString('pt-BR', { maximumFractionDigits: 0 })} km</p>
            <p className="text-xs text-gray-500 mt-0.5">KM Total Estimado</p>
          </div>
          <div className="px-6 py-4 text-center">
            <p className="text-2xl font-bold text-gray-900">{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(calcCustoTotal(rots))}</p>
            <p className="text-xs text-gray-500 mt-0.5">Custo Total Estimado</p>
          </div>
        </div>

        {rots.length === 0 ? (
          <div className="text-center p-12 text-gray-400">
            <Package className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p className="font-medium">Nenhum roteiro nesta versão ainda.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left text-gray-500">
              <thead className="text-xs text-gray-700 uppercase bg-gray-50 border-b">
                <tr>
                  <th className="px-4 py-3 w-10">
                    <input type="checkbox" checked={allSelected} onChange={e => setSelectedIds(e.target.checked ? new Set(rots.map((r: RoteiroSalvo) => r.id)) : new Set())} className="rounded border-gray-300 text-blue-600 cursor-pointer" />
                  </th>
                  <th className="px-6 py-3">Consultor</th>
                  <th className="px-6 py-3">Referência</th>
                  <th className="px-6 py-3">Cenário</th>
                  <th className="px-6 py-3 text-right">Ações</th>
                </tr>
              </thead>
              <tbody>
                {rots.map((roteiro: RoteiroSalvo) => (
                  <tr key={roteiro.id} className={`border-b hover:bg-gray-50 transition-colors ${selectedIds.has(roteiro.id) ? 'bg-blue-50/40' : 'bg-white'}`}>
                    <td className="px-4 py-4">
                      <input type="checkbox" checked={selectedIds.has(roteiro.id)} onChange={e => {
                        const next = new Set(selectedIds);
                        e.target.checked ? next.add(roteiro.id) : next.delete(roteiro.id);
                        setSelectedIds(next);
                      }} className="rounded border-gray-300 text-blue-600 cursor-pointer" />
                    </td>
                    <td className="px-6 py-4 font-medium text-gray-900">
                      <div className="flex items-center gap-2">
                        <User className="w-4 h-4 text-gray-400 shrink-0" />
                        <span className="truncate max-w-[180px]">{roteiro.consultor}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-gray-600">{MESES[(roteiro.mes || 1) - 1]}/{roteiro.ano}</td>
                    <td className="px-6 py-4 text-blue-600 font-medium text-xs">{roteiro.cenario || 'Principal'}</td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex items-center justify-end gap-3">
                        <button onClick={() => onEdit?.(roteiro.dados_roteiro)} className="text-blue-600 hover:text-blue-900 flex items-center gap-1 text-xs font-medium">
                          <Edit className="w-3.5 h-3.5" /> Carregar
                        </button>
                        <button onClick={() => handleDelete(roteiro.id, roteiro.consultor)} className="text-red-500 hover:text-red-700 flex items-center gap-1 text-xs font-medium">
                          <Trash2 className="w-3.5 h-3.5" /> Apagar
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200 mt-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-semibold flex items-center gap-2">
            <FileText className="w-5 h-5 text-blue-600" /> Versões de Roteiros
          </h2>
          <p className="text-xs text-gray-500 mt-1">Agrupe e compare diferentes cenários de planejamento.</p>
        </div>
        <button onClick={fetchTudo} className="flex items-center gap-2 px-3 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50" title="Atualizar">
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      {todasVersoesAgrupadas.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <BarChart3 className="w-12 h-12 mx-auto mb-3 opacity-25" />
          <p className="font-medium">Nenhum roteiro salvo ainda.</p>
          <p className="text-sm mt-1">Gere um roteiro e clique em "Aprovar e Salvar".</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {todasVersoesAgrupadas.map(versao => {
            const rots = versao.rots || [];
            const kmTotal = calcKmTotal(rots);
            const custoTotal = calcCustoTotal(rots);
            const isLegado = versao.id === 'v0-legado';
            const isSemVersao = versao.id === 'sem-versao';

            if (isSemVersao && rots.length === 0) return null;

            return (
              <div key={versao.id} className={`group relative border rounded-2xl p-5 hover:shadow-md transition-all cursor-pointer bg-white ${
                isSemVersao ? 'border-dashed border-orange-200 hover:border-orange-400' : 'border-gray-200 hover:border-blue-400'
              }`} onClick={() => { setVersaoAtiva(versao.id); setSelectedIds(new Set()); }}>
                {isLegado && <span className="absolute top-3 right-3 text-xs px-2 py-0.5 bg-amber-100 text-amber-700 rounded-full font-medium">Legado</span>}
                {isSemVersao && <span className="absolute top-3 right-3 text-xs px-2 py-0.5 bg-orange-100 text-orange-700 rounded-full font-medium">Não Organizado</span>}

                <div className="flex items-start gap-3 mb-4">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${isLegado ? 'bg-amber-100' : isSemVersao ? 'bg-orange-100' : 'bg-blue-100'}`}>
                    {isSemVersao ? <AlertCircle className="w-5 h-5 text-orange-600" /> : <Tag className={`w-5 h-5 ${isLegado ? 'text-amber-600' : 'text-blue-600'}`} />}
                  </div>
                  <div className="min-w-0 flex-1 pr-12">
                    <h3 className="font-bold text-gray-900 text-sm leading-tight truncate">{versao.nome}</h3>
                    {versao.descricao && <p className="text-xs text-gray-400 mt-0.5 truncate">{versao.descricao}</p>}
                    <p className="text-xs text-gray-400 mt-1 flex items-center gap-1"><Clock className="w-3 h-3" />{new Date(versao.created_at).toLocaleDateString('pt-BR')}</p>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-2 mb-4">
                  <div className="text-center bg-gray-50 rounded-lg py-2">
                    <p className="text-xl font-bold text-gray-800">{rots.length}</p>
                    <p className="text-[10px] text-gray-500 leading-tight">Roteiros</p>
                  </div>
                  <div className="text-center bg-gray-50 rounded-lg py-2">
                    <p className="text-sm font-bold text-gray-800">{kmTotal > 0 ? `${(kmTotal / 1000).toFixed(1)}k` : '—'}</p>
                    <p className="text-[10px] text-gray-500 leading-tight">KM</p>
                  </div>
                  <div className="text-center bg-gray-50 rounded-lg py-2">
                    <p className="text-sm font-bold text-gray-800">{custoTotal > 0 ? `R$${(custoTotal / 1000).toFixed(1)}k` : '—'}</p>
                    <p className="text-[10px] text-gray-500 leading-tight">Custo</p>
                  </div>
                </div>

                <div className="flex items-center justify-between">
                  <span className={`text-xs font-medium flex items-center gap-1 group-hover:gap-2 transition-all ${isSemVersao ? 'text-orange-600' : 'text-blue-600'}`}>
                    {isSemVersao ? 'Ver e organizar' : 'Ver detalhes'} <ChevronRight className="w-3.5 h-3.5" />
                  </span>
                  {!isLegado && !isSemVersao && (
                    <button onClick={e => { e.stopPropagation(); handleDeleteVersao(versao.id, versao.nome); }} disabled={deletingVersaoId === versao.id} className="opacity-0 group-hover:opacity-100 transition-opacity text-red-400 hover:text-red-600 p-1">
                      {deletingVersaoId === versao.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
