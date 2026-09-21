// Loads the userscript into jsdom for each saved fixture and checks the parsed records.

import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { JSDOM, VirtualConsole } from "jsdom";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const script = readFileSync(
  join(root, "mcmaster-catalog-tools.user.js"),
  "utf8",
);
const fixtureDir = join(root, "fixtures");
const fixtures = existsSync(fixtureDir)
  ? readdirSync(fixtureDir).filter((f) => f.endsWith(".html"))
  : [];

function load(file) {
  const html = readFileSync(join(fixtureDir, file), "utf8");
  const virtualConsole = new VirtualConsole();
  virtualConsole.on("warn", (...a) =>
    console.warn(
      "   ",
      ...a.map((x) => (typeof x === "string" ? x : "<node>")),
    ),
  );
  const dom = new JSDOM(html, {
    url: "https://www.mcmaster.com/products/fixture/",
    runScripts: "outside-only",
    virtualConsole,
  });
  dom.window.__mctNoAutoInit = true;
  dom.window.eval(script);
  return dom.window;
}

const plain = (x) => JSON.parse(JSON.stringify(x));
const eq = (actual, expected, msg) =>
  assert.deepEqual(plain(actual), plain(expected), msg);
const pick = (needle) =>
  fixtures.find((f) => decodeURIComponent(f).includes(needle));
const summary = (d) =>
  `org1=${d.org1s.size} org2=${d.org2s.size} tables=${d.tables.length} rows=${d.tables.reduce((n, t) => n + t.rows.length, 0)} records=${d.records.length} pending=${d.pending}`;
const specKeys = (r) => Object.keys(r.specs);

let failures = 0;
let checks = 0;

function check(name, fn) {
  checks++;
  try {
    fn();
    console.log(`ok   ${name}`);
  } catch (e) {
    failures++;
    console.log(`FAIL ${name}\n     ${e.message}`);
  }
}

const pending = [];

function checkAsync(name, fn) {
  checks++;
  pending.push(
    fn().then(
      () => console.log(`ok   ${name}`),
      (e) => {
        failures++;
        console.log(`FAIL ${name}\n     ${e.message}`);
      },
    ),
  );
}

const until = (cond, ms = 5000) =>
  new Promise((resolve, reject) => {
    const started = Date.now();
    const tick = () => {
      if (cond()) {
        resolve();
      } else if (Date.now() - started > ms) {
        reject(new Error("timed out"));
      } else {
        setTimeout(tick, 50);
      }
    };
    tick();
  });

function fixture(needle, fn) {
  const file = pick(needle);
  if (!file) {
    console.log(`skip ${needle}: no fixture in fixtures/`);
    return;
  }

  const win = load(file);
  fn(win, win.__mct.parseDocument(win.document));
}

