/**
 * Google Forms -> Google Sheets -> Apps Script -> Supabase
 *
 * V1 automatica para Rendimiento.
 *
 * IMPORTANTE:
 * - SUPABASE_SERVICE_ROLE_KEY no debe estar nunca en React ni en archivos publicos.
 * - Guardala solo en Apps Script > Project Settings > Script properties.
 *
 * Script properties necesarias:
 * - SUPABASE_URL: https://xxxxx.supabase.co
 * - SUPABASE_SERVICE_ROLE_KEY: service_role key privada de Supabase
 *
 * El jugador se resuelve directamente contra public.jugadores en Supabase.
 * Prioridad de nombres: google_forms_name, shirt_name y name.
 * La comparación ignora mayúsculas, tildes y espacios sobrantes, pero nunca es parcial.
 *
 * Form Wellness diario. Columnas esperadas/recomendadas:
 * - Fecha
 * - Nombre y apellidos.
 * - Horas de sueño
 * - Sueño o Calidad del sueño
 * - Fatiga
 * - Dolor muscular
 * - Estrés
 * - Estado de ánimo
 * - Peso
 * - Molestias
 * - Comentario
 * - Ratio salud
 *
 * Las respuestas categóricas de Sueño, Molestias y Estado de ánimo se convierten
 * automáticamente a escala 1-10 antes de guardar en Supabase.
 *
 * Form RPE post-entrenamiento. Columnas esperadas:
 * - Marca temporal (la añade Google Forms automáticamente)
 * - Nombre y apellidos.
 * - RPE
 * - Comentario
 *
 * El RPE se guarda como dato diario. La marca temporal de Google Forms determina
 * entry_date en la zona horaria del Sheet y submitted_at conserva el instante completo.
 * training_sessions y session_id se mantienen en Supabase solo como compatibilidad legacy.
 *
 * Triggers:
 * 1. En el Google Sheet del Wellness:
 *    Apps Script > Triggers > Add Trigger
 *    function: onWellnessSubmit
 *    event source: From spreadsheet
 *    event type: On form submit
 *
 * 2. En el Google Sheet del RPE:
 *    Apps Script > Triggers > Add Trigger
 *    function: onRpeSubmit
 *    event source: From spreadsheet
 *    event type: On form submit
 *
 * Importación histórica Wellness:
 * - Ejecuta manualmente importAllWellnessHistory desde Apps Script.
 * - Puede repetirse: el upsert por jugador_id + entry_date evita duplicados.
 *
 * Importación histórica RPE:
 * - Ejecuta manualmente importAllRpeHistory desde Apps Script.
 * - Puede repetirse: el upsert por jugador_id + entry_date evita duplicados.
 */

const TECHNICAL_COLUMNS = ['Supabase status', 'Supabase session_id', 'Supabase error', 'Supabase synced_at'];
const PLAYER_HEADER_CANDIDATES = ['Nombre y apellidos.', 'Nombre y apellidos', 'Nombre del jugador', 'Jugador', 'Nombre', 'Columna 3'];
const RPE_HEADER_CANDIDATES = ['RPE', 'RPE (1-10)', 'RPE 1-10', 'Columna 4'];
const RPE_SESSION_CODE_HEADERS = ['Código sesión', 'Codigo sesion', 'Código de sesión', 'Codigo de sesion', 'form_code'];
const TIMESTAMP_HEADER_CANDIDATES = ['Marca temporal', 'Timestamp', 'Fecha', 'Columna 1'];
const RPE_COMMENT_HEADER_CANDIDATES = ['Comentario', 'Comentarios', 'Columna 5'];
const FORMULA_RETRY_COUNT = 3;
const FORMULA_RETRY_DELAY_MS = 250;
const WELLNESS_IMPORT_BATCH_SIZE = 100;
const RPE_IMPORT_BATCH_SIZE = 100;

function onWellnessSubmit(e) {
  let submission = null;
  try {
    submission = readSubmittedSheetRow(e, { waitForHeader: 'Ratio salud' });
    const row = submission.values;
    const playerName = getFirstValue(row, ['Nombre y apellidos.', 'Nombre y apellidos', 'Jugador', 'Nombre']);
    const player = findPlayerIdByFormName(playerName);
    if (!player) {
      throw new Error(`Jugador no encontrado en public.jugadores: "${playerName}". No se inserta wellness.`);
    }

    const payload = buildWellnessPayload(row, player.jugador_id);

    requireFields(payload, ['jugador_id', 'entry_date'], 'wellness');
    upsertSupabase('wellness_entries', payload, 'jugador_id,entry_date');
    logPlayerResolution('onWellnessSubmit', playerName, player);
    setSubmissionSyncState(submission, { status: 'SYNCED', sessionId: '', error: '', syncedAt: new Date() });
    console.log('Wellness sincronizado con Supabase', payload);
  } catch (error) {
    if (submission) {
      setSubmissionSyncState(submission, { status: 'ERROR', sessionId: '', error: error.message || String(error), syncedAt: '' });
    }
    console.error('Error en onWellnessSubmit:', error);
    throw error;
  }
}

function onRpeSubmit(e) {
  let submission = null;
  const diagnostic = {
    receivedName: '',
    receivedTimestamp: '',
    rawRpe: '',
    playerResolution: null,
    payload: null,
  };
  try {
    submission = readSubmittedSheetRow(e);
    const row = submission.values;
    assertRpeHeaders(row);
    const playerName = getFirstValue(row, PLAYER_HEADER_CANDIDATES);
    diagnostic.receivedName = playerName;
    diagnostic.receivedTimestamp = getFirstValue(row, TIMESTAMP_HEADER_CANDIDATES);
    diagnostic.rawRpe = getFirstValue(row, RPE_HEADER_CANDIDATES);
    const player = findPlayerIdByFormName(playerName);
    if (!player) {
      throw new Error(`Jugador no encontrado en public.jugadores: "${playerName}". No se inserta RPE.`);
    }
    diagnostic.playerResolution = player;

    const payload = buildDailyRpePayload(
      row,
      player.jugador_id,
      getSheetTimeZone(submission.sheet),
      player.club_id
    );
    diagnostic.payload = payload;
    requireFields(payload, ['jugador_id', 'entry_date', 'submitted_at', 'rpe'], 'rpe diario');
    upsertSupabase('rpe_entries', payload, getDailyRpeConflictTarget(payload));
    logRpeResolution('onRpeSubmit', {
      receivedName: playerName,
      player,
      payload,
    });
    setSubmissionSyncState(submission, { status: 'SYNCED', sessionId: '', error: '', syncedAt: new Date() });
    console.log('RPE sincronizado con Supabase', payload);
  } catch (error) {
    logRpeHistoryErrors([buildRpeImportFailure({
      rowNumber: submission?.rowNumber || '',
      receivedName: diagnostic.receivedName,
      receivedTimestamp: diagnostic.receivedTimestamp,
      rawRpe: diagnostic.rawRpe,
      playerResolution: diagnostic.playerResolution,
      payload: diagnostic.payload,
      error,
      players: [],
    })]);
    if (submission) {
      setSubmissionSyncState(submission, { status: 'ERROR', sessionId: '', error: error.message || String(error), syncedAt: '' });
    }
    console.error('Error en onRpeSubmit:', error);
    throw error;
  }
}

