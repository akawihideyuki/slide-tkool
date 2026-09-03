import {
  applyTemplate,
  CANVAS_SIZES,
  convertProjectRatio,
  createImageElement,
  createProject,
  createShapeElement,
  createSlide,
  createTextElement,
  deepClone,
  getCanvasSize,
  normalizeProject,
  slideDisplayName,
  uid,
} from "./model.js";
import { hitTest, pointToCanvas, renderSlide, renderThumbnail, retainImageCache, slideToBlob } from "./renderer.js";
import { loadAutosave, saveAutosave } from "./storage.js";

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];

const els = {
  canvas: $("#stageCanvas"),
  stageWrap: $("#stageWrap"),
  slideList: $("#slideList"),
  canvasSizeLabel: $("#canvasSizeLabel"),
  guideToggle: $("#guideToggle"),
  toast: $("#toast"),
  textOverflowWarning: $("#textOverflowWarning"),
  undoBtn: $("#undoBtn"),
  redoBtn: $("#redoBtn"),
  slidesPanel: $("#slidesPanel"),
  inspectorPanel: $("#inspectorPanel"),
  panelBackdrop: $("#panelBackdrop"),
  openSlidesPanelBtn: $("#openSlidesPanelBtn"),
  openInspectorPanelBtn: $("#openInspectorPanelBtn"),
  elementHeading: $("#elementHeading"),
  emptyInspector: $("#emptyInspector"),
  textInspector: $("#textInspector"),
  imageInspector: $("#imageInspector"),
  shapeInspector: $("#shapeInspector"),
  commonInspector: $("#commonInspector"),
  bgColor1: $("#bgColor1"),
  bgColor2: $("#bgColor2"),
  bgType: $("#bgType"),
  textContent: $("#textContent"),
  fontSize: $("#fontSize"),
  textColor: $("#textColor"),
  fontWeight: $("#fontWeight"),
  textAlign: $("#textAlign"),
  imageFit: $("#imageFit"),
  shapeColor: $("#shapeColor"),
  shapeOpacity: $("#shapeOpacity"),
  shapeRadius: $("#shapeRadius"),
  posX: $("#posX"),
  posY: $("#posY"),
  elemW: $("#elemW"),
  elemH: $("#elemH"),
};

let project = createProject("landscape");
project.activeSlideId = project.slides[0].id;
let selectedId = null;
let history = [];
let future = [];
let pendingFieldSnapshot = null;
let autosaveTimer = null;
let thumbTimer = null;
let toastTimer = null;
let dragState = null;
let renderSerial = 0;
const HISTORY_LIMIT = 50;

function activeSlide() {
  return project.slides.find((slide) => slide.id === project.activeSlideId) ?? project.slides[0];
}

function selectedElement() {
  return activeSlide()?.elements.find((el) => el.id === selectedId) ?? null;
}

function showToast(message) {
  els.toast.textContent = message;
  els.toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => els.toast.classList.remove("show"), 2300);
}

function pushHistory(snapshot) {
  history.push(snapshot);
  if (history.length > HISTORY_LIMIT) history.shift();
  future = [];
}

function mutate(fn, { toast = null } = {}) {
  pendingFieldSnapshot = null;
  pushHistory(deepClone(project));
  fn();
  project.updatedAt = new Date().toISOString();
  scheduleAutosave();
  refreshAll();
  if (toast) showToast(toast);
}

function undo() {
  if (!history.length) return;
  future.push(deepClone(project));
  project = history.pop();
  selectedId = null;
  pendingFieldSnapshot = null;
  scheduleAutosave();
  refreshAll();
}

function redo() {
  if (!future.length) return;
  history.push(deepClone(project));
  project = future.pop();
  selectedId = null;
  pendingFieldSnapshot = null;
  scheduleAutosave();
  refreshAll();
}

function beginFieldEdit() {
  if (!pendingFieldSnapshot) pendingFieldSnapshot = deepClone(project);
}

