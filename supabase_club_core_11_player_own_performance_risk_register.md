# Bloque 1.4 — riesgo bloqueante antes del frontend PLAYER

La policy remota `club_memberships."Club members can read memberships"` usa:

```sql
(user_id = auth.uid()) OR is_club_member(club_id)
```

Un futuro usuario con membership `player` podría satisfacer
`is_club_member(club_id)` y leer memberships de otros miembros de su club.

Este riesgo no se corrige en el Bloque 1.4 porque `club_memberships` queda fuera
del alcance de la migración. Su revisión y cierre son obligatorios antes de
habilitar cualquier frontend o navegación PLAYER.
