import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const requiredFiles = [
  "index.html",
  "styles.css",
  "js/app.js",
  "js/model.js",
  "js/renderer.js",
  "js/storage.js",
  "js/resize.js",
  "tests/model-check.mjs",
];

const failures = [];

for (const file of requiredFiles) {
  if (!existsSync(resolve(root, file))) failures.push(`Missing required file: ${file}`);
}

const html = readFileSync(resolve(root, "index.html"), "utf8");
const scriptsToScan = ["js/app.js", "js/model.js", "js/renderer.js", "js/storage.js", "js/resize.js"];

for (const scriptPath of scriptsToScan) {
  const fullPath = resolve(root, scriptPath);
  const source = readFileSync(fullPath, "utf8");

  const selectorPatterns = [
    /\$\("#([A-Za-z][\w-]*)"\)/g,
    /querySelector\("#([A-Za-z][\w-]*)"\)/g,
  ];
  for (const pattern of selectorPatterns) {
    for (const match of source.matchAll(pattern)) {
      const id = match[1];
      if (!html.includes(`id="${id}"`)) failures.push(`${scriptPath} references missing HTML id: #${id}`);
    }
  }

  for (const match of source.matchAll(/from\s+"(\.\/[^\"]+)"/g)) {
    const importPath = resolve(dirname(fullPath), match[1]);
    if (!existsSync(importPath)) failures.push(`${scriptPath} imports missing file: ${match[1]}`);
  }
}

for (const script of ["js/app.js", "js/resize.js"]) {
  if (!html.includes(`src="${script}"`)) failures.push(`index.html does not load ${script}`);
}

if (!html.includes('data-ratio="landscape"')) failures.push("Landscape ratio control is missing.");
if (!html.includes('data-ratio="portrait"')) failures.push("Portrait ratio control is missing.");
if (!html.includes('id="openSlidesPanelBtn"')) failures.push("Responsive slide panel control is missing.");
if (!html.includes('id="openInspectorPanelBtn"')) failures.push("Responsive inspector panel control is missing.");
if (!html.includes('id="textOverflowWarning"')) failures.push("Text overflow warning is missing.");

if (failures.length) {
  console.error("Static checks failed:\n" + failures.map((item) => `- ${item}`).join("\n"));
  process.exit(1);
}

console.log(`Static checks passed (${requiredFiles.length} required files, HTML/JS references verified).`);
