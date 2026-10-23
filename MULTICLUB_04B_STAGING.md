# Ensayo Multiclub 04B: dos clubes ficticios

Esta guía usa un proyecto Supabase **nuevo y separado**. No usar ramas ni
restauraciones con datos de producción. `CtsCoreApp` ofrece Inicio, Plantilla
y Partidos de solo lectura; el acceso directo a tablas legacy sigue siendo
inseguro hasta 03C.

## 1. Preparar la base de ensayo

1. Crear un proyecto nuevo en Supabase con `ENSAYO` en el nombre. Anotar su
   *project ref* y clave pública. Comprobar siempre el nombre en el panel.
2. Instalar una estructura base **sin datos deportivos personales** desde un
   entorno de desarrollo propio. Este repositorio contiene migraciones
   incrementales, pero no el SQL inicial completo de `jugadores`, `partidos`
   y `equipos_rivales`. Sin esa base no se puede iniciar el ensayo desde cero.
3. Aplicar en orden las dependencias del núcleo: clubes y membresías,
   jugadores globales, temporadas, equipos, CTS y CTSP. A continuación:
   Multiclub 01 (`supabase_club_core_40_multiclub_identity.sql`), 02 de
   lecturas (`supabase_multiclub_02_scoped_reads.sql`), 02 de vínculos
   (`supabase_multiclub_02_row_scope_prepare.sql`), 03A
   (`supabase_multiclub_03_prepare.sql`) y 03B
   (`supabase_multiclub_03_player_create.sql`). Ejecutar sus preflight y
   postflight antes de avanzar. **No instalar 02B con los 24 UUID reales ni
   03C**. Si falla un preflight, detenerse.

**Dependencia pendiente:** varios SQL iniciales validan filas históricas del
Caudal y no sirven para construir una base vacía desde cero. El repositorio
no incluye ese esquema base independiente. Usar una base de desarrollo ya
inicializada con datos ficticios o aportar primero un esquema base vacío
revisado; no ejecutar migraciones que exijan datos reales para sortearlo.

## 2. Crear cinco usuarios ficticios

En Authentication > Users > Add user del proyecto ENSAYO, crear y confirmar
las cuentas de abajo. Usar contraseñas nuevas y no guardarlas en el repo.

| Correo | Perfil |
| --- | --- |
| `owner-04b@example.invalid` | Propietario de A y B |
| `staff-a-04b@example.invalid` | Staff solo A |
| `staff-b-04b@example.invalid` | Staff solo B |
| `outsider-04b@example.invalid` | Sin acceso |
| `player-04b@example.invalid` | PLAYER ficticio de A |

Si el panel rechaza `.invalid`, usar correos de prueba bajo control propio y
cambiarlos también en los dos SQL 04B antes de ejecutarlos. No enviar
invitaciones a terceros.

## 3. Instalar los datos ficticios

1. Verificar que el panel abierto es el proyecto ENSAYO.
2. Ejecutar en SQL Editor `supabase_multiclub_04b_staging_preflight.sql`.
   Todos los objetos deben existir, debe haber cinco usuarios y cero clubes
   `ENSAYO 04B`.
3. Revisar y ejecutar una sola vez `supabase_multiclub_04b_staging_seed.sql`.
   Crea dos clubes, equipos y temporadas 2099/2100, dos jugadores y dos
   partidos ficticios. Retira **solo en ensayo** el índice legacy que limita
   a un equipo `own`; la transacción se revierte entera si falla.
4. Ejecutar `supabase_multiclub_04b_staging_postflight.sql`: todos los
   booleanos deben ser `true`; cada club debe tener un CTS, un jugador y un
   partido. No usar el SQL Editor como prueba de RLS: opera como `postgres`.

## 4. Abrir la app desde VS Code

1. Usar una copia local separada. Copiar `.env.staging.example` a
   `.env.staging` (Git lo ignora).
2. Rellenar URL, clave pública y project ref de ENSAYO, además del project
   ref de producción para excluirlo. No copiar la clave de producción.
3. Ejecutar **`npm run dev:staging`**. Este comando comprueba que la URL
   corresponde a ENSAYO, que las referencias difieren y que la URL no
   coincide con `.env.local`. No usar `npm run dev -- --mode staging`, que
   omite esa comprobación.

## 5. Pruebas manuales reproducibles

Cerrar sesión entre cuentas. El propietario debe ver A y B en el selector.
En A, Inicio/Plantilla/Partidos solo deben mostrar `FICCIÓN Ámbar 04B` y
su partido; en B, solo `FICCIÓN Azul 04B` y el suyo. Cambiar A → B → A y
comprobar que no persiste ninguna fila ni estado anterior. Staff A y B deben
entrar directamente a su único CTS. Outsider no debe entrar. PLAYER debe
acceder sin selector y conservar sus reglas de privacidad.

Con sesiones `authenticated` reales, llamar a `my_cts_jugadores_v1` y
`my_cts_matches_v1` con el CTS propio y ajeno: el ajeno debe devolver cero
filas. Probar también revocación de membresía antes de elegir, UUID de CTS
inventado y temporada cerrada. Las consultas directas a `jugadores` y
`partidos` **pueden devolver datos ajenos con RLS legacy**: registrar esa
limitación, nunca considerarla una prueba aprobada de seguridad.

`supabase_multiclub_04b_staging_rpc_matrix.sql` reproduce cinco casos de
las RPC en el SQL Editor (propio: 1/1; ajeno o outsider: 0/0). Usa claims
temporales de ensayo, pero el SQL Editor sigue siendo `postgres`: repetir
las negativas con sesiones `authenticated` reales antes de concluir nada
sobre permisos.

Antes de 03C faltan las demás pantallas, escrituras, RPC y vistas derivadas,
las pruebas negativas completas y la revisión de políticas permisivas.