function importAllWellnessHistory() {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = findWellnessResponseSheet(spreadsheet);
  const technical = ensureTechnicalColumns(sheet);
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) {
    const emptySummary = { sheet: sheet.getName(), rows: 0, upserted: 0, duplicatesMerged: 0, errors: 0 };
    console.log('Histórico Wellness: no hay filas para importar.', emptySummary);
    return emptySummary;
  }

  SpreadsheetApp.flush();
  const rows = sheet.getRange(2, 1, lastRow - 1, technical.lastColumn).getValues();
  const rowItems = rows.map((row, index) => ({
    rowNumber: index + 2,
    values: Object.fromEntries(technical.headers.map((header, columnIndex) => [String(header).trim(), row[columnIndex]])),
  }));
  const players = fetchPlayersForForms();
  const plan = buildWellnessHistoryImportPlan(rowItems, players);
  const syncStates = {};

  plan.failures.forEach((failure) => {
    syncStates[failure.rowNumber] = {
      status: 'ERROR',
      sessionId: '',
      error: failure.error,
      syncedAt: '',
    };
  });

  let upserted = 0;
  let syncedRows = 0;
  for (let offset = 0; offset < plan.groups.length; offset += WELLNESS_IMPORT_BATCH_SIZE) {
    const groups = plan.groups.slice(offset, offset + WELLNESS_IMPORT_BATCH_SIZE);
    try {
      upsertSupabase('wellness_entries', groups.map((group) => group.payload), 'jugador_id,entry_date');
      const syncedAt = new Date();
      groups.forEach((group) => {
        group.rowNumbers.forEach((rowNumber) => {
          syncStates[rowNumber] = {
            status: 'SYNCED',
            sessionId: '',
            error: '',
            syncedAt,
          };
          syncedRows += 1;
        });
        group.rowDetails.forEach((detail) => {
          logPlayerResolution('importAllWellnessHistory', detail.receivedName, {
            jugador_id: group.payload.jugador_id,
            name: detail.matchedPlayerName,
            google_forms_name: detail.googleFormsName,
            match_rule: detail.matchRule,
          });
        });
      });
      upserted += groups.length;
    } catch (error) {
      const message = error.message || String(error);
      groups.forEach((group) => {
        group.rowNumbers.forEach((rowNumber) => {
          syncStates[rowNumber] = {
            status: 'ERROR',
            sessionId: '',
            error: message,
            syncedAt: '',
          };
        });
      });
      plan.failures.push(...groups.flatMap((group) =>
        group.rowDetails.map((detail) => buildWellnessImportFailure({
          rowNumber: detail.rowNumber,
          receivedName: detail.receivedName,
          receivedDate: detail.receivedDate,
          error: getWellnessPayloadDiagnostic(group.payload, detail.receivedDate) || message,
          players,
        }))
      ));
    }
  }
  writeHistorySyncStates(sheet, technical.columns, lastRow, syncStates);

  const summary = {
    sheet: sheet.getName(),
    rows: rowItems.length,
    syncedRows,
    upserted,
    duplicatesMerged: plan.duplicatesMerged,
    skipped: plan.skipped,
    errors: plan.failures.length,
  };
  console.log('Histórico Wellness importado.', summary);
  logWellnessHistoryErrors(plan.failures);
  return summary;
}

function importAllRpeHistory() {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = findRpeResponseSheet(spreadsheet);
  const technical = ensureTechnicalColumns(sheet);
  assertRpeHeaders(Object.fromEntries(technical.headers.map((header) => [String(header).trim(), ''])));
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) {
    const emptySummary = { sheet: sheet.getName(), rows: 0, syncedRows: 0, upserted: 0, duplicatesMerged: 0, skipped: 0, errors: 0 };
    console.log('Histórico RPE: no hay filas para importar.', emptySummary);
    return emptySummary;
  }

  SpreadsheetApp.flush();
  const rows = sheet.getRange(2, 1, lastRow - 1, technical.lastColumn).getValues();
  const rowItems = rows.map((row, index) => ({
    rowNumber: index + 2,
    values: Object.fromEntries(technical.headers.map((header, columnIndex) => [String(header).trim(), row[columnIndex]])),
  }));
  const players = fetchPlayersForForms();
  const plan = buildRpeHistoryImportPlan(rowItems, players, getSheetTimeZone(sheet));
  const syncStates = {};

  plan.failures.forEach((failure) => {
    syncStates[failure.rowNumber] = {
      status: 'ERROR',
      sessionId: '',
      error: failure.error,
      syncedAt: '',
    };
  });

  let upserted = 0;
  let syncedRows = 0;
  const markGroupsAsSynced = (groups) => {
    const syncedAt = new Date();
    groups.forEach((group) => {
      group.rowDetails.forEach((detail) => {
        syncStates[detail.rowNumber] = {
          status: 'SYNCED',
          sessionId: '',
          error: '',
          syncedAt,
        };
        syncedRows += 1;
        logRpeResolution('importAllRpeHistory', {
          receivedName: detail.receivedName,
          player: detail.playerResolution,
          payload: group.payload,
        });
      });
    });
    upserted += groups.length;
  };
  const markGroupAsFailed = (group, error) => {
    const message = error.message || String(error);
    group.rowDetails.forEach((detail) => {
      const failure = buildRpeImportFailure({
        rowNumber: detail.rowNumber,
        receivedName: detail.receivedName,
        playerResolution: detail.playerResolution,
        payload: group.payload,
        error: message,
      });
      plan.failures.push(failure);
      syncStates[detail.rowNumber] = {
        status: 'ERROR',
        sessionId: '',
        error: failure.error,
        syncedAt: '',
      };
    });
  };
  for (let offset = 0; offset < plan.groups.length; offset += RPE_IMPORT_BATCH_SIZE) {
    const groups = plan.groups.slice(offset, offset + RPE_IMPORT_BATCH_SIZE);
    try {
      upsertSupabase(
        'rpe_entries',
        groups.map((group) => group.payload),
        getDailyRpeConflictTarget(groups[0] && groups[0].payload)
      );
      markGroupsAsSynced(groups);
    } catch (batchError) {
      console.warn('Falló un lote RPE; se reintenta cada clave individualmente.', {
        offset,
        groups: groups.length,
        error: batchError.message || String(batchError),
      });
      groups.forEach((group) => {
        try {
          upsertSupabase('rpe_entries', group.payload, getDailyRpeConflictTarget(group.payload));
          markGroupsAsSynced([group]);
        } catch (rowError) {
          markGroupAsFailed(group, rowError);
        }
      });
    }
  }
  writeHistorySyncStates(sheet, technical.columns, lastRow, syncStates);

  const summary = {
    sheet: sheet.getName(),
    rows: rowItems.length,
    syncedRows,
    upserted,
    duplicatesMerged: plan.duplicatesMerged,
    skipped: plan.skipped,
    errors: plan.failures.length,
  };
  console.log('Histórico RPE importado.', summary);
  logRpeHistoryErrors(plan.failures);
  return summary;
}

function getSupabaseConfig() {
  const properties = PropertiesService.getScriptProperties();
  const url = properties.getProperty('SUPABASE_URL');
  const serviceRoleKey = properties.getProperty('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !serviceRoleKey) {
    throw new Error('Configura SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY en Script properties.');
  }
  return {
    url: url.replace(/\/$/, ''),
    serviceRoleKey,
  };
}