// ---- bearings ----
fixture("linear-ball-bearings", (win, d) => {
  console.log(`bearings: ${summary(d)}`);
  const t0 = d.tables[0];
  check(
    "bearings: 6 spec tables, 207 records (one per part link), no warnings",
    () => {
      assert.equal(d.tables.length, 6);
      assert.equal(
        d.records.length,
        win.document.querySelectorAll("a[class*='_partNumberLink']").length,
      );
      eq(
        d.tables.flatMap((t) => t.warnings),
        [],
      );
    },
  );
  check(
    "bearings: first table has 3 header rows, groups Bearings (primary) + Retaining Rings",
    () => {
      assert.equal(t0.headerRows, 3);
      const groups = [...new Set(t0.columns.map((c) => c.group))];
      eq(groups, ["Bearings", "Retaining Rings"]);
      assert.ok(t0.columns.find((c) => c.group === "Bearings").primary);
    },
  );
  check("bearings: bearing record specs, prices, breadcrumb", () => {
    const r = t0.records[0];
    assert.equal(r.partNumber, "90001A101");
    assert.equal(r.url, "https://www.mcmaster.com/90001A101/");
    assert.equal(r.group, "Bearings");
    eq(r.prices, [
      { label: "Each", amount: 672.84, raw: "$672.84", cell: r.prices[0].cell },
    ]);
    assert.equal(r.specs["For Shaft Dia."], '1/4"');
    assert.equal(r.specs["Load Capacity, lb. > Dynamic"], "42");
    assert.equal(r.specs["Load Capacity, lb. > Static"], "25");
    eq(r.breadcrumb, [
      "Linear Ball Bearings",
      "Self-Aligning with 0.5° Misalignment Capability",
      "Bearings",
    ]);
    eq(r.rowGroup, ["Acetal Bearings with Stainless Steel Balls"]);
  });
  check(
    "bearings: retaining ring record pairs with its own price and keeps Bearings prefix on specs",
    () => {
      const r = t0.records[1];
      assert.equal(r.partNumber, "90002A102");
      assert.equal(r.group, "Retaining Rings");
      assert.equal(r.price, 20.74);
      assert.equal(r.specs["Bearings > For Shaft Dia."], '1/4"');
    },
  );
  check("bearings: later rows parse bare prices and null cells", () => {
    const r = t0.records[2];
    assert.equal(r.partNumber, "90003A103");
    assert.equal(r.price, 555.51);
    assert.equal(r.specs["Load Capacity, lb. > Static"], null);
  });
  check(
    "bearings: panel stays hidden without a sidebar, then re-homes to the bottom of the filter frame",
    () => {
      const inner = win.document.querySelector("#SpecSrch_Inner");
      const parent = inner.parentElement;
      inner.remove();
      win.__mct.init({ observe: false });
      const panel = win.document.querySelector(".mct-panel");
      const top = panel.querySelector(".mct-top");
      assert.ok(
        panel.classList.contains("mct-hidden") &&
          panel.parentElement === win.document.body,
        "hidden fallback",
      );
      assert.equal(panel.firstElementChild, top, "price waits in the panel");
      parent.append(inner);
      win.__mct.rescan();
      const frame = win.document.querySelector(
        "#SpecSrch_Inner [class*='_frame_']",
      );
      const header = frame.querySelector("[class*='_specFrameHeader']");
      assert.equal(header.nextElementSibling, top, "price is under the header");
      assert.equal(
        frame.lastElementChild,
        panel,
        "panel is last child of the frame",
      );
      assert.ok(!panel.classList.contains("mct-hidden"));
      assert.equal(top.querySelectorAll(".mct-block").length, 1);
      assert.equal(panel.querySelectorAll(".mct-block").length, 3);
      eq(
        [...top.querySelectorAll(".mct-attr-name")].map((e) => e.textContent),
        ["Price"],
      );
      eq(
        [...panel.querySelectorAll(".mct-attr-name")].map((e) => e.textContent),
        ["Categories", "Export", "Catalog Tools Plugin Settings"],
      );
    },
  );
  check(
    "bearings: filters hide rows, dim cells, collapse blocks; tree rows show on/off/inherited states",
    () => {
      const st = win.__mct.state;
      assert.equal(st.data.records.length, 207);
      const panel = st.ui.panel;
      const top = panel.mct.top;
      assert.match(top.querySelector("[aria-label='Minimum price']").placeholder, /^\d+\.\d\d$/);
      assert.match(top.querySelector("[aria-label='Maximum price']").placeholder, /^[\d,]+\.\d\d$/);
      const rows = [...panel.querySelectorAll(".mct-value[data-key]")];
      const roots = win.__mct.treeNodes(st.data);
      const all = [];
      const walk = (ns) => {
        for (const n of ns) {
          all.push(n);
          walk(n.children);
        }
      };
      walk(roots);
      assert.equal(rows.length, all.length);
      assert.ok(
        all.length > st.data.org1s.size + st.data.org2s.size,
        "pivot groups add nodes",
      );
      assert.ok(rows.every((r) => r.classList.contains("mct-on")));
      assert.equal(
        panel.querySelectorAll(".mct-children .mct-value[data-key]").length,
        all.length - roots.length,
      );
      win.__mct.setFilters({ min: 0, max: 300 });
      const allRows = st.data.tables.flatMap((t) => t.rows);
      const hidden = allRows.filter((r) =>
        r.tr.classList.contains("mct-hidden"),
      ).length;
      const total = allRows.length;
      assert.ok(hidden > 0 && hidden < total, `hidden ${hidden} of ${total}`);
      assert.ok(
        win.document.querySelectorAll("td[class*='_partNumberCell'].mct-dim")
          .length > 0,
        "dimmed part cells",
      );
      assert.ok(
        win.document.querySelectorAll("td[class*='_priceCell'].mct-dim")
          .length > 0,
        "dimmed price cells",
      );
      const first = [...st.data.org1s.values()][0];
      win.__mct.setFilters({ min: null, max: null, disabled: [first.key] });
      assert.ok(first.blocks.every((b) => b.classList.contains("mct-hidden")));
      assert.equal(
        allRows.filter((r) => r.tr.classList.contains("mct-hidden")).length,
        first.tables.reduce((n, t) => n + t.rows.length, 0),
      );
      const rowOf = (key) =>
        panel.querySelector(
          `.mct-value[data-key="${key.replace(/"/g, '\\"')}"]`,
        );
      assert.ok(
        rowOf(first.key).classList.contains("mct-off"),
        "parent row off",
      );
      assert.equal(rowOf(first.key).getAttribute("aria-checked"), "false");
      const childKeys = [...first.org2s.keys()];
      assert.ok(childKeys.length >= 2);
      const under = (key) =>
        [
          ...rowOf(key)
            .closest(".mct-node")
            .querySelectorAll(".mct-value[data-key]"),
        ].filter((r) => r !== rowOf(key));
      const descendants = under(first.key);
      assert.ok(
        descendants.length > childKeys.length,
        "pivot groups nest under sub-categories",
      );
      assert.ok(
        descendants.every(
          (r) =>
            r.classList.contains("mct-inh") &&
            r.getAttribute("aria-checked") === "mixed",
        ),
        "descendants inherit off",
      );
      assert.ok(
        rows.filter((r) => r.classList.contains("mct-on")).length ===
          rows.length - 1 - descendants.length,
        "others stay on",
      );
      rowOf(childKeys[0]).click();
      assert.ok(
        rowOf(childKeys[0]).classList.contains("mct-off"),
        "clicked child is own-off",
      );
      rowOf(first.key).click();
      assert.ok(
        rowOf(first.key).classList.contains("mct-on") &&
          rowOf(childKeys[1]).classList.contains("mct-on") &&
          rowOf(childKeys[0]).classList.contains("mct-off"),
      );
      assert.ok(
        under(childKeys[0]).every((r) => r.classList.contains("mct-inh")),
        "own-off child's groups inherit",
      );
      assert.ok(
        under(childKeys[1]).every((r) => r.classList.contains("mct-on")),
        "re-enabled sibling's groups are on",
      );
      assert.ok(
        st.data.org2s
          .get(childKeys[0])
          .blocks.every((b) => b.classList.contains("mct-hidden")),
        "own-off child block hidden",
      );
      win.__mct.setFilters({ disabled: [] });
      assert.equal(win.document.querySelectorAll(".mct-hidden").length, 0);
      const exp = win.__mct.buildExport(false);
      assert.equal(exp.count, 207);
      eq(Object.keys(exp.items[0]), [
        "partNumber",
        "url",
        "breadcrumb",
        "category",
        "subcategory",
        "group",
        "rowGroup",
        "price",
        "prices",
        "specs",
      ]);
      assert.ok(
        panel.querySelector(".mct-status").textContent.startsWith("207 parts"),
      );
      assert.ok(
        top
          .querySelector(".mct-value:not([data-key])")
          .classList.contains("mct-on"),
        "include-no-price row reflects state",
      );
    },
  );
});

