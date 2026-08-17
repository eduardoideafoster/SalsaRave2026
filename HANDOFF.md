# SalsaRave 2026 · traspaso de conversación

Estado a 15 de agosto de 2026. Dos proyectos separados, los dos en
producción en el equipo `ideafoster` de Vercel.

---

## 1. Rooming — `salsarave-rooming-2026.vercel.app`

Repo: `~/Documents/GITHUB/SalsaRave2026` (Next.js 16 + Supabase).
Proyecto Vercel: `salsarave-fresh`. Despliegue: `pnpm build` →
`vercel deploy --prod --yes --scope ideafoster` → `vercel alias set <url>
salsarave-rooming-2026.vercel.app`.

### Acceso

Login real de Supabase Auth desde el 15/08. Usuario
`eduardo@ideafoster.com`. `middleware.ts` protege **todas** las rutas y
manda a `/login`. `/finance` conserva además su contraseña propia
(cookie `finance-auth`).

**Si la cuenta se pierde:** borrar el usuario en Supabase →
`Authentication` → `Users` y recrearlo con **Add user → Create new
user** (no *Invite*: la invitación crea la cuenta sin contraseña) y
marcando *Auto Confirm User*. Los correos de recuperación pueden fallar
por límite de envío.

### Seguridad de la base de datos

Las 5 tablas (`guests`, `rooms`, `bookings`, `finance_entries`,
`payments`) tienen RLS con política `authenticated full access`.
Migración en `supabase/migrations/20260815_lock_tables_to_authenticated.sql`.

Antes estaban abiertas: la clave anon viaja en el bundle del navegador,
así que cualquiera podía leer o borrar los 747 asistentes sin abrir la
web. Verificado tras el cierre: como rol `anon` las 5 tablas devuelven 0
filas; como `authenticated`, todas. **Sin sesión la base no responde** —
si algo deja de cargar datos, mirar primero si hay sesión.

### Datos actuales

- 747 asistentes · 464 reservas · **280 habitaciones** (221 de huéspedes, 59 staff)
- Tipos: 163 twin · 91 single · 18 triple · 7 matrimonial · 1 cuádruple
- **`double` está retirado.** Todas pasaron a twin, salvo las de cama
  única de H4 que son matrimonial.
- 269 habitaciones en uso · 9 libres, disponibles desde el viernes 11
- 284 asistentes sin habitación asignada (RavePass)

### Reglas de habitaciones

`lib/types.ts` centraliza:

- `SELECTABLE_ROOM_TYPES` — sin `double`; los que ya lo tienen lo siguen mostrando
- `H4_SINGLE_BED_ROOMS` — 10, 11, 18, 19, 20, 21, 28, 29, 30, 31, 38, 39, 40, 41, 48, 49, 50, 59
- `allowedRoomTypes(hotel, número)` — esas 18 sólo aceptan `single` o `matrimonial`

Se aplica en el desplegable **y** en el guardado, en los tres sitios:
fila de la tabla, diálogo del lápiz y alta de habitación.

### Avisos

`lib/rooming-rules.ts` — función pura, avisos no bloqueantes, panel
plegable arriba de la pestaña de Habitaciones. Seis reglas: sobre
capacidad, tipo de cama no permitido, capacidad que no cuadra con el
tipo, entrada antes de estar disponible, huésped en dos habitaciones,
hotel del huésped distinto al de la habitación.

Se descartó "habitación de staff con huéspedes": salían 61, que es
simplemente lo que es una habitación de staff.

### Columnas y export

- Columna **Solicitada** (`rooms.requested`) junto al número
- **Entrada / Salida** de la habitación (`check_in_date` / `check_out_date`):
  muestran la entrada más temprana y la salida más tardía de sus
  ocupantes; escribir una fecha la fija, borrarla vuelve al cálculo
- **Disponible desde** al final, separada
- Export *Rooming list (with guests)*: `room_number ·
  habitacion_solicitada · hotel · room_type · guest_name · is_staff ·
  room_first_check_in · guest_check_in · guest_check_out` y detrás
  capacidad, order_code, rol, país, ticket. Las fechas salen de la
  **reserva**, no de la ficha del huésped

