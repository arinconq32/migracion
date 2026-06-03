"use client";

import { useMemo } from "react";

const defaultEmbeddedChatUrl = "/chat-embed/index.html";

function buildEmbeddedChatUrl(base: string) {
  const agentId =
    process.env.NEXT_PUBLIC_DEFAULT_AGENT_ID?.trim() || "413";
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
  const embeddedChatUrl = useMemo(() => {
    const base =
      process.env.NEXT_PUBLIC_EMBEDDED_CHATS_URL || defaultEmbeddedChatUrl;
    return buildEmbeddedChatUrl(base);
  }, []);

  return (
    <section className="-m-4 overflow-hidden md:-m-6">
      <iframe
        src={embeddedChatUrl}
        title="Proyecto de chats embebido"
        className="block h-[calc(100dvh-80px)] w-full border-0 bg-white"
      />
    </section>
  );
}