function supabaseFetch(path, options) {
  const config = getSupabaseConfig();
  const response = UrlFetchApp.fetch(`${config.url}/rest/v1/${path}`, {
    muteHttpExceptions: true,
    ...options,
    headers: {
      apikey: config.serviceRoleKey,
      Authorization: `Bearer ${config.serviceRoleKey}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
      ...(options && options.headers ? options.headers : {}),
    },
  });

  const status = response.getResponseCode();
  const body = response.getContentText();
  if (status < 200 || status >= 300) {
    throw new Error(`Supabase error ${status}: ${body}`);
  }
  return body ? JSON.parse(body) : null;
}

function upsertSupabase(table, payload, onConflict) {
  return supabaseFetch(`${table}?on_conflict=${encodeURIComponent(onConflict)}`, {
    method: 'post',
    payload: JSON.stringify(payload),
    headers: {
      Prefer: 'resolution=merge-duplicates,return=representation',
    },
  });
}

function deleteSupabase(table, query) {
  return supabaseFetch(`${table}?${query}`, {
    method: 'delete',
    headers: {
      Prefer: 'return=minimal',
    },
  });
}

function getSheetTimeZone(sheet) {
  try {
    const spreadsheet = sheet && typeof sheet.getParent === 'function' ? sheet.getParent() : null;
    const spreadsheetTimeZone = spreadsheet && typeof spreadsheet.getSpreadsheetTimeZone === 'function'
      ? spreadsheet.getSpreadsheetTimeZone()
      : '';
    if (spreadsheetTimeZone) return spreadsheetTimeZone;
  } catch (error) {
    console.warn('No se pudo leer la zona horaria del Sheet; se usa la del proyecto Apps Script.', error);
  }
  return Session.getScriptTimeZone();
}

function buildDailyRpePayload(row, playerId, timeZone, clubId) {
  const receivedTimestamp = getFirstValue(row || {}, TIMESTAMP_HEADER_CANDIDATES);
  const submittedDate = parseRpeSubmittedDate(receivedTimestamp, timeZone);
  if (!submittedDate) {
    throw new Error(`Fecha RPE inválida: "${String(receivedTimestamp || '').trim()}".`);
  }
  const entryDate = Utilities.formatDate(
    submittedDate,
    timeZone || Session.getScriptTimeZone(),
    'yyyy-MM-dd'
  );
  if (!isValidIsoDate(entryDate)) {
    throw new Error(`Fecha RPE inválida: "${String(receivedTimestamp || '').trim()}".`);
  }
  const payload = {
    jugador_id: playerId,
    entry_date: entryDate,
    submitted_at: submittedDate.toISOString(),
    rpe: toRpeValue(getFirstValue(row || {}, RPE_HEADER_CANDIDATES)),
    comment: getFirstValue(row || {}, RPE_COMMENT_HEADER_CANDIDATES) || '',
  };
  if (clubId) payload.club_id = clubId;
  return payload;
}

function parseRpeSubmittedDate(value, timeZone) {
  if (!value) return null;
  if (Object.prototype.toString.call(value) === '[object Date]') {
    return Number.isNaN(value.getTime()) ? null : value;
  }

  const text = String(value).trim();
  if (!text) return null;
  const zone = timeZone || Session.getScriptTimeZone();
  const spanishTimestamp = text.match(
    /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/
  );
  if (spanishTimestamp) {
    const year = Number(spanishTimestamp[3]);
    const month = Number(spanishTimestamp[2]);
    const day = Number(spanishTimestamp[1]);
    const hour = Number(spanishTimestamp[4] || 0);
    const minute = Number(spanishTimestamp[5] || 0);
    const second = Number(spanishTimestamp[6] || 0);
    const calendarCheck = new Date(Date.UTC(year, month - 1, day, hour, minute, second));
    if (
      calendarCheck.getUTCFullYear() !== year
      || calendarCheck.getUTCMonth() !== month - 1
      || calendarCheck.getUTCDate() !== day
      || hour > 23
      || minute > 59
      || second > 59
    ) {
      return null;
    }
  }
  const formats = [
    'dd/MM/yyyy HH:mm:ss',
    'dd/MM/yyyy H:mm:ss',
    'dd/MM/yyyy HH:mm',
    'dd/MM/yyyy',
    'yyyy-MM-dd HH:mm:ss',
    "yyyy-MM-dd'T'HH:mm:ss",
    'yyyy-MM-dd',
  ];
  if (Utilities && typeof Utilities.parseDate === 'function') {
    for (const format of formats) {
      try {
        const parsed = Utilities.parseDate(text, zone, format);
        if (parsed && !Number.isNaN(parsed.getTime())) return parsed;
      } catch {
        // Prueba el siguiente formato admitido.
      }
    }
  }

  if (spanishTimestamp) {
    return new Date(Date.UTC(
      Number(spanishTimestamp[3]),
      Number(spanishTimestamp[2]) - 1,
      Number(spanishTimestamp[1]),
      Number(spanishTimestamp[4] || 0),
      Number(spanishTimestamp[5] || 0),
      Number(spanishTimestamp[6] || 0)
    ));
  }

  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

// Compatibilidad legacy de Fase 1. Ningún flujo RPE activo llama a estas funciones.
function fetchTrainingSessionsForRpe() {
  return supabaseFetch('training_sessions?select=id,session_date,planned_duration,title,session_type,form_code&order=session_date.asc,created_at.asc&limit=5000', {
    method: 'get',
  }) || [];
}

function resolveTrainingSessionForRpe(sessions, row) {
  const rows = Array.isArray(sessions) ? sessions : [];
  const receivedCode = String(getFirstValue(row || {}, RPE_SESSION_CODE_HEADERS) || '').trim();
  if (receivedCode) {
    const matches = rows.filter((session) => String(session.form_code || '').trim() === receivedCode);
    return resolveUniqueTrainingSession(matches, {
      receivedSession: receivedCode,
      matchRule: 'EXACT_FORM_CODE',
      missingMessage: `No existe training_session con form_code exacto "${receivedCode}".`,
    });
  }

  const receivedDate = getFirstValue(row || {}, TIMESTAMP_HEADER_CANDIDATES);
  const sessionDate = toIsoDate(receivedDate);
  if (!isValidIsoDate(sessionDate)) {
    const error = new Error(`Fecha RPE inválida: "${String(receivedDate || '').trim()}".`);
    error.session_rule = 'UNIQUE_SESSION_DATE';
    error.received_session = String(receivedDate || '').trim();
    throw error;
  }
  const matches = rows.filter((session) => String(session.session_date || '') === sessionDate);
  return resolveUniqueTrainingSession(matches, {
    receivedSession: sessionDate,
    matchRule: 'UNIQUE_SESSION_DATE',
    missingMessage: `No existe training_session para la fecha ${sessionDate}.`,
  });
}

function resolveUniqueTrainingSession(matches, details) {
  const candidates = Array.isArray(matches) ? matches : [];
  if (candidates.length !== 1) {
    const message = candidates.length
      ? `Sesión ambigua para "${details.receivedSession}": ${candidates.length} training_sessions candidatas.`
      : details.missingMessage;
    const error = new Error(message);
    error.session_rule = details.matchRule;
    error.received_session = details.receivedSession;
    error.session_candidates = candidates;
    throw error;
  }
  return {
    session: candidates[0],
    received_session: details.receivedSession,
    match_rule: details.matchRule,
  };
}

function toRpeValue(value) {
  const number = toNullableNumber(value);
  if (number === null || !Number.isInteger(number) || number < 1 || number > 10) {
    throw new Error(`RPE inválido: "${String(value ?? '').trim()}". Debe ser un entero entre 1 y 10.`);
  }
  return number;
}

function findPlayerIdByFormName(formName) {
  const submittedName = String(formName || '').trim();
  if (!submittedName) return null;
  const players = fetchPlayersForForms();
  return addPlayerClubContext(resolvePlayerByFormName(players, submittedName), players);
}

function fetchPlayersForForms() {
  try {
    return supabaseFetch(
      'jugadores?select=id,name,shirt_name,google_forms_name,club_id&order=id.asc&limit=1000',
      { method: 'get' }
    ) || [];
  } catch (error) {
    if (!/club_id/i.test(String(error && error.message ? error.message : error))) throw error;
    return supabaseFetch(
      'jugadores?select=id,name,shirt_name,google_forms_name&order=id.asc&limit=1000',
      { method: 'get' }
    ) || [];
  }
}

function addPlayerClubContext(resolution, players) {
  if (!resolution) return null;
  const player = (Array.isArray(players) ? players : [])
    .find((candidate) => candidate.id === resolution.jugador_id);
  return player && player.club_id
    ? { ...resolution, club_id: player.club_id }
    : resolution;
}

function getDailyRpeConflictTarget(payload) {
  return payload && payload.club_id
    ? 'club_id,jugador_id,entry_date'
    : 'jugador_id,entry_date';
}

function resolvePlayerByFormName(players, formName) {
  const normalizedFormName = normalizePlayerName(formName);
  if (!normalizedFormName) return null;
  const rows = Array.isArray(players) ? players : [];

  const aliasMatches = rows.filter((player) =>
    normalizePlayerName(player.google_forms_name) === normalizedFormName
  );
  const aliasResult = resolveUniquePlayerCandidate(aliasMatches, formName, 'EXACT_GOOGLE_FORMS_NAME');
  if (aliasResult) return aliasResult;

  const exactShirtNameMatches = rows.filter((player) =>
    normalizePlayerName(player.shirt_name) === normalizedFormName
  );
  const exactShirtNameResult = resolveUniquePlayerCandidate(exactShirtNameMatches, formName, 'EXACT_SHIRT_NAME');
  if (exactShirtNameResult) return exactShirtNameResult;

  const exactNameMatches = rows.filter((player) =>
    normalizePlayerName(player.name) === normalizedFormName
  );
  const exactNameResult = resolveUniquePlayerCandidate(exactNameMatches, formName, 'EXACT_PLAYER_NAME');
  if (exactNameResult) return exactNameResult;

  const receivedTokens = getCanonicalPlayerTokens(formName);
  const tokenMatches = rows.map((player) => {
    const sources = [
      { value: player.shirt_name, label: 'SHIRT_NAME' },
      { value: player.name, label: 'PLAYER_NAME' },
    ];
    for (const source of sources) {
      const playerTokens = getCanonicalPlayerTokens(source.value);
      const formsIsSubset = isTokenSubset(receivedTokens, playerTokens);
      const playerIsSubset = playerTokens.length >= 2 && isTokenSubset(playerTokens, receivedTokens);
      if (formsIsSubset || playerIsSubset) {
        return {
          player,
          rule: formsIsSubset
            ? `TOKEN_SUBSET_OF_${source.label}`
            : `${source.label}_SUBSET_OF_FORMS`,
        };
      }
    }
    return null;
  }).filter(Boolean);
  const tokenResult = resolveUniquePlayerCandidateEntries(tokenMatches, formName, 'TOKEN_MATCH');
  if (tokenResult) return tokenResult;

  const typoMatches = rows.map((player) => {
    const sources = [
      { value: player.shirt_name, label: 'SHIRT_NAME' },
      { value: player.name, label: 'PLAYER_NAME' },
    ];
    const source = sources.find((candidate) => isStrictTypoNameMatch(formName, candidate.value));
    return source ? { player, rule: `STRICT_TYPO_DISTANCE_1_${source.label}` } : null;
  }).filter(Boolean);
  return resolveUniquePlayerCandidateEntries(typoMatches, formName, 'STRICT_TYPO_DISTANCE_1');
}

function resolveUniquePlayerCandidate(matches, formName, rule) {
  const entries = (Array.isArray(matches) ? matches : []).map((player) => ({ player, rule }));
  return resolveUniquePlayerCandidateEntries(entries, formName, rule);
}

function resolveUniquePlayerCandidateEntries(entries, formName, ambiguityRule) {
  if (entries.length > 1) {
    const error = new Error(`Coincidencia ambigua para "${String(formName || '').trim()}" mediante ${ambiguityRule}: ${entries.length} jugadores compatibles en public.jugadores.`);
    error.match_rule = ambiguityRule;
    error.candidates = entries.map((entry) => entry.player);
    throw error;
  }
  if (!entries.length) return null;
  const entry = entries[0];
  const row = entry.player;
  return {
    jugador_id: row.id,
    name: row.name,
    google_forms_name: row.google_forms_name || null,
    match_rule: entry.rule,
  };
}

function normalizePlayerName(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function getCanonicalPlayerTokens(value) {
  const replacements = {
    fdez: 'fernandez',
    glez: 'gonzalez',
    rguez: 'rodriguez',
    alex: 'alejandro',
    agus: 'agustin',
  };
  return getNormalizedPlayerTokens(value)
    .map((token) => replacements[token] || token);
}

function getNormalizedPlayerTokens(value) {
  return normalizePlayerName(value).split(' ').filter(Boolean);
}

function isTokenSubset(subset, complete) {
  if (!subset.length || !complete.length) return false;
  const available = complete.slice();
  return subset.every((token) => {
    const index = available.indexOf(token);
    if (index === -1) return false;
    available.splice(index, 1);
    return true;
  });
}

function isStrictTypoTokenMatch(receivedTokens, playerTokens) {
  if (!receivedTokens.length || !playerTokens.length) return false;
  const available = playerTokens.slice();
  let typoCount = 0;

  for (const receivedToken of receivedTokens) {
    const exactIndex = available.indexOf(receivedToken);
    if (exactIndex !== -1) {
      available.splice(exactIndex, 1);
      continue;
    }
    const minimumLength = receivedTokens.length === 1 ? 7 : 6;
    const typoIndex = available.findIndex((playerToken) =>
      (
        Math.min(receivedToken.length, playerToken.length) >= minimumLength
        || (
          receivedTokens.length > 1
          && receivedToken.length === playerToken.length
          && ['fdez', 'glez', 'rguez'].includes(playerToken)
        )
      )
      && damerauLevenshteinDistance(receivedToken, playerToken) === 1
    );
    if (typoIndex === -1 || typoCount >= 1) return false;
    available.splice(typoIndex, 1);
    typoCount += 1;
  }
  return typoCount === 1;
}

function isStrictTypoNameMatch(receivedName, playerName) {
  if (!normalizePlayerName(playerName)) return false;
  return isStrictTypoTokenMatch(
    getCanonicalPlayerTokens(receivedName),
    getCanonicalPlayerTokens(playerName)
  ) || isStrictTypoTokenMatch(
    getNormalizedPlayerTokens(receivedName),
    getNormalizedPlayerTokens(playerName)
  );
}

function damerauLevenshteinDistance(leftValue, rightValue) {
  const left = String(leftValue || '');
  const right = String(rightValue || '');
  const matrix = Array.from({ length: left.length + 1 }, () => Array(right.length + 1).fill(0));
  for (let row = 0; row <= left.length; row += 1) matrix[row][0] = row;
  for (let column = 0; column <= right.length; column += 1) matrix[0][column] = column;

  for (let row = 1; row <= left.length; row += 1) {
    for (let column = 1; column <= right.length; column += 1) {
      const cost = left[row - 1] === right[column - 1] ? 0 : 1;
      matrix[row][column] = Math.min(
        matrix[row - 1][column] + 1,
        matrix[row][column - 1] + 1,
        matrix[row - 1][column - 1] + cost
      );
      if (
        row > 1
        && column > 1
        && left[row - 1] === right[column - 2]
        && left[row - 2] === right[column - 1]
      ) {
        matrix[row][column] = Math.min(matrix[row][column], matrix[row - 2][column - 2] + cost);
      }
    }
  }
  return matrix[left.length][right.length];
}

function buildWellnessPayload(row, playerId) {
  const sleepValue = getFirstValue(row, [
    'Calidad del sueño',
    'Calidad del sueno',
    '¿Qué tal dormiste anoche?',
    'Sueño',
    'Sueno',
  ]);
  const sorenessValue = getFirstValue(row, [
    'Daño muscular',
    'Dano muscular',
    '¿Cuánto te duelen los músculos hoy?',
    'Dolor muscular',
    'Molestias',
  ]);
  const moodValue = getFirstValue(row, [
    'Estado de ánimo.',
    'Estado de ánimo',
    'Estado de animo.',
    'Estado de animo',
    'Ánimo',
    'Animo',
  ]);

  return {
    jugador_id: playerId,
    entry_date: toIsoDate(getFirstValue(row, ['Fecha', 'Marca temporal', 'Timestamp'])),
    sleep_hours: toNullableNumber(getFirstValue(row, ['Horas de sueño', 'Horas de sueno', 'Horas sueño', 'Horas sueno'])),
    sleep_quality: toWellnessScale(sleepValue, 'sleep'),
    fatigue: toWellnessScale(getFirstValue(row, ['¿Cómo de fatigado estás hoy?', 'Fatiga']), 'high-is-bad'),
    muscle_soreness: toWellnessScale(sorenessValue, 'discomfort'),
    stress: toWellnessScale(getFirstValue(row, ['¿Cómo de estresado estás hoy?', 'Estrés', 'Estres']), 'high-is-bad'),
    mood: toWellnessScale(moodValue, 'mood'),
    weight: toNullableNumber(getFirstValue(row, ['¿Cuál tu peso hoy?', 'Peso'])),
    discomfort: getFirstValue(row, ['Especificar la molestia en caso de tener alguna', 'Molestias']) || '',
    comment: getFirstValue(row, ['Información personal: (molestias, comentarios)', 'Comentario', 'Comentarios']) || '',
    health_ratio: toHealthRatio(getFirstValue(row, ['Ratio salud'])),
  };
}

function buildWellnessHistoryImportPlan(rowItems, players) {
  const groupsByKey = {};
  const failures = [];
  let skipped = 0;

  (Array.isArray(rowItems) ? rowItems : []).forEach((item) => {
    const row = item.values || {};
    const playerName = getFirstValue(row, ['Nombre y apellidos.', 'Nombre y apellidos', 'Jugador', 'Nombre']);
    const entryDate = getFirstValue(row, ['Fecha', 'Marca temporal', 'Timestamp']);
    if (!playerName && !entryDate) {
      skipped += 1;
      return;
    }

    try {
      const player = resolvePlayerByFormName(players, playerName);
      if (!player) {
        throw new Error(`Jugador no encontrado en public.jugadores: "${playerName}". No se inserta wellness.`);
      }
      const payload = buildWellnessPayload(row, player.jugador_id);
      requireFields(payload, ['jugador_id', 'entry_date'], 'wellness');
      const key = `${payload.jugador_id}|${payload.entry_date}`;
      const existing = groupsByKey[key];
      const rowDetail = {
        rowNumber: item.rowNumber,
        receivedName: String(playerName || '').trim(),
        receivedDate: entryDate,
        matchedPlayerName: player.name,
        googleFormsName: player.google_forms_name,
        matchRule: player.match_rule,
      };
      groupsByKey[key] = {
        payload,
        rowNumbers: existing ? [...existing.rowNumbers, item.rowNumber] : [item.rowNumber],
        rowDetails: existing ? [...existing.rowDetails, rowDetail] : [rowDetail],
      };
    } catch (error) {
      failures.push(buildWellnessImportFailure({
        rowNumber: item.rowNumber,
        receivedName: playerName,
        receivedDate: entryDate,
        error,
        players,
      }));
    }
  });

  const groups = Object.values(groupsByKey);
  return {
    groups,
    failures,
    skipped,
    duplicatesMerged: groups.reduce((total, group) => total + Math.max(0, group.rowNumbers.length - 1), 0),
  };
}

function buildWellnessImportFailure(details) {
  const rawError = details.error;
  const message = String(rawError?.message || rawError || 'Error desconocido.');
  const receivedName = String(details.receivedName || '').trim();
  let category = 'DATO_INVALIDO';
  if (/coincidencia ambigua/i.test(message)) category = 'ALIAS_AMBIGUO';
  else if (/jugador no encontrado/i.test(message)) category = 'JUGADOR_NO_ENCONTRADO';
  else if (/fecha|entry_date|date\/time field value out of range/i.test(message)) category = 'FECHA_INVALIDA';
  else if (/supabase error/i.test(message)) category = 'ERROR_SUPABASE';

  const aliasProblem = category === 'ALIAS_AMBIGUO' || category === 'JUGADOR_NO_ENCONTRADO';
  const expectedPlayers = aliasProblem
    ? formatDiagnosticPlayerCandidates(
      Array.isArray(rawError?.candidates) && rawError.candidates.length
        ? rawError.candidates
        : findExpectedPlayersForAlias(details.players, receivedName)
    )
    : [];
  return {
    rowNumber: details.rowNumber,
    receivedName,
    receivedDate: details.receivedDate || '',
    category,
    error: message,
    expectedPlayers,
  };
}

function findExpectedPlayersForAlias(players, receivedName) {
  const normalizedReceivedName = normalizePlayerName(receivedName);
  if (!normalizedReceivedName) return [];
  const rows = Array.isArray(players) ? players : [];
  const exactCompatible = rows.filter((player) => {
    const normalizedAlias = normalizePlayerName(player.google_forms_name);
    return normalizedAlias === normalizedReceivedName
      || normalizePlayerName(player.shirt_name) === normalizedReceivedName
      || normalizePlayerName(player.name) === normalizedReceivedName;
  });
  const diagnosticCandidates = exactCompatible.length ? exactCompatible : rows.filter((player) => {
    const normalizedName = normalizePlayerName(player.name);
    const normalizedShirtName = normalizePlayerName(player.shirt_name);
    const nameTokens = getCanonicalPlayerTokens(player.name);
    const receivedTokens = getCanonicalPlayerTokens(receivedName);
    return normalizedName === normalizedReceivedName
      || normalizedShirtName === normalizedReceivedName
      || receivedTokens.some((token) => nameTokens.includes(token));
  });
  const seen = {};
  return diagnosticCandidates.filter((player) => {
    const key = String(player.id || player.name || '');
    if (seen[key]) return false;
    seen[key] = true;
    return true;
  });
}

function formatDiagnosticPlayerCandidates(players) {
  return (Array.isArray(players) ? players : []).map((player) => ({
    id: player.id,
    name: player.name || '',
    shirt_name: player.shirt_name || null,
    google_forms_name: player.google_forms_name || null,
  }));
}

function getWellnessPayloadDiagnostic(payload, receivedDate) {
  if (!isValidIsoDate(payload && payload.entry_date)) {
    return `Fecha inválida recibida: "${String(receivedDate || payload?.entry_date || '').trim()}".`;
  }
  return '';
}

function isValidIsoDate(value) {
  const match = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year
    && date.getUTCMonth() === month - 1
    && date.getUTCDate() === day;
}

function logWellnessHistoryErrors(failures) {
  const rows = (Array.isArray(failures) ? failures : [])
    .slice()
    .sort((left, right) => Number(left.rowNumber || 0) - Number(right.rowNumber || 0));
  if (!rows.length) {
    console.log('Histórico Wellness: ninguna fila con error.');
    return;
  }
  console.error(`Histórico Wellness: informe completo de ${rows.length} errores.`);
  rows.forEach((failure, index) => {
    const expected = failure.expectedPlayers && failure.expectedPlayers.length
      ? failure.expectedPlayers.map((player) =>
        `${player.name} [id=${player.id}; shirt_name=${player.shirt_name || 'NULL'}; google_forms_name=${player.google_forms_name || 'NULL'}]`
      ).join(' | ')
      : 'Sin candidato claro en public.jugadores.';
    const lines = [
      `Error ${index + 1}/${rows.length} · fila ${failure.rowNumber}`,
      `Nombre recibido desde Google Forms: ${failure.receivedName || '(vacío)'}`,
      `Motivo exacto: ${failure.category} · ${failure.error}`,
    ];
    if (failure.category === 'ALIAS_AMBIGUO' || failure.category === 'JUGADOR_NO_ENCONTRADO') {
      lines.push(`Jugador esperado en public.jugadores: ${expected}`);
    }
    console.error(lines.join('\n'));
  });
}

function logPlayerResolution(context, receivedName, resolution) {
  console.log('Resolución automática de jugador.', {
    context,
    received_name: String(receivedName || '').trim(),
    jugador_id: resolution.jugador_id,
    jugador_name: resolution.name,
    google_forms_name: resolution.google_forms_name || null,
    match_rule: resolution.match_rule,
  });
}

function buildRpeHistoryImportPlan(rowItems, players, timeZone) {
  const groupsByKey = {};
  const failures = [];
  let skipped = 0;

  (Array.isArray(rowItems) ? rowItems : []).forEach((item) => {
    const row = item.values || {};
    const playerName = getFirstValue(row, PLAYER_HEADER_CANDIDATES);
    const rawRpe = getFirstValue(row, RPE_HEADER_CANDIDATES);
    const receivedTimestamp = getFirstValue(row, TIMESTAMP_HEADER_CANDIDATES);
    if (!playerName && !rawRpe && !receivedTimestamp) {
      skipped += 1;
      return;
    }

    let playerResolution = null;
    let payload = null;
    try {
      playerResolution = addPlayerClubContext(
        resolvePlayerByFormName(players, playerName),
        players
      );
      if (!playerResolution) {
        throw new Error(`Jugador no encontrado en public.jugadores: "${playerName}". No se inserta RPE.`);
      }
      payload = buildDailyRpePayload(
        row,
        playerResolution.jugador_id,
        timeZone,
        playerResolution.club_id
      );
      requireFields(payload, ['jugador_id', 'entry_date', 'submitted_at', 'rpe'], 'rpe diario');
      const key = `${payload.club_id || ''}|${payload.jugador_id}|${payload.entry_date}`;
      const existing = groupsByKey[key];
      const rowDetail = {
        rowNumber: item.rowNumber,
        receivedName: String(playerName || '').trim(),
        playerResolution,
        entryDate: payload.entry_date,
        submittedAt: payload.submitted_at,
        rpe: payload.rpe,
      };
      groupsByKey[key] = {
        payload,
        rowNumbers: existing ? [...existing.rowNumbers, item.rowNumber] : [item.rowNumber],
        rowDetails: existing ? [...existing.rowDetails, rowDetail] : [rowDetail],
      };
    } catch (error) {
      failures.push(buildRpeImportFailure({
        rowNumber: item.rowNumber,
        receivedName: playerName,
        receivedTimestamp,
        rawRpe,
        playerResolution,
        payload,
        error,
        players,
      }));
    }
  });

  const groups = Object.values(groupsByKey);
  return {
    groups,
    failures,
    skipped,
    duplicatesMerged: groups.reduce((total, group) => total + Math.max(0, group.rowNumbers.length - 1), 0),
  };
}

function buildRpeImportFailure(details) {
  const rawError = details.error;
  const message = String(rawError?.message || rawError || 'Error desconocido.');
  let category = 'DATO_INVALIDO';
  if (/coincidencia ambigua/i.test(message)) category = 'JUGADOR_AMBIGUO';
  else if (/jugador no encontrado/i.test(message)) category = 'JUGADOR_NO_ENCONTRADO';
  else if (/sesión ambigua/i.test(message)) category = 'SESION_AMBIGUA';
  else if (/no existe training_session/i.test(message)) category = 'SESION_NO_ENCONTRADA';
  else if (/fecha rpe inválida/i.test(message)) category = 'FECHA_INVALIDA';
  else if (/rpe inválido/i.test(message)) category = 'RPE_INVALIDO';
  else if (/supabase error/i.test(message)) category = 'ERROR_SUPABASE';

  const expectedPlayers = ['JUGADOR_AMBIGUO', 'JUGADOR_NO_ENCONTRADO'].includes(category)
    ? formatDiagnosticPlayerCandidates(
      Array.isArray(rawError?.candidates) && rawError.candidates.length
        ? rawError.candidates
        : findExpectedPlayersForAlias(details.players, details.receivedName)
    )
    : [];
  const sessionCandidates = Array.isArray(rawError?.session_candidates)
    ? rawError.session_candidates.map(formatRpeSessionCandidate)
    : [];
  return {
    rowNumber: details.rowNumber,
    receivedName: String(details.receivedName || '').trim(),
    playerId: details.playerResolution?.jugador_id || '',
    playerMatchRule: details.playerResolution?.match_rule || rawError?.match_rule || '',
    receivedTimestamp: String(details.receivedTimestamp || '').trim(),
    entryDate: details.payload?.entry_date || '',
    submittedAt: details.payload?.submitted_at || '',
    rpe: details.payload?.rpe ?? details.rawRpe ?? '',
    category,
    error: message,
    expectedPlayers,
    sessionCandidates,
  };
}

function formatRpeSessionCandidate(session) {
  return {
    id: session.id,
    form_code: session.form_code || null,
    session_date: session.session_date || '',
    title: session.title || session.session_type || '',
  };
}

function assertRpeHeaders(row) {
  const headers = Object.keys(row || {}).map((header) => String(header).trim()).filter(Boolean);
  const missing = [];
  if (!hasCandidateHeader(headers, PLAYER_HEADER_CANDIDATES)) missing.push(`jugador (${PLAYER_HEADER_CANDIDATES.join(' | ')})`);
  if (!hasCandidateHeader(headers, RPE_HEADER_CANDIDATES)) missing.push(`esfuerzo (${RPE_HEADER_CANDIDATES.join(' | ')})`);
  if (!hasCandidateHeader(headers, TIMESTAMP_HEADER_CANDIDATES)) missing.push(`fecha (${TIMESTAMP_HEADER_CANDIDATES.join(' | ')})`);
  if (missing.length) {
    throw new Error(`Cabeceras RPE no reconocidas. Faltan: ${missing.join(', ')}. Cabeceras detectadas: ${headers.join(' | ') || '(ninguna)'}.`);
  }
}

function hasCandidateHeader(headers, candidates) {
  const normalizedHeaders = (Array.isArray(headers) ? headers : []).map(normalizeName);
  return candidates.some((candidate) => normalizedHeaders.includes(normalizeName(candidate)));
}

function findRpeResponseSheet(spreadsheet) {
  if (!spreadsheet || typeof spreadsheet.getSheets !== 'function') {
    throw new Error('No se pudo acceder al Google Sheet de RPE.');
  }
  const inspected = spreadsheet.getSheets().map((sheet) => {
    const lastColumn = sheet.getLastColumn();
    const headers = lastColumn ? sheet.getRange(1, 1, 1, lastColumn).getDisplayValues()[0] : [];
    return { sheet, headers };
  });
  const activeSheet = typeof spreadsheet.getActiveSheet === 'function' ? spreadsheet.getActiveSheet() : null;
  const namedCandidates = inspected.filter(({ sheet }) =>
    normalizeName(sheet.getName()).includes('rpe')
  );
  if (namedCandidates.length) {
    const activeNamedCandidate = activeSheet
      ? namedCandidates.find(({ sheet }) => sheet.getSheetId() === activeSheet.getSheetId())
      : null;
    if (activeNamedCandidate) return activeNamedCandidate.sheet;
    if (namedCandidates.length === 1) return namedCandidates[0].sheet;
    throw new Error(`Hay varias hojas cuyo nombre contiene "RPE": ${namedCandidates.map(({ sheet }) => sheet.getName()).join(', ')}. Activa la hoja que quieres importar.`);
  }
  const candidates = inspected.filter(({ headers }) =>
    hasCandidateHeader(headers, PLAYER_HEADER_CANDIDATES)
    && hasCandidateHeader(headers, RPE_HEADER_CANDIDATES)
    && hasCandidateHeader(headers, TIMESTAMP_HEADER_CANDIDATES)
  );
  if (!candidates.length) {
    const detected = inspected.map(({ sheet, headers }) =>
      `${sheet.getName()}: [${headers.join(' | ') || '(sin cabeceras)'}]`
    ).join(' ; ');
    throw new Error(`No se encontró una hoja RPE compatible. Cabeceras detectadas: ${detected || '(ninguna hoja)'}.`);
  }
  const activeCandidate = activeSheet
    ? candidates.find(({ sheet }) => sheet.getSheetId() === activeSheet.getSheetId())
    : null;
  if (activeCandidate) return activeCandidate.sheet;
  if (candidates.length > 1) {
    throw new Error(`Hay varias hojas RPE compatibles: ${candidates.map(({ sheet }) => sheet.getName()).join(', ')}. Activa la hoja que quieres importar.`);
  }
  return candidates[0].sheet;
}

function logRpeResolution(context, details) {
  console.log('Resolución automática RPE.', {
    context,
    received_name: String(details.receivedName || '').trim(),
    jugador_id: details.player.jugador_id,
    jugador_match_rule: details.player.match_rule,
    entry_date: details.payload.entry_date,
    submitted_at: details.payload.submitted_at,
    rpe: details.payload.rpe,
  });
}

function logRpeHistoryErrors(failures) {
  const rows = (Array.isArray(failures) ? failures : [])
    .slice()
    .sort((left, right) => Number(left.rowNumber || 0) - Number(right.rowNumber || 0));
  if (!rows.length) {
    console.log('Histórico RPE: ninguna fila con error.');
    return;
  }
  console.error(`Histórico RPE: informe completo de ${rows.length} errores.`);
  rows.forEach((failure, index) => {
    const lines = [
      `Error ${index + 1}/${rows.length} · fila ${failure.rowNumber}`,
      `Nombre recibido: ${failure.receivedName || '(vacío)'}`,
      `Jugador resuelto: ${failure.playerId || '(sin resolver)'}`,
      `Regla jugador: ${failure.playerMatchRule || '(ninguna)'}`,
      `Marca temporal recibida: ${failure.receivedTimestamp || '(vacía)'}`,
      `entry_date: ${failure.entryDate || '(sin resolver)'}`,
      `submitted_at: ${failure.submittedAt || '(sin resolver)'}`,
      `RPE: ${failure.rpe === '' ? '(sin resolver)' : failure.rpe}`,
      `Motivo: ${failure.category} · ${failure.error}`,
    ];
    console.error(lines.join('\n'));
  });
}

function findWellnessResponseSheet(spreadsheet) {
  if (!spreadsheet || typeof spreadsheet.getSheets !== 'function') {
    throw new Error('No se pudo acceder al Google Sheet de Wellness.');
  }
  const candidates = spreadsheet.getSheets().filter((sheet) => {
    const lastColumn = sheet.getLastColumn();
    if (!lastColumn) return false;
    const headers = sheet.getRange(1, 1, 1, lastColumn).getDisplayValues()[0];
    const normalizedHeaders = headers.map(normalizeName);
    const hasPlayer = ['Nombre y apellidos.', 'Nombre y apellidos', 'Jugador', 'Nombre']
      .some((header) => normalizedHeaders.includes(normalizeName(header)));
    return hasPlayer && normalizedHeaders.includes(normalizeName('Ratio salud'));
  });
  if (!candidates.length) {
    throw new Error('No se encontró una hoja con las cabeceras de Wellness.');
  }
  const activeSheet = typeof spreadsheet.getActiveSheet === 'function' ? spreadsheet.getActiveSheet() : null;
  if (activeSheet && candidates.some((sheet) => sheet.getSheetId() === activeSheet.getSheetId())) {
    return activeSheet;
  }
  if (candidates.length > 1) {
    throw new Error('Hay varias hojas compatibles con Wellness. Activa la hoja que quieres importar y vuelve a ejecutar.');
  }
  return candidates[0];
}

function getNamedValues(e) {
  if (!e || !e.namedValues) {
    throw new Error('Evento de formulario invalido. Usa trigger "On form submit" desde Google Sheets.');
  }
  return Object.fromEntries(
    Object.entries(e.namedValues).map(([key, value]) => [String(key).trim(), Array.isArray(value) ? value[0] : value])
  );
}

function ensureTechnicalColumns(sheet) {
  const currentLastColumn = Math.max(sheet.getLastColumn(), 1);
  const currentHeaders = sheet.getRange(1, 1, 1, currentLastColumn).getDisplayValues()[0];
  const missingHeaders = TECHNICAL_COLUMNS.filter((header) =>
    !currentHeaders.some((current) => normalizeName(current) === normalizeName(header))
  );

  if (missingHeaders.length) {
    const requiredLastColumn = currentLastColumn + missingHeaders.length;
    if (requiredLastColumn > sheet.getMaxColumns()) {
      sheet.insertColumnsAfter(sheet.getMaxColumns(), requiredLastColumn - sheet.getMaxColumns());
    }
    sheet.getRange(1, currentLastColumn + 1, 1, missingHeaders.length).setValues([missingHeaders]);
  }

  const lastColumn = sheet.getLastColumn();
  const headers = sheet.getRange(1, 1, 1, lastColumn).getDisplayValues()[0];
  const columns = {};
  TECHNICAL_COLUMNS.forEach((header) => {
    const index = headers.findIndex((current) => normalizeName(current) === normalizeName(header)) + 1;
    columns[header] = index;
    if (index > 0) sheet.hideColumns(index);
  });
  return { headers, columns, lastColumn };
}

function readSubmittedSheetRow(e, options) {
  if (!e || !e.range || typeof e.range.getSheet !== 'function') {
    throw new Error('Evento de formulario inválido. Usa trigger "On form submit" desde Google Sheets.');
  }

  const sheet = e.range.getSheet();
  const rowNumber = e.range.getRow();
  const technical = ensureTechnicalColumns(sheet);
  const waitForHeader = options && options.waitForHeader;
  let values = {};

  for (let attempt = 0; attempt < FORMULA_RETRY_COUNT; attempt += 1) {
    SpreadsheetApp.flush();
    const row = sheet.getRange(rowNumber, 1, 1, technical.lastColumn).getValues()[0];
    values = Object.fromEntries(technical.headers.map((header, index) => [String(header).trim(), row[index]]));
    if (!waitForHeader || getFirstValue(values, [waitForHeader]) !== '') break;
    if (attempt < FORMULA_RETRY_COUNT - 1) Utilities.sleep(FORMULA_RETRY_DELAY_MS);
  }

  return {
    sheet,
    rowNumber,
    columns: technical.columns,
    values,
  };
}

function setSubmissionSyncState(submission, state) {
  if (!submission || !submission.sheet) return;
  const values = {
    'Supabase status': state.status || '',
    'Supabase session_id': state.sessionId || '',
    'Supabase error': state.error || '',
    'Supabase synced_at': state.syncedAt || '',
  };
  Object.entries(values).forEach(([header, value]) => {
    const column = submission.columns[header];
    if (column) submission.sheet.getRange(submission.rowNumber, column).setValue(value);
  });
}

function writeHistorySyncStates(sheet, columns, lastRow, statesByRow) {
  const fields = {
    'Supabase status': 'status',
    'Supabase session_id': 'sessionId',
    'Supabase error': 'error',
    'Supabase synced_at': 'syncedAt',
  };
  Object.entries(fields).forEach(([header, stateField]) => {
    const column = columns[header];
    if (!column || lastRow < 2) return;
    const range = sheet.getRange(2, column, lastRow - 1, 1);
    const values = range.getValues();
    Object.entries(statesByRow).forEach(([rowNumber, state]) => {
      const index = Number(rowNumber) - 2;
      if (index >= 0 && index < values.length) {
        values[index][0] = state[stateField] || '';
      }
    });
    range.setValues(values);
  });
}

function getFirstValue(row, candidateKeys) {
  const entries = Object.entries(row);
  for (const candidate of candidateKeys) {
    const exactValue = row[candidate];
    if (exactValue !== '' && exactValue !== null && exactValue !== undefined) return exactValue;

    const normalizedCandidate = normalizeName(candidate);
    const match = entries.find(([key, value]) => normalizeName(key) === normalizedCandidate && value !== '' && value !== null && value !== undefined);
    if (match) return match[1];
  }
  return '';
}

function normalizeName(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function toIsoDate(value) {
  if (!value) return '';
  if (Object.prototype.toString.call(value) === '[object Date]') {
    return Utilities.formatDate(value, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  }
  const text = String(value).trim();
  const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const parts = text.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})(?:\s+.*)?$/);
  if (parts) return `${parts[3]}-${parts[2].padStart(2, '0')}-${parts[1].padStart(2, '0')}`;
  const parsed = new Date(text);
  if (!Number.isNaN(parsed.getTime())) {
    return Utilities.formatDate(parsed, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  }
  return text;
}

function toNullableNumber(value) {
  if (value === '' || value === null || value === undefined) return null;
  const number = Number(String(value).replace(',', '.'));
  return Number.isFinite(number) ? number : null;
}

function toHealthRatio(value) {
  const number = toNullableNumber(value);
  if (number === null) return null;
  if (number < 0 || number > 10) {
    throw new Error(`Ratio salud fuera de escala 0-10: ${value}`);
  }
  return number;
}

function toNullableInt(value) {
  const number = toNullableNumber(value);
  return number === null ? null : Math.round(number);
}

function toWellnessScale(value, kind) {
  const numeric = toNullableInt(value);
  if (numeric !== null) return Math.max(1, Math.min(10, numeric));

  const text = normalizeName(value);
  if (!text) return null;

  if (kind === 'sleep') {
    if (hasAny(text, ['excelente', 'muy bien', 'muy bueno', 'descansado', 'perfecto'])) return 9;
    if (hasAny(text, ['bien', 'bueno'])) return 7;
    if (hasAny(text, ['regular', 'normal', 'medio'])) return 5;
    if (hasAny(text, ['muy mal', 'fatal', 'pesimo', 'nada'])) return 1;
    if (hasAny(text, ['mal', 'malo', 'poco', 'bajo'])) return 3;
  }

  if (kind === 'mood') {
    if (hasAny(text, ['excelente', 'muy bien', 'muy bueno', 'motivado', 'feliz', 'alegre'])) return 9;
    if (hasAny(text, ['bien', 'bueno'])) return 7;
    if (hasAny(text, ['regular', 'normal', 'medio'])) return 5;
    if (hasAny(text, ['muy mal', 'fatal', 'pesimo'])) return 1;
    if (hasAny(text, ['mal', 'malo', 'bajo', 'triste', 'cansado'])) return 3;
  }

  if (kind === 'discomfort') {
    if (hasAny(text, ['sin molestias', 'ninguna', 'no', 'nada', 'sin dolor'])) return 1;
    if (hasAny(text, ['leve', 'poco', 'baja'])) return 3;
    if (hasAny(text, ['moderada', 'regular', 'media'])) return 5;
    if (hasAny(text, ['muy alta', 'muchisimo', 'fuerte', 'dolor fuerte'])) return 9;
    if (hasAny(text, ['alta', 'mucho', 'dolor'])) return 8;
  }

  if (kind === 'high-is-bad') {
    if (hasAny(text, ['nada', 'muy baja', 'ninguna'])) return 1;
    if (hasAny(text, ['baja', 'poca', 'leve'])) return 3;
    if (hasAny(text, ['regular', 'normal', 'media', 'moderada'])) return 5;
    if (hasAny(text, ['muy alta', 'muchisimo', 'extrema'])) return 9;
    if (hasAny(text, ['alta', 'mucho'])) return 8;
  }

  return null;
}

function hasAny(text, fragments) {
  return fragments.some((fragment) => text.indexOf(normalizeName(fragment)) !== -1);
}

function toInt(value, fallback) {
  const number = toNullableInt(value);
  return number === null ? fallback : number;
}

function requireFields(payload, fields, label) {
  const missing = fields.filter((field) => payload[field] === '' || payload[field] === null || payload[field] === undefined);
  if (missing.length) {
    throw new Error(`Faltan campos obligatorios para ${label}: ${missing.join(', ')}`);
  }
}
