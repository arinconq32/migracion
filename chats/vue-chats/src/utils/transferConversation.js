export function normalizeAgentKey(value) {
  return String(value ?? "").trim();
}

export function agentsMatch(left, right) {
  const a = normalizeAgentKey(left);
  const b = normalizeAgentKey(right);
  if (!a || !b) return false;
  if (a === b) return true;

  const numA = Number(a);
  const numB = Number(b);
  if (Number.isFinite(numA) && Number.isFinite(numB) && numA === numB) {
    return true;
  }

  return false;
}

export function getConversationTransferencias(conv = {}) {
  const fromMetadata = conv?.metadata?.transferencias;
  if (Array.isArray(fromMetadata) && fromMetadata.length > 0) {
    return fromMetadata;
  }
  if (Array.isArray(conv?.transferencias) && conv.transferencias.length > 0) {
    return conv.transferencias;
  }
  return [];
}

export function getConversationOriginAgent(conv = {}) {
  const transferencias = getConversationTransferencias(conv);
  if (transferencias.length > 0) {
    const first = transferencias[0];
    return (
      first?.desde ||
      first?.agenteOrigen ||
      first?.desdeExten ||
      null
    );
  }

  return (
    conv?.transferOrigenId ||
    conv?.agente_origen_exten ||
    conv?.metadata?.agente_origen_exten ||
    null
  );
}

export function isConversationTransferredToOtherAgent(
  conv = {},
  currentAgentId = "",
) {
  const transferencias = getConversationTransferencias(conv);
  const originAgent = getConversationOriginAgent(conv);
  const currentAgent = normalizeAgentKey(
    currentAgentId || conv?.agenteId || conv?.agente_id,
  );
  const assignedAgent = normalizeAgentKey(conv?.agenteId || conv?.agente_id);

  if (!currentAgent || !assignedAgent) return false;
  if (!agentsMatch(currentAgent, assignedAgent)) return false;

  if (transferencias.length > 0 && originAgent) {
    return !agentsMatch(currentAgent, originAgent);
  }

  return Boolean(conv?.transferida);
}
