'use client';

import { useEffect, useState, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import { Loader2, Download, RefreshCw, FileText, Calendar as CalendarIcon, User, Edit, Trash2, Activity } from 'lucide-react';
import * as xlsx from 'xlsx';

interface RoteiroSalvo {
  id: string;
  consultor: string;
  mes: number;
  ano: number;
  status: string;
  created_at: string;
  dados_roteiro: any; // A estrutura JSON do roteiro aprovado
}

export default function RoteirosSalvos({ onEdit, onViewConsolidated }: { 
  onEdit?: (roteiro: any) => void;
  onViewConsolidated?: (roteiros: any[]) => void;
}) {
  const [roteiros, setRoteiros] = useState<RoteiroSalvo[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterMes, setFilterMes] = useState<string>('');
  const [filterAno, setFilterAno] = useState<string>('');

  const fetchRoteiros = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('roteiros')
        .select('*')
        .order('created_at', { ascending: false });
        
      if (error) throw error;
      setRoteiros(data || []);
    } catch (e: any) {
      console.error('Erro ao buscar roteiros:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRoteiros();
  }, []);

  const roteirosFiltrados = useMemo(() => {
    return roteiros.filter(r => {
      if (filterMes && r.mes !== parseInt(filterMes)) return false;
      if (filterAno && r.ano !== parseInt(filterAno)) return false;
      return true;
    });
  }, [roteiros, filterMes, filterAno]);

  const handleDelete = async (id: string, consultor: string, mes: number, ano: number) => {
    const confirmado = window.confirm(`Tem certeza que deseja apagar o roteiro de ${consultor} (${mes}/${ano})?`);
    if (!confirmado) return;
    try {
      const { error } = await supabase.from('roteiros').delete().eq('id', id);
      if (error) throw error;
      setRoteiros(prev => prev.filter(r => r.id !== id));
    } catch (e: any) {
      alert('Erro ao apagar roteiro: ' + e.message);
    }
  };

  const handleExportConsolidado = () => {
    if (roteirosFiltrados.length === 0) return;

    // Juntar todos os dias de todos os roteiros filtrados
    const dataToExport = roteirosFiltrados.flatMap((r) => {
      const resultado = r.dados_roteiro;
      if (!resultado || !resultado.roteiro) return [];

      return resultado.roteiro.flatMap((dia: any) => {
        if (dia.feriado && !dia.feriado.startsWith('__viagem')) {
          return [{
            Data: dia.data,
            'Dia da Semana': dia.diaSemana,
            Consultor: resultado.consultor,
            'Nome PDV': dia.feriado,
            'Status': 'FERIADO/FOLGA'
          }];
        }

        return dia.lojas.map((loja: any) => ({
          Data: dia.data,
          'Dia da Semana': dia.diaSemana,
          Consultor: resultado.consultor,
          'Nome PDV': loja.nome_pdv,
          Cliente: loja.cliente,
          Cidade: loja.cidade,
          UF: loja.uf,
          Cluster: loja.cluster,
          'Check-in': loja.checkIn,
          'Check-out': loja.checkOut,
          Tipo: loja.tipo === 'viagem' ? `Viagem (${loja.estadoViagem})` : 'Local'
        }));
      });
    });

    const worksheet = xlsx.utils.json_to_sheet(dataToExport);
    const workbook = xlsx.utils.book_new();
    xlsx.utils.book_append_sheet(workbook, worksheet, "Journey Model Consolidado");
    
    const mesAnoStr = filterMes && filterAno ? `${filterMes}_${filterAno}` : 'Geral';
    const fileName = `Journey_Model_Consolidado_${mesAnoStr}.xlsx`;
    xlsx.writeFile(workbook, fileName);
  };

  const anosDisponiveis = Array.from(new Set(roteiros.map(r => String(r.ano)))).sort();
  const mesesDisponiveis = [
    { v: '1', n: 'Janeiro' }, { v: '2', n: 'Fevereiro' }, { v: '3', n: 'Março' }, 
    { v: '4', n: 'Abril' }, { v: '5', n: 'Maio' }, { v: '6', n: 'Junho' },
    { v: '7', n: 'Julho' }, { v: '8', n: 'Agosto' }, { v: '9', n: 'Setembro' },
    { v: '10', n: 'Outubro' }, { v: '11', n: 'Novembro' }, { v: '12', n: 'Dezembro' }
  ].filter(m => roteiros.some(r => String(r.mes) === m.v));

  return (
    <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200 mt-8">
      <div className="flex flex-col md:flex-row md:items-center justify-between mb-6 gap-4">
        <div>
          <h2 className="text-xl font-semibold flex items-center gap-2">
            <FileText className="w-5 h-5 text-green-600" /> Roteiros Aprovados
          </h2>
          <p className="text-xs text-gray-500 mt-1">Histórico de planejamentos validados no banco de dados.</p>
        </div>
        
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <select 
              value={filterMes} 
              onChange={e => setFilterMes(e.target.value)}
              className="text-xs p-2 border border-gray-300 rounded-lg bg-white outline-none focus:ring-2 focus:ring-green-500"
            >
              <option value="">Mês (Todos)</option>
              {mesesDisponiveis.map(m => <option key={m.v} value={m.v}>{m.n}</option>)}
            </select>
            <select 
              value={filterAno} 
              onChange={e => setFilterAno(e.target.value)}
              className="text-xs p-2 border border-gray-300 rounded-lg bg-white outline-none focus:ring-2 focus:ring-green-500"
            >
              <option value="">Ano (Todos)</option>
              {anosDisponiveis.map(a => <option key={a} value={a}>{a}</option>)}
            </select>
          </div>

          <button 
            onClick={fetchRoteiros}
            className="flex items-center gap-2 px-3 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50"
            title="Atualizar lista"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
          
          <button 
            onClick={() => onViewConsolidated?.(roteirosFiltrados)}
            disabled={roteirosFiltrados.length === 0}
            className="flex items-center gap-2 px-4 py-2 bg-blue-50 text-blue-700 font-bold rounded-xl hover:bg-blue-100 transition-all text-xs disabled:opacity-50"
          >
            <Activity className="w-4 h-4" /> Ver Dashboard Consolidado
          </button>
          
          <button 
            onClick={handleExportConsolidado}
            disabled={roteirosFiltrados.length === 0}
            className="flex items-center gap-2 px-4 py-2 text-sm text-white bg-green-600 rounded-lg hover:bg-green-700 disabled:opacity-50 shadow-sm transition-all"
          >
            <Download className="w-4 h-4" /> Baixar Consolidado ({roteirosFiltrados.length})
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center p-8 text-gray-500">
          <Loader2 className="w-6 h-6 animate-spin" />
        </div>
      ) : roteirosFiltrados.length === 0 ? (
        <div className="text-center p-8 text-gray-500 bg-gray-50 rounded-lg border border-dashed">
          Nenhum roteiro encontrado para os filtros selecionados.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left text-gray-500">
            <thead className="text-xs text-gray-700 uppercase bg-gray-50 border-b">
              <tr>
                <th className="px-6 py-3">Consultor</th>
                <th className="px-6 py-3">Referência</th>
                <th className="px-6 py-3">Status</th>
                <th className="px-6 py-3">Data de Aprovação</th>
                <th className="px-6 py-3 text-right">Ações</th>
              </tr>
            </thead>
            <tbody>
              {roteirosFiltrados.map(roteiro => (
                <tr key={roteiro.id} className="bg-white border-b hover:bg-gray-50">
                  <td className="px-6 py-4 font-medium text-gray-900 flex items-center gap-2">
                    <User className="w-4 h-4 text-gray-400" /> {roteiro.consultor}
                  </td>
                  <td className="px-6 py-4 flex items-center gap-2">
                    <CalendarIcon className="w-4 h-4 text-gray-400" /> {roteiro.mes}/{roteiro.ano}
                  </td>
                  <td className="px-6 py-4">
                    <span className="px-2.5 py-1 bg-green-100 text-green-800 rounded-full text-xs font-medium">
                      {roteiro.status}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    {new Date(roteiro.created_at).toLocaleString('pt-BR')}
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex items-center justify-end gap-3">
                      <button 
                        onClick={() => onEdit && onEdit(roteiro.dados_roteiro)}
                        className="text-blue-600 hover:text-blue-900 flex items-center gap-1"
                      >
                        <Edit className="w-4 h-4" /> Carregar
                      </button>
                      <button 
                        onClick={() => handleDelete(roteiro.id, roteiro.consultor, roteiro.mes, roteiro.ano)}
                        className="text-red-500 hover:text-red-700 flex items-center gap-1"
                      >
                        <Trash2 className="w-4 h-4" /> Apagar
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