### Errores de cálculo ya corregidos (patrón a vigilar)

Tres del mismo tipo — un número que fue cierto y se quedó fijo, o dos
paneles contando poblaciones distintas:

1. **Room Sharing Statistics** contaba *pedidos*, no habitaciones, sobre
   los 747 incluidos los 284 sin habitación. Partido en *Room
   occupancy* (269/92/161/16, 371 compartiendo) y *Orders by size*
   (434/261/154/19, 486).
2. **Inventario por noche** estaba fijo (160 jueves, 270 viernes). Al
   liberar las 10 bloqueadas pasó a haber 280 y el panel decía "−1
   sobrevendida". Ahora se cuenta de `available_from`.
3. **Vendibles** contaba libres *esa noche*. Decía 28 el jueves, pero
   todas están ocupadas desde el viernes. Ahora exige estar libre **todo
   el tramo**: 0 el jueves, 9 el viernes.

### Pendiente

- **Habitación 49 (H4)**: está en la lista de cama única pero es triple
  con 3 huéspedes. Cambiarla desaloja a alguien — decisión de Eduardo.
- 2 avisos ámbar de capacidad que no cuadra con el tipo.
- 9 avisos rojos de gente entrando antes de que la habitación esté
  disponible (H3 134, 335, 618, 632 · H4 41, 43, 48, 54, 58).

---

## 2. Cartel de DJs — `salsarave-schedule-2026.vercel.app`

Repo aparte: `~/Documents/GITHUB/salsarave-schedule-2026`. Sin framework:
HTML estático + funciones serverless. 54 tests (`npm test`).

- `/` — horario público, sólo **jueves a domingo**, sin categorías ni
  marcas de trabajo
- `/edit` — editor con contraseña `EDIT_PASSWORD`

### Cómo se guarda

**El horario vive en el servidor**, no en el repo. `/api/schedule` lo lee
y escribe en Vercel Blob; el editor guarda solo; cada guardado deja una
copia con fecha que no se borra nunca (`schedule/history/`).
`data2.json` es sólo la semilla inicial.

**Nunca hacer `PUT` del fichero local al servidor.** Hacerlo borró 40
slots de trabajo de Eduardo y luego una tanda de datos de viaje. Leer
del servidor, modificar y devolver. El blob es *eventualmente
consistente*: leer justo después de escribir puede devolver lo anterior,
así que no se puede construir un bloqueo fiable encima — se intentó y
falló. Sólo edita él, así que no hay control de concurrencia a propósito.

### Reglas

`rules.js` — módulo puro portado del editor original, con arnés de
paridad que ejecuta el JS antiguo en un sandbox y compara salidas.

Incluye: disponibilidad por DJ, horas de vuelo con margen de traslado de
2h30 (ajustable por DJ), Cruz sólo Prime sábado o domingo, cinco DJs que
no empiezan antes de las 00:00 y nunca seguidos entre ellos, diez DJs de
"jueves sólo noche", Anael sin viernes tarde ni después de las 02:00 del
domingo, Eddie y Melao sin piscina, y avisos **naranjas validables**
(un master con noche de más se acepta sin mover a nadie).

Miércoles y lunes son after party y **no cuentan para los cupos**.

### Pendiente

- Rellenar `NO_EARLY_POOL` y `NO_PAIR` (los ganchos existen, están vacíos)
- Confirmar quién cierra el sábado y quién lleva el pico del viernes

---

## Cómo trabajo aquí

- Eduardo escribe en español; respuestas en español, código y commits en inglés
- Autonomía: aplicar cambios, migraciones y despliegues sin pedir permiso
- Excepciones donde sí se pregunta: acciones destructivas sobre datos de
  producción fuera del encargo, y cualquier cosa que necesite su
  autenticación (`vercel login`, panel de Supabase)
- El email del commit **debe** ser `eduardo@ideafoster.com` o el equipo
  de Vercel rechaza el despliegue con un "deploy_failed" vacío
- Verificar con datos antes de afirmar: varios fallos de esta sesión se
  encontraron comprobando el resultado en vez de fiarse del `HTTP 200`
