// Checks that every stored version agrees, or copies package.json's version into the script and lockfile.
// Usage: version.mjs check [--staged] [--tag vX.Y.Z] | version.mjs sync

import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const SCRIPT = "mcmaster-catalog-tools.user.js";
const HEADER = /^(\/\/ @version\s+)(\S+)\r?$/m;
const CONST = /^(\s*const VERSION = ")([^"]+)(";)\r?$/m;

const [mode, ...args] = process.argv.slice(2);
const staged = args.includes("--staged");
const tagAt = args.indexOf("--tag");
const tag = tagAt === -1 ? null : args[tagAt + 1];

function read(file) {
  if (staged) {
    return execFileSync("git", ["show", `:${file}`], {
      cwd: root,
      encoding: "utf8",
    });
  }

  return readFileSync(join(root, file), "utf8");
}

function versions() {
  const script = read(SCRIPT);
  const pkg = JSON.parse(read("package.json"));
  const lock = JSON.parse(read("package-lock.json"));

  return [
    [`${SCRIPT} @version`, script.match(HEADER)?.[2]],
    [`${SCRIPT} VERSION`, script.match(CONST)?.[2]],
    ["package.json", pkg.version],
    ["package-lock.json", lock.version],
    ['package-lock.json packages[""]', lock.packages?.[""]?.version],
  ];
}

function check() {
  const found = versions();
  if (tag) {
    found.push(["git tag", tag.replace(/^v/, "")]);
  }

  const distinct = new Set(found.map(([, v]) => v));
  if (distinct.size === 1 && !distinct.has(undefined)) {
    console.log(`Version ${found[0][1]} everywhere${tag ? `, tag ${tag} matches` : ""}.`);
    return 0;
  }

  const width = Math.max(...found.map(([name]) => name.length));
  console.error("Versions differ:");
  for (const [name, v] of found) {
    console.error(`  ${name.padEnd(width)}  ${v ?? "(missing)"}`);
  }
  console.error("Run `node scripts/version.mjs sync` to copy package.json's version everywhere.");
  return 1;
}

function sync() {
  const v = JSON.parse(readFileSync(join(root, "package.json"), "utf8")).version;
  const scriptPath = join(root, SCRIPT);
  const script = readFileSync(scriptPath, "utf8");
  if (!HEADER.test(script) || !CONST.test(script)) {
    console.error(`Could not find @version or VERSION in ${SCRIPT}.`);
    return 1;
  }

  writeFileSync(
    scriptPath,
    script
      .replace(HEADER, (_m, lead) => `${lead}${v}`)
      .replace(CONST, (_m, lead, _old, tail) => `${lead}${v}${tail}`),
  );

  const lockPath = join(root, "package-lock.json");
  const lock = JSON.parse(readFileSync(lockPath, "utf8"));
  lock.version = v;
  if (lock.packages?.[""]) {
    lock.packages[""].version = v;
  }
  writeFileSync(lockPath, `${JSON.stringify(lock, null, 2)}\n`);

  console.log(`Set ${v} in ${SCRIPT} and package-lock.json.`);
  return 0;
}

if (mode === "check") {
  process.exit(check());
} else if (mode === "sync") {
  process.exit(sync());
} else {
  console.error("Usage: node scripts/version.mjs check [--staged] [--tag vX.Y.Z] | sync");
  process.exit(2);
}
