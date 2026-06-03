import { ref } from "vue";
import { getApiBase } from "@/utils/apiBase";
import { resolveAgentIdFromSources } from "@/utils/agentId";
import { fetchWithTimeout } from "@/utils/fetchWithTimeout";

const agentProfile = ref(null);

function persistAgentProfile(profile) {
  if (!profile) return;
  try {
    if (profile.nombre) {
      sessionStorage.setItem("agentName", profile.nombre);
      sessionStorage.setItem("nombreAgente", profile.nombre);
      window.AGENT_NAME = profile.nombre;
    }
    if (profile.extension) {
      sessionStorage.setItem("sipUsername", profile.extension);
      localStorage.setItem("sipUsername", profile.extension);
      window.AGENT_EXTENSION = profile.extension;
    }
    if (profile.usuario) {
      sessionStorage.setItem("agentUser", profile.usuario);
      sessionStorage.setItem("usuarioAgente", profile.usuario);
    }
  } catch {
    /* ignore storage errors */
  }
}

export async function loadAgentProfile(force = false) {
  if (agentProfile.value && !force) return agentProfile.value;

  const agentId = String(resolveAgentIdFromSources() || "").trim();
  if (!agentId) return null;

  try {
    const res = await fetchWithTimeout(`${getApiBase()}/api/usuarios`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const users = await res.json();
    const list = Array.isArray(users) ? users : [];
    const match = list.find((user) => {
      const id = String(user.id ?? user._id ?? "").trim();
      const exten = String(user.exten ?? user.extension ?? "").trim();
      const usuario = String(user.usuario ?? "").trim();
      return id === agentId || exten === agentId || usuario === agentId;
    });

    if (match) {
      agentProfile.value = {
        id: match.id ?? match._id ?? agentId,
        nombre: String(match.nombre || match.name || "").trim(),
        usuario: String(match.usuario || "").trim(),
        extension: String(match.exten || match.extension || "").trim(),
      };
      persistAgentProfile(agentProfile.value);
    }
  } catch (error) {
    console.error("[useAgentProfile] Error cargando perfil:", error);
  }

  return agentProfile.value;
}

export function useAgentProfile() {
  return { agentProfile, loadAgentProfile };
}
