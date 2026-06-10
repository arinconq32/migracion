import { getApiBase } from "@/utils/apiBase";
import { fetchWithTimeout } from "@/utils/fetchWithTimeout";
import {
  getDefaultAgentId,
  persistAgentId,
  resolveAgentIdFromSources,
} from "@/utils/agentId";
import { enrichConversationsWithContacts } from "./enrichContacts";
import { dedupeConversationsByPhonePerEstado } from "@/utils/conversationDedup";

const MAX_RETRIES = 3;
const RETRY_MS = 2000;
const FETCH_TIMEOUT_MS = 12000;

export function normalizeEstado(estado) {
  if (!estado) return "nuevo";
  const e = String(estado).toLowerCase();
  if (e.startsWith("abier")) return "abierta";
  if (e.startsWith("cerr")) return "cerrada";
  if (e.startsWith("new") || e === "nuevo") return "nuevo";
  if (e === "activo" || e === "open") return "abierta";
  return e;
}

export function normalizeConversation(conv) {
  return {
    ...conv,
    agenteId: conv.agenteId ?? conv.agente_id,
    estado: normalizeEstado(conv.estado),
  };
}

function splitQueues(conversations) {
  const deduped = dedupeConversationsByPhonePerEstado(conversations);
  return {
    activos: deduped.filter((c) => c.estado === "abierta"),
    nuevos: deduped.filter((c) => c.estado === "nuevo"),
    cerrados: deduped.filter((c) => c.estado === "cerrada"),
  };
}

function countQueues(store) {
  if (!store) return 0;
  return (
    (store.activos?.length || 0) +
    (store.nuevos?.length || 0) +
    (store.cerrados?.length || 0) ||
    Object.keys(store.conversaciones || {}).length
  );
}

async function fetchConversationsJson(url) {
  const res = await fetchWithTimeout(url, { cache: "no-store" }, FETCH_TIMEOUT_MS);
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} al cargar ${url}`);
  }
  const data = await res.json();
  return Array.isArray(data) ? data.map(normalizeConversation) : [];
}

/**
 * Carga conversaciones con reintentos y fallback; no vacía la UI si ya hay datos.
 */
export async function loadConversationsForStore(store, options = {}) {
  const { force = false, agentId: agentIdOption } = options;
  const apiBase = getApiBase();
  const agentId = String(agentIdOption || resolveAgentIdFromSources()).trim();
  persistAgentId(agentId);

  let lastError = null;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt += 1) {
    try {
      const conversations = await fetchConversationsJson(
        `${apiBase}/api/conversations?userId=${encodeURIComponent(agentId)}`,
      );

      if (conversations.length === 0 && !force && countQueues(store) > 0) {
        return { agentId, loaded: false, keptExisting: true };
      }

      if (conversations.length > 0 || force || countQueues(store) === 0) {
        store.setQueueState(splitQueues(conversations), { replace: true });
        await enrichConversationsWithContacts(store);
        return { agentId, loaded: true, count: conversations.length };
      }

      lastError = new Error("Sin conversaciones en la base");
    } catch (error) {
      lastError = error;
      const msg =
        error.name === "AbortError"
          ? "Tiempo de espera agotado"
          : error.message;
      console.warn(
        `[loadConversations] Intento ${attempt}/${MAX_RETRIES}: ${msg}`,
      );
    }

    if (attempt < MAX_RETRIES) {
      await new Promise((r) => setTimeout(r, RETRY_MS * attempt));
    }
  }

  if (!force && countQueues(store) > 0) {
    return { agentId, loaded: false, keptExisting: true };
  }

  throw lastError || new Error("No se pudieron cargar conversaciones");
}

let retryTimer = null;
let retryCount = 0;
const MAX_AUTO_RETRIES = 4;

/** Reintenta carga HTTP si el socket aún no conecta (máximo 4 veces). */
export function scheduleConversationReload(store, delayMs = 2000) {
  if (retryCount >= MAX_AUTO_RETRIES) return;
  if (retryTimer) clearTimeout(retryTimer);
  retryTimer = setTimeout(() => {
    retryCount += 1;
    loadConversationsForStore(store, { force: false })
      .then(() => {
        retryCount = 0;
      })
      .catch(() => {
        scheduleConversationReload(store, Math.min(delayMs * 1.5, 10000));
      });
  }, delayMs);
}