check("bearings: counts are opt-in through the settings row", () => {
  const win = load(pick("linear-ball-bearings"));
  win.__mct.init({ observe: false });
  const st = win.__mct.state;
  const panel = st.ui.panel;
  const firstCount = () =>
    panel.querySelector(".mct-value[data-key] .mct-count").textContent;
  assert.equal(st.settings.loadAll, false);
  assert.ok(panel.classList.contains("mct-nocounts"));
  assert.equal(firstCount(), "");
  assert.equal(st.ui.priming, "tables", "tree mounts by default");
  assert.equal(st.ui.veil, null, "no scrolling by default");
  assert.ok(
    panel.querySelector(".mct-status").textContent.startsWith("207 parts seen"),
  );
  panel.mct.loadAllRow.click();
  assert.equal(st.settings.loadAll, true);
  assert.ok(!panel.classList.contains("mct-nocounts"));
  assert.match(firstCount(), /^\d+\/\d+$/);
  assert.ok(
    panel.querySelector(".mct-status").textContent.startsWith("207 parts ·"),
  );
  assert.equal(
    JSON.parse(win.localStorage.getItem("mct.prefs")).settings.loadAll,
    true,
  );
});

checkAsync("bearings: export loads every row first, then counts come on", async () => {
  const win = load(pick("linear-ball-bearings"));
  win.__mct.init({ observe: false });
  const st = win.__mct.state;
  const panel = st.ui.panel;
  assert.equal(st.settings.loadAll, false);
  assert.ok(!win.__mct.rowsComplete(), "page starts incomplete");
  const copy = win.__mct.copyJson(false);
  await until(() => st.ui.priming === "rows");
  assert.equal(panel.mct.msg.textContent, "Loading all rows first…");
  await copy;
  assert.ok(win.__mct.rowsComplete(), "page complete after export");
  assert.ok(!st.ui.priming);
  assert.equal(panel.mct.msg.textContent, "All rows loaded. Click Copy again.");
  assert.ok(!panel.classList.contains("mct-nocounts"), "counts on once complete");
  assert.ok(
    panel.querySelector(".mct-status").textContent.startsWith("207 parts ·"),
  );
  assert.equal(win.__mct.buildExport(false).count, 207);
  await win.__mct.copyJson(false);
  assert.match(panel.mct.msg.textContent, /^Copy failed/);
});

