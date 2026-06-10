"use client";

import React, { useEffect, useRef, useState } from "react";
import { Modal } from "@/components/ui/modal";
import {
  getMensajes,
  type ConversacionDetalle,
  type MensajeChat,
} from "@/lib/reportesChatsApi";

interface MensajesConversacionModalProps {
  isOpen: boolean;
  onClose: () => void;
  conversacion: ConversacionDetalle | null;
}

import {
  emisorLabel,
  estiloBurbuja,
  formatHora,
  textoMensaje,
} from "./chatMessageUtils";

export default function MensajesConversacionModal({
  isOpen,
  onClose,
  conversacion,
}: MensajesConversacionModalProps) {
  const [mensajes, setMensajes] = useState<MensajeChat[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen || !conversacion?.id) return;
    setLoading(true);
    setError("");
    getMensajes(conversacion.id)
      .then(setMensajes)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [isOpen, conversacion?.id]);

  useEffect(() => {
    if (mensajes.length) {
      endRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [mensajes]);

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      className="max-w-2xl p-0"
      overlayClassName="bg-black/30"
    >
      <div className="flex max-h-[85vh] flex-col bg-white dark:bg-gray-900">
        <div className="border-b border-gray-200 px-6 py-5 dark:border-gray-800">
          <h3 className="text-lg font-semibold text-gray-800 dark:text-white">
            Mensajes de la conversación
          </h3>
          <p className="mt-1 text-sm text-gray-500">
            {conversacion?.nombre} · {conversacion?.telefono}
          </p>
        </div>

        <div className="flex-1 space-y-3 overflow-y-auto px-6 py-4">
          {loading ? (
            <div className="flex flex-col items-center py-12">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-gray-400 border-t-transparent" />
              <p className="mt-3 text-sm text-gray-400">Cargando mensajes...</p>
            </div>
          ) : error ? (
            <p className="rounded-lg bg-error-50 px-4 py-3 text-sm text-error-600 dark:bg-error-500/10">
              {error}
            </p>
          ) : mensajes.length === 0 ? (
            <p className="py-12 text-center text-sm text-gray-400">
              No hay mensajes registrados
            </p>
          ) : (
            mensajes.map((m) => {
              const estilo = estiloBurbuja(m.emisor, m.origen);
              return (
                <div
                  key={m.id}
                  className={`flex ${estilo.alineacion}`}
                >
                  <div
                    className={`rounded-2xl px-4 py-2.5 text-sm shadow-sm ${estilo.clase}`}
                  >
                    <p className="text-xs font-semibold opacity-70">
                      {emisorLabel(m.emisor, m.origen)} · {formatHora(m.fecha)}
                    </p>
                    <p className="mt-1 whitespace-pre-wrap">{textoMensaje(m)}</p>
                  </div>
                </div>
              );
            })
          )}
          <div ref={endRef} />
        </div>

        <div className="border-t border-gray-200 px-6 py-3 text-center text-xs text-gray-400 dark:border-gray-800">
          {mensajes.length} mensaje{mensajes.length !== 1 ? "s" : ""}
        </div>
      </div>
    </Modal>
  );
}
