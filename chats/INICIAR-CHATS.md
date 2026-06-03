# Cómo iniciar el módulo de chats

Puedes usar **cualquiera** de estos (deben estar sincronizados):

```powershell
cd c:\migracion_interfaz\chats\vue-chats\backend
node server.js
```

o:

```powershell
cd c:\migracion_interfaz\chats\src\app\chats\backend
npm install
node server.js
```

## Orden de servicios

1. MongoDB (27017)
2. Redis (`redis-server`)
3. Backend anterior (`node server.js`)
4. Next.js: `cd c:\migracion_interfaz\chats` → `npm run dev`
5. Navegador: http://localhost:3000/chats (Ctrl+F5)

## Tras cambiar el frontend Vue

```powershell
cd c:\migracion_interfaz\chats\vue-chats
npm run build
```
