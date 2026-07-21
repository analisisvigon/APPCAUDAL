# Analizador de fuentes de jugadores

Nombre remoto obligatorio: `analyze-player-source`.

La función valida una sesión mediante el JWT recibido en `Authorization`, descarga únicamente URLs HTTPS públicas y ofrece tres modos:

- `full_analysis`: extracción revisable de datos del perfil.
- `photo_only`: extracción aislada de la fotografía, sin devolver nombre, edad, posición ni otros campos.
- `store_photo`: valida de nuevo JPG/PNG/WEBP (máximo 5 MB y mínimo 150 × 150) y guarda una copia en `rival-player-assets`.

No usa OpenAI.

## Variables

`SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY` son necesarios únicamente para `store_photo`; Supabase los proporciona por defecto a sus Edge Functions alojadas. `OPENAI_API_KEY` no se utiliza. El frontend necesita `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY`; Supabase añade `apikey` y la aplicación envía explícitamente el JWT de la sesión.

La service role nunca se envía al navegador: se usa solo dentro de la Edge Function para escribir la copia validada en Storage.

## Despliegue

```powershell
$env:SUPABASE_ACCESS_TOKEN = '<token personal de Supabase>'
npx supabase functions deploy analyze-player-source --project-ref jkjuwysuubhdeqjuefbu
npx supabase functions list --project-ref jkjuwysuubhdeqjuefbu
```

Los eventos incluyen un `requestId` y se registran como JSON con estos nombres:

- `player_source_analysis_started`
- `player_source_analysis_completed`
- `player_source_photo_completed`
- `player_source_photo_stored`
- `player_source_analysis_failed`
- `player_source_auth_missing`

Los logs remotos se consultan en Supabase Dashboard → Edge Functions → `analyze-player-source` → Logs.

## Caso real documentado

Ficha: `https://www.lapreferente.com/J148655/aitor-ferrero.html`

En la comprobación del 21/07/2026, la página respondió `200`, declaró como `og:image` `https://www.lapreferente.com/imagenes/jugadores/20202021/148655.jpg?f=1612405277`, y la imagen respondió como `image/jpeg`, `300 × 300`, 9.707 bytes. El test automatizado conserva una fixture mínima de esos metadatos; no depende de la disponibilidad de la web externa durante cada build.