function endFieldEdit() {
  if (!pendingFieldSnapshot) return;
  pushHistory(pendingFieldSnapshot);
  pendingFieldSnapshot = null;
  project.updatedAt = new Date().toISOString();
  scheduleAutosave();
  refreshAll();
}

function touchLive({ thumbnails = true } = {}) {
  project.updatedAt = new Date().toISOString();
  scheduleAutosave();
  renderStage();
  syncInspector();
  if (thumbnails) scheduleThumbnails();
}

function scheduleAutosave() {
  clearTimeout(autosaveTimer);
  autosaveTimer = setTimeout(async () => {
    try {
      await saveAutosave(project);
    } catch (error) {
      console.warn("Autosave failed:", error);
      showToast("自動保存に失敗しました。JSON保存を利用してください。");
    }
  }, 450);
}

function scheduleThumbnails() {
  clearTimeout(thumbTimer);
  thumbTimer = setTimeout(renderSlideList, 180);
}

function fitStage() {
  const size = getCanvasSize(project.ratio);
  const availableWidth = Math.max(240, els.stageWrap.clientWidth - 54);
  const availableHeight = Math.max(240, els.stageWrap.clientHeight - 74);
  const scale = Math.min(availableWidth / size.width, availableHeight / size.height, 1);
  els.canvas.style.width = `${Math.floor(size.width * scale)}px`;
  els.canvas.style.height = `${Math.floor(size.height * scale)}px`;
  els.canvas.style.maxHeight = "none";
}

async function renderStage() {
  const serial = ++renderSerial;
  const slide = activeSlide();
  if (!slide) return;
  const size = getCanvasSize(project.ratio);
  fitStage();
  if (els.canvas.width !== size.width) els.canvas.width = size.width;
  if (els.canvas.height !== size.height) els.canvas.height = size.height;

  const buffer = document.createElement("canvas");
  try {
    const result = await renderSlide(buffer, slide, size, {
      selectedId,
      showGuides: els.guideToggle.checked,
      showOverflowWarnings: true,
      ratio: project.ratio,
    });
    if (serial !== renderSerial) return;
    const ctx = els.canvas.getContext("2d", { alpha: false });
    ctx.clearRect(0, 0, size.width, size.height);
    ctx.drawImage(buffer, 0, 0);
    const selectedTextOverflows = selectedElement()?.type === "text" && result.overflowTextIds.includes(selectedId);
    els.textOverflowWarning.hidden = !selectedTextOverflows;
  } catch (error) {
    if (serial !== renderSerial) return;
    console.error("Slide render failed:", error);
    showToast("スライドの描画に失敗しました。読み込んだデータを確認してください。");
  }
}

function renderSlideList() {
  els.slideList.replaceChildren();
  const size = getCanvasSize(project.ratio);
  project.slides.forEach((slide, index) => {
    const item = document.createElement("button");
    item.type = "button";
    item.className = `slide-item${slide.id === project.activeSlideId ? " is-active" : ""}`;
    item.dataset.slideId = slide.id;
    item.innerHTML = `
      <span class="slide-number">${index + 1}</span>
      <span><canvas class="slide-thumb${project.ratio === "portrait" ? " portrait" : ""}" aria-hidden="true"></canvas><span class="slide-name"></span></span>
      <span class="slide-grip">⋮</span>
    `;
    item.querySelector(".slide-name").textContent = slideDisplayName(slide, index);
    item.addEventListener("click", () => {
      project.activeSlideId = slide.id;
      selectedId = null;
      renderSlideList();
      renderStage();
      syncControls();
      if (window.matchMedia("(max-width: 900px)").matches) closeMobilePanels();
    });
    els.slideList.append(item);
    renderThumbnail(item.querySelector("canvas"), slide, size).catch(console.warn);
  });
}

function syncRatioControls() {
  $$("[data-ratio]").forEach((button) => {
    const isActive = button.dataset.ratio === project.ratio;
    button.classList.toggle("is-active", isActive);
    button.setAttribute("aria-pressed", String(isActive));
  });
  const size = getCanvasSize(project.ratio);
  els.canvasSizeLabel.textContent = `${size.width} × ${size.height}`;
}

