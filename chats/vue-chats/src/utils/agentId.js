const STORAGE_KEY = "chatAgentId";

/** IDs de agente en CRM suelen ser numéricos o cortos; extensiones SIP no. */
export function isLikelyAgentId(value) {
  const id = String(value ?? "").trim();
  if (!id) return false;
  if (/^\d{1,6}$/.test(id)) return true;
  if (/^[a-f0-9]{24}$/i.test(id)) return false;
  return id.length <= 8 && /^[a-zA-Z0-9_-]+$/.test(id);
}

function readUrlAgentId() {
  try {
    const params = new URLSearchParams(window.location.search);
    return (
      params.get("agentId") ||
      params.get("userId") ||
      params.get("agenteId") ||
      ""
    ).trim();
  } catch {
    return "";
  }
}

function readStorageAgentId() {
  try {
    const persisted = sessionStorage.getItem(STORAGE_KEY);
    if (isLikelyAgentId(persisted)) return String(persisted).trim();
    const userId =
      sessionStorage.getItem("userId") || localStorage.getItem("userId");
    if (isLikelyAgentId(userId)) return String(userId).trim();
  } catch {
    /* ignore */
  }
  return "";
}

export function getDefaultAgentId() {
  return String(
    import.meta.env.VITE_DEFAULT_AGENT_ID ||
      window.DEFAULT_AGENT_ID ||
      "413",
  ).trim();
}

/** Fuentes explícitas (sin sipUsername ni heurísticas). */
export function resolveAgentIdFromSources() {
  const candidates = [
    readUrlAgentId(),
    window.USER_ID,
    window.AGENT_USER_ID,
    readStorageAgentId(),
    getDefaultAgentId(),
  ];

  const found = candidates.find((v) => isLikelyAgentId(v));
  return found ? String(found).trim() : getDefaultAgentId();
}

export function persistAgentId(agentId) {
  const id = String(agentId ?? "").trim();
  if (!isLikelyAgentId(id)) return;
  try {
    sessionStorage.setItem(STORAGE_KEY, id);
    window.USER_ID = id;
    window.AGENT_USER_ID = id;
  } catch {
    /* ignore */
  }
}

/** Inicializa USER_ID desde la URL antes de montar Vue (iframe / Next). */
export function bootstrapAgentFromUrl() {
  const fromUrl = readUrlAgentId();
  if (fromUrl && isLikelyAgentId(fromUrl)) {
    persistAgentId(fromUrl);
    return fromUrl;
  }
  const apiBase = new URLSearchParams(window.location.search).get("apiBase");
  if (apiBase) {
    window.URL_BASE = apiBase;
  }
  return resolveAgentIdFromSources();
}
