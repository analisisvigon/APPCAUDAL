# Ensayo Multiclub 04B: dos clubes ficticios

Esta guía usa un proyecto Supabase **nuevo y separado**. No usar ramas ni
restauraciones con datos de producción. `CtsCoreApp` ofrece Inicio, Plantilla
y Partidos de solo lectura; el acceso directo a tablas legacy sigue siendo
inseguro hasta 03C.

## 1. Preparar la base de ensayo

1. Seguir primero `MULTICLUB_04C_STAGING_SCHEMA.md`. El esquema base aún no
   está acreditado: **el seed 04B permanece bloqueado** hasta recibir los
   metadatos estructurales y preparar el SQL base revisado.
2. En el proyecto nuevo de ensayo, completar el orden 04C y ejecutar
   `supabase_multiclub_04c_staging_schema_verify.sql`.
3. Crear las cinco cuentas ficticias y ejecutar
   `supabase_multiclub_04c_staging_guard.sql` después de comprobar el project
   ref. Este guard exige que las tablas deportivas sigan vacías.

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
cambiarlos en los SQL 04B y en el guard 04C antes de ejecutarlos. No enviar
invitaciones a terceros.

## 3. Instalar los datos ficticios

1. Verificar que el panel abierto es el proyecto ENSAYO.
2. Ejecutar en SQL Editor `supabase_multiclub_04b_staging_preflight.sql`.
   Todos los objetos deben existir, el marcador 04C debe ser válido, debe
   haber exactamente cinco usuarios ficticios y la base deportiva estar vacía.
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
