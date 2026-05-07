# CromoFútbol Tenerife — PRD

## Problema original
"Termina esta app" — Plataforma para gestión e intercambio de cromos de fútbol base de Tenerife.
Lógica: "Busco" + "Repetido" del otro = posible intercambio. Privacidad: contacto solo tras aceptar.

## Stack Final
- **Backend**: FastAPI + Motor (MongoDB) + JWT (bcrypt) + CORS abierto
- **Frontend**: Expo SDK 54 + React Native + expo-router + react-native-web (móvil + web)
- **Auth**: Bearer tokens en AsyncStorage (compatible iOS/Android/Web)

## 🤖 Agente IA (Gemini 2.5 Flash via Emergent LLM Key)
- **Endpoint:** `POST /api/ai/extract-list` con `image_base64` + `mode` (`lista` | `cromos`)
- **Lista escrita a mano**: extrae números y nombres de jugadores especiales reconociendo letra de niño
- **Foto de cromos**: identifica números visibles y nombres de cromos especiales
- Devuelve JSON estructurado: `{numbers: [], specials: [{player_name, card_type}]}`
- El `card_type` se infiere automáticamente como `ballondor` (premios) o `special` (jugadores destacados)
- **UX en frontend** (Mis Cambios → modal añadir → botón morado "🤖 Importar con IA"):
  1. Picker de imagen (galería + cámara en móvil, file picker en web)
  2. Preview de la foto
  3. Selección "Lista escrita" vs "Foto de cromos"
  4. Botón "Analizar con IA" → resultados editables como chips
  5. Permite añadir/quitar números y especiales antes de confirmar
  6. Confirmar → mezcla en el formulario principal → guarda con bulk endpoint

## Pantallas implementadas
1. **Landing** (`/`)
2. **Login / Register** (`/login`, `/register`)
3. **Dashboard** (`/(tabs)/dashboard`): stats + tutorial
4. **Mis Cambios** (`/(tabs)/cambios`): multiselección numérica 1-500, especiales por nombre, bulk endpoint, buscador, crear colección inline
5. **Match** (`/(tabs)/coincidencias`): modal con checkboxes para elegir cuántos y cuáles cromos pedir/ofrecer (multi-select bidireccional)
6. **Intercambios** (`/(tabs)/intercambios`): muestra listas completas de cromos pedidos/ofrecidos, aceptar/rechazar, contacto desbloqueado
7. **Admin** (`/(tabs)/admin`, solo role=admin): overview con stats, filtros pendientes/aprobadas/rechazadas, aprobar/rechazar/editar/borrar/crear colecciones
8. **Perfil** (`/(tabs)/perfil`) con campo "Nombre de tu jugador"

## Flujo de aprobación
- Usuarios crean colecciones → status `pending` (notificación a admins)
- Admin las aprueba/rechaza → notificación al creador
- Solo colecciones aprobadas (o las propias) son visibles a usuarios normales
- Admin las crea ya como `approved`

## Intercambios múltiples
- Endpoint `POST /api/exchanges` acepta `requested_entry_ids[]` y `offered_entry_ids[]` (hasta 50 cada uno)
- Compatibilidad retro: el frontend antiguo desplegado sigue funcionando (acepta los campos singulares)
- Vista del intercambio muestra todos los cromos en cada lado

## Endpoints backend
- `/api/auth/{register,login,me}`
- `/api/profile/me` (PUT)
- `/api/collections` (GET, POST)
- `/api/cards` (GET, POST)
- `/api/entries/me` (GET), `/api/entries` (POST), `/api/entries/{id}` (DELETE)
- `/api/matches` (GET) — algoritmo busco↔repetido cruzado con priorización
- `/api/exchanges` (GET, POST), `/api/exchanges/{id}/accept`, `/api/exchanges/{id}/reject`
- `/api/notifications` (GET), `/api/notifications/read-all`
- `/api/dashboard` (stats)

## Admin
- `admin@cromofutbol.es` / `Admin123` (auto-seed en startup)

## Cómo probar (web + móvil)
- **Web**: abrir preview URL `/` → registrarse o login con admin → navegación por tabs
- **Móvil**: escanear QR de Expo Go en el preview

## Verificación
- ✅ Backend: login admin, dashboard, register, create collection (curl OK)
- ✅ Frontend web: landing renderiza, login form interactivo, navegación a tabs funcional (logs backend confirman flujo)
- ✅ Mobile: Expo bundles para iOS/Android (Tunnel ready)

## No implementado vs PRD del zip original (out of scope MVP mínimo)
- Múltiples niños por cuenta, importación CSV, comunidades por club
- Panel admin web (aprobar/fusionar colecciones)
- Chat por intercambio, notificaciones realtime, PWA install
- Filtros avanzados en match (categoría/club/zona/especiales-only)
- Confirmar intercambio bilateralmente

(Estos quedan en backlog si se desean retomar.)
