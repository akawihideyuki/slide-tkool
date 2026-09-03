export const CANVAS_SIZES = Object.freeze({
  landscape: { width: 1920, height: 1080, label: "16:9 通常" },
  portrait: { width: 1080, height: 1920, label: "9:16 Shorts" },
});

const FONT_STACK = '"Noto Sans JP", "Yu Gothic", "Meiryo", sans-serif';
const ELEMENT_TYPES = new Set(["text", "image", "shape"]);

export function isSafeImageSource(src) {
  return typeof src === "string" && /^data:image\/[a-z0-9.+-]+(?:;[^,]*)?,/i.test(src);
}

function finiteNumber(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function clampNumber(value, min, max, fallback) {
  return Math.max(min, Math.min(max, finiteNumber(value, fallback)));
}

export function uid(prefix = "id") {
  if (globalThis.crypto?.randomUUID) return `${prefix}-${crypto.randomUUID()}`;
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

export function deepClone(value) {
  return structuredClone(value);
}

export function createTextElement({
  text = "テキスト",
  x = 160,
  y = 140,
  w = 900,
  h = 220,
  fontSize = 72,
  fontWeight = 700,
  color = "#ffffff",
  align = "left",
  valign = "top",
} = {}) {
  return {
    id: uid("text"),
    type: "text",
    x, y, w, h,
    text,
    fontSize,
    fontFamily: FONT_STACK,
    fontWeight: String(fontWeight),
    color,
    align,
    valign,
    lineHeight: 1.22,
  };
}

export function createShapeElement({
  x = 140,
  y = 140,
  w = 620,
  h = 240,
  color = "#111827",
  opacity = 0.82,
  radius = 28,
} = {}) {
  return {
    id: uid("shape"),
    type: "shape",
    x, y, w, h,
    color,
    opacity,
    radius,
  };
}

export function createImageElement({
  src,
  x = 960,
  y = 120,
  w = 800,
  h = 840,
  fit = "cover",
} = {}) {
  return {
    id: uid("image"),
    type: "image",
    x, y, w, h,
    src,
    fit,
  };
}

export function createSlide(ratio = "landscape", template = "titleBody") {
  const slide = {
    id: uid("slide"),
    background: {
      type: "gradient",
      color1: "#111827",
      color2: "#24324d",
      angle: 135,
    },
    elements: [],
  };
  applyTemplate(slide, ratio, template);
  return slide;
}

export function createProject(ratio = "landscape") {
  return {
    version: 1,
    name: "YouTube Slides",
    ratio,
    slides: [createSlide(ratio, "titleBody")],
    activeSlideId: null,
    updatedAt: new Date().toISOString(),
  };
}

export function getCanvasSize(ratio) {
  return CANVAS_SIZES[ratio] ?? CANVAS_SIZES.landscape;
}

export function applyTemplate(slide, ratio, templateName) {
  const { width: W, height: H } = getCanvasSize(ratio);
  const oldImage = slide.elements.find((el) => el.type === "image" && el.src)?.src ?? null;
  const margin = ratio === "portrait" ? 90 : 120;
  const titleSize = ratio === "portrait" ? 92 : 82;
  const bodySize = ratio === "portrait" ? 50 : 42;
  const title = "ここにタイトル";
  const body = "伝えたい内容をここに入力します。\n短く区切ると、動画でも読みやすくなります。";

  if (templateName === "title") {
    slide.elements = [
      createTextElement({
        text: title,
        x: margin,
        y: H * 0.31,
        w: W - margin * 2,
        h: H * 0.34,
        fontSize: titleSize + 14,
        fontWeight: 900,
        align: "center",
        valign: "middle",
      }),
    ];
    return;
  }

  if (templateName === "split") {
    const gap = ratio === "portrait" ? 56 : 70;
    if (ratio === "portrait") {
      const imageY = H * 0.44;
      slide.elements = [
        createTextElement({ text: title, x: margin, y: 150, w: W - margin * 2, h: 230, fontSize: titleSize, fontWeight: 900 }),
        createTextElement({ text: body, x: margin, y: 390, w: W - margin * 2, h: 330, fontSize: bodySize, fontWeight: 400 }),
        ...(oldImage ? [createImageElement({ src: oldImage, x: margin, y: imageY, w: W - margin * 2, h: H - imageY - 180, fit: "cover" })] : [
          createShapeElement({ x: margin, y: imageY, w: W - margin * 2, h: H - imageY - 180, color: "#334155", opacity: .72, radius: 36 }),
        ]),
      ];
    } else {
      const leftW = W * 0.42;
      const imageX = margin + leftW + gap;
      slide.elements = [
        createTextElement({ text: title, x: margin, y: H * .20, w: leftW, h: 220, fontSize: titleSize, fontWeight: 900 }),
        createTextElement({ text: body, x: margin, y: H * .43, w: leftW, h: 360, fontSize: bodySize, fontWeight: 400 }),
        ...(oldImage ? [createImageElement({ src: oldImage, x: imageX, y: 100, w: W - imageX - margin, h: H - 200, fit: "cover" })] : [
          createShapeElement({ x: imageX, y: 100, w: W - imageX - margin, h: H - 200, color: "#334155", opacity: .72, radius: 36 }),
        ]),
      ];
    }
    return;
  }

  if (templateName === "caption") {
    slide.elements = [
      ...(oldImage ? [createImageElement({ src: oldImage, x: 0, y: 0, w: W, h: H, fit: "cover" })] : [
        createShapeElement({ x: 0, y: 0, w: W, h: H, color: "#25324a", opacity: 1, radius: 0 }),
      ]),
      createShapeElement({ x: margin, y: H * .69, w: W - margin * 2, h: H * .20, color: "#050a12", opacity: .76, radius: 28 }),
      createTextElement({
        text: title,
        x: margin + 40,
        y: H * .70,
        w: W - margin * 2 - 80,
        h: H * .18,
        fontSize: titleSize,
        fontWeight: 900,
        align: "center",
        valign: "middle",
      }),
    ];
    return;
  }

  slide.elements = [
    createTextElement({
      text: title,
      x: margin,
      y: ratio === "portrait" ? 360 : 220,
      w: W - margin * 2,
      h: ratio === "portrait" ? 320 : 220,
      fontSize: titleSize,
      fontWeight: 900,
      align: "center",
      valign: "middle",
    }),
    createTextElement({
      text: body,
      x: margin * 1.25,
      y: ratio === "portrait" ? 760 : 520,
      w: W - margin * 2.5,
      h: ratio === "portrait" ? 600 : 350,
      fontSize: bodySize,
      fontWeight: 400,
      color: "#d8e1f2",
      align: "center",
      valign: "top",
    }),
  ];
}

export function convertProjectRatio(project, nextRatio) {
  if (!CANVAS_SIZES[nextRatio] || project.ratio === nextRatio) return;
  const oldSize = getCanvasSize(project.ratio);
  const newSize = getCanvasSize(nextRatio);
  const sx = newSize.width / oldSize.width;
  const sy = newSize.height / oldSize.height;
  const fontScale = Math.sqrt(sx * sy);

  for (const slide of project.slides) {
    for (const el of slide.elements) {
      el.x *= sx;
      el.y *= sy;
      el.w *= sx;
      el.h *= sy;
      if (el.type === "text") el.fontSize *= fontScale;
      if (el.type === "shape") el.radius *= fontScale;
    }
  }

  project.ratio = nextRatio;
  project.updatedAt = new Date().toISOString();
}

export function slideDisplayName(slide, index) {
  const text = slide.elements.find((el) => el.type === "text" && el.text?.trim())?.text?.trim();
  if (!text) return `スライド ${index + 1}`;
  return text.split(/\r?\n/)[0].slice(0, 28);
}

export function normalizeProject(raw) {
  if (!raw || typeof raw !== "object" || !Array.isArray(raw.slides)) throw new Error("有効なプロジェクトJSONではありません。");
  if (!CANVAS_SIZES[raw.ratio]) raw.ratio = "landscape";
  raw.version = 1;
  raw.slides = raw.slides.filter((slide) => slide && Array.isArray(slide.elements));
  if (raw.slides.length === 0) raw.slides.push(createSlide(raw.ratio));
  const size = getCanvasSize(raw.ratio);

  for (const [slideIndex, slide] of raw.slides.entries()) {
    slide.id ||= uid("slide");
    if (!slide.background || typeof slide.background !== "object") {
      slide.background = { type: "solid", color1: "#111827", color2: "#111827", angle: 135 };
    }
    slide.background.type = slide.background.type === "solid" ? "solid" : "gradient";
    slide.background.color1 = typeof slide.background.color1 === "string" ? slide.background.color1 : "#111827";
    slide.background.color2 = typeof slide.background.color2 === "string" ? slide.background.color2 : slide.background.color1;
    slide.background.angle = finiteNumber(slide.background.angle, 135);

    for (const [elementIndex, el] of slide.elements.entries()) {
      if (!el || typeof el !== "object" || !ELEMENT_TYPES.has(el.type)) {
        throw new Error(`スライド${slideIndex + 1}の要素${elementIndex + 1}は対応していない形式です。`);
      }

      el.id ||= uid(el.type);
      el.x = finiteNumber(el.x, 0);
      el.y = finiteNumber(el.y, 0);
      el.w = clampNumber(el.w, 10, size.width * 2, 100);
      el.h = clampNumber(el.h, 10, size.height * 2, 100);

      if (el.type === "image") {
        if (!isSafeImageSource(el.src)) {
          throw new Error(`スライド${slideIndex + 1}の画像${elementIndex + 1}に外部URLまたは無効な画像データが含まれています。画像はこのツールから追加し直してください。`);
        }
        el.fit = el.fit === "contain" ? "contain" : "cover";
      } else if (el.type === "text") {
        el.text = typeof el.text === "string" ? el.text : "";
        el.fontSize = clampNumber(el.fontSize, 12, 240, 48);
        el.fontFamily = typeof el.fontFamily === "string" && el.fontFamily.length <= 200 ? el.fontFamily : FONT_STACK;
        el.fontWeight = ["400", "600", "700", "900"].includes(String(el.fontWeight)) ? String(el.fontWeight) : "400";
        el.color = typeof el.color === "string" ? el.color : "#ffffff";
        el.align = ["left", "center", "right"].includes(el.align) ? el.align : "left";
        el.valign = ["top", "middle", "bottom"].includes(el.valign) ? el.valign : "top";
        el.lineHeight = clampNumber(el.lineHeight, 0.8, 3, 1.22);
      } else {
        el.color = typeof el.color === "string" ? el.color : "#111827";
        el.opacity = clampNumber(el.opacity, 0, 1, 0.82);
        el.radius = clampNumber(el.radius, 0, Math.max(size.width, size.height), 0);
      }
    }
  }
  raw.updatedAt = new Date().toISOString();
  return raw;
}
