# CromoFútbol Tenerife — PRD (Emergent setup)

## Problema original
"Tengo conectado este repositorio GitHub existente de una app ya construida.
No reconstruyas la app desde cero. No rediseñes. No cambies funcionalidades todavía.
Analiza el repositorio actual y configura únicamente lo necesario para ejecutarlo en preview/deploy dentro de Emergent."

## Stack detectado
- **Backend**: FastAPI + Motor (MongoDB) + JWT (PyJWT + bcrypt) + CORS abierto
- **Frontend**: Expo SDK 54 + React Native + expo-router + react-native-web (móvil + web)
- **Base de datos**: MongoDB local de Emergent (`mongodb://localhost:27017` / `cromofutbol`)
- **Auth**: Bearer JWT en `AsyncStorage` (compatible iOS/Android/Web)
- **IA opcional**: Gemini 2.5 Flash vía Emergent LLM Key (`POST /api/ai/extract-list`)

## Estructura del repo (tras configuración)
```
/app
├── backend/
│   ├── server.py              # FastAPI + endpoints + seed admin
│   ├── requirements.txt
│   └── .env                   # MONGO_URL, DB_NAME, JWT_SECRET, ADMIN_*, EMERGENT_LLM_KEY
├── frontend/
│   ├── app/                   # expo-router pages (tabs, login, register, index)
│   ├── src/                   # api.ts (axios + AsyncStorage) y auth.tsx (context)
│   ├── assets/, scripts/
│   ├── app.json               # expo config (web bundler=metro, output=static)
│   ├── package.json           # script "start" → expo start --web --port 3000
│   ├── metro.config.js
│   └── .env                   # EXPO_PUBLIC_BACKEND_URL
└── memory/
    ├── PRD.md
    └── test_credentials.md
```

## Variables de entorno configuradas

### backend/.env
| Variable | Valor |
|---|---|
| `MONGO_URL` | `mongodb://localhost:27017` |
| `DB_NAME` | `cromofutbol` |
| `JWT_SECRET` | secreto generado (64 hex chars) |
| `ADMIN_EMAIL` | `admin@cromofutbol.es` |
| `ADMIN_PASSWORD` | `Fitipaldi8@` |
| `EMERGENT_LLM_KEY` | Universal Key Emergent (Gemini 2.5 Flash) |
| `CORS_ORIGINS` | `*` |

### frontend/.env
| Variable | Valor |
|---|---|
| `EXPO_PUBLIC_BACKEND_URL` | URL pública de preview Emergent |

## Comandos de ejecución (gestionados por supervisor)
- **Backend**: `uvicorn server:app --host 0.0.0.0 --port 8001 --reload` (cwd: `/app/backend`)
- **Frontend**: `yarn start` → `expo start --web --port 3000` (cwd: `/app/frontend`)
- **MongoDB**: `mongod --bind_ip_all` (servicio supervisado)
- **Reinicio**: `sudo supervisorctl restart backend frontend`

## Estado de preview (verificado vía URL pública)
- ✅ `GET /api/` → `{"ok":true,"service":"cromofutbol-api"}`
- ✅ `GET /health` → `{"status":"ok"}`
- ✅ `POST /api/auth/login` con admin → token JWT válido, role=admin
- ✅ `GET /api/auth/me` con bearer → user + profile (profile_completed=true)
- ✅ Frontend Expo Web sirve landing con branding original (CromoFútbol Tenerife)
- ✅ Hot reload activo en backend (uvicorn --reload) y frontend (Metro)

## Listo para deploy
Sí. La app cumple con el contrato Emergent:
- Backend en puerto 8001 con prefijo `/api` para todas las rutas (más `/health` y `/api/download/web-bundle`).
- Frontend en puerto 3000 sirviendo Expo Web (output=static).
- Variables protegidas (`MONGO_URL`, `DB_NAME`, `REACT_APP_BACKEND_URL` no aplica, se usa `EXPO_PUBLIC_BACKEND_URL`) configuradas.
- No hay URLs hardcodeadas: el frontend lee `EXPO_PUBLIC_BACKEND_URL` y cae a `window.location.origin`.

## Pantallas implementadas (sin cambios respecto al repo original)
1. Landing (`/`)
2. Login / Register (`/login`, `/register`)
3. Dashboard (`/(tabs)/dashboard`)
4. Mis Cambios (`/(tabs)/cambios`) con import IA
5. Coincidencias (`/(tabs)/coincidencias`)
6. Intercambios (`/(tabs)/intercambios`)
7. Admin (`/(tabs)/admin`, solo role=admin)
8. Perfil (`/(tabs)/perfil`)

## No implementado en esta sesión (out of scope por petición explícita)
- No se añadieron features nuevas
- No se redisenó UI
- No se modificó lógica de negocio existente

## Backlog (heredado del repo, no abordado)
- Múltiples niños por cuenta, importación CSV
- Panel admin web extendido
- Chat por intercambio, notificaciones realtime, PWA install
- Filtros avanzados en match
- Confirmación bilateral de intercambio
