'use client';

import React, { useState, useEffect, useRef } from 'react';
import { 
  format, 
  parseISO, 
  startOfMonth, 
  endOfMonth, 
  eachDayOfInterval, 
  isSameDay, 
  isWithinInterval, 
  getDay,
  parse,
  addMonths
} from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight, X } from 'lucide-react';

interface DateRangePickerProps {
  mes: string; // Formato 'YYYY-MM'
  startDate: string; // Formato 'YYYY-MM-DD'
  endDate: string; // Formato 'YYYY-MM-DD'
  onChange: (start: string, end: string) => void;
}

export default function DateRangePicker({ mes, startDate, endDate, onChange }: DateRangePickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);

  // Fechar ao clicar fora
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (popoverRef.current && !popoverRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const [currentViewDate, setCurrentViewDate] = useState<Date>(new Date());

  useEffect(() => {
    if (mes) {
      setCurrentViewDate(parse(mes, 'yyyy-MM', new Date()));
    }
  }, [mes]);

  if (!mes) return null;

  const monthStart = startOfMonth(currentViewDate);
  const monthEnd = endOfMonth(currentViewDate);
  const days = eachDayOfInterval({ start: monthStart, end: monthEnd });

  // Ajustar o início da semana (Domingo = 0, Segunda = 1)
  // Queremos que a grade comece no Domingo
  const startDayOfWeek = getDay(monthStart);
  const blanks = Array(startDayOfWeek).fill(null);

  const prevMonth = (e: React.MouseEvent) => {
    e.stopPropagation();
    setCurrentViewDate(prev => addMonths(prev, -1));
  };

  const nextMonth = (e: React.MouseEvent) => {
    e.stopPropagation();
    setCurrentViewDate(prev => addMonths(prev, 1));
  };

  const handleDayClick = (day: Date) => {
    const dayStr = format(day, 'yyyy-MM-dd');

    if (!startDate || (startDate && endDate)) {
      // Primeira seleção ou reset
      onChange(dayStr, '');
    } else {
      // Segunda seleção
      if (dayStr < startDate) {
        // Se a data clicada for anterior à inicial, reseta para ela ser a inicial
        onChange(dayStr, '');
      } else {
        onChange(startDate, dayStr);
        setIsOpen(false); // Fecha ao completar o range
      }
    }
  };

  const clearRange = (e: React.MouseEvent) => {
    e.stopPropagation();
    onChange('', '');
  };

  const getDayClass = (day: Date) => {
    const dayStr = format(day, 'yyyy-MM-dd');
    const isSelectedStart = startDate === dayStr;
    const isSelectedEnd = endDate === dayStr;
    const isInRange = startDate && endDate && isWithinInterval(day, { 
      start: parseISO(startDate), 
      end: parseISO(endDate) 
    });

    if (isSelectedStart || isSelectedEnd) {
      return 'bg-blue-600 text-white font-bold rounded-lg shadow-md z-10';
    }
    if (isInRange) {
      return 'bg-blue-50 text-blue-700 font-semibold';
    }
    return 'text-gray-700 hover:bg-gray-100 rounded-lg';
  };

  const formatDisplayRange = () => {
    if (startDate && endDate) {
      return `${format(parseISO(startDate), 'dd/MM')} até ${format(parseISO(endDate), 'dd/MM')}`;
    }
    if (startDate) {
      return `A partir de ${format(parseISO(startDate), 'dd/MM')}`;
    }
    return 'Mês Completo';
  };

  return (
    <div className="relative" ref={popoverRef}>
      <div className="space-y-2">
        <label className="text-sm font-medium text-gray-700 flex items-center gap-2">
          <CalendarIcon className="w-4 h-4 text-blue-600" /> Período do Roteiro
        </label>
        <button
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          className="w-full flex items-center justify-between p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none bg-white text-sm font-medium hover:border-gray-400 transition-all shadow-sm"
        >
          <span className={startDate ? 'text-blue-700 font-semibold' : 'text-gray-500'}>
            {formatDisplayRange()}
          </span>
          <div className="flex items-center gap-2">
            {startDate && (
              <X 
                className="w-4 h-4 text-gray-400 hover:text-gray-600 cursor-pointer" 
                onClick={clearRange}
              />
            )}
            <ChevronLeft className={`w-4 h-4 text-gray-400 transition-transform ${isOpen ? 'rotate-90' : '-rotate-90'}`} />
          </div>
        </button>
      </div>

      {isOpen && (
        <div className="absolute top-full left-0 mt-2 p-4 bg-white border border-gray-200 rounded-xl shadow-xl z-50 w-[320px] animate-in fade-in slide-in-from-top-1 duration-200">
          <div className="flex items-center justify-between mb-4 border-b border-gray-100 pb-2">
            <button onClick={prevMonth} className="p-1 hover:bg-gray-100 rounded text-gray-500 transition-colors">
              <ChevronLeft className="w-4 h-4" />
            </button>
            <h3 className="text-sm font-bold text-gray-800 capitalize">
              {format(currentViewDate, 'MMMM yyyy', { locale: ptBR })}
            </h3>
            <button onClick={nextMonth} className="p-1 hover:bg-gray-100 rounded text-gray-500 transition-colors">
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          {/* Dias da Semana */}
          <div className="grid grid-cols-7 gap-1 text-center mb-2">
            {['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'].map((d, i) => (
              <span key={i} className={`text-[11px] font-bold ${i === 0 || i === 6 ? 'text-gray-400' : 'text-gray-500'}`}>
                {d}
              </span>
            ))}
          </div>

          {/* Grade de Dias */}
          <div className="grid grid-cols-7 gap-1">
            {blanks.map((_, i) => (
              <div key={`blank-${i}`} className="p-2" />
            ))}
            {days.map((day, i) => {
              const isWeekend = getDay(day) === 0 || getDay(day) === 6;
              return (
                <button
                  key={i}
                  type="button"
                  onClick={() => handleDayClick(day)}
                  className={`p-2 text-xs text-center transition-all aspect-square flex items-center justify-center relative ${getDayClass(day)} ${isWeekend ? 'font-medium' : ''}`}
                >
                  {format(day, 'd')}
                </button>
              );
            })}
          </div>

          {startDate && !endDate && (
            <p className="text-[10px] text-amber-600 bg-amber-50 p-2 rounded-lg text-center mt-3 border border-amber-100 font-medium">
              💡 Clique na data final para fechar o período.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