// ---- tubing (search page, lazy tables) ----
fixture("tubing-search", (win, d) => {
  console.log(`tubing: ${summary(d)}`);
  check("tubing: 2 rendered tables, 15 pending, org1 + org2 present", () => {
    assert.equal(d.tables.length, 2);
    assert.equal(d.pending, 15);
    assert.ok(d.org1s.size >= 10 && d.org2s.size >= 15);
    eq(
      d.tables.flatMap((t) => t.warnings),
      [],
    );
  });
  check("tubing: length-priced columns and null prices", () => {
    const r = d.tables[0].records[0];
    eq(
      r.prices.map((p) => p.label),
      ['2" Long', '4" Long', '6" Long', '8" Long'],
    );
    eq(
      r.prices.map((p) => p.amount),
      [null, null, 611.02, 672.84],
    );
    assert.equal(r.price, 611.02);
    eq(
      d.tables[1].records[0].prices.map((p) => p.label),
      ["1 ft. Long", "3 ft. Long", "6 ft. Long", "8 ft. Long"],
    );
  });
  check("tubing: two-level row groups", () => {
    eq(d.tables[0].records[0].rowGroup, ["Seamless", "304 Stainless Steel"]);
    assert.ok(
      d.tables[0].records.some((r) => r.rowGroup[1] === "316 Stainless Steel"),
    );
  });
  check("tubing: site breadcrumb captured", () => {
    assert.equal(d.siteBreadcrumb[0], "Fluid Handling");
  });
});

// ---- nuts ----
fixture("mil-spec-hex-nuts", (win, d) => {
  console.log(`nuts: ${summary(d)}`);
  check(
    "nuts: 4 tables, Pkg. Qty. is a spec and Pkg. is the price label",
    () => {
      assert.equal(d.tables.length, 4);
      for (const t of d.tables) {
        eq(t.warnings, []);
        const r = t.records[0];
        assert.ok("Pkg. Qty." in r.specs, specKeys(r).join(","));
        eq(
          r.prices.map((p) => p.label),
          ["Pkg."],
        );
        assert.equal(r.group, null);
      }
      assert.equal(d.tables[0].records[0].partNumber, "90001A101");
      assert.equal(d.tables[0].records[0].price, 672.84);
    },
  );
});

