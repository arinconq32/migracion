const ALLOWED_MEDIA_HOSTS = [
  "supabase.co",
  "gupshup.io",
  "filemanager.gupshup.io",
  "midominio.com",
  "w3.org",
  "soundhelix.com",
  "picsum.photos",
  "localhost",
  "127.0.0.1",
];

function isAllowedMediaUrl(rawUrl) {
  try {
    const parsed = new URL(String(rawUrl || "").trim());
    if (!["http:", "https:"].includes(parsed.protocol)) return false;
    const host = parsed.hostname.toLowerCase();
    return ALLOWED_MEDIA_HOSTS.some(
      (allowed) => host === allowed || host.endsWith(`.${allowed}`),
    );
  } catch {
    return false;
  }
}

function parseSupabaseStorageUrl(rawUrl) {
  const match = String(rawUrl || "").match(
    /https?:\/\/([^.]+)\.supabase\.co\/storage\/v1\/object\/(?:public\/)?([^/]+)\/(.+)/i,
  );
  if (!match) return null;
  return {
    project: match[1],
    bucket: match[2],
    path: decodeURIComponent(match[3].split("?")[0]),
  };
}

async function fetchSupabaseObject(parsed) {
  const key = String(process.env.SUPABASE_KEY || "").trim();
  if (!key || !parsed) return null;

  const url = `https://${parsed.project}.supabase.co/storage/v1/object/${parsed.bucket}/${parsed.path}`;
  return fetch(url, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${key}`,
      apikey: key,
    },
  });
}

async function fetchUpstreamMedia(rawUrl) {
  const parsed = parseSupabaseStorageUrl(rawUrl);
  if (parsed) {
    try {
      const authed = await fetchSupabaseObject(parsed);
      if (authed?.ok) return authed;
    } catch {
      /* fallback to public URL */
    }
  }

  return fetch(rawUrl, { method: "GET" });
}

exports.proxyMedia = async (req, res) => {
  try {
    const rawUrl = String(req.query.url || "").trim();
    if (!rawUrl || !isAllowedMediaUrl(rawUrl)) {
      return res.status(400).json({ ok: false, error: "URL de media no valida" });
    }

    const upstream = await fetchUpstreamMedia(rawUrl);
    if (!upstream?.ok) {
      const parsed = parseSupabaseStorageUrl(rawUrl);
      const hint = parsed
        ? "El proyecto Supabase no responde o fue eliminado"
        : `Archivo no disponible (${upstream?.status || "sin respuesta"})`;
      return res.status(upstream?.status || 502).json({
        ok: false,
        error: hint,
      });
    }

    const contentType =
      upstream.headers.get("content-type") || "application/octet-stream";
    const contentLength = upstream.headers.get("content-length");

    res.setHeader("Content-Type", contentType);
    res.setHeader("Cache-Control", "public, max-age=3600");
    res.setHeader("Access-Control-Allow-Origin", "*");
    if (contentLength) res.setHeader("Content-Length", contentLength);

    const buffer = Buffer.from(await upstream.arrayBuffer());
    return res.send(buffer);
  } catch (err) {
    return res.status(502).json({
      ok: false,
      error: "No se pudo obtener el archivo",
      details: String(err?.message || err),
    });
  }
};
