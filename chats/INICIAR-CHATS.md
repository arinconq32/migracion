# Cómo iniciar el módulo de chats

## Backend (puerto 3001)

```powershell
cd c:\migracion_interfaz
npm run dev:backend
```

## Frontend Next.js (puerto 3000)

```powershell
cd c:\migracion_interfaz
npm run dev:frontend
```

## Orden de servicios

1. MongoDB (27017)
2. Redis (`redis-server`) — opcional
3. Backend: `npm run dev:backend`
4. Frontend: `npm run dev:frontend`
5. Navegador: http://localhost:3000/chats (Ctrl+F5)

## Tras cambiar el frontend Vue

```powershell
cd c:\migracion_interfaz\chats\vue-chats
npm run build
```
