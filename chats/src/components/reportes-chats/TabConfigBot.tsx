"use client";

import React, { useEffect, useState } from "react";
import Button from "@/components/ui/button/Button";
import {
  getBotConfig,
  saveBotConfig,
  type BotConfig,
  type OpcionMenu,
} from "@/lib/reportesChatsApi";

const EMPTY_OPCION: OpcionMenu = {
  titulo: "",
  postback: "",
  cola: "",
  mensaje_espera: "",
};

export default function TabConfigBot() {
  const [config, setConfig] = useState<BotConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [mensaje, setMensaje] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    getBotConfig()
      .then(setConfig)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  const updateOpcion = (index: number, field: keyof OpcionMenu, value: string) => {
    if (!config) return;
    const opciones = [...config.opciones_menu];
    opciones[index] = { ...opciones[index], [field]: value };
    setConfig({ ...config, opciones_menu: opciones });
  };

  const agregarOpcion = () => {
    if (!config) return;
    setConfig({
      ...config,
      opciones_menu: [...config.opciones_menu, { ...EMPTY_OPCION }],
    });
  };

  const eliminarOpcion = (index: number) => {
    if (!config || config.opciones_menu.length <= 1) return;
    const opciones = config.opciones_menu.filter((_, i) => i !== index);
    setConfig({ ...config, opciones_menu: opciones });
  };

  const guardar = async () => {
    if (!config) return;
    setGuardando(true);
    setError("");
    setMensaje("");
    try {
      const result = await saveBotConfig(config);
      setMensaje(
        result.reload?.ok
          ? "Configuración guardada y recargada en el chatbot."
          : "Configuración guardada. El chatbot se recargará en el próximo ciclo.",
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al guardar");
    } finally {
      setGuardando(false);
    }
  };

  const textareaClass =
    "w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm shadow-theme-xs focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90";

  const inputClass =
    "h-11 w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm dark:border-gray-700 dark:bg-gray-900 dark:text-white/90";

  if (loading) {
    return <p className="text-sm text-gray-400">Cargando configuración...</p>;
  }

  if (!config) {
    return <p className="text-sm text-error-600">{error || "No se pudo cargar"}</p>;
  }

  return (
    <div className="space-y-6">
      {error && (
        <p className="rounded-lg bg-error-50 px-4 py-2 text-sm text-error-600 dark:bg-error-500/10">
          {error}
        </p>
      )}
      {mensaje && (
        <p className="rounded-lg bg-success-50 px-4 py-2 text-sm text-success-600 dark:bg-success-500/10">
          {mensaje}
        </p>
      )}

      <div className="rounded-xl border border-gray-200 p-4 dark:border-gray-800">
        <h3 className="mb-4 text-sm font-semibold text-gray-700 dark:text-gray-300">
          Mensajes generales
        </h3>
        <div className="space-y-4">
          <div>
            <label className="mb-1.5 block text-xs font-medium text-gray-500">
              Mensaje inicial / saludo del menú
            </label>
            <textarea
              className={textareaClass}
              rows={3}
              value={config.saludo_menu}
              onChange={(e) =>
                setConfig({ ...config, saludo_menu: e.target.value })
              }
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-gray-500">
              Mensaje cuando no hay agentes
            </label>
            <textarea
              className={textareaClass}
              rows={2}
              value={config.mensaje_no_agentes}
              onChange={(e) =>
                setConfig({ ...config, mensaje_no_agentes: e.target.value })
              }
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-gray-500">
              Mensaje de despedida
            </label>
            <textarea
              className={textareaClass}
              rows={2}
              value={config.mensaje_despedida}
              onChange={(e) =>
                setConfig({ ...config, mensaje_despedida: e.target.value })
              }
            />
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-gray-200 p-4 dark:border-gray-800">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">
            Opciones del menú
          </h3>
          <Button size="sm" variant="outline" onClick={agregarOpcion}>
            + Agregar opción
          </Button>
        </div>

        <div className="space-y-4">
          {config.opciones_menu.map((op, index) => (
            <div
              key={index}
              className="rounded-lg border border-gray-100 p-4 dark:border-gray-800"
            >
              <div className="mb-3 flex items-center justify-between">
                <span className="text-xs font-medium text-gray-500">
                  Opción {index + 1}
                </span>
                {config.opciones_menu.length > 1 && (
                  <button
                    type="button"
                    onClick={() => eliminarOpcion(index)}
                    className="text-xs text-error-500 hover:underline"
                  >
                    Eliminar
                  </button>
                )}
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs text-gray-400">Título</label>
                  <input
                    className={inputClass}
                    value={op.titulo}
                    onChange={(e) => updateOpcion(index, "titulo", e.target.value)}
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs text-gray-400">Postback</label>
                  <input
                    className={inputClass}
                    value={op.postback}
                    onChange={(e) => updateOpcion(index, "postback", e.target.value)}
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs text-gray-400">Cola</label>
                  <input
                    className={inputClass}
                    value={op.cola}
                    onChange={(e) => updateOpcion(index, "cola", e.target.value)}
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="mb-1 block text-xs text-gray-400">
                    Mensaje de espera
                  </label>
                  <textarea
                    className={textareaClass}
                    rows={2}
                    value={op.mensaje_espera}
                    onChange={(e) =>
                      updateOpcion(index, "mensaje_espera", e.target.value)
                    }
                  />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="flex justify-end">
        <Button onClick={guardar} disabled={guardando}>
          {guardando ? "Guardando..." : "Guardar configuración"}
        </Button>
      </div>
    </div>
  );
}
