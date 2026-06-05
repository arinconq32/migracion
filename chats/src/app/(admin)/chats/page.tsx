"use client";

import { useAuth } from "@/context/AuthContext";
import { useEffect, useMemo } from "react";
import { useSearchParams } from "next/navigation";

const CHAT_NOTIFY_MESSAGE_TYPE = "omnicanal-chat-notify";

const defaultEmbeddedChatUrl = "/chat-embed/index.html";

function buildEmbeddedChatUrl(base: string, agentId: string) {
  const apiBase =
    process.env.NEXT_PUBLIC_CHAT_API_URL?.trim() ||
    "http://localhost:3001";
  const separator = base.includes("?") ? "&" : "?";
  const params = new URLSearchParams({
    agentId,
    apiBase,
  });
  return `${base}${separator}${params.toString()}`;
}

export default function ChatsPage() {
  const searchParams = useSearchParams();
  const { user, loading } = useAuth();

  useEffect(() => {
    const pedirPermisoPadre = () => {
      if (typeof window === "undefined" || !("Notification" in window)) return;
      if (Notification.permission === "default") {
        void Notification.requestPermission();
      }
    };
    document.addEventListener("click", pedirPermisoPadre, { passive: true });
    document.addEventListener("keydown", pedirPermisoPadre, { passive: true });

    const onMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return;
      const data = event.data;
      if (!data || data.type !== CHAT_NOTIFY_MESSAGE_TYPE) return;
      if (!("Notification" in window) || Notification.permission !== "granted") {
        return;
      }
      try {
        const titulo = String(data.titulo || "Nuevo mensaje").trim();
        const cuerpo = String(data.cuerpo || "").trim();
        const notification = new Notification(titulo, {
          body: cuerpo,
          icon: data.icon || "/chat-embed/favicon.ico",
          tag: String(data.tag || "chat-alerta"),
        });
        notification.onclick = () => {
          window.focus();
          notification.close();
        };
      } catch {
        /* ignore */
      }
    };

    window.addEventListener("message", onMessage);
    return () => {
      document.removeEventListener("click", pedirPermisoPadre);
      document.removeEventListener("keydown", pedirPermisoPadre);
      window.removeEventListener("message", onMessage);
    };
  }, []);

  const embeddedChatUrl = useMemo(() => {
    const agentId =
      searchParams.get("agentId") ||
      searchParams.get("userId") ||
      user?.agentId ||
      process.env.NEXT_PUBLIC_DEFAULT_AGENT_ID?.trim() ||
      "";
    if (!agentId) return "";
    const base =
      process.env.NEXT_PUBLIC_EMBEDDED_CHATS_URL || defaultEmbeddedChatUrl;
    return buildEmbeddedChatUrl(base, agentId);
  }, [searchParams, user?.agentId]);

  if (loading || !embeddedChatUrl) {
    return (
      <section className="-m-4 flex h-[calc(100dvh-80px)] items-center justify-center md:-m-6">
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Cargando chats...
        </p>
      </section>
    );
  }

  return (
    <section className="-m-4 overflow-hidden md:-m-6">
      <iframe
        src={embeddedChatUrl}
        title="Proyecto de chats embebido"
        className="block h-[calc(100dvh-80px)] w-full border-0 bg-white"
        allow="notifications; autoplay"
      />
    </section>
  );
}