// ---- screws (leaf page, two part columns) ----
fixture("socket-head-screws", (win, d) => {
  console.log(`screws: ${summary(d)}`);
  const t = d.tables[0];
  check(
    "screws: one table, 370 rows, Small Pack / Large Pack part columns",
    () => {
      assert.equal(d.tables.length, 1);
      assert.equal(t.rows.length, 370);
      eq(t.warnings, []);
      eq(
        t.columns.filter((c) => c.kind === "part").map((c) => c.group),
        ["Small Pack", "Large Pack"],
      );
      assert.equal(d.org1s.size, 1);
      assert.equal(d.org2s.size, 0);
    },
  );
  check(
    "screws: row with a missing large-pack part yields one record; keys carry other-group prefix",
    () => {
      const first = t.rows[0].records;
      assert.equal(first.length, 1);
      const r = first[0];
      assert.equal(r.group, "Small Pack");
      assert.equal(r.partNumber, "90001A101");
      assert.equal(r.specs["Pkg. Qty."], "5");
      assert.equal(r.specs["Large Pack > Pkg. Qty."], null);
      assert.equal(r.specs["Head, mm > Dia."], "2.6");
      assert.equal(r.specs["Lg., mm"], "2");
      eq(
        r.prices.map((p) => p.label),
        ["Pkg."],
      );
      eq(r.rowGroup, ["18-8 Stainless Steel", "M1.4 × 0.3 mm"]);
      eq(r.breadcrumb, ["Stainless Steel Socket Head Screws", "Small Pack"]);
    },
  );
  check("screws: large-pack records exist with their own price", () => {
    const lp = t.records.filter((r) => r.group === "Large Pack");
    assert.ok(lp.length > 0);
    assert.ok(
      lp.every((r) => r.prices.length === 1 && r.prices[0].label === "Pkg."),
    );
    assert.ok(lp.some((r) => r.price != null));
  });
});

