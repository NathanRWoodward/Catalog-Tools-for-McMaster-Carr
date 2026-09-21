// Reduces a saved McMaster page to its product-page DOM with synthetic part numbers and prices.

import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { JSDOM, VirtualConsole } from "jsdom";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const rawDir = join(root, "fixtures", "raw");
const outDir = join(root, "fixtures");

const KEEP_ATTRS = new Set([
  "id",
  "class",
  "colspan",
  "rowspan",
  "role",
  "type",
  "tabindex",
  "data-testid",
]);
const DROP =
  "script, style, link, noscript, iframe, template, object, embed, video, audio, canvas, input[type=hidden]";
const PART = /\b\d{4,5}[A-Z]\d{1,3}\b/g;
const MONEY = /\$\s?\d[\d,]*(?:\.\d{2})?/g;
const BARE = /\b\d[\d,]*\.\d{2}\b/g;
const EMAIL = /[\w.+-]+@[\w-]+\.[\w.-]+/;

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function sanitize(html, name) {
  const source = (html.match(/saved from url=\(\d+\)(\S+)/) || [])[1] || "";
  const dom = new JSDOM(html, { virtualConsole: new VirtualConsole() });
  const { document, NodeFilter } = dom.window;
  const page = document.querySelector("#ProductPage");
  if (!page) {
    throw new Error(`${name}: no #ProductPage element`);
  }

  for (const el of page.querySelectorAll(DROP)) {
    el.remove();
  }

  for (const svg of page.querySelectorAll("svg")) {
    svg.replaceChildren();
  }

  for (const el of page.querySelectorAll(".mct-panel")) {
    el.remove();
  }

  for (const el of page.querySelectorAll("[class*='mct-']")) {
    el.classList.remove(...[...el.classList].filter((c) => c.startsWith("mct-")));
  }

  const comments = [];
  const commentWalker = document.createTreeWalker(page, NodeFilter.SHOW_COMMENT);
  while (commentWalker.nextNode()) {
    comments.push(commentWalker.currentNode);
  }

  for (const c of comments) {
    c.remove();
  }

  for (const el of [page, ...page.querySelectorAll("*")]) {
    for (const attr of el.getAttributeNames()) {
      if (!KEEP_ATTRS.has(attr)) {
        el.removeAttribute(attr);
      }
    }
  }

  const parts = new Map();
  const prices = new Map();
  const rand = mulberry32(0x4d4354);
  const fakePart = (orig) => {
    if (!parts.has(orig)) {
      const n = parts.size + 1;
      parts.set(orig, `${90000 + n}A${100 + (n % 900)}`);
    }
    return parts.get(orig);
  };
  const fakePrice = (orig) => {
    const key = orig.replace(/[$,\s]/g, "");
    if (!prices.has(key)) {
      prices.set(key, ((Math.floor(rand() * 99990) + 10) / 100).toFixed(2));
    }
    return prices.get(key);
  };

  const textWalker = document.createTreeWalker(page, NodeFilter.SHOW_TEXT);
  while (textWalker.nextNode()) {
    const node = textWalker.currentNode;
    let t = node.nodeValue.replace(PART, fakePart);
    t = t.replace(MONEY, (m) => `$${fakePrice(m)}`);
    if (node.parentElement?.closest("td[class*='_priceCell']")) {
      t = t.replace(BARE, fakePrice);
    }
    node.nodeValue = t;
  }

  for (const a of page.querySelectorAll("a[class*='_partNumberLink']")) {
    const num = a.textContent.trim();
    if (/^\d{5}A\d{3}$/.test(num)) {
      a.setAttribute("href", `/${num}/`);
    }
  }

  let path = "";
  try {
    const u = new URL(source);
    path = u.pathname + u.search;
  } catch (_e) {
    path = "";
  }
  const esc = (s) => s.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
  const out = `${[
    "<!DOCTYPE html>",
    '<html lang="en">',
    "<head>",
    '<meta charset="utf-8">',
    `<title>McMaster fixture: ${esc(name)}</title>`,
    path ? `<meta name="fixture-source" content="${esc(path)}">` : "",
    "</head>",
    "<body>",
    page.outerHTML,
    "</body>",
    "</html>",
  ]
    .filter(Boolean)
    .join("\n")}\n`;

  if (EMAIL.test(out)) {
    throw new Error(`${name}: an email address survived sanitizing`);
  }
  return { out, parts: parts.size, prices: prices.size };
}

const files =
  process.argv.length > 2
    ? process.argv.slice(2)
    : readdirSync(rawDir)
        .filter((f) => f.endsWith(".html"))
        .map((f) => join(rawDir, f));

mkdirSync(outDir, { recursive: true });

for (const file of files) {
  const name = basename(file, ".html");
  const html = readFileSync(file, "utf8");
  const { out, parts, prices } = sanitize(html, name);
  writeFileSync(join(outDir, `${name}.html`), out);
  const kb = (s) => `${(s.length / 1024).toFixed(0)} KB`;
  console.log(
    `${name}: ${parts} part numbers, ${prices} prices, ${kb(html)} -> ${kb(out)}`,
  );
}