function syncBackgroundControls() {
  const bg = activeSlide()?.background;
  if (!bg) return;
  els.bgColor1.value = bg.color1 || "#111827";
  els.bgColor2.value = bg.color2 || bg.color1 || "#111827";
  els.bgType.value = bg.type === "solid" ? "solid" : "gradient";
}

function setInspectorVisibility(type) {
  els.emptyInspector.hidden = Boolean(type);
  els.textInspector.hidden = type !== "text";
  els.imageInspector.hidden = type !== "image";
  els.shapeInspector.hidden = type !== "shape";
  els.commonInspector.hidden = !type;
}

function syncInspector() {
  const el = selectedElement();
  if (!el) {
    els.elementHeading.textContent = "要素未選択";
    els.textOverflowWarning.hidden = true;
    setInspectorVisibility(null);
    return;
  }

  els.elementHeading.textContent = el.type === "text" ? "テキスト" : el.type === "image" ? "画像" : "ボックス";
  setInspectorVisibility(el.type);
  els.posX.value = Math.round(el.x);
  els.posY.value = Math.round(el.y);
  els.elemW.value = Math.round(el.w);
  els.elemH.value = Math.round(el.h);

  if (el.type === "text") {
    els.textOverflowWarning.hidden = true;
    els.textContent.value = el.text ?? "";
    els.fontSize.value = Math.round(el.fontSize ?? 48);
    els.textColor.value = el.color || "#ffffff";
    els.fontWeight.value = String(el.fontWeight || "400");
    els.textAlign.value = el.align || "left";
  } else if (el.type === "image") {
    els.textOverflowWarning.hidden = true;
    els.imageFit.value = el.fit || "cover";
  } else if (el.type === "shape") {
    els.textOverflowWarning.hidden = true;
    els.shapeColor.value = el.color || "#111827";
    els.shapeOpacity.value = Number(el.opacity ?? .8);
    els.shapeRadius.value = Math.round(el.radius ?? 0);
  }
}

function syncControls() {
  syncRatioControls();
  syncBackgroundControls();
  syncInspector();
  els.undoBtn.disabled = history.length === 0;
  els.redoBtn.disabled = future.length === 0;
}

function refreshAll() {
  retainImageCache(project.slides.flatMap((slide) => slide.elements.filter((el) => el.type === "image").map((el) => el.src)));
  syncControls();
  renderSlideList();
  renderStage();
}

function addSlide() {
  mutate(() => {
    const slide = createSlide(project.ratio, "titleBody");
    const index = Math.max(0, project.slides.findIndex((item) => item.id === project.activeSlideId));
    project.slides.splice(index + 1, 0, slide);
    project.activeSlideId = slide.id;
    selectedId = null;
  });
}

function duplicateSlide() {
  const source = activeSlide();
  if (!source) return;
  mutate(() => {
    const copy = deepClone(source);
    copy.id = uid("slide");
    copy.elements.forEach((el) => { el.id = uid(el.type || "element"); });
    const index = project.slides.findIndex((item) => item.id === source.id);
    project.slides.splice(index + 1, 0, copy);
    project.activeSlideId = copy.id;
    selectedId = null;
  });
}

function deleteSlide() {
  if (project.slides.length <= 1) {
    showToast("スライドは最低1枚必要です。");
    return;
  }
  mutate(() => {
    const index = project.slides.findIndex((item) => item.id === project.activeSlideId);
    project.slides.splice(index, 1);
    project.activeSlideId = project.slides[Math.min(index, project.slides.length - 1)].id;
    selectedId = null;
  });
}

function addText(kind) {
  const { width: W, height: H } = getCanvasSize(project.ratio);
  mutate(() => {
    const isTitle = kind === "title";
    const el = createTextElement({
      text: isTitle ? "新しいタイトル" : "新しいテキスト",
      x: W * .12,
      y: H * (isTitle ? .18 : .42),
      w: W * .76,
      h: H * (isTitle ? .22 : .30),
      fontSize: isTitle ? (project.ratio === "portrait" ? 92 : 82) : (project.ratio === "portrait" ? 50 : 42),
      fontWeight: isTitle ? 900 : 400,
      align: isTitle ? "center" : "left",
    });
    activeSlide().elements.push(el);
    selectedId = el.id;
  });
}