// ---- lead screws (pivot rows as groups under each sub-category) ----
fixture("lead-screws-and-nuts", (win, d) => {
  console.log(`lead screws: ${summary(d)}`);
  const nativeInnerHeight = Object.getOwnPropertyDescriptor(win, "innerHeight");
  check("lead screws: 21 tables under 2 categories, all grouped by pivot rows", () => {
    assert.equal(d.tables.length, 21);
    assert.equal(d.org1s.size, 2);
    assert.equal(d.org2s.size, 21);
    assert.ok(d.tables.every((t) => t.pivots.length > 0));
    eq(
      d.tables.flatMap((t) => t.warnings),
      [],
    );
  });
  check("lead screws: tree nests pivot groups under their sub-category", () => {
    const roots = win.__mct.treeNodes(d);
    assert.equal(roots.length, 2);
    const sub = roots[0].children[0];
    assert.equal(sub.key, d.tables[0].org2.key);
    eq(
      sub.children.map((n) => n.name),
      d.tables[0].pivots.map((p) => p.title),
    );
    assert.equal(
      sub.children[0].records.length,
      d.tables[0].pivots[0].rows.length,
    );
    assert.ok(sub.children[0].key.startsWith(`${sub.key}/p:`));
    const twin = roots[0].children[1].children.find(
      (n) => n.name === sub.children[0].name,
    );
    assert.ok(
      twin && twin.key !== sub.children[0].key,
      "same title under another sub-category is a separate node",
    );
  });
  check("lead screws: disabling a group hides exactly its rows and header", () => {
    win.__mct.state.settings.loadAll = true;
    win.__mct.init({ observe: false });
    const st = win.__mct.state;
    const t0 = st.data.tables[0];
    const group = t0.pivots[0];
    win.__mct.setFilters({ disabled: [group.key] });
    const hidden = t0.rows.filter((r) =>
      r.tr.classList.contains("mct-hidden"),
    );
    assert.equal(hidden.length, group.rows.length);
    assert.ok(hidden.every((r) => r.l2 === group));
    assert.ok(group.tr.classList.contains("mct-hidden"), "group header hidden");
    assert.ok(
      !t0.pivots[1].tr.classList.contains("mct-hidden"),
      "sibling header visible",
    );
    const panel = st.ui.panel;
    const row = [...panel.querySelectorAll(".mct-value[data-key]")].find(
      (r) => r.getAttribute("data-key") === group.key,
    );
    assert.ok(row.classList.contains("mct-off"));
    assert.equal(
      row.querySelector(".mct-count").textContent,
      `0/${group.rows.length}`,
    );
    win.__mct.setFilters({ disabled: [] });
    assert.equal(win.document.querySelectorAll(".mct-hidden").length, 0);
  });
  check("lead screws: groups stay in the tree after their rows unmount", () => {
    const st = win.__mct.state;
    const t0 = st.data.tables[0];
    const subKey = t0.org2.key;
    const titles = t0.pivots.map((p) => p.title);
    assert.ok(st.groups.size > 0, "registry filled by rescan");
    for (const p of t0.pivots) {
      p.tr.remove();
    }
    for (const r of t0.rows) {
      r.tr.remove();
    }
    win.__mct.rescan();
    assert.equal(st.data.tables[0].pivots.length, 0, "no live pivots left");
    const sub = win.__mct
      .treeNodes(st.data)[0]
      .children.find((n) => n.key === subKey);
    eq(
      sub.children.map((n) => n.name),
      titles,
    );
    assert.ok(sub.children.every((n) => n.records.length === 0));
    const panel = st.ui.panel;
    const rendered = [...panel.querySelectorAll(".mct-value[data-key]")].map(
      (r) => r.getAttribute("data-key"),
    );
    assert.ok(sub.children.every((n) => rendered.includes(n.key)));
  });
  check("lead screws: counts and export come from every part seen, not mounted rows", () => {
    const st = win.__mct.state;
    const t0 = st.data.tables[0];
    const subKey = t0.org2.key;
    assert.equal(st.data.tables[0].rows.length, 0, "table 0 rows unmounted");
    assert.equal(st.data.records.length, 502 - 370, "mounted records shrink");
    assert.equal(win.__mct.buildExport(false).count, 502, "export keeps them");
    const panel = st.ui.panel;
    assert.ok(
      panel.querySelector(".mct-status").textContent.startsWith("502 parts"),
    );
    const text = (key) =>
      [...panel.querySelectorAll(".mct-value[data-key]")]
        .find((r) => r.getAttribute("data-key") === key)
        .querySelector(".mct-count").textContent;
    assert.equal(text(subKey), "370/370");
    assert.equal(text(`${subKey}/p:Carbon Steel`), "99/99");
    win.__mct.setFilters({ disabled: [subKey] });
    assert.equal(text(subKey), "0/370");
    assert.equal(win.__mct.buildExport(true).count, 502 - 370);
    win.__mct.setFilters({ disabled: [] });
  });
  checkAsync("lead screws: priming spoofs the viewport once, then restores it", async () => {
    const st = win.__mct.state;
    assert.ok(st.ui.priming, "priming starts with init");
    assert.ok(win.innerHeight > 768, `spoofed height ${win.innerHeight}`);
    const restored = () =>
      Object.getOwnPropertyDescriptor(win, "innerHeight").get ===
      nativeInnerHeight.get;
    await until(() => !st.ui.priming && restored());
    assert.equal(win.innerHeight, 768);
    win.__mct.primeLazyTables();
    assert.ok(!st.ui.priming, "does not prime the same page twice");
  });
});

await Promise.all(pending);

if (!checks) {
  console.log("no fixtures in fixtures/, nothing checked; see DEVELOPMENT.md");
  process.exit(0);
}

console.log(failures ? `\n${failures} check(s) failed` : "\nall checks passed");
process.exit(failures ? 1 : 0);
