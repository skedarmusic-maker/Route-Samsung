'use client';

import React from 'react';
import { format, startOfMonth, endOfMonth, parse } from 'date-fns';
import { Calendar as CalendarIcon } from 'lucide-react';

interface DateRangePickerProps {
  mes: string; // Formato 'YYYY-MM'
  startDate: string; // Formato 'YYYY-MM-DD'
  endDate: string; // Formato 'YYYY-MM-DD'
  onChange: (start: string, end: string) => void;
}

export default function DateRangePicker({ mes, startDate, endDate, onChange }: DateRangePickerProps) {
  if (!mes) return null;

  // Obter primeiro e último dia do mês selecionado para limitar o picker
  let minDate = '';
  let maxDate = '';
  try {
    const parsedMonth = parse(mes, 'yyyy-MM', new Date());
    minDate = format(startOfMonth(parsedMonth), 'yyyy-MM-dd');
    maxDate = format(endOfMonth(parsedMonth), 'yyyy-MM-dd');
  } catch (e) {
    console.error('Erro ao calcular datas do mês:', e);
  }

  const handleStartChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newStart = e.target.value;
    // Se a data final for menor que a nova data inicial, ajusta para a mesma data
    if (endDate && newStart > endDate) {
      onChange(newStart, newStart);
    } else {
      onChange(newStart, endDate);
    }
  };

  const handleEndChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newEnd = e.target.value;
    onChange(startDate, newEnd);
  };

  return (
    <div className="space-y-2 col-span-1">
      <label className="text-sm font-medium text-gray-700 flex items-center gap-2">
        <CalendarIcon className="w-4 h-4 text-blue-600" /> Período do Roteiro
      </label>
      <div className="flex gap-2">
        {/* Input da Data de Início */}
        <div className="flex-1 relative">
          <input
            type="date"
            value={startDate}
            onChange={handleStartChange}
            className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm font-medium text-blue-800 bg-white"
            title="Data de Início"
          />
          <span className="absolute -top-2 left-2 px-1 bg-white text-[9px] font-bold text-gray-400 uppercase tracking-wider">
            Início
          </span>
        </div>

        {/* Input da Data de Fim */}
        <div className="flex-1 relative">
          <input
            type="date"
            value={endDate}
            min={startDate}
            onChange={handleEndChange}
            className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm font-medium text-blue-800 bg-white"
            title="Data de Fim"
          />
          <span className="absolute -top-2 left-2 px-1 bg-white text-[9px] font-bold text-gray-400 uppercase tracking-wider">
            Fim
          </span>
        </div>
      </div>
    </div>
  );
}
