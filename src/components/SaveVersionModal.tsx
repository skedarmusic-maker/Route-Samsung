'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { Loader2, PlusCircle, Tag, X, CheckCircle } from 'lucide-react';

interface Versao {
  id: string;
  nome: string;
  descricao?: string;
  created_at: string;
}

interface SaveVersionModalProps {
  consultorNome: string;
  onConfirm: (versaoId: string, versaoNome: string) => void;
  onClose: () => void;
}

export default function SaveVersionModal({ consultorNome, onConfirm, onClose }: SaveVersionModalProps) {
  const [versoes, setVersoes] = useState<Versao[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedVersaoId, setSelectedVersaoId] = useState<string>('');
  const [criandoNova, setCriandoNova] = useState(false);
  const [novoNome, setNovoNome] = useState('');
  const [novaDescricao, setNovaDescricao] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadVersoes();
  }, []);

  const loadVersoes = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('versoes_roteiro')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      setVersoes(data || []);
      // Pré-seleciona a mais recente (exceto legado)
      const primeiraValida = (data || []).find(v => v.id !== 'v0-legado');
      if (primeiraValida) setSelectedVersaoId(primeiraValida.id);
      else if (data && data.length > 0) setSelectedVersaoId(data[0].id);
    } catch (e) {
      console.error('Erro ao carregar versões:', e);
    } finally {
      setLoading(false);
    }
  };

  const handleCriarESelecionar = async () => {
    if (!novoNome.trim()) return;
    setSaving(true);
    try {
      const novoId = `v-${Date.now()}`;
      const { error } = await supabase.from('versoes_roteiro').insert({
        id: novoId,
        nome: novoNome.trim(),
        descricao: novaDescricao.trim() || null,
      });
      if (error) throw error;
      // Recarrega e seleciona a nova
      const { data } = await supabase.from('versoes_roteiro').select('*').order('created_at', { ascending: false });
      setVersoes(data || []);
      setSelectedVersaoId(novoId);
      setCriandoNova(false);
      setNovoNome('');
      setNovaDescricao('');
    } catch (e: any) {
      alert('Erro ao criar versão: ' + e.message);
    } finally {
      setSaving(false);
    }
  };

  const handleConfirm = () => {
    const versao = versoes.find(v => v.id === selectedVersaoId);
    if (!versao) return;
    onConfirm(versao.id, versao.nome);
  };

  const selectedVersao = versoes.find(v => v.id === selectedVersaoId);

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="bg-gradient-to-r from-blue-600 to-blue-700 px-6 py-5 text-white">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center">
                <Tag className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-lg font-bold">Salvar em uma Versão</h2>
                <p className="text-blue-200 text-sm">Roteiro de {consultorNome.split(' ')[0]}</p>
              </div>
            </div>
            <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-white/20 transition-colors">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="p-6 space-y-5">

          {loading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-blue-500" />
            </div>
          ) : (
            <>
              {/* Selecionar versão existente */}
              {!criandoNova && (
                <div className="space-y-3">
                  <label className="text-sm font-semibold text-gray-700">
                    Selecionar Versão Existente
                  </label>
                  {versoes.length === 0 ? (
                    <p className="text-sm text-gray-400 italic">Nenhuma versão criada ainda.</p>
                  ) : (
                    <div className="space-y-2 max-h-52 overflow-y-auto pr-1">
                      {versoes.map(v => (
                        <label
                          key={v.id}
                          className={`flex items-start gap-3 p-3 rounded-xl border-2 cursor-pointer transition-all ${
                            selectedVersaoId === v.id
                              ? 'border-blue-500 bg-blue-50'
                              : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                          }`}
                        >
                          <input
                            type="radio"
                            name="versao"
                            value={v.id}
                            checked={selectedVersaoId === v.id}
                            onChange={() => setSelectedVersaoId(v.id)}
                            className="mt-0.5 text-blue-600 focus:ring-blue-500"
                          />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <p className={`font-semibold text-sm ${selectedVersaoId === v.id ? 'text-blue-700' : 'text-gray-800'}`}>
                                {v.nome}
                              </p>
                              {v.id === 'v0-legado' && (
                                <span className="text-xs px-1.5 py-0.5 bg-amber-100 text-amber-700 rounded-full font-medium">Legado</span>
                              )}
                            </div>
                            {v.descricao && (
                              <p className="text-xs text-gray-400 mt-0.5 truncate">{v.descricao}</p>
                            )}
                            <p className="text-xs text-gray-400 mt-0.5">
                              Criada em {new Date(v.created_at).toLocaleDateString('pt-BR')}
                            </p>
                          </div>
                          {selectedVersaoId === v.id && (
                            <CheckCircle className="w-4 h-4 text-blue-500 shrink-0 mt-0.5" />
                          )}
                        </label>
                      ))}
                    </div>
                  )}

                  <button
                    onClick={() => setCriandoNova(true)}
                    className="w-full flex items-center justify-center gap-2 py-2.5 px-4 border-2 border-dashed border-blue-300 text-blue-600 rounded-xl hover:bg-blue-50 hover:border-blue-400 transition-all text-sm font-medium"
                  >
                    <PlusCircle className="w-4 h-4" />
                    Criar Nova Versão
                  </button>
                </div>
              )}

              {/* Formulário de nova versão */}
              {criandoNova && (
                <div className="space-y-3 bg-blue-50 p-4 rounded-xl border border-blue-200">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-semibold text-blue-700">Nova Versão</p>
                    <button
                      onClick={() => { setCriandoNova(false); setNovoNome(''); setNovaDescricao(''); }}
                      className="text-xs text-gray-400 hover:text-gray-600"
                    >
                      Cancelar
                    </button>
                  </div>
                  <input
                    type="text"
                    placeholder="Nome da versão (ex: V1 - Maio 2026)"
                    value={novoNome}
                    onChange={e => setNovoNome(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleCriarESelecionar()}
                    className="w-full text-sm border border-blue-300 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                    autoFocus
                  />
                  <input
                    type="text"
                    placeholder="Descrição (opcional)"
                    value={novaDescricao}
                    onChange={e => setNovaDescricao(e.target.value)}
                    className="w-full text-sm border border-blue-300 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                  />
                  <button
                    onClick={handleCriarESelecionar}
                    disabled={!novoNome.trim() || saving}
                    className="w-full flex items-center justify-center gap-2 py-2 px-4 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-all text-sm font-semibold"
                  >
                    {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <PlusCircle className="w-4 h-4" />}
                    Criar e Selecionar
                  </button>
                </div>
              )}
            </>
          )}

          {/* Actions */}
          {!criandoNova && (
            <div className="flex gap-3 pt-1">
              <button
                onClick={onClose}
                className="flex-1 py-2.5 px-4 border border-gray-300 text-gray-600 rounded-xl hover:bg-gray-50 transition-all text-sm font-medium"
              >
                Cancelar
              </button>
              <button
                onClick={handleConfirm}
                disabled={!selectedVersaoId || loading}
                className="flex-1 py-2.5 px-4 bg-blue-600 text-white rounded-xl hover:bg-blue-700 disabled:opacity-50 transition-all text-sm font-bold shadow-sm flex items-center justify-center gap-2"
              >
                <CheckCircle className="w-4 h-4" />
                {selectedVersao ? `Salvar em "${selectedVersao.nome}"` : 'Salvar'}
              </button>
            </div>
          )}

          {selectedVersao && !criandoNova && (
            <p className="text-center text-xs text-gray-400">
              O roteiro será agrupado junto aos demais da versão <strong>{selectedVersao.nome}</strong>.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
