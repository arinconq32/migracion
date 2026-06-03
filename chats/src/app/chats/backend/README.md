# Backend Socket para Chat

Este backend separa la lógica de colas y sockets del frontend Vue.

## Estructura

- `chatapp/utils/chatUtils.js`
- `chatapp/models/InMemoryChatModel.js`
- `chatapp/websocketHandlers/ChatSocketHandler.js`
- `server.js`

## Correr backend

1. Instala dependencias:

```bash
cd backend
npm install
```

2. Ejecuta:

```bash
npm run dev
```

3. Variables opcionales:

- `SOCKET_PORT` (por defecto `3001`)
- `FRONT_ORIGIN` (por defecto `http://localhost:5173`)

## Integración frontend

En navegador define:

```js
window.URL_BASE = "http://localhost:3001";
```

Tu `useSocket.js` ya usa `io(window.URL_BASE, ...)`.

## Modelos

Por defecto el backend usa `InMemoryChatModel`.

Si quieres usar las consultas SQL migradas, define en `.env`:

```env
USE_SQL_MODEL=true
DB_HOST=127.0.0.1
DB_PORT=3306
DB_USER=root
DB_PASSWORD=secret
DB_NAME=chatdb
REDIS_ENABLED=true
REDIS_URL=redis://127.0.0.1:6379
```

Pools opcionales adicionales:

```env
TIPIFICACIONES_DB_HOST=
TIPIFICACIONES_DB_PORT=3306
TIPIFICACIONES_DB_USER=
TIPIFICACIONES_DB_PASSWORD=
TIPIFICACIONES_DB_NAME=

USUARIOSB_DB_HOST=
USUARIOSB_DB_PORT=3306
USUARIOSB_DB_USER=
USUARIOSB_DB_PASSWORD=
USUARIOSB_DB_NAME=

COLAS_DB_HOST=
COLAS_DB_PORT=3306
COLAS_DB_USER=
COLAS_DB_PASSWORD=
COLAS_DB_NAME=
```

El modelo SQL vive en `chatapp/models/ChatModel.js` y exporta también `getCache` y `setCache` con Redis opcional.
