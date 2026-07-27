export const DELEGATED_EVENT_STAT_EFFECTS = {
  gol: { team: { goals: 1, shots: 1, shotsOnTarget: 1 }, player: { goals: 1, shots: 1, shotsOnTarget: 1 } },
  tiro: { team: { shots: 1 }, player: { shots: 1 } },
  tiro_puerta: { team: { shots: 1, shotsOnTarget: 1 }, player: { shots: 1, shotsOnTarget: 1 } },
  regate: { team: { dribbles: 1 }, player: { dribbles: 1 } },
  centro: { team: { crosses: 1 }, player: { crosses: 1 } },
  perdida: { team: { turnovers: 1 }, player: { turnovers: 1 } },
  robo: { team: { steals: 1 }, player: { steals: 1 } },
  recuperacion: { team: { recoveries: 1 }, player: { recoveries: 1 } },
  falta_realizada: { team: { foulsCommitted: 1 }, player: { foulsCommitted: 1 } },
  falta_recibida: { team: { foulsReceived: 1 }, player: { foulsReceived: 1 } },
  corner: { team: { corners: 1 }, player: {} },
};

export const reconcileDelegatedEvent = (events = [], savedEvent, optimisticId = '') => {
  if (!savedEvent?.id) return Array.isArray(events) ? events : [];
  const source = Array.isArray(events) ? events : [];
  const optimisticIndex = source.findIndex((event) => event?.id === optimisticId);
  const nextEvents = source.filter((event) => event?.id !== optimisticId && event?.id !== savedEvent.id);
  const insertAt = optimisticIndex >= 0 ? Math.min(optimisticIndex, nextEvents.length) : nextEvents.length;
  return [
    ...nextEvents.slice(0, insertAt),
    savedEvent,
    ...nextEvents.slice(insertAt),
  ];
};

export const saveDelegatedEventWithSync = async ({
  persist,
  syncLocal,
  reload,
} = {}) => {
  let savedEvent;
  try {
    savedEvent = await persist();
  } catch (error) {
    return { status: 'insert-error', savedEvent: null, insertError: error, localError: null, reloadError: null };
  }

  try {
    await syncLocal(savedEvent);
    return { status: 'saved', savedEvent, insertError: null, localError: null, reloadError: null };
  } catch (localError) {
    let reloadError = null;
    try {
      await reload?.(savedEvent);
    } catch (error) {
      reloadError = error;
    }
    return {
      status: reloadError ? 'saved-local-error' : 'saved-reloaded',
      savedEvent,
      insertError: null,
      localError,
      reloadError,
    };
  }
};
