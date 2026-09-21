// ==UserScript==
// @name         Catalog Tools for McMaster-Carr
// @namespace    https://github.com/NathanRWoodward
// @version      0.2.0
// @description  Unofficial: price and category filters for McMaster-Carr category pages, plus JSON export of the parsed tables.
// @author       Nathan W.
// @license      MIT
// @homepageURL  https://github.com/NathanRWoodward/Catalog-Tools-for-McMaster-Carr
// @supportURL   https://github.com/NathanRWoodward/Catalog-Tools-for-McMaster-Carr/issues
// @downloadURL  https://raw.githubusercontent.com/NathanRWoodward/Catalog-Tools-for-McMaster-Carr/main/mcmaster-catalog-tools.user.js
// @updateURL    https://raw.githubusercontent.com/NathanRWoodward/Catalog-Tools-for-McMaster-Carr/main/mcmaster-catalog-tools.user.js
// @match        https://www.mcmaster.com/*
// @run-at       document-idle
// @noframes
// @grant        GM_addStyle
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        unsafeWindow
// ==/UserScript==

/* global GM_addStyle, GM_getValue, GM_setValue, unsafeWindow */
class DeltaTimer {
  constructor() {
    this.startTime = performance.now();
    this.lastTime = performance.now();
  }

  step() {
    const now = performance.now();
    const delta = now - this.lastTime;
    this.lastTime = now;
    return delta;
  }

  step_str(width = 4) {
    return this.format(this.step(), width);
  }

  total() {
    return performance.now() - this.startTime;
  }

  total_str(width = 4) {
    return this.format(this.total(), width);
  }

  format(delta, width = 4) {
    return `${new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(delta).padStart(width, " ")}`;
  }

  combo_str() {
    const total = this.total_str();
    const step = `+${this.step_str(0)}`;
    return `${total} ${step.padStart(7, " ")}`;
  }
}

