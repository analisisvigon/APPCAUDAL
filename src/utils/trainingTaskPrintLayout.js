const MM_IN_PX = 96 / 25.4;

const elementEscapes = (sheet) => {
  const bounds = sheet.getBoundingClientRect();
  const style = getComputedStyle(sheet);
  const bottom = bounds.bottom - parseFloat(style.paddingBottom);
  const right = bounds.right - parseFloat(style.paddingRight);
  return [...sheet.querySelectorAll('h1,h2,h3,p,a,svg,.task-export-footer')].some((node) => {
    const rect = node.getBoundingClientRect();
    return rect.bottom > bottom + 1 || rect.right > right + 1;
  });
};

export function renderedBoardSize(board) {
  if (!board) return null;
  const rect = board.getBoundingClientRect();
  const viewBox = board.viewBox?.baseVal;
  if (!viewBox?.width || !viewBox?.height || !rect.width || !rect.height) return null;
  const ratio = viewBox.width / viewBox.height;
  const width = Math.min(rect.width, rect.height * ratio);
  return { width, height: width / ratio, ratio };
}

export function taskSheetFits(sheet) {
  const panels = [...sheet.querySelectorAll('.task-export-main, .task-export-content, .task-export-visual')];
  if (panels.some((panel) => panel.scrollHeight > panel.clientHeight + 2 || panel.scrollWidth > panel.clientWidth + 2)) return false;
  if (elementEscapes(sheet)) return false;
  const board = sheet.querySelector('.task-export-board svg');
  const size = renderedBoardSize(board);
  if (!size) return !board;
  const pitchType = board.closest('.task-export-board')?.dataset.pitchType;
  const minimumHeightMm = pitchType === 'half' ? 42 : pitchType === 'blank' ? 48 : 58;
  return size.height >= minimumHeightMm * MM_IN_PX;
}

function continuationHeader(sheet) {
  const header = sheet.querySelector('.task-export-header')?.cloneNode(true);
  const identity = header?.querySelector('p');
  if (identity) identity.textContent = identity.textContent + ' · Continuación';
  return header;
}

function addContinuation(sheet) {
  const continuation = document.createElement('article');
  continuation.className = 'task-export-sheet task-export-continuation';
  continuation.dataset.taskId = sheet.dataset.taskId;
  continuation.dataset.continuationFor = sheet.dataset.taskId;
  const header = continuationHeader(sheet);
  if (header) continuation.append(header);
  const body = document.createElement('div');
  body.className = 'task-export-continuation-content';
  const content = sheet.querySelector('.task-export-content');
  const footer = sheet.querySelector('.task-export-footer');
  if (content) body.append(content);
  if (footer?.children.length) body.append(footer);
  continuation.append(body);
  sheet.dataset.layout = 'continued';
  sheet.after(continuation);
  if (continuation.scrollHeight > continuation.clientHeight + 2 || elementEscapes(continuation)) {
    continuation.dataset.overflow = 'true';
  }
  return continuation;
}

// Prefer one landscape page. Only the task that needs more space receives a continuation.
export function fitTrainingTaskPrintSheets(sheets) {
  const continuations = [];
  for (const sheet of sheets) {
    delete sheet.dataset.density;
    if (!taskSheetFits(sheet)) sheet.dataset.density = 'compact';
    if (!taskSheetFits(sheet)) continuations.push(addContinuation(sheet));
  }
  return { sheets: sheets.length, continuations: continuations.length };
}
