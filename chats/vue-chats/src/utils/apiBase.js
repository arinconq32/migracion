/** Base HTTP del backend; en Next (3000) usa proxy mismo origen para evitar CORS. */
export function getApiBase() {
  const fromWindow = String(window.URL_BASE || "").trim();
  if (fromWindow) {
    return fromWindow.replace(/\/$/, "");
  }

  return "http://localhost:3001";
}

/** Opciones para socket.io según si usamos proxy /chat-api o puerto 3001 directo. */
export function getSocketConnectOptions() {
  const apiBase = getApiBase();

  if (/^https?:\/\//i.test(apiBase) && apiBase.includes(":3001")) {
    return { url: apiBase };
  }

  let pathPrefix = "/chat-api";
  if (apiBase.startsWith("http")) {
    try {
      pathPrefix = new URL(apiBase).pathname.replace(/\/$/, "") || "/chat-api";
    } catch {
      pathPrefix = "/chat-api";
    }
  } else if (apiBase.startsWith("/")) {
    pathPrefix = apiBase.replace(/\/$/, "") || "/chat-api";
  }

  return { path: `${pathPrefix}/socket.io` };
}