function addShape() {
  const { width: W, height: H } = getCanvasSize(project.ratio);
  mutate(() => {
    const shape = createShapeElement({ x: W * .18, y: H * .28, w: W * .64, h: H * .24, color: "#0b1220", opacity: .78, radius: 30 });
    activeSlide().elements.push(shape);
    selectedId = shape.id;
  });
}

function deleteSelectedElement() {
  if (!selectedId) return;
  mutate(() => {
    const slide = activeSlide();
    slide.elements = slide.elements.filter((el) => el.id !== selectedId);
    selectedId = null;
  });
}

function moveLayer(direction) {
  const slide = activeSlide();
  const index = slide.elements.findIndex((el) => el.id === selectedId);
  if (index < 0) return;
  const next = direction > 0 ? Math.min(slide.elements.length - 1, index + 1) : Math.max(0, index - 1);
  if (next === index) return;
  mutate(() => {
    const [el] = slide.elements.splice(index, 1);
    slide.elements.splice(next, 0, el);
  });
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

function cleanFilename(text) {
  return String(text || "slide").replace(/[\\/:*?"<>|\u0000-\u001f]/g, "_").trim().slice(0, 42) || "slide";
}

async function exportSlide(slide, index) {
  const blob = await slideToBlob(slide, getCanvasSize(project.ratio), project.ratio);
  const name = cleanFilename(slideDisplayName(slide, index));
  downloadBlob(blob, `${String(index + 1).padStart(2, "0")}_${name}.png`);
}

async function exportCurrent() {
  const index = project.slides.findIndex((slide) => slide.id === project.activeSlideId);
  if (index < 0) return;
  try {
    await exportSlide(project.slides[index], index);
    showToast("PNGを書き出しました。");
  } catch (error) {
    console.error(error);
    showToast("PNG書き出しに失敗しました。");
  }
}

async function exportAll() {
  try {
    for (let index = 0; index < project.slides.length; index += 1) {
      await exportSlide(project.slides[index], index);
      await new Promise((resolve) => setTimeout(resolve, 120));
    }
    showToast(`${project.slides.length}枚のPNGを書き出しました。`);
  } catch (error) {
    console.error(error);
    showToast("一括書き出しに失敗しました。ブラウザの複数ダウンロード許可も確認してください。");
  }
}

function saveProjectJson() {
  const blob = new Blob([JSON.stringify(project, null, 2)], { type: "application/json" });
  downloadBlob(blob, `slide-tkool_${project.ratio}_${new Date().toISOString().slice(0, 10)}.json`);
  showToast("プロジェクトJSONを保存しました。");
}

async function loadProjectFile(file) {
  try {
    const text = await file.text();
    const raw = normalizeProject(JSON.parse(text));
    project = raw;
    project.activeSlideId = project.slides.some((slide) => slide.id === raw.activeSlideId) ? raw.activeSlideId : project.slides[0].id;
    history = [];
    future = [];
    selectedId = null;
    scheduleAutosave();
    refreshAll();
    showToast("プロジェクトを読み込みました。");
  } catch (error) {
    console.error(error);
    showToast(error?.message || "JSONの読み込みに失敗しました。");
  }
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error ?? new Error("ファイルを読めませんでした。"));
    reader.readAsDataURL(file);
  });
}

function loadHtmlImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("画像を読み込めませんでした。"));
    img.src = src;
  });
}

