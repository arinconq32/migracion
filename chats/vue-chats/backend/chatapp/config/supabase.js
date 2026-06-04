const { createClient } = require("@supabase/supabase-js");

function resolveSupabaseUrl() {
  const explicit = String(process.env.SUPABASE_URL || "").trim();
  if (explicit) return explicit.replace(/\/$/, "");

  const ref = String(process.env.SUPABASE_PROJECT_REF || "").trim();
  if (ref) return `https://${ref}.supabase.co`;

  return null;
}

function getSupabaseConfig() {
  const url = resolveSupabaseUrl();
  const key = String(process.env.SUPABASE_KEY || "").trim();
  const bucket = String(process.env.SUPABASE_STORAGE_BUCKET || "chat-media").trim();

  return { url, key, bucket, configured: Boolean(url && key) };
}

let client = null;

function getSupabaseClient() {
  const { url, key, configured } = getSupabaseConfig();
  if (!configured) return null;
  if (!client) {
    client = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return client;
}

module.exports = {
  getSupabaseClient,
  getSupabaseConfig,
  resolveSupabaseUrl,
};
