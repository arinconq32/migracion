import { getApiBase } from "@/utils/apiBase";
import { fetchWithTimeout } from "@/utils/fetchWithTimeout";

function extractApiList(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.data)) return payload.data;
  return [];
}

async function fetchLabelsList() {
  const apiBase = getApiBase();

  const res = await fetchWithTimeout(`${apiBase}/api/conversations/labels`);
  if (res.ok) {
    const data = await res.json();
    return extractApiList(data);
  }

  const fallback = await fetchWithTimeout(`${apiBase}/etiquetas`);
  if (!fallback.ok) {
    throw new Error(`HTTP ${fallback.status} al cargar etiquetas`);
  }
  const data = await fallback.json();
  return extractApiList(data);
}

export async function fetchEtiquetasCatalogo(store) {
  try {
    const lista = await fetchLabelsList();
    if (lista.length > 0) {
      store.setEtiquetas(lista);
    }
  } catch (error) {
    console.error("[useCatalog] Error cargando etiquetas:", error);
  }
}

export async function fetchMotivosCierreCatalogo(store) {
  try {
    const res = await fetchWithTimeout(`${getApiBase()}/motivos-cierre`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const lista = extractApiList(data);
    store.setMotivosCierre(lista);
    return lista;
  } catch (error) {
    console.error("[useCatalog] Error cargando motivos de cierre:", error);
    return [];
  }
}

export async function fetchTipificacionesCatalogo(store) {
  try {
    const res = await fetchWithTimeout(`${getApiBase()}/tipificaciones`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const lista = extractApiList(data);
    store.setTipificaciones(lista);
    return lista;
  } catch (error) {
    console.error("[useCatalog] Error cargando tipificaciones:", error);
    return [];
  }
}

export async function fetchCatalogosDesdeDb(store) {
  await Promise.all([
    fetchEtiquetasCatalogo(store),
    fetchMotivosCierreCatalogo(store),
    fetchTipificacionesCatalogo(store),
  ]);
}

export { fetchLabelsList, extractApiList };
