import assert from "node:assert/strict";

import { isSafeImageSource, normalizeProject } from "../js/model.js";

function projectWith(element) {
  return {
    version: 1,
    ratio: "landscape",
    slides: [{
      id: "slide-test",
      background: { type: "solid", color1: "#111827" },
      elements: [element],
    }],
  };
}

const embeddedImage = "data:image/png;base64,iVBORw0KGgo=";
assert.equal(isSafeImageSource(embeddedImage), true);
assert.equal(isSafeImageSource("https://example.com/image.png"), false);

const normalizedImageProject = normalizeProject(projectWith({
  id: "image-test",
  type: "image",
  x: 0,
  y: 0,
  w: 1920,
  h: 1080,
  src: embeddedImage,
  fit: "unexpected",
}));
assert.equal(normalizedImageProject.slides[0].elements[0].fit, "cover");

assert.throws(
  () => normalizeProject(projectWith({ type: "image", src: "https://example.com/image.png" })),
  /外部URLまたは無効な画像データ/,
);
assert.throws(
  () => normalizeProject(projectWith({ type: "video" })),
  /対応していない形式/,
);

const normalizedShapeProject = normalizeProject(projectWith({
  type: "shape",
  x: "invalid",
  y: 20,
  w: -100,
  h: 999999,
  opacity: 4,
  radius: -8,
}));
const shape = normalizedShapeProject.slides[0].elements[0];
assert.equal(shape.x, 0);
assert.equal(shape.w, 10);
assert.equal(shape.h, 2160);
assert.equal(shape.opacity, 1);
assert.equal(shape.radius, 0);

console.log("Model checks passed (safe image sources and imported element normalization verified).");
