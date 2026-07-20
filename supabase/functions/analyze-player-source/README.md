# Analizador de fuentes de jugadores

Nombre remoto obligatorio: `analyze-player-source`.

La función valida una sesión mediante el JWT recibido en `Authorization`, descarga únicamente URLs HTTPS públicas y analiza el HTML de la fuente. No usa OpenAI ni accede directamente a la base de datos.

## Variables

No requiere secretos propios. En particular, `OPENAI_API_KEY` y `SUPABASE_SERVICE_ROLE_KEY` no se utilizan. El frontend necesita `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY`; Supabase añade `apikey` y la aplicación envía explícitamente el JWT de la sesión.

## Despliegue

```powershell
$env:SUPABASE_ACCESS_TOKEN = '<token personal de Supabase>'
npx supabase functions deploy analyze-player-source --project-ref jkjuwysuubhdeqjuefbu
npx supabase functions list --project-ref jkjuwysuubhdeqjuefbu
```

Los eventos incluyen un `requestId` y se registran como JSON con estos nombres:

- `player_source_analysis_started`
- `player_source_analysis_completed`
- `player_source_analysis_failed`
- `player_source_auth_missing`

Los logs remotos se consultan en Supabase Dashboard → Edge Functions → `analyze-player-source` → Logs.
