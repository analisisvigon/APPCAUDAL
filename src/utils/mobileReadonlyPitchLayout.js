const asFiniteNumber = (value, fallback) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const clamp = (value, minimum, maximum) => Math.max(minimum, Math.min(maximum, value));

const getRowCenter = (row) => (
  row.reduce((sum, slot) => sum + slot.sourceY, 0) / Math.max(1, row.length)
);

export const buildMobileReadonlyPitchLayout = (slots = [], options = {}) => {
  const rowTolerance = asFiniteNumber(options.rowTolerance, 8);
  const minimumX = asFiniteNumber(options.minimumX, 10);
  const maximumX = asFiniteNumber(options.maximumX, 90);
  const minimumY = asFiniteNumber(options.minimumY, 18);
  const maximumY = asFiniteNumber(options.maximumY, 87);
  const normalizedSlots = slots.map((slot, sourceIndex) => ({
    ...slot,
    sourceIndex,
    sourceX: clamp(asFiniteNumber(slot?.x, 50), 0, 100),
    sourceY: clamp(asFiniteNumber(slot?.y, 50), 0, 100),
  })).sort((left, right) => left.sourceY - right.sourceY || left.sourceX - right.sourceX);

  const rows = normalizedSlots.reduce((result, slot) => {
    const currentRow = result[result.length - 1];
    if (!currentRow || Math.abs(slot.sourceY - getRowCenter(currentRow)) > rowTolerance) {
      result.push([slot]);
    } else {
      currentRow.push(slot);
    }
    return result;
  }, []);

  const rowStep = rows.length > 1 ? (maximumY - minimumY) / (rows.length - 1) : 0;
  const positioned = rows.flatMap((row, rowIndex) => {
    const orderedRow = row.slice().sort((left, right) => left.sourceX - right.sourceX);
    const columnStep = orderedRow.length > 1 ? (maximumX - minimumX) / (orderedRow.length - 1) : 0;
    return orderedRow.map((slot, columnIndex) => ({
      ...slot,
      mobileX: orderedRow.length === 1 ? 50 : minimumX + columnStep * columnIndex,
      mobileY: rows.length === 1 ? 50 : minimumY + rowStep * rowIndex,
      mobileRow: rowIndex,
      mobileColumn: columnIndex,
      mobileRowSize: orderedRow.length,
    }));
  });

  return positioned.sort((left, right) => left.sourceIndex - right.sourceIndex);
};