async function optimizeImage(file) {
  const source = await fileToDataUrl(file);
  const img = await loadHtmlImage(source);
  const maxEdge = 2400;
  const scale = Math.min(1, maxEdge / Math.max(img.naturalWidth, img.naturalHeight));
  const width = Math.max(1, Math.round(img.naturalWidth * scale));
  const height = Math.max(1, Math.round(img.naturalHeight * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  ctx.drawImage(img, 0, 0, width, height);
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/webp", .9));
  if (!blob) return source;
  return await fileToDataUrl(blob);
}

async function addImageFromFile(file, replacing = false) {
  if (!file?.type?.startsWith("image/")) {
    showToast("画像ファイルを選択してください。");
    return;
  }
  try {
    const src = await optimizeImage(file);
    const { width: W, height: H } = getCanvasSize(project.ratio);
    if (replacing && selectedElement()?.type === "image") {
      mutate(() => { selectedElement().src = src; }, { toast: "画像を差し替えました。" });
      return;
    }
    mutate(() => {
      const image = createImageElement({
        src,
        x: W * .18,
        y: H * .14,
        w: W * .64,
        h: H * .58,
        fit: "cover",
      });
      activeSlide().elements.push(image);
      selectedId = image.id;
    }, { toast: "画像を追加しました。" });
  } catch (error) {
    console.error(error);
    showToast("画像の読み込みに失敗しました。");
  }
}

function clampElement(el) {
  const size = getCanvasSize(project.ratio);
  el.w = Math.max(10, Math.min(Number(el.w) || 10, size.width * 2));
  el.h = Math.max(10, Math.min(Number(el.h) || 10, size.height * 2));
  el.x = Math.max(-el.w * .75, Math.min(Number(el.x) || 0, size.width - el.w * .25));
  el.y = Math.max(-el.h * .75, Math.min(Number(el.y) || 0, size.height - el.h * .25));
}

function bindLiveField(element, eventName, getter, setter, { thumbnails = true } = {}) {
  element.addEventListener("focus", beginFieldEdit);
  element.addEventListener(eventName, () => {
    const target = getter();
    if (!target) return;
    setter(target, element.value);
    if (target.type) clampElement(target);
    touchLive({ thumbnails });
  });
  element.addEventListener("change", endFieldEdit);
}

function bindFields() {
  for (const input of [els.bgColor1, els.bgColor2, els.bgType]) {
    input.addEventListener("focus", beginFieldEdit);
    input.addEventListener("input", () => {
      const bg = activeSlide().background;
      bg.color1 = els.bgColor1.value;
      bg.color2 = els.bgColor2.value;
      bg.type = els.bgType.value;
      touchLive();
    });
    input.addEventListener("change", endFieldEdit);
  }

  bindLiveField(els.textContent, "input", selectedElement, (el, value) => { if (el.type === "text") el.text = value; });
  bindLiveField(els.fontSize, "input", selectedElement, (el, value) => { if (el.type === "text") el.fontSize = Math.max(12, Number(value) || 12); });
  bindLiveField(els.textColor, "input", selectedElement, (el, value) => { if (el.type === "text") el.color = value; });
  bindLiveField(els.fontWeight, "input", selectedElement, (el, value) => { if (el.type === "text") el.fontWeight = value; });
  bindLiveField(els.textAlign, "input", selectedElement, (el, value) => { if (el.type === "text") el.align = value; });
  bindLiveField(els.imageFit, "input", selectedElement, (el, value) => { if (el.type === "image") el.fit = value; });
  bindLiveField(els.shapeColor, "input", selectedElement, (el, value) => { if (el.type === "shape") el.color = value; });
  bindLiveField(els.shapeOpacity, "input", selectedElement, (el, value) => { if (el.type === "shape") el.opacity = Number(value); });
  bindLiveField(els.shapeRadius, "input", selectedElement, (el, value) => { if (el.type === "shape") el.radius = Math.max(0, Number(value) || 0); });
  bindLiveField(els.posX, "input", selectedElement, (el, value) => { el.x = Number(value) || 0; }, { thumbnails: false });
  bindLiveField(els.posY, "input", selectedElement, (el, value) => { el.y = Number(value) || 0; }, { thumbnails: false });
  bindLiveField(els.elemW, "input", selectedElement, (el, value) => { el.w = Math.max(10, Number(value) || 10); }, { thumbnails: false });
  bindLiveField(els.elemH, "input", selectedElement, (el, value) => { el.h = Math.max(10, Number(value) || 10); }, { thumbnails: false });
}

function bindCanvas() {
  els.canvas.addEventListener("pointerdown", (event) => {
    const point = pointToCanvas(els.canvas, event.clientX, event.clientY);
    const hit = hitTest(activeSlide().elements, point);
    selectedId = hit?.id ?? null;
    syncInspector();
    renderStage();
    if (!hit) return;

    dragState = {
      pointerId: event.pointerId,
      start: point,
      originX: hit.x,
      originY: hit.y,
      moved: false,
      snapshot: deepClone(project),
    };
    els.canvas.setPointerCapture(event.pointerId);
    els.canvas.classList.add("is-dragging");
  });

  els.canvas.addEventListener("pointermove", (event) => {
    if (!dragState || event.pointerId !== dragState.pointerId) return;
    const el = selectedElement();
    if (!el) return;
    const point = pointToCanvas(els.canvas, event.clientX, event.clientY);
    const dx = point.x - dragState.start.x;
    const dy = point.y - dragState.start.y;
    if (Math.abs(dx) + Math.abs(dy) > 1) dragState.moved = true;
    el.x = dragState.originX + dx;
    el.y = dragState.originY + dy;
    clampElement(el);
    project.updatedAt = new Date().toISOString();
    renderStage();
    syncInspector();
  });

  const finishDrag = (event) => {
    if (!dragState || event.pointerId !== dragState.pointerId) return;
    if (dragState.moved) {
      pushHistory(dragState.snapshot);
      scheduleAutosave();
      scheduleThumbnails();
    }
    dragState = null;
    els.canvas.classList.remove("is-dragging");
    try { els.canvas.releasePointerCapture(event.pointerId); } catch {}
  };
  els.canvas.addEventListener("pointerup", finishDrag);
  els.canvas.addEventListener("pointercancel", finishDrag);
}

function isTypingTarget(target) {
  return target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement || target?.isContentEditable;
}

function closeMobilePanels({ restoreFocus = false } = {}) {
  const openSlides = els.slidesPanel.classList.contains("is-open");
  const openInspector = els.inspectorPanel.classList.contains("is-open");
  els.slidesPanel.classList.remove("is-open");
  els.inspectorPanel.classList.remove("is-open");
  els.openSlidesPanelBtn.setAttribute("aria-expanded", "false");
  els.openInspectorPanelBtn.setAttribute("aria-expanded", "false");
  els.panelBackdrop.hidden = true;
  document.body.classList.remove("mobile-panel-open");
  if (restoreFocus) {
    if (openSlides) els.openSlidesPanelBtn.focus();
    else if (openInspector) els.openInspectorPanelBtn.focus();
  }
}

function openMobilePanel(panelName) {
  if (!window.matchMedia("(max-width: 900px)").matches) return;
  const showSlides = panelName === "slides";
  els.slidesPanel.classList.toggle("is-open", showSlides);
  els.inspectorPanel.classList.toggle("is-open", !showSlides);
  els.openSlidesPanelBtn.setAttribute("aria-expanded", String(showSlides));
  els.openInspectorPanelBtn.setAttribute("aria-expanded", String(!showSlides));
  els.panelBackdrop.hidden = false;
  document.body.classList.add("mobile-panel-open");
  const panel = showSlides ? els.slidesPanel : els.inspectorPanel;
  requestAnimationFrame(() => panel.querySelector("[data-close-mobile-panel]")?.focus());
}

function bindKeyboard() {
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !els.panelBackdrop.hidden) {
      event.preventDefault();
      closeMobilePanels({ restoreFocus: true });
      return;
    }
    if (isTypingTarget(event.target)) return;
    const mod = event.ctrlKey || event.metaKey;
    if (mod && event.key.toLowerCase() === "z") {
      event.preventDefault();
      event.shiftKey ? redo() : undo();
      return;
    }
    if (mod && event.key.toLowerCase() === "y") {
      event.preventDefault();
      redo();
      return;
    }
    if ((event.key === "Delete" || event.key === "Backspace") && selectedId) {
      event.preventDefault();
      deleteSelectedElement();
      return;
    }
    if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key) && selectedId) {
      event.preventDefault();
      const delta = event.shiftKey ? 10 : 1;
      mutate(() => {
        const el = selectedElement();
        if (event.key === "ArrowLeft") el.x -= delta;
        if (event.key === "ArrowRight") el.x += delta;
        if (event.key === "ArrowUp") el.y -= delta;
        if (event.key === "ArrowDown") el.y += delta;
        clampElement(el);
      });
    }
  });
}

