import { getApiBase } from "@/utils/apiBase";
import { fetchWithTimeout } from "@/utils/fetchWithTimeout";
import { collectConversationLookupKeys } from "@/utils/contactDisplay";

export async function enrichConversationsWithContacts(store) {
  const convs = Object.values(store.conversaciones || {});
  if (!convs.length) return;

  const { telefonos, dataIds } = collectConversationLookupKeys(convs);
  if (!telefonos.length && !dataIds.length) return;

  try {
    const res = await fetchWithTimeout(`${getApiBase()}/api/contacts/lookup`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ telefonos, dataIds }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const lookup = await res.json();
    store.enrichConversationsWithContactLookup(lookup);
  } catch (error) {
    console.error("[enrichContacts] Error enriqueciendo contactos:", error);
  }
}
