const canvas = document.querySelector("#stageCanvas");
const commonInspector = document.querySelector("#commonInspector");
const xInput = document.querySelector("#posX");
const yInput = document.querySelector("#posY");
const wInput = document.querySelector("#elemW");
const hInput = document.querySelector("#elemH");

let resizeState = null;

function selectedBox() {
  if (!commonInspector || commonInspector.hidden) return null;
  const x = Number(xInput.value);
  const y = Number(yInput.value);
  const w = Number(wInput.value);
  const h = Number(hInput.value);
  if (![x, y, w, h].every(Number.isFinite)) return null;
  return { x, y, w, h };
}

function canvasPoint(event) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: (event.clientX - rect.left) * (canvas.width / rect.width),
    y: (event.clientY - rect.top) * (canvas.height / rect.height),
    unitPerCssPx: canvas.width / rect.width,
  };
}

function cornerAt(point, box) {
  const threshold = 14 * point.unitPerCssPx;
  const corners = {
    nw: [box.x, box.y],
    ne: [box.x + box.w, box.y],
    sw: [box.x, box.y + box.h],
    se: [box.x + box.w, box.y + box.h],
  };
  for (const [name, [x, y]] of Object.entries(corners)) {
    if (Math.abs(point.x - x) <= threshold && Math.abs(point.y - y) <= threshold) return name;
  }
  return null;
}

function setInput(input, value) {
  input.value = String(Math.round(value));
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

function cursorForCorner(corner) {
  return corner === "nw" || corner === "se" ? "nwse-resize" : "nesw-resize";
}

canvas.addEventListener("pointerdown", (event) => {
  const box = selectedBox();
  if (!box) return;
  const point = canvasPoint(event);
  const corner = cornerAt(point, box);
  if (!corner) return;

  event.preventDefault();
  event.stopImmediatePropagation();
  wInput.focus({ preventScroll: true });
  resizeState = {
    pointerId: event.pointerId,
    corner,
    startPoint: point,
    box,
  };
  canvas.setPointerCapture(event.pointerId);
  canvas.style.cursor = cursorForCorner(corner);
}, true);

canvas.addEventListener("pointermove", (event) => {
  if (!resizeState) {
    const box = selectedBox();
    if (!box) return;
    const corner = cornerAt(canvasPoint(event), box);
    if (corner) canvas.style.cursor = cursorForCorner(corner);
    else if (!canvas.classList.contains("is-dragging")) canvas.style.cursor = "default";
    return;
  }
  if (event.pointerId !== resizeState.pointerId) return;

  event.preventDefault();
  event.stopImmediatePropagation();
  const point = canvasPoint(event);
  const dx = point.x - resizeState.startPoint.x;
  const dy = point.y - resizeState.startPoint.y;
  const minSize = Math.max(24, 10 * point.unitPerCssPx);
  const start = resizeState.box;
  let x = start.x;
  let y = start.y;
  let w = start.w;
  let h = start.h;

  if (resizeState.corner.includes("e")) w = Math.max(minSize, start.w + dx);
  if (resizeState.corner.includes("s")) h = Math.max(minSize, start.h + dy);
  if (resizeState.corner.includes("w")) {
    w = Math.max(minSize, start.w - dx);
    x = start.x + (start.w - w);
  }
  if (resizeState.corner.includes("n")) {
    h = Math.max(minSize, start.h - dy);
    y = start.y + (start.h - h);
  }

  setInput(xInput, x);
  setInput(yInput, y);
  setInput(wInput, w);
  setInput(hInput, h);
}, true);

function finishResize(event) {
  if (!resizeState || event.pointerId !== resizeState.pointerId) return;
  event.preventDefault();
  event.stopImmediatePropagation();
  resizeState = null;
  canvas.style.cursor = "default";
  wInput.dispatchEvent(new Event("change", { bubbles: true }));
  wInput.blur();
  try { canvas.releasePointerCapture(event.pointerId); } catch {}
}

canvas.addEventListener("pointerup", finishResize, true);
canvas.addEventListener("pointercancel", finishResize, true);
