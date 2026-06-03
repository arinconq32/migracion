import axios from "axios";
import { ref } from "vue";

import { getApiBase } from "@/utils/apiBase";
import { resolveAgentIdFromSources } from "@/utils/agentId";

export function useContacts() {
  const contacts = ref([]);
  const loading = ref(false);
  const error = ref(null);

  const fetchContacts = async (search = "", limit = 500) => {
    loading.value = true;
    try {
      const params = new URLSearchParams({ limit: String(limit) });
      const agentId = String(resolveAgentIdFromSources() || "").trim();
      if (agentId) {
        params.set("agentId", agentId);
      }
      if (String(search || "").trim()) {
        params.set("search", String(search).trim());
      }
      const res = await axios.get(`${getApiBase()}/api/contacts?${params}`);
      contacts.value = Array.isArray(res.data) ? res.data : [];
      error.value = null;
    } catch (err) {
      error.value = err;
      contacts.value = [];
    } finally {
      loading.value = false;
    }
  };

  const createContact = async (contact) => {
    try {
      const res = await axios.post(`${getApiBase()}/api/contacts`, contact);
      contacts.value.push(res.data);
      return res.data;
    } catch (err) {
      throw err;
    }
  };

  return {
    contacts,
    loading,
    error,
    fetchContacts,
    createContact,
  };
}
