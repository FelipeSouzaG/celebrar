import React, { ReactNode } from "react";
import { cleanDigits, formatCPFCNPJ } from "../utils";

export function Modal({
  open,
  title,
  onClose,
  children,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children?: ReactNode;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fadeIn">
      <div
        className="bg-white rounded-xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-y-auto flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-between items-center p-5 border-b border-slate-100 bg-slate-50 rounded-t-xl">
          <h3 className="text-xl font-bold text-slate-800">{title}</h3>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 p-1 hover:bg-slate-200 rounded-lg transition-colors"
          >
            <svg
              className="w-6 h-6"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>
        <div className="p-8">{children}</div>
      </div>
    </div>
  );
}

export function Table({
  headers,
  children,
}: {
  headers: string[];
  children?: ReactNode;
}) {
  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200 shadow-sm bg-white">
      <table className="w-full text-left border-collapse">
        <thead>
          <tr className="bg-slate-50 border-b border-slate-200">
            {headers.map((h, i) => (
              <th
                key={i}
                className="px-6 py-4 text-xs font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap"
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 text-sm">{children}</tbody>
      </table>
    </div>
  );
}

// --- NOVOS COMPONENTES DE UX ---

interface CurrencyInputProps extends Omit<
  React.InputHTMLAttributes<HTMLInputElement>,
  "onChange" | "value"
> {
  value: number;
  onChange: (val: number) => void;
}

export function CurrencyInput({
  value,
  onChange,
  className,
  ...props
}: CurrencyInputProps) {
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    // Remove tudo que não é dígito
    const raw = cleanDigits(e.target.value);
    // Converte para centavos e depois para float
    const numberVal = parseInt(raw || "0", 10) / 100;
    onChange(numberVal);
  };

  // Formata para exibição (R$ XX,XX)
  const displayValue = (value || 0).toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  return (
    <div className="relative">
      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 font-bold text-sm pointer-events-none">
        R$
      </span>
      <input
        {...props}
        type="text"
        inputMode="numeric"
        className={`pl-9 pr-3 ${className || "w-full p-2.5 border rounded-lg"}`}
        value={displayValue}
        onChange={handleChange}
      />
    </div>
  );
}

interface DocumentInputProps extends Omit<
  React.InputHTMLAttributes<HTMLInputElement>,
  "onChange" | "value"
> {
  value: string;
  onChange: (val: string) => void;
}

export function DocumentInput({
  value,
  onChange,
  className,
  ...props
}: DocumentInputProps) {
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    // Mantém apenas números no estado
    const raw = cleanDigits(e.target.value);
    // Limita a 14 dígitos (CNPJ)
    if (raw.length <= 14) {
      onChange(raw);
    }
  };

  return (
    <input
      {...props}
      type="text"
      inputMode="numeric"
      className={className || "w-full p-2.5 border rounded-lg"}
      value={formatCPFCNPJ(value)}
      onChange={handleChange}
      placeholder="000.000.000-00"
    />
  );
}
