import { isSafeImageSource } from "./model.js";

const imageCache = new Map();
const MAX_IMAGE_CACHE_ENTRIES = 12;

function trimImageCache() {
  while (imageCache.size > MAX_IMAGE_CACHE_ENTRIES) {
    imageCache.delete(imageCache.keys().next().value);
  }
}

export function retainImageCache(sources) {
  const retained = new Set([...sources].filter(isSafeImageSource));
  for (const src of imageCache.keys()) {
    if (!retained.has(src)) imageCache.delete(src);
  }
  trimImageCache();
}

function loadImage(src) {
  if (!isSafeImageSource(src)) return Promise.resolve(null);
  if (imageCache.has(src)) {
    const cached = imageCache.get(src);
    imageCache.delete(src);
    imageCache.set(src, cached);
    return cached;
  }
  const promise = new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => {
      if (imageCache.get(src) === promise) imageCache.delete(src);
      resolve(null);
    };
    img.src = src;
  });
  imageCache.set(src, promise);
  trimImageCache();
  return promise;
}

function roundedRect(ctx, x, y, w, h, radius) {
  const r = Math.max(0, Math.min(radius || 0, Math.min(w, h) / 2));
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function drawBackground(ctx, slide, width, height) {
  const bg = slide.background || {};
  const color1 = bg.color1 || "#111827";
  const color2 = bg.color2 || color1;
  if (bg.type === "solid") {
    ctx.fillStyle = color1;
  } else {
    const angle = ((bg.angle ?? 135) * Math.PI) / 180;
    const cx = width / 2;
    const cy = height / 2;
    const length = Math.abs(width * Math.cos(angle)) + Math.abs(height * Math.sin(angle));
    const dx = Math.cos(angle) * length / 2;
    const dy = Math.sin(angle) * length / 2;
    const gradient = ctx.createLinearGradient(cx - dx, cy - dy, cx + dx, cy + dy);
    gradient.addColorStop(0, color1);
    gradient.addColorStop(1, color2);
    ctx.fillStyle = gradient;
  }
  ctx.fillRect(0, 0, width, height);
}

function segmentText(text) {
  if (globalThis.Intl?.Segmenter) {
    const segmenter = new Intl.Segmenter("ja", { granularity: "word" });
    return [...segmenter.segment(text)].map((item) => item.segment);
  }
  return [...text];
}

function segmentGraphemes(text) {
  if (globalThis.Intl?.Segmenter) {
    const segmenter = new Intl.Segmenter("ja", { granularity: "grapheme" });
    return [...segmenter.segment(text)].map((item) => item.segment);
  }
  return [...text];
}

function breakToken(ctx, token, maxWidth) {
  const parts = [];
  let current = "";
  for (const grapheme of segmentGraphemes(token)) {
    const test = current + grapheme;
    if (current && ctx.measureText(test).width > maxWidth) {
      parts.push(current);
      current = grapheme;
    } else {
      current = test;
    }
  }
  if (current || parts.length === 0) parts.push(current);
  return parts;
}

function wrapParagraph(ctx, paragraph, maxWidth) {
  if (!paragraph) return [""];
  const tokens = segmentText(paragraph);
  const lines = [];
  let current = "";

  for (const token of tokens) {
    const parts = ctx.measureText(token).width > maxWidth ? breakToken(ctx, token, maxWidth) : [token];
    for (const part of parts) {
      const test = current + part;
      if (current && ctx.measureText(test).width > maxWidth) {
        lines.push(current.trimEnd());
        current = part.trimStart();
      } else {
        current = test;
      }
    }
  }
  if (current || lines.length === 0) lines.push(current.trimEnd());
  return lines;
}

function buildTextLines(ctx, text, maxWidth) {
  return String(text ?? "").split(/\r?\n/).flatMap((paragraph) => wrapParagraph(ctx, paragraph, maxWidth));
}

function drawText(ctx, el) {
  const fontSize = Math.max(1, Number(el.fontSize) || 48);
  const lineHeight = fontSize * (Number(el.lineHeight) || 1.2);
  ctx.save();
  ctx.beginPath();
  ctx.rect(el.x, el.y, el.w, el.h);
  ctx.clip();
  ctx.fillStyle = el.color || "#ffffff";
  ctx.font = `${el.fontWeight || "400"} ${fontSize}px ${el.fontFamily || "sans-serif"}`;
  ctx.textBaseline = "top";
  ctx.textAlign = el.align || "left";

  const lines = buildTextLines(ctx, el.text, Math.max(10, el.w));
  const totalHeight = lines.length * lineHeight;
  const visibleLineCount = Math.max(0, Math.floor((Math.max(0, Number(el.h) || 0) + 0.5) / lineHeight));
  const overflows = lines.length > visibleLineCount || lines.some((line) => ctx.measureText(line).width > Math.max(10, el.w) + 0.5);
  let y = el.y;
  if (el.valign === "middle") y += Math.max(0, (el.h - totalHeight) / 2);
  if (el.valign === "bottom") y += Math.max(0, el.h - totalHeight);

  let x = el.x;
  if (ctx.textAlign === "center") x = el.x + el.w / 2;
  if (ctx.textAlign === "right") x = el.x + el.w;

  for (const line of lines.slice(0, visibleLineCount)) {
    ctx.fillText(line, x, y);
    y += lineHeight;
  }
  ctx.restore();
  return overflows;
}

function drawTextOverflowWarning(ctx, el) {
  const label = "文字が枠に収まりません";
  const fontSize = 24;
  const padX = 10;
  const height = 42;
  ctx.save();
  ctx.strokeStyle = "#ffb24a";
  ctx.lineWidth = 4;
  ctx.setLineDash([12, 8]);
  ctx.strokeRect(el.x, el.y, el.w, el.h);
  ctx.setLineDash([]);
  ctx.font = `700 ${fontSize}px sans-serif`;
  const width = Math.ceil(ctx.measureText(label).width + padX * 2);
  const x = Math.max(0, Math.min(el.x, ctx.canvas.width - width));
  const preferredY = el.y >= height + 8 ? el.y - height - 8 : el.y + 8;
  const y = Math.max(0, Math.min(preferredY, ctx.canvas.height - height));
  ctx.fillStyle = "rgba(101, 57, 13, .94)";
  ctx.fillRect(x, y, width, height);
  ctx.fillStyle = "#fff1d6";
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillText(label, x + padX, y + height / 2);
  ctx.restore();
}

async function drawImage(ctx, el) {
  const img = await loadImage(el.src);
  if (!img) {
    ctx.save();
    ctx.fillStyle = "rgba(148, 163, 184, .16)";
    ctx.fillRect(el.x, el.y, el.w, el.h);
    ctx.fillStyle = "rgba(226, 232, 240, .65)";
    ctx.font = "600 30px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("画像を読み込めません", el.x + el.w / 2, el.y + el.h / 2);
    ctx.restore();
    return;
  }

  const sourceRatio = img.naturalWidth / img.naturalHeight;
  const boxRatio = el.w / el.h;
  let dw = el.w;
  let dh = el.h;
  let dx = el.x;
  let dy = el.y;

  if (el.fit === "contain") {
    if (sourceRatio > boxRatio) {
      dh = el.w / sourceRatio;
      dy += (el.h - dh) / 2;
    } else {
      dw = el.h * sourceRatio;
      dx += (el.w - dw) / 2;
    }
    ctx.drawImage(img, dx, dy, dw, dh);
    return;
  }

  let sx = 0;
  let sy = 0;
  let sw = img.naturalWidth;
  let sh = img.naturalHeight;
  if (sourceRatio > boxRatio) {
    sw = img.naturalHeight * boxRatio;
    sx = (img.naturalWidth - sw) / 2;
  } else {
    sh = img.naturalWidth / boxRatio;
    sy = (img.naturalHeight - sh) / 2;
  }
  ctx.drawImage(img, sx, sy, sw, sh, el.x, el.y, el.w, el.h);
}

function drawShape(ctx, el) {
  ctx.save();
  ctx.globalAlpha = Math.max(0, Math.min(1, Number(el.opacity) || 0));
  ctx.fillStyle = el.color || "#111827";
  roundedRect(ctx, el.x, el.y, el.w, el.h, Number(el.radius) || 0);
  ctx.fill();
  ctx.restore();
}

function drawSelection(ctx, el, scale = 1) {
  const line = Math.max(2, 3 / Math.max(scale, .1));
  const handle = Math.max(8, 11 / Math.max(scale, .1));
  ctx.save();
  ctx.strokeStyle = "#78a0ff";
  ctx.lineWidth = line;
  ctx.setLineDash([line * 3, line * 2]);
  ctx.strokeRect(el.x, el.y, el.w, el.h);
  ctx.setLineDash([]);
  ctx.fillStyle = "#eaf0ff";
  const points = [
    [el.x, el.y], [el.x + el.w, el.y],
    [el.x, el.y + el.h], [el.x + el.w, el.y + el.h],
  ];
  for (const [x, y] of points) ctx.fillRect(x - handle / 2, y - handle / 2, handle, handle);
  ctx.restore();
}

function drawGuides(ctx, width, height, ratio) {
  ctx.save();
  ctx.strokeStyle = "rgba(255,255,255,.48)";
  ctx.fillStyle = "rgba(0,0,0,.12)";
  ctx.lineWidth = Math.max(2, width / 900);
  ctx.setLineDash([14, 10]);

  if (ratio === "portrait") {
    const left = width * .07;
    const right = width * .20;
    const top = height * .08;
    const bottom = height * .16;
    ctx.fillRect(0, 0, width, top);
    ctx.fillRect(0, height - bottom, width, bottom);
    ctx.fillRect(width - right, 0, right, height);
    ctx.strokeRect(left, top, width - left - right, height - top - bottom);
    ctx.setLineDash([]);
    ctx.fillStyle = "rgba(255,255,255,.62)";
    ctx.font = `600 ${Math.max(18, width * .022)}px sans-serif`;
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    ctx.fillText("Shorts UI目安ガイド", left + 14, top + 12);
  } else {
    const mx = width * .05;
    const my = height * .07;
    ctx.strokeRect(mx, my, width - mx * 2, height - my * 2);
    ctx.setLineDash([]);
    ctx.fillStyle = "rgba(255,255,255,.62)";
    ctx.font = `600 ${Math.max(16, width * .014)}px sans-serif`;
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    ctx.fillText("安全領域目安", mx + 12, my + 10);
  }
  ctx.restore();
}

export async function renderSlide(canvas, slide, size, options = {}) {
  const { selectedId = null, showGuides = false, showOverflowWarnings = false, ratio = "landscape" } = options;
  if (canvas.width !== size.width) canvas.width = size.width;
  if (canvas.height !== size.height) canvas.height = size.height;
  const ctx = canvas.getContext("2d", { alpha: false });
  ctx.clearRect(0, 0, size.width, size.height);
  drawBackground(ctx, slide, size.width, size.height);

  const images = slide.elements.filter((el) => el.type === "image");
  await Promise.all(images.map((el) => loadImage(el.src)));

  const overflowingTextElements = [];
  for (const el of slide.elements) {
    if (el.type === "shape") drawShape(ctx, el);
    else if (el.type === "image") await drawImage(ctx, el);
    else if (el.type === "text" && drawText(ctx, el)) overflowingTextElements.push(el);
  }

  if (showOverflowWarnings) {
    for (const el of overflowingTextElements) drawTextOverflowWarning(ctx, el);
  }
  if (showGuides) drawGuides(ctx, size.width, size.height, ratio);
  if (selectedId) {
    const selected = slide.elements.find((el) => el.id === selectedId);
    if (selected) drawSelection(ctx, selected, 1);
  }
  return { overflowTextIds: overflowingTextElements.map((el) => el.id) };
}

export function pointToCanvas(canvas, clientX, clientY) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: (clientX - rect.left) * (canvas.width / rect.width),
    y: (clientY - rect.top) * (canvas.height / rect.height),
  };
}

export function hitTest(elements, point) {
  for (let i = elements.length - 1; i >= 0; i -= 1) {
    const el = elements[i];
    if (point.x >= el.x && point.x <= el.x + el.w && point.y >= el.y && point.y <= el.y + el.h) return el;
  }
  return null;
}

export async function slideToBlob(slide, size, ratio) {
  const canvas = document.createElement("canvas");
  await renderSlide(canvas, slide, size, { selectedId: null, showGuides: false, ratio });
  return await new Promise((resolve, reject) => {
    canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("PNG生成に失敗しました。")), "image/png");
  });
}

export async function renderThumbnail(canvas, slide, size) {
  const targetWidth = 320;
  const targetHeight = Math.round(targetWidth * size.height / size.width);
  const full = document.createElement("canvas");
  await renderSlide(full, slide, size, { selectedId: null, showGuides: false });
  canvas.width = targetWidth;
  canvas.height = targetHeight;
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, targetWidth, targetHeight);
  ctx.drawImage(full, 0, 0, targetWidth, targetHeight);
}