function bindUi() {
  $("#addSlideBtn").addEventListener("click", addSlide);
  $("#duplicateSlideBtn").addEventListener("click", duplicateSlide);
  $("#deleteSlideBtn").addEventListener("click", deleteSlide);
  $("#addTitleBtn").addEventListener("click", () => addText("title"));
  $("#addTextBtn").addEventListener("click", () => addText("body"));
  $("#addShapeBtn").addEventListener("click", addShape);
  $("#deleteElementBtn").addEventListener("click", deleteSelectedElement);
  $("#bringForwardBtn").addEventListener("click", () => moveLayer(1));
  $("#sendBackwardBtn").addEventListener("click", () => moveLayer(-1));
  $("#undoBtn").addEventListener("click", undo);
  $("#redoBtn").addEventListener("click", redo);
  $("#exportCurrentBtn").addEventListener("click", exportCurrent);
  $("#exportAllBtn").addEventListener("click", exportAll);
  $("#saveProjectBtn").addEventListener("click", saveProjectJson);
  els.guideToggle.addEventListener("change", renderStage);
  els.openSlidesPanelBtn.addEventListener("click", () => openMobilePanel("slides"));
  els.openInspectorPanelBtn.addEventListener("click", () => openMobilePanel("inspector"));
  els.panelBackdrop.addEventListener("click", () => closeMobilePanels({ restoreFocus: true }));
  $$('[data-close-mobile-panel]').forEach((button) => button.addEventListener("click", () => closeMobilePanels({ restoreFocus: true })));

  $("#imageInput").addEventListener("change", async (event) => {
    const [file] = event.target.files;
    if (file) await addImageFromFile(file);
    event.target.value = "";
  });
  $("#replaceImageBtn").addEventListener("click", () => $("#replaceImageInput").click());
  $("#replaceImageInput").addEventListener("change", async (event) => {
    const [file] = event.target.files;
    if (file) await addImageFromFile(file, true);
    event.target.value = "";
  });
  $("#loadProjectInput").addEventListener("change", async (event) => {
    const [file] = event.target.files;
    if (file) await loadProjectFile(file);
    event.target.value = "";
  });

  $$("[data-ratio]").forEach((button) => button.addEventListener("click", () => {
    const nextRatio = button.dataset.ratio;
    if (nextRatio === project.ratio || !CANVAS_SIZES[nextRatio]) return;
    mutate(() => {
      convertProjectRatio(project, nextRatio);
      selectedId = null;
    }, { toast: "比率を変換しました。大きく構図が変わる場合はテンプレート再適用がおすすめです。" });
  }));

  $$("[data-template]").forEach((button) => button.addEventListener("click", () => {
    mutate(() => {
      applyTemplate(activeSlide(), project.ratio, button.dataset.template);
      selectedId = null;
    }, { toast: "テンプレートを適用しました。" });
  }));
}

async function init() {
  bindUi();
  bindFields();
  bindCanvas();
  bindKeyboard();
  window.addEventListener("resize", () => {
    if (!window.matchMedia("(max-width: 900px)").matches) closeMobilePanels();
    fitStage();
    renderStage();
  });

  try {
    const saved = await loadAutosave();
    if (saved?.slides?.length) {
      project = normalizeProject(saved);
      project.activeSlideId = project.slides.some((slide) => slide.id === saved.activeSlideId) ? saved.activeSlideId : project.slides[0].id;
      showToast("前回の自動保存を復元しました。");
    }
  } catch (error) {
    console.warn("Autosave restore failed:", error);
  }
  if (!project.activeSlideId) project.activeSlideId = project.slides[0].id;
  refreshAll();
}

init();