(() => {
  const css = String.raw;

  const VERSION = "0.2.0";
  const PREF_KEY = "mct.prefs";

  function log(text) {
    console.log(`[MCT] ${text}`);
  }

  log(`Loading Catalog Tools for McMaster-Carr: Version ${VERSION}`);

  // Hash-tolerant selectors; McMaster's CSS-module hashes rotate per build.
  const SEL = {
    org1Header: "[class*='_org1PresentationHeader']",
    org1Title: "[class*='_org1Header_']",
    org2Header: "[class*='Org2PresentationHeader']",
    org2Title: "[class*='_subtableHeader_']",
    org2Block: ".org2-presentation",
    wheel: "[class*='_wheelContainer']",
    table: "table[class*='_table_']",
    tableContainer: "[class*='_tableContainer']",
    imgHeader: "[class*='_columnHeaderCellAboveStackPivot']",
    primaryHeader: "[class*='_columnHeaderCellForPrimaryProduct']",
    priceHeader: "[class*='_priceColumnHeaderCell']",
    filler: "[class*='_bg_']",
    dataCell: "td[class*='_cellDisplay']",
    imgCell: "td[class*='_stackPivotImagesCell']",
    pivotRow: "tr[class*='_stackPivotRow']",
    pivotTitle: "[class*='_stackPivotTitle']",
    pivotTitleTint: "[class*='_stackPivotTitleWithTint']",
    partLink: "a[class*='_partNumberLink']",
    priceCell: "td[class*='_priceCell']",
    nullCell: "[class*='_nullCell']",
    sidebarInner: "#SpecSrch_Inner",
    sidebarFrame: "[class*='_frame_']",
    frameHeader: "[class*='_specFrameHeader']",
    content: "#ProdPageContent",
    breadcrumb: "nav[class*='_breadcrumbsNav'] a",
  };

  // Mirrors the native "Filter by" sidebar rules (divider, sticky attribute header, value rows, search input, link buttons).
  const CHECK_FALLBACK = `url("data:image/svg+xml,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 width=%279%27 height=%279%27 viewBox=%270 0 10 10%27%3E%3Cpath d=%27M1.5 5.5l2.5 2.5 4.5-5%27 fill=%27none%27 stroke=%27%23069%27 stroke-width=%271.8%27/%3E%3C/svg%3E")`;
  const CSS = css`
    .mct-hidden {
      display: none !important;
    }

    .mct-dim {
      opacity: 0.3;
    }

    .mct-panel {
      font-family: HelveticaNeueeTextPro-Roman, arial, sans-serif;
      font-size: 12px;
      line-height: 14px;
      color: #333;
    }

    .mct-divider {
      border-top: 1px solid #999;
      height: 0;
      line-height: 0;
      margin: 6px 0 2px;
    }

    .mct-attr-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      position: sticky;
      top: 22px;
      background: #eee;
      z-index: 3;
    }

    .mct-attr-name {
      font-family: HelveticaNeueeTextPro-Md, arial, sans-serif;
      font-size: 12px;
      font-weight: 500;
      text-align: left;
      padding: 6px 0 3px 1px;
      display: inline-block;
      white-space: pre-wrap;
    }

    .mct-actions {
      display: flex;
      gap: 2px;
      align-items: center;
      flex-wrap: wrap;
      margin-left: auto;
    }

    .mct-btn {
      background: none;
      border: 0;
      border-radius: 2px;
      color: #069;
      font: inherit;
      font-size: 11px;
      line-height: 14px;
      padding: 1px 3px;
      cursor: pointer;
    }

    .mct-btn:hover {
      background: #ffffb5;
      color: #333;
    }

    .mct-range {
      display: flex;
      align-items: center;
      gap: 4px;
      margin: 2px 0 2px 1px;
    }

    .mct-input {
      border: 1px solid #999;
      border-radius: 0;
      box-sizing: border-box;
      font-family: HelveticaNeueeTextPro-Roman, arial, sans-serif;
      font-size: 12px;
      height: 24px;
      text-indent: 5px;
      width: 64px;
      min-width: 0;
      background: #fff;
      color: #333;
    }

    .mct-input:focus {
      outline: none;
      border-color: #069;
    }

    .mct-money {
      position: relative;
      display: inline-flex;
      align-items: center;
      flex: 1 1 0;
      min-width: 0;
    }

    .mct-money::before {
      content: "$";
      position: absolute;
      left: 6px;
      color: #666;
      font-size: 12px;
      pointer-events: none;
    }

    .mct-money .mct-input {
      width: 100%;
      padding-left: 15px;
      text-indent: 0;
    }

    .mct-input.mct-nomax::placeholder {
      font-size: 16px;
    }

    .mct-values {
      display: flex;
      flex-direction: column;
      border: 1px solid transparent;
      width: 100%;
    }

    .mct-value {
      color: #069;
      padding: 3px 0 1px 12px;
      line-height: 14px;
      display: flex;
      justify-content: space-between;
      align-items: baseline;
      gap: 6px;
      position: relative;
      cursor: pointer;
      background-repeat: no-repeat;
      background-position: 1px 5px;
      outline: none;
    }

    .mct-value.mct-depth-0 {
      color: #333;
      background-color: #e2e2e2;
      padding-top: 4px;
      padding-bottom: 2px;
      background-position: 1px 6px;
    }

    .mct-depth-0 .mct-name,
    .mct-depth-1 .mct-name {
      font-family: HelveticaNeueeTextPro-Md, arial, sans-serif;
      font-weight: 500;
    }

    .mct-depth-2 .mct-name {
      font-size: 11px;
    }

    .mct-values > .mct-node + .mct-node {
      margin-top: 6px;
    }

    .mct-value:hover,
    .mct-value:focus-visible {
      color: #000;
      background-color: #ffffb5;
    }

    .mct-node {
      position: relative;
    }

    .mct-children {
      margin-left: 5px;
      padding-left: 10px;
    }

    /* Three pieces per node (line above the tick, the tick, line below) so a hover can colour just the path to the root. */
    .mct-children > .mct-node::before,
    .mct-children > .mct-node:not(:last-child)::after,
    .mct-children > .mct-node > .mct-value::before {
      content: "";
      position: absolute;
      left: -10px;
      border: 0 solid #bbb;
    }

    .mct-children > .mct-node::before {
      top: 0;
      height: 11px;
      border-left-width: 1px;
    }

    .mct-children > .mct-node:not(:last-child)::after {
      top: 11px;
      bottom: 0;
      border-left-width: 1px;
    }

    .mct-children > .mct-node > .mct-value::before {
      left: -9px;
      top: 10px;
      width: 7px;
      border-top-width: 1px;
    }

    .mct-children > .mct-node:hover::before,
    .mct-children > .mct-node:hover > .mct-value::before,
    .mct-children > .mct-node:has(~ .mct-node:hover)::before,
    .mct-children > .mct-node:has(~ .mct-node:hover)::after {
      border-color: #333;
    }

    .mct-value.mct-on {
      background-image: var(--checkmark, ${CHECK_FALLBACK});
    }

    .mct-value.mct-inh {
      background-image: linear-gradient(#999, #999);
      background-size: 8px 2px;
      background-position: 1px 9px;
    }

    .mct-value.mct-off,
    .mct-value.mct-inh {
      color: #999;
    }

    .mct-value.mct-off:hover,
    .mct-value.mct-inh:hover {
      color: #666;
    }

    .mct-name {
      flex: 1 1 auto;
      min-width: 0;
      font-family: HelveticaNeueeTextPro-Roman, arial, sans-serif;
      font-size: 12px;
      line-height: 14px;
      text-align: left;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .mct-count {
      color: #999;
      font-size: 11px;
      white-space: nowrap;
    }

    .mct-nocounts .mct-count {
      display: none;
    }

    .mct-status {
      color: #666;
      font-size: 11px;
      padding: 3px 0 0 1px;
    }

    .mct-msg {
      color: #069;
      font-size: 11px;
      min-height: 14px;
      padding-left: 1px;
    }

    .mct-veil {
      position: fixed;
      z-index: 9998;
      display: flex;
      align-items: flex-start;
      justify-content: center;
      padding-top: 120px;
      box-sizing: border-box;
      background: rgba(255, 255, 255, 0.92);
      font-family: HelveticaNeueeTextPro-Roman, arial, sans-serif;
      font-size: 14px;
      color: #333;
    }

    #ProductPage {
      display: flex;

      #SpecSrch_Cntnr {
        display: flex !important;
      }

      #SpecSrch_Inner {
        width: unset !important;
        display: flex !important;
      }

      #SpecSrch_Inner > div {
        width: min-content !important;
        min-width: 250px;
        max-width: 500px;
      }

      #ProdPageContent {
        display: flex;
        justify-content: center;
        width: unset !important;
        flex-grow: 1;
      }
    }
  `;

  // ---------- utils ----------
  const BLOCK_TAGS = /^(DIV|P|LI|TR|TD|TH)$/;

  function text(node) {
    if (!node) {
      return "";
    }

    let out = "";
    const walk = (n) => {
      if (n.nodeType === 3) {
        out += n.nodeValue;
        return;
      }
      if (n.nodeType !== 1) {
        return;
      }
      if (n.tagName === "BR") {
        out += " ";
        return;
      }
      if (n.tagName === "SCRIPT" || n.tagName === "STYLE") {
        return;
      }

      for (const c of n.childNodes) {
        walk(c);
      }

      if (BLOCK_TAGS.test(n.tagName)) {
        out += " ";
      }
    };

    walk(node);
    return out.replace(/\s+/g, " ").trim();
  }

  function parsePrice(raw) {
    const m = String(raw || "")
      .replace(/,/g, "")
      .match(/\d+(?:\.\d+)?/);
    return m ? Number(m[0]) : null;
  }

  const isNullText = (t) => t === "" || /^[—–-]+$/.test(t);
  const num = (v) =>
    v === "" || v == null || !Number.isFinite(+v) ? null : +v;

  const debounce = (fn, ms) => {
    let t;
    return () => {
      clearTimeout(t);
      t = setTimeout(fn, ms);
    };
  };

  const toggle = (el, cls, on) => {
    if (el) {
      el.classList.toggle(cls, !!on);
    }
  };

  const warn = (...a) => console.warn("[mct]", ...a);

  // Product page URL without the search query the site appends on result pages.
  function absUrl(a) {
    try {
      const u = new URL(a.getAttribute("href") || "", a.ownerDocument.baseURI);
      return u.origin + u.pathname;
    } catch (_e) {
      return a.href || "";
    }
  }

  const store = {
    get(key, fallback) {
      try {
        const raw =
          typeof GM_getValue === "function"
            ? GM_getValue(key)
            : localStorage.getItem(key);
        return raw == null ? fallback : JSON.parse(raw);
      } catch (_) {
        return fallback;
      }
    },

    set(key, value) {
      try {
        const raw = JSON.stringify(value);
        if (typeof GM_setValue === "function") {
          GM_setValue(key, raw);
        } else {
          localStorage.setItem(key, raw);
        }
      } catch (_) {
        /* storage unavailable */
      }
    },
  };

  function addStyle(css) {
    if (typeof GM_addStyle === "function") {
      return GM_addStyle(css);
    }

    const s = document.createElement("style");
    s.textContent = css;
    document.head.appendChild(s);
    return s;
  }

  function h(tag, props, ...children) {
    const el = document.createElement(tag);

    for (const [k, v] of Object.entries(props || {})) {
      if (k === "class") {
        el.className = v;
      } else if (k === "text") {
        el.textContent = v;
      } else if (k.startsWith("on")) {
        el.addEventListener(k.slice(2), v);
      } else if (v != null) {
        el.setAttribute(k, v);
      }
    }

    for (const c of children.flat()) {
      if (c != null) {
        el.append(c.nodeType ? c : String(c));
      }
    }

    return el;
  }

  // ---------- parser ----------
  function parseHeader(table) {
    const thead = table.tHead || table.querySelector("thead");
    if (!thead) {
      return null;
    }

    const rows = [...thead.rows];
    if (!rows.length) {
      return null;
    }

    const grid = [];
    rows.forEach((tr, r) => {
      grid[r] = grid[r] || [];
      let c = 0;
      for (const cell of tr.children) {
        while (grid[r][c]) {
          c++;
        }

        const cs = Math.max(1, parseInt(cell.getAttribute("colspan"), 10) || 1);
        const rs = Math.max(1, parseInt(cell.getAttribute("rowspan"), 10) || 1);

        for (let i = 0; i < rs; i++) {
          grid[r + i] = grid[r + i] || [];
          for (let j = 0; j < cs; j++) {
            grid[r + i][c + j] = cell;
          }
        }

        c += cs;
      }
    });

    const width = Math.max(...grid.map((r) => r.length));
    const columns = [];

    for (let c = 0; c < width; c++) {
      const cells = grid.map((r) => r[c]).filter(Boolean);
      const top = grid[0][c];
      const leaf = cells[cells.length - 1];
      const path = [];
      let prev = null;

      for (const cell of cells) {
        if (cell === prev) {
          continue;
        }

        prev = cell;
        const t = text(cell);
        if (t) {
          path.push(t);
        }
      }

      const topSpan = top ? parseInt(top.getAttribute("colspan"), 10) || 1 : 1;
      columns.push({
        index: c,
        path,
        label: path[path.length - 1] || "",
        group: topSpan > 1 ? text(top) || null : null,
        primary: topSpan > 1 && top.matches(SEL.primaryHeader),
        isImg: cells.some((cell) => cell.matches(SEL.imgHeader)),
        isFiller: !!leaf && leaf.matches(SEL.filler),
        isPriceHeader: !!leaf && leaf.matches(SEL.priceHeader),
      });
    }

    return { columns, width, rowCount: rows.length };
  }

  function isSpecTable(table) {
    return !!(
      table.querySelector(SEL.partLink) ||
      table.querySelector(SEL.priceCell) ||
      table.querySelector(SEL.priceHeader)
    );
  }

  // Data rows carry varying classes (_row_, _delimiterLinesBlack_); image, spacer and empty rows do not have spec cells.
  function isDataRow(tr) {
    return (
      tr.children.length >= 2 &&
      !tr.querySelector(`:scope > ${SEL.imgCell}`) &&
      !!tr.querySelector(`:scope > ${SEL.dataCell}`)
    );
  }

  function parseTable(table, ctx, tableIndex) {
    const info = {
      table,
      index: tableIndex,
      container: table.closest(SEL.tableContainer) || table,
      org1: ctx.org1 || null,
      org2: ctx.org2 || null,
      columns: [],
      rows: [],
      pivots: [],
      tbodies: [],
      records: [],
      warnings: [],
      visibleRows: 0,
      headerRows: 0,
    };

    const header = parseHeader(table);
    if (!header) {
      info.warnings.push("no thead");
      return info;
    }

    const cols = header.columns.filter((c) => !c.isImg && !c.isFiller);
    info.columns = cols;
    info.headerRows = header.rowCount;

    let l1 = null;
    let l2 = null;

    for (const tbody of table.tBodies) {
      const tb = { el: tbody, rows: [], pivots: [] };

      for (const tr of tbody.rows) {
        if (tr.matches(SEL.pivotRow)) {
          const level = tr.querySelector(SEL.pivotTitleTint) ? 1 : 2;
          const p = {
            tr,
            level,
            title: text(tr.querySelector(SEL.pivotTitle) || tr),
            parent: level === 2 ? l1 : null,
            rows: [],
            key: "",
          };

          if (level === 1) {
            l1 = p;
            l2 = null;
          } else {
            l2 = p;
          }

          info.pivots.push(p);
          tb.pivots.push(p);
          continue;
        }

        if (!isDataRow(tr)) {
          continue;
        }

        const cells = [...tr.children].filter((td) => !td.matches(SEL.filler));
        const row = { tr, cells, l1, l2, records: [], visible: true };
        info.rows.push(row);
        tb.rows.push(row);
        if (l1) {
          l1.rows.push(row);
        }
        if (l2) {
          l2.rows.push(row);
        }
      }

      info.tbodies.push(tb);
    }

    if (!info.rows.length) {
      return info;
    }

    const width = info.rows[0].cells.length;
    if (width !== cols.length) {
      info.warnings.push(
        `column mismatch: header ${cols.length} vs row ${width}`,
      );
      warn(info.warnings[0], table);
      info.rows = [];
      return info;
    }

    cols.forEach((col, i) => {
      col.isPrice =
        col.isPriceHeader ||
        info.rows.some((r) => r.cells[i]?.matches(SEL.priceCell));
      col.isPart =
        !col.isPrice &&
        info.rows.some((r) => r.cells[i]?.querySelector(SEL.partLink));
      col.kind = col.isPrice ? "price" : col.isPart ? "part" : "spec";
    });

    const byKind = (kind) =>
      cols.map((c, i) => ({ c, i })).filter((x) => x.c.kind === kind);
    const partCols = byKind("part");
    const priceCols = byKind("price");
    const specCols = byKind("spec");

    info.rows.forEach((row, rowIndex) => {
      if (row.cells.length !== cols.length) {
        return;
      }

      for (const { c: pc, i: pi } of partCols) {
        const link = row.cells[pi].querySelector(SEL.partLink);
        if (!link) {
          continue;
        }

        const group = pc.group;
        let mine = priceCols.filter((x) => x.c.group === group);
        if (!mine.length) {
          mine = priceCols;
        }

        const prices = mine.map(({ c, i }) => {
          const cell = row.cells[i];
          const raw = text(cell);
          return { label: c.label, amount: parsePrice(raw), raw, cell };
        });

        const specs = {};
        for (const { c, i } of specCols) {
          const path = group && c.path[0] === group ? c.path.slice(1) : c.path;
          let key = path.join(" > ") || c.label || `column ${i + 1}`;
          if (key in specs) {
            key = `${key} (${i + 1})`;
          }

          const cell = row.cells[i];
          const value = cell.matches(SEL.nullCell) ? "" : text(cell);
          specs[key] = isNullText(value) ? null : value;
        }

        const amounts = prices.map((p) => p.amount).filter((a) => a != null);
        const rec = {
          key: `${tableIndex}|${rowIndex}|${pi}`,
          partNumber: text(link),
          url: absUrl(link),
          group: group || null,
          prices,
          price: amounts.length ? Math.min(...amounts) : null,
          specs,
          rowGroup: [row.l1, row.l2].filter(Boolean).map((p) => p.title),
          row,
          table: info,
          partCell: row.cells[pi],
          visible: true,
          pricePass: true,
        };

        row.records.push(rec);
        info.records.push(rec);
      }
    });

    return info;
  }

  function parseDocument(doc) {
    doc = doc || document;

    const data = {
      org1s: new Map(),
      org2s: new Map(),
      tables: [],
      records: [],
      pending: doc.querySelectorAll(SEL.wheel).length,
      siteBreadcrumb: [...doc.querySelectorAll(SEL.breadcrumb)].map(text),
    };

    const markers = [
      ...doc.querySelectorAll(
        `${SEL.org1Header}, ${SEL.org2Header}, ${SEL.table}`,
      ),
    ];

    let org1 = null;
    let org2 = null;
    let tableIndex = 0;

    for (const el of markers) {
      if (el.matches(SEL.org1Header)) {
        const name = text(el.querySelector(SEL.org1Title) || el);
        const key = `c:${name}`;
        org1 = data.org1s.get(key) || {
          key,
          name,
          blocks: [],
          org2s: new Map(),
          tables: [],
          records: [],
        };

        org1.blocks.push(el.parentElement || el);
        data.org1s.set(key, org1);
        org2 = null;
        continue;
      }

      if (org1 && !org1.blocks.some((b) => b.contains(el))) {
        org1 = null;
      }

      if (el.matches(SEL.org2Header)) {
        const name = text(el.querySelector(SEL.org2Title) || el);
        const block = el.closest(SEL.org2Block) || el.parentElement || el;
        const key = `${org1 ? org1.key : "c:"}/${name}`;
        org2 = data.org2s.get(key) || {
          key,
          name,
          org1,
          blocks: [],
          tables: [],
          records: [],
        };

        org2.blocks.push(block);
        data.org2s.set(key, org2);
        if (org1 && !org1.org2s.has(key)) {
          org1.org2s.set(key, org2);
        }
        continue;
      }

      if (org2 && !org2.blocks.some((b) => b.contains(el))) {
        org2 = null;
      }

      if (!isSpecTable(el)) {
        continue;
      }

      const info = parseTable(el, { org1, org2 }, tableIndex++);
      data.tables.push(info);

      if (org1) {
        org1.tables.push(info);
        org1.records.push(...info.records);
      }
      if (org2) {
        org2.tables.push(info);
        org2.records.push(...info.records);
      }

      const base = org2 ? org2.key : org1 ? org1.key : "";
      for (const p of info.pivots) {
        p.key = `${p.parent ? p.parent.key : base}/p:${p.title}`;
      }

      for (const r of info.records) {
        r.org1 = org1;
        r.org2 = org2;
        r.breadcrumb = [
          org1?.name,
          org2 && (!org1 || org2.name !== org1.name) ? org2.name : null,
          r.group,
        ].filter(Boolean);
      }

      data.records.push(...info.records);
    }

    return data;
  }

  // ---------- state + filters ----------
  const state = {
    data: {
      org1s: new Map(),
      org2s: new Map(),
      tables: [],
      records: [],
      pending: 0,
      siteBreadcrumb: [],
    },
    filters: {
      min: null,
      max: null,
      includeNoPrice: true,
      disabled: new Set(),
    },
    groups: new Map(),
    catalog: new Map(),
    settings: { loadAll: false },
    ui: { panel: null, treeSig: "", priming: false, veil: null },
  };

  let observer = null;
  let initialized = false;
  let lastPath = null;

  function loadPrefs() {
    const p = store.get(PREF_KEY, null);
    if (!p) {
      return;
    }

    state.filters.min = num(p.min);
    state.filters.max = num(p.max);
    state.filters.includeNoPrice = p.includeNoPrice !== false;
    state.settings.loadAll = !!p.settings?.loadAll;
  }

  function savePrefs() {
    const f = state.filters;
    store.set(PREF_KEY, {
      min: f.min,
      max: f.max,
      includeNoPrice: f.includeNoPrice,
      settings: { ...state.settings },
    });
  }

  let isProcessingResize = false;

  function forceReactResize() {
    // Long pages use lazy loading. When DOM elements get suddenly hidden out from underneath the page it doesn't know to load elements that were previously off screen
    // By resizing the main window by 1px, it will reevaluate what is in view.
    if (isProcessingResize) {
      log(`Skipping resize, already processing.`);
      return;
    }

    log(`Forcing resize`);

    // 1. Target the real page window context, bypassing Tampermonkey's sandbox
    const pageWindow =
      typeof unsafeWindow !== "undefined" ? unsafeWindow : window;
    const originalHeight = pageWindow.innerHeight;
    const originalDesc = Object.getOwnPropertyDescriptor(
      pageWindow,
      "innerHeight",
    );
    isProcessingResize = true;

    // 2. Override innerHeight on the real page window object
    Object.defineProperty(pageWindow, "innerHeight", {
      get: () => originalHeight + 10, // Shift by 10px to guarantee a change notice
      configurable: true,
    });

    // 3. Construct and dispatch the event explicitly using the page context's Event constructor
    const resizeEvent = new pageWindow.Event("resize", { bubbles: true });
    pageWindow.dispatchEvent(resizeEvent);

    // 4. Wait 150ms (clears the 100ms TanStack debounce) before restoring the original height
    setTimeout(() => {
      if (originalDesc) {
        Object.defineProperty(pageWindow, "innerHeight", originalDesc);
      } else {
        // No own descriptor means the native accessor is inherited; dropping the override exposes it again.
        delete pageWindow.innerHeight;
      }

      // Dispatch a second resize event to let React scale back to the normal boundary seamlessly
      const resetEvent = new pageWindow.Event("resize", { bubbles: true });
      pageWindow.dispatchEvent(resetEvent);
      isProcessingResize = false;
    }, 150);
  }

  let primedPath = null;
  let rowsAttemptedPath = null;
  let rowsCompletePath = null;
  let primingPromise = null;

  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const rowsComplete = () => rowsCompletePath === location.pathname;
  const countsOn = () => state.settings.loadAll || rowsComplete();

  const loadedCounts = (d) =>
    `${d.tables.length} tables, ${d.tables.reduce((n, t) => n + t.pivots.length, 0)} groups, ${d.tables.reduce((n, t) => n + t.rows.length, 0)} rows mounted, ${d.pending} pending, ${state.catalog.size} parts in catalog`;

  // Groups seen on this page stay in the tree even when the virtualizer unmounts their rows.
  function rememberGroups(d) {
    for (const t of d.tables) {
      const org = t.org2 || t.org1;

      for (const p of t.pivots) {
        if (!state.groups.has(p.key)) {
          state.groups.set(p.key, {
            key: p.key,
            title: p.title,
            parentKey: p.parent ? p.parent.key : org ? org.key : "",
          });
        }
      }
    }
  }

  function ownNode(el) {
    const panel = state.ui.panel;
    const roots = [panel, panel?.mct.top, state.ui.veil].filter(Boolean);
    return roots.some((r) => r === el || r.contains(el));
  }

  // Parses the page into the registries without touching the DOM or the panel.
  function capture() {
    const d = parseDocument(document);
    rememberGroups(d);
    rememberRecords(d);
    state.data = d;
    return d;
  }

  const _nextFrame = () =>
    new Promise((resolve) => {
      if (typeof requestAnimationFrame === "function") {
        requestAnimationFrame(() => resolve());
      } else {
        setTimeout(resolve, 16);
      }
    });

  // Resolves once the DOM has been quiet for `quiet` ms, or after `max` ms regardless. Changes inside this script's own panels do not count.
  function whenSettled(quiet, max) {
    return new Promise((resolve) => {
      let timer = null;
      let cap = null;
      let watcher = null;
      const finish = () => {
        clearTimeout(timer);
        clearTimeout(cap);
        watcher.disconnect();
        resolve();
      };

      watcher = new MutationObserver((mutations) => {
        if (mutations.every((m) => ownNode(m.target))) {
          return;
        }

        clearTimeout(timer);
        timer = setTimeout(finish, quiet);
      });
      watcher.observe(document.body, { childList: true, subtree: true });
      timer = setTimeout(finish, quiet);
      cap = setTimeout(finish, max);
    });
  }

  const pageWin = () =>
    typeof unsafeWindow !== "undefined" ? unsafeWindow : window;

  // Report a viewport taller than the content so the virtualizer mounts every table shell and group header. Invisible and quick, so every page gets it.
  async function mountAllTables(timer) {
    const pageWindow = pageWin();
    const originalDesc = Object.getOwnPropertyDescriptor(
      pageWindow,
      "innerHeight",
    );
    const resize = () =>
      pageWindow.dispatchEvent(
        new pageWindow.Event("resize", { bubbles: true }),
      );
    let tall = pageWindow.innerHeight;
    let counts = loadedCounts(state.data);
    log(`Mounting all tables. Before: ${counts}`);

    for (let pass = 1; pass <= 4; pass++) {
      tall = Math.max(scrollContainer().scrollHeight * 2, tall * 2);
      Object.defineProperty(pageWindow, "innerHeight", {
        get: () => tall,
        configurable: true,
      });
      resize();
      await whenSettled(200, 2000);

      const next = loadedCounts(capture());
      log(
        `[${timer.combo_str()}] Mount pass ${pass}: viewport ${tall}px. Rendered: ${next}`,
      );
      if (next === counts) {
        break;
      }
      counts = next;
    }

    if (originalDesc) {
      Object.defineProperty(pageWindow, "innerHeight", originalDesc);
    } else {
      delete pageWindow.innerHeight;
    }
    resize();
    ensurePanel();
    updatePanel();
  }

  // Scroll through the tables so every row renders at least once and lands in the catalog. Resolves true when it got all the way through.
  async function loadAllRows(timer) {
    const scrolled = await scrollThrough();
    rescan();
    log(
      `[${timer.combo_str()}] Scrolled ${scrolled.container} in ${scrolled.steps} steps${scrolled.cancelled ? ", stopped by user input" : ""}. Rendered: ${loadedCounts(state.data)}`,
    );

    return !scrolled.cancelled;
  }

  // Once per page: mount every table so the tree is complete, and load every row when the setting asks for it or `rows` is forced. Single-flight; resolves when the requested level is reached. A run the user cancelled is not retried automatically, but a forced request tries again.
  function primeLazyTables(rows = false) {
    if (primingPromise) {
      return primingPromise.then(() => primeLazyTables(rows));
    }

    const path = location.pathname;
    const needTables = primedPath !== path;
    const needRows = rows
      ? rowsCompletePath !== path
      : state.settings.loadAll && rowsAttemptedPath !== path;
    if (!needTables && !needRows) {
      return Promise.resolve();
    }

    primingPromise = (async () => {
      while (isProcessingResize) {
        await sleep(50);
      }

      const timer = new DeltaTimer();
      isProcessingResize = true;

      try {
        if (needTables) {
          primedPath = path;
          state.ui.priming = "tables";
          await mountAllTables(timer);
        }
        if (needRows) {
          rowsAttemptedPath = path;
          state.ui.priming = "rows";
          if (await loadAllRows(timer)) {
            rowsCompletePath = path;
          }
        }
      } finally {
        isProcessingResize = false;
        state.ui.priming = false;
        primingPromise = null;
      }

      updatePanel();
      log(`[${timer.combo_str()}] Finished priming.`);

      setTimeout(() => {
        rescan();
        log(
          `[${timer.combo_str()}] One second after priming: ${loadedCounts(state.data)}`,
        );
      }, 1000);
    })();

    return primingPromise;
  }

  const describe = (el) =>
    `${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ""}${el.classList[0] ? `.${el.classList[0]}` : ""}`;

  const scrollStart = () =>
    document.querySelector(SEL.table) || document.querySelector(SEL.content);

  // The element that scrolls the tables. McMaster scrolls a column, not the document, so walk up from the first table, body and html included.
  function scrollContainer() {
    for (let el = scrollStart(); el; el = el.parentElement) {
      const overflow = getComputedStyle(el).overflowY;
      if (
        (overflow === "auto" || overflow === "scroll") &&
        el.scrollHeight > el.clientHeight + 1
      ) {
        return el;
      }
    }

    return document.scrollingElement || document.documentElement;
  }

  function scrollChain() {
    const parts = [];

    for (let el = scrollStart(); el; el = el.parentElement) {
      const overflow = getComputedStyle(el).overflowY;
      if (overflow !== "visible" || el.scrollHeight > el.clientHeight + 1) {
        parts.push(
          `${describe(el)} overflow-y=${overflow} ${el.scrollHeight}/${el.clientHeight}`,
        );
      }
    }

    return parts.length
      ? parts.join(" > ")
      : "nothing scrollable above the first table";
  }

  function showVeil(rect) {
    const veil = h("div", { class: "mct-veil" }, h("div"));
    Object.assign(veil.style, {
      top: `${rect.top}px`,
      left: `${rect.left}px`,
      width: `${rect.width}px`,
      height: `${rect.height}px`,
    });
    document.body.appendChild(veil);
    state.ui.veil = veil;

    return {
      say: (text) => {
        veil.firstChild.textContent = text;
      },
      remove: () => {
        veil.remove();
        state.ui.veil = null;
      },
    };
  }

  // Scrolls the tables' container to the bottom in viewport-sized steps behind a veil, pausing at each until the page goes quiet and recording what rendered, repeats while it keeps growing, then returns to the starting position. Wheel, touch or a key outside the panel stops it.
  async function scrollThrough() {
    const el = scrollContainer();
    const isDoc =
      el === (document.scrollingElement || document.documentElement);
    const viewport = () => (isDoc ? window.innerHeight : el.clientHeight);
    const position = () => (isDoc ? window.scrollY : el.scrollTop);
    const jump = (y) => {
      const target = isDoc ? window : el;
      if (typeof target.scrollTo === "function") {
        target.scrollTo({ top: y, behavior: "instant" });
      } else {
        el.scrollTop = y;
      }
    };
    const name = isDoc ? "the document" : describe(el);
    const startY = position();
    log(`Scroll chain: ${scrollChain()}`);
    log(
      `Scrolling ${name}: ${el.scrollHeight}px of content in a ${viewport()}px view, starting at ${startY}px`,
    );

    const events = ["wheel", "touchstart", "keydown"];
    let cancelled = false;
    let steps = 0;
    const cancel = (e) => {
      if (e.type === "keydown" && ownNode(e.target)) {
        return;
      }
      cancelled = true;
    };
    for (const ev of events) {
      window.addEventListener(ev, cancel, { passive: true });
    }

    const veil = showVeil(
      isDoc
        ? {
            top: 0,
            left: 0,
            width: window.innerWidth,
            height: window.innerHeight,
          }
        : el.getBoundingClientRect(),
    );
    const step = Math.max(200, Math.floor(viewport() * 0.9));
    let y = 0;

    for (let round = 0; round < 8 && !cancelled; round++) {
      const bottom = Math.max(0, el.scrollHeight - viewport());
      const expected = Math.ceil(bottom / step) + 1;

      while (y < bottom && !cancelled) {
        veil.say(`Loading all tables… ${steps + 1} of ${expected}`);
        jump(y);
        await whenSettled(150, 600);
        capture();
        y += step;
        steps++;
      }
      if (cancelled) {
        break;
      }

      jump(bottom);
      await whenSettled(200, 1000);
      capture();
      if (el.scrollHeight - viewport() <= bottom) {
        break;
      }
      y = bottom;
    }

    for (const ev of events) {
      window.removeEventListener(ev, cancel);
    }
    jump(startY);
    veil.remove();

    return { cancelled, steps, container: name };
  }

  function pricePasses(f, prices) {
    if (f.min == null && f.max == null) {
      return true;
    }

    const amounts = prices.map((p) => p.amount).filter((a) => a != null);
    if (!amounts.length) {
      return f.includeNoPrice;
    }

    return amounts.some(
      (a) => (f.min == null || a >= f.min) && (f.max == null || a <= f.max),
    );
  }

  const keysOff = (f, keys) => keys.some((k) => !!k && f.disabled.has(k));

  const catalogVisible = (f, r) =>
    pricePasses(f, r.prices) && !keysOff(f, r.keys);

  // Every part seen since the page loaded, so counts and export survive the virtualizer unmounting rows. The same part can sit on several rows, under different groups or with different specs, so all of that is in the key.
  function rememberRecords(d) {
    for (const r of d.records) {
      const keys = [
        r.org1 ? r.org1.key : null,
        r.org2 ? r.org2.key : null,
        r.row.l1 ? r.row.l1.key : null,
        r.row.l2 ? r.row.l2.key : null,
      ];
      const key = `${keys.join("|")}|${r.group || ""}|${r.partNumber}|${JSON.stringify(r.specs)}`;

      state.catalog.set(key, {
        keys,
        partNumber: r.partNumber,
        url: r.url,
        breadcrumb: r.breadcrumb,
        category: r.org1 ? r.org1.name : null,
        subcategory: r.org2 ? r.org2.name : null,
        group: r.group,
        rowGroup: r.rowGroup,
        price: r.price,
        prices: r.prices.map((p) => ({
          label: p.label,
          amount: p.amount,
          raw: p.raw,
        })),
        specs: r.specs,
      });
    }
  }

  function catalogCounts() {
    const f = state.filters;
    const counts = new Map();

    for (const r of state.catalog.values()) {
      const visible = catalogVisible(f, r);

      for (const k of r.keys) {
        if (!k) {
          continue;
        }

        const c = counts.get(k) || { shown: 0, total: 0 };
        c.total++;
        if (visible) {
          c.shown++;
        }
        counts.set(k, c);
      }
    }

    return counts;
  }

  function applyFilters() {
    const f = state.filters;
    const d = state.data;
    const hasRange = f.min != null || f.max != null;
    const inRange = (a) =>
      (f.min == null || a >= f.min) && (f.max == null || a <= f.max);
    const isOff = (org1, org2) =>
      (org1 && f.disabled.has(org1.key)) || (org2 && f.disabled.has(org2.key));
    const pivotOff = (p) =>
      !!p &&
      (f.disabled.has(p.key) || (!!p.parent && f.disabled.has(p.parent.key)));

    for (const t of d.tables) {
      const off = isOff(t.org1, t.org2);
      let visibleRows = 0;

      for (const row of t.rows) {
        let rowVisible = false;

        for (const rec of row.records) {
          rec.pricePass = pricePasses(f, rec.prices);

          if (rec.pricePass) {
            rowVisible = true;
          }
        }

        if (!row.records.length) {
          rowVisible = !hasRange || f.includeNoPrice;
        }

        rowVisible =
          rowVisible && !off && !pivotOff(row.l1) && !pivotOff(row.l2);
        row.visible = rowVisible;
        toggle(row.tr, "mct-hidden", !rowVisible);

        for (const rec of row.records) {
          rec.visible = rowVisible && rec.pricePass;
          toggle(rec.partCell, "mct-dim", rowVisible && !rec.pricePass);

          for (const p of rec.prices) {
            toggle(
              p.cell,
              "mct-dim",
              rowVisible && hasRange && p.amount != null && !inRange(p.amount),
            );
          }
        }

        if (rowVisible) {
          visibleRows++;
        }
      }

      for (const p of t.pivots) {
        toggle(
          p.tr,
          "mct-hidden",
          pivotOff(p) || (p.rows.length > 0 && !p.rows.some((r) => r.visible)),
        );
      }

      for (const tb of t.tbodies) {
        let hide = false;
        if (tb.rows.length) {
          hide = !tb.rows.some((r) => r.visible);
        } else if (tb.pivots.length) {
          hide = tb.pivots.every(
            (p) => p.rows.length > 0 && !p.rows.some((r) => r.visible),
          );
        }

        toggle(tb.el, "mct-hidden", hide);
      }

      t.visibleRows = visibleRows;
      toggle(t.container, "mct-hidden", t.rows.length > 0 && visibleRows === 0);
    }

    const allHidden = (tables) =>
      tables.length > 0 &&
      tables.every((t) => t.rows.length > 0 && t.visibleRows === 0);
    const hasPending = (blocks) =>
      blocks.some((b) => b.querySelector(SEL.wheel));

    for (const o of d.org2s.values()) {
      const hide =
        isOff(o.org1, o) || (!hasPending(o.blocks) && allHidden(o.tables));

      for (const b of o.blocks) {
        toggle(b, "mct-hidden", hide);
      }
    }

    for (const o of d.org1s.values()) {
      const hide =
        f.disabled.has(o.key) || (!hasPending(o.blocks) && allHidden(o.tables));

      for (const b of o.blocks) {
        toggle(b, "mct-hidden", hide);
      }
    }

    forceReactResize();
    // setTimeout(() => {
    //    forceReactResize();
    //  }, 10);
  }

  function setFilters(patch) {
    const f = state.filters;

    if ("min" in patch) {
      f.min = num(patch.min);
    }
    if ("max" in patch) {
      f.max = num(patch.max);
    }
    if (f.min != null && f.max != null && f.min > f.max) {
      const t = f.min;
      f.min = f.max;
      f.max = t;
    }

    if ("includeNoPrice" in patch) {
      f.includeNoPrice = !!patch.includeNoPrice;
    }
    if ("disabled" in patch) {
      f.disabled = new Set(patch.disabled || []);
    }

    savePrefs();
    applyFilters();
    updatePanel();

    if (observer) {
      observer.takeRecords();
    }
  }

  function setSetting(key, value) {
    state.settings[key] = value;
    savePrefs();
    updatePanel();

    if (key === "loadAll" && value) {
      primeLazyTables().catch((e) => warn("priming failed", e));
    }
  }

  // ---------- export ----------
  function buildExport(filteredOnly) {
    const d = state.data;
    const f = state.filters;
    const recs = [...state.catalog.values()].filter(
      (r) => !filteredOnly || catalogVisible(f, r),
    );

    return {
      source: {
        url: location.href,
        title: document.title,
        siteBreadcrumb: d.siteBreadcrumb,
        collectedAt: new Date().toISOString(),
        filtered: !!filteredOnly,
        filters: filteredOnly
          ? {
              min: f.min,
              max: f.max,
              includeNoPrice: f.includeNoPrice,
              disabledCategories: [...f.disabled],
            }
          : null,
        pendingSubcategories: d.pending,
        version: VERSION,
      },
      count: recs.length,
      items: recs.map((r) => ({
        partNumber: r.partNumber,
        url: r.url,
        breadcrumb: r.breadcrumb,
        category: r.category,
        subcategory: r.subcategory,
        group: r.group,
        rowGroup: r.rowGroup,
        price: r.price,
        prices: r.prices,
        specs: r.specs,
      })),
    };
  }

  function exportFileName() {
    const seg = location.pathname.split("/").filter(Boolean).pop() || "page";
    const slug =
      seg
        .replace(/[^a-z0-9]+/gi, "-")
        .replace(/^-+|-+$/g, "")
        .toLowerCase()
        .slice(0, 60) || "page";

    const d = new Date();
    const pad = (n) => String(n).padStart(2, "0");

    return `mcmaster-${slug}-${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}.json`;
  }

  function download(name, content) {
    const blob = new Blob([content], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = h("a", { href: url, download: name });

    document.body.appendChild(a);
    a.click();
    a.remove();

    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  // An export must cover the whole page, so load every row first unless that has already happened here.
  async function loadForExport() {
    if (rowsComplete()) {
      return true;
    }

    flash("Loading all rows first…");
    try {
      await primeLazyTables(true);
    } catch (e) {
      warn("loading rows for export failed", e);
    }

    return rowsComplete();
  }

  const partial = (complete) => (complete ? "" : " (page not fully loaded)");

  async function exportJson(filteredOnly) {
    const complete = await loadForExport();
    const data = buildExport(filteredOnly);
    download(exportFileName(), JSON.stringify(data, null, 2));
    flash(`Exported ${data.count} parts${partial(complete)}`);
  }

  // The clipboard only accepts writes soon after a click, so a copy that had to load rows first asks for a second click.
  async function copyJson(filteredOnly) {
    const wasComplete = rowsComplete();
    const complete = await loadForExport();
    const data = buildExport(filteredOnly);

    try {
      await navigator.clipboard.writeText(JSON.stringify(data, null, 2));
      flash(`Copied ${data.count} parts${partial(complete)}`);
    } catch (e) {
      flash(
        wasComplete
          ? `Copy failed: ${e.message}`
          : "All rows loaded. Click Copy again.",
      );
    }
  }

  // ---------- panel ----------
  function flash(message) {
    const p = state.ui.panel;
    if (!p) {
      return;
    }

    p.mct.msg.textContent = message;

    clearTimeout(p.mct.msgTimer);
    p.mct.msgTimer = setTimeout(() => {
      p.mct.msg.textContent = "";
    }, 4000);
  }

  // A native-style value row with three states: on (checkmark), off (no mark, greyed), inh (dash: on, but an ancestor is off).
  function valueRow(label, opts) {
    const row = h(
      "div",
      {
        class:
          opts.depth == null
            ? "mct-value"
            : `mct-value mct-depth-${Math.min(opts.depth, 2)}`,
        role: "checkbox",
        tabindex: "0",
        "data-key": opts.key || null,
      },
      h("span", { class: "mct-name", text: label }),
      opts.count ? h("span", { class: "mct-count" }) : null,
    );

    const fire = () => opts.onToggle(row);
    row.addEventListener("click", fire);
    row.addEventListener("keydown", (e) => {
      if (e.key === " " || e.key === "Enter") {
        e.preventDefault();
        fire();
      }
    });

    return row;
  }

  function setRowState(row, rowState) {
    row.classList.toggle("mct-on", rowState === "on");
    row.classList.toggle("mct-off", rowState === "off");
    row.classList.toggle("mct-inh", rowState === "inh");

    row.setAttribute(
      "aria-checked",
      rowState === "on" ? "true" : rowState === "inh" ? "mixed" : "false",
    );
  }

  function block(title, actions, ...body) {
    return h(
      "div",
      { class: "mct-block" },
      h("div", { class: "mct-divider" }),
      h(
        "div",
        { class: "mct-attr-header" },
        h("div", { class: "mct-attr-name", text: title }),
        actions.length ? h("div", { class: "mct-actions" }, ...actions) : null,
      ),
      ...body,
    );
  }

  function buildPanel() {
    log(`Building panel.`);

    const f = state.filters;
    const btn = (label, onclick) =>
      h("button", { type: "button", class: "mct-btn", text: label, onclick });

    const minIn = h("input", {
      class: "mct-input",
      type: "number",
      min: "0",
      step: "0.01",
      placeholder: "0.00",
      "aria-label": "Minimum price",
      value: f.min == null ? "" : f.min,
    });
    const maxIn = h("input", {
      class: "mct-input",
      type: "number",
      min: "0",
      step: "0.01",
      placeholder: "∞",
      "aria-label": "Maximum price",
      value: f.max == null ? "" : f.max,
    });

    const apply = () => setFilters({ min: minIn.value, max: maxIn.value });
    const onKey = (e) => {
      if (e.key === "Enter") {
        apply();
      }
    };
    minIn.addEventListener("keydown", onKey);
    maxIn.addEventListener("keydown", onKey);

    const noPriceRow = valueRow("Include rows without a price", {
      onToggle: () =>
        setFilters({ includeNoPrice: !state.filters.includeNoPrice }),
    });

    const filteredRow = valueRow("Filtered rows only", {
      onToggle: (row) => {
        row.mctOn = !row.mctOn;
        setRowState(row, row.mctOn ? "on" : "off");
      },
    });
    filteredRow.mctOn = false;
    setRowState(filteredRow, "off");

    const loadAllRow = valueRow("Load all tables when a page opens", {
      onToggle: () => setSetting("loadAll", !state.settings.loadAll),
    });

    const status = h("div", { class: "mct-status" });
    const msg = h("div", { class: "mct-msg" });
    const tree = h("div", { class: "mct-values" });

    const topKeys = () => treeNodes(state.data).map((n) => n.key);

    const top = h(
      "div",
      { class: "mct-panel mct-top" },
      block(
        "Price",
        [
          btn("Clear", () => {
            minIn.value = "";
            maxIn.value = "";
            apply();
          }),
        ],
        h(
          "div",
          { class: "mct-range" },
          h("span", { class: "mct-money" }, minIn),
          h("span", { text: "–" }),
          h("span", { class: "mct-money" }, maxIn),
          btn("Apply", apply),
        ),
        h("div", { class: "mct-values" }, noPriceRow),
      ),
    );

    const panel = h(
      "div",
      { class: "mct-panel" },
      block(
        "Categories",
        [
          btn("All", () => setFilters({ disabled: [] })),
          btn("None", () => setFilters({ disabled: topKeys() })),
        ],
        tree,
      ),
      block(
        "Export",
        [
          btn("JSON file", () => exportJson(filteredRow.mctOn)),
          btn("Copy", () => copyJson(filteredRow.mctOn)),
        ],
        h("div", { class: "mct-values" }, filteredRow),
        status,
        msg,
      ),
      block(
        "Catalog Tools Plugin Settings",
        [],
        h("div", { class: "mct-values" }, loadAllRow),
        h("div", {
          class: "mct-status",
          text: "Complete counts on every page, a few seconds each. Export loads everything on its own.",
        }),
      ),
    );

    panel.mct = {
      top,
      loadAllRow,
      minIn,
      maxIn,
      noPriceRow,
      filteredRow,
      status,
      msg,
      tree,
      rows: new Map(),
      msgTimer: null,
    };

    return panel;
  }

  function sidebarFrame() {
    const inner = document.querySelector(SEL.sidebarInner);
    return inner ? inner.querySelector(SEL.sidebarFrame) || inner : null;
  }

  // Price goes right under the native "Filter by" header; Categories and Export sit at the bottom of the frame. Until the frame renders, the panel waits hidden in the body and moves in on the next scan.
  function ensurePanel() {
    let panel = state.ui.panel;
    if (!panel?.isConnected) {
      panel = buildPanel();
      state.ui.panel = panel;
      state.ui.treeSig = "";
    }

    const top = panel.mct.top;
    const frame = sidebarFrame();
    if (frame) {
      const header = frame.querySelector(SEL.frameHeader);
      if (header) {
        if (header.nextElementSibling !== top) {
          header.after(top);
        }
      } else if (frame.firstElementChild !== top) {
        frame.prepend(top);
      }

      if (panel.parentElement !== frame) {
        frame.append(panel);
      }
      panel.classList.remove("mct-hidden");
    } else if (!panel.isConnected) {
      panel.classList.add("mct-hidden");
      panel.prepend(top);
      document.body.appendChild(panel);
    }

    return panel;
  }

  function toggleKey(key) {
    const disabled = new Set(state.filters.disabled);

    if (disabled.has(key)) {
      disabled.delete(key);
    } else {
      disabled.add(key);
    }

    setFilters({ disabled: [...disabled] });
  }

  // Category > sub-category > in-table group rows. Groups with the same title under the same parent merge across tables.
  function treeNodes(d) {
    const byKey = new Map();
    const roots = [];
    const add = (key, name, parent) => {
      let node = byKey.get(key);
      if (!node) {
        node = { key, name, parent, records: [], children: [] };
        byKey.set(key, node);
        (parent ? parent.children : roots).push(node);
      }

      return node;
    };

    for (const o of d.org1s.values()) {
      const node = add(o.key, o.name, null);
      node.records = o.records;

      for (const s of o.org2s.values()) {
        add(s.key, s.name, node).records = s.records;
      }
    }

    for (const s of d.org2s.values()) {
      if (!s.org1) {
        add(s.key, s.name, null).records = s.records;
      }
    }

    for (const g of state.groups.values()) {
      const parent = g.parentKey ? byKey.get(g.parentKey) : null;
      if (!g.parentKey || parent) {
        add(g.key, g.title, parent);
      }
    }

    for (const t of d.tables) {
      const org = t.org2 || t.org1;
      const base = org ? byKey.get(org.key) : null;

      for (const p of t.pivots) {
        const parent = p.parent ? byKey.get(p.parent.key) : base;
        const node = add(p.key, p.title, parent);

        for (const row of p.rows) {
          node.records.push(...row.records);
        }
      }
    }

    return roots;
  }

  function flattenTree(nodes, out = []) {
    for (const n of nodes) {
      out.push(n);
      flattenTree(n.children, out);
    }

    return out;
  }

  function renderNodes(container, nodes, rows, depth = 0) {
    for (const n of nodes) {
      const row = valueRow(n.name || "(untitled)", {
        key: n.key,
        depth,
        count: true,
        onToggle: () => toggleKey(n.key),
      });
      const el = h("div", { class: "mct-node" }, row);

      if (n.children.length) {
        const kids = h("div", { class: "mct-children" });
        renderNodes(kids, n.children, rows, depth + 1);
        el.append(kids);
      }

      rows.set(n.key, row);
      container.append(el);
    }
  }

  function renderTree() {
    const p = state.ui.panel;
    if (!p) {
      return;
    }

    const d = state.data;
    const f = state.filters;
    const tree = p.mct.tree;
    const roots = treeNodes(d);
    const nodes = flattenTree(roots);
    const sig = nodes.map((n) => n.key).join("\u0001");

    if (sig !== state.ui.treeSig) {
      state.ui.treeSig = sig;
      tree.replaceChildren();
      p.mct.rows = new Map();
      renderNodes(tree, roots, p.mct.rows);

      if (!nodes.length) {
        tree.append(
          h("div", {
            class: "mct-status",
            text: "No categories found on this page.",
          }),
        );
      }
    }

    const counts = catalogCounts();

    for (const n of nodes) {
      const row = p.mct.rows.get(n.key);
      if (!row) {
        continue;
      }

      const own = !f.disabled.has(n.key);
      let inherited = false;
      for (let a = n.parent; a; a = a.parent) {
        if (f.disabled.has(a.key)) {
          inherited = true;
        }
      }
      setRowState(row, !own ? "off" : inherited ? "inh" : "on");

      const c = counts.get(n.key) || { shown: 0, total: 0 };
      row.querySelector(".mct-count").textContent = countsOn()
        ? `${c.shown}/${c.total}`
        : "";
    }
  }

  function updatePanel() {
    const p = state.ui.panel;
    if (!p) {
      return;
    }

    const d = state.data;
    const f = state.filters;
    const catalog = [...state.catalog.values()];
    const shown = catalog.filter((r) => catalogVisible(f, r)).length;

    const parts = [
      `${catalog.length} parts${countsOn() ? "" : " seen"}`,
      `${d.tables.length} tables`,
      `${shown} shown`,
    ];
    if (d.pending) {
      parts.push(`${d.pending} not loaded`);
    }
    if (state.ui.priming) {
      parts.push(
        state.ui.priming === "rows" ? "loading all rows…" : "loading tables…",
      );
    }
    p.mct.status.textContent = parts.join(" · ");

    const amounts = catalog
      .flatMap((r) => r.prices.map((x) => x.amount))
      .filter((a) => a != null);
    const money = (n) =>
      n.toLocaleString(undefined, {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      });
    p.mct.minIn.placeholder = amounts.length
      ? money(amounts.reduce((a, b) => Math.min(a, b)))
      : "0.00";
    p.mct.maxIn.placeholder = amounts.length
      ? money(amounts.reduce((a, b) => Math.max(a, b)))
      : "∞";
    p.mct.maxIn.classList.toggle("mct-nomax", !amounts.length);

    if (document.activeElement !== p.mct.minIn) {
      p.mct.minIn.value = f.min == null ? "" : f.min;
    }
    if (document.activeElement !== p.mct.maxIn) {
      p.mct.maxIn.value = f.max == null ? "" : f.max;
    }

    setRowState(p.mct.noPriceRow, f.includeNoPrice ? "on" : "off");
    setRowState(p.mct.loadAllRow, state.settings.loadAll ? "on" : "off");
    p.classList.toggle("mct-nocounts", !countsOn());
    renderTree();
  }

  // ---------- lifecycle ----------
  let lastProductPageNotification = "never";

  function rescan(skipApply = false) {
    const partNumberRegex = /^\/?(\d{5}[A-Z]\d{2,3})\/?$/gm;
    const isProductPage = partNumberRegex.test(location.pathname);
    if (isProductPage) {
      if (lastProductPageNotification !== "notProductPage") {
        log(
          `Page is not a product category: "${location.pathname}". Skipping panel setup.`,
        );
        lastProductPageNotification = "notProductPage";
      }

      if (state.ui.panel) {
        state.ui.panel.mct.top.remove();
        state.ui.panel.remove();
      }
      state.ui.panel = null;
      return;
    }

    if (lastProductPageNotification !== "productPage") {
      log(
        `Page is a product category: "${location.pathname}". Setting up panel.`,
      );
      lastProductPageNotification = "productPage";
    }

    state.data = parseDocument(document);
    rememberGroups(state.data);
    rememberRecords(state.data);
    primeLazyTables().catch((e) => warn("priming failed", e));

    if (!skipApply) {
      applyFilters();
    }

    ensurePanel();
    updatePanel();

    if (observer) {
      observer.takeRecords();
    }
  }

  const scheduleRescan = debounce(rescan, 250);

  function onUrlChange() {
    if (location.pathname === lastPath) {
      return;
    }

    lastPath = location.pathname;
    state.filters.disabled = new Set();
    state.groups = new Map();
    state.catalog = new Map();
    state.ui.treeSig = "";

    scheduleRescan();
  }

  function hookHistory() {
    for (const method of ["pushState", "replaceState"]) {
      const original = history[method];
      if (typeof original !== "function") {
        continue;
      }

      history[method] = function (...args) {
        const result = original.apply(this, args);
        onUrlChange();
        return result;
      };
    }

    window.addEventListener("popstate", onUrlChange);
  }

  function startObserver() {
    observer = new MutationObserver((mutations) => {
      if (state.ui.priming) {
        return;
      }

      for (const m of mutations) {
        if (ownNode(m.target)) {
          continue;
        }
        scheduleRescan();
        return;
      }
    });

    observer.observe(document.body, { childList: true, subtree: true });
  }

  function init(opts) {
    opts = opts || {};

    if (initialized) {
      return;
    }

    initialized = true;
    lastPath = location.pathname;

    addStyle(CSS);
    loadPrefs();
    hookHistory();

    if (opts.observe !== false) {
      startObserver();
    }

    rescan(true);
  }

  window.__mct = {
    VERSION,
    SEL,
    text,
    parsePrice,
    parseHeader,
    parseTable,
    parseDocument,
    treeNodes,
    state,
    init,
    rescan,
    primeLazyTables,
    applyFilters,
    setFilters,
    setSetting,
    buildExport,
    exportJson,
    copyJson,
    rowsComplete,
  };

  if (
    !window.__mctNoAutoInit &&
    /(^|\.)mcmaster\.com$/.test(location.hostname)
  ) {
    init();
  }
})();
