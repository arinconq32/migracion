"use client";

import React from "react";
import Button from "@/components/ui/button/Button";
import type { FiltrosReporte } from "@/lib/reportesChatsApi";

interface FiltrosFormProps {
  filtros: FiltrosReporte;
  entidades: string[];
  colas: string[];
  onChange: (filtros: FiltrosReporte) => void;
  onBuscar: () => void;
  loading?: boolean;
  showEstado?: boolean;
}

export default function FiltrosForm({
  filtros,
  entidades,
  colas,
  onChange,
  onBuscar,
  loading = false,
  showEstado = false,
}: FiltrosFormProps) {
  const update = (key: keyof FiltrosReporte, value: string) => {
    onChange({ ...filtros, [key]: value || undefined });
  };

  const selectClass =
    "h-11 w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm shadow-theme-xs focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90";

  const inputClass =
    "h-11 w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm shadow-theme-xs focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90";

  const gridCols = showEstado
    ? "sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6"
    : "sm:grid-cols-2 lg:grid-cols-5";

  return (
    <div className={`grid gap-4 ${gridCols}`}>
      <div>
        <label className="mb-1.5 block text-xs font-medium text-gray-500 dark:text-gray-400">
          Entidad
        </label>
        <select
          className={selectClass}
          value={filtros.entidad || ""}
          onChange={(e) => update("entidad", e.target.value)}
        >
          <option value="">Todas</option>
          {entidades.map((e) => (
            <option key={e} value={e}>
              {e}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="mb-1.5 block text-xs font-medium text-gray-500 dark:text-gray-400">
          Cola
        </label>
        <select
          className={selectClass}
          value={filtros.cola || ""}
          onChange={(e) => update("cola", e.target.value)}
        >
          <option value="">Todas</option>
          {colas.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </div>

      {showEstado && (
        <div>
          <label className="mb-1.5 block text-xs font-medium text-gray-500 dark:text-gray-400">
            Estado
          </label>
          <select
            className={selectClass}
            value={filtros.estado || ""}
            onChange={(e) => update("estado", e.target.value)}
          >
            <option value="">Todos</option>
            <option value="abierta">Abierto</option>
            <option value="cerrada">Cerrado</option>
          </select>
        </div>
      )}

      <div>
        <label className="mb-1.5 block text-xs font-medium text-gray-500 dark:text-gray-400">
          Desde
        </label>
        <input
          type="date"
          className={inputClass}
          value={filtros.desde || ""}
          onChange={(e) => update("desde", e.target.value)}
        />
      </div>

      <div>
        <label className="mb-1.5 block text-xs font-medium text-gray-500 dark:text-gray-400">
          Hasta
        </label>
        <input
          type="date"
          className={inputClass}
          value={filtros.hasta || ""}
          onChange={(e) => update("hasta", e.target.value)}
        />
      </div>

      <div className="flex items-end">
        <Button onClick={onBuscar} disabled={loading} className="w-full">
          {loading ? "Buscando..." : "Buscar"}
        </Button>
      </div>
    </div>
  );
}
