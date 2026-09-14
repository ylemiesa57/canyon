// Static checks that need no browser: every script parses, every local asset a page references exists,
// and the house style holds (no em dashes in landing-page copy).
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const root = path.resolve(__dirname, "..");
let failures = 0;
const fail = (msg) => { failures++; console.error("  FAIL", msg); };
const ok = (msg) => console.log("  ok  ", msg);

function walk(dir, exts, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(p, exts, out);
    else if (exts.includes(path.extname(entry.name))) out.push(p);
  }
  return out;
}

console.log("Syntax");
for (const file of walk(root, [".js"]).filter((f) => !f.includes(path.sep + "tests" + path.sep))) {
  const isModule = fs.readFileSync(file, "utf8").includes("import ");
  try {
    if (isModule) execFileSync(process.execPath, ["--input-type=module", "--check"], { input: fs.readFileSync(file), stdio: ["pipe", "pipe", "pipe"] });
    else execFileSync(process.execPath, ["--check", file], { stdio: "pipe" });
    ok(path.relative(root, file));
  } catch (e) {
    fail(path.relative(root, file) + ": " + String(e.stderr || e.message).split("\n")[0]);
  }
}

console.log("Local asset references");
for (const file of walk(root, [".html"]).filter((f) => !f.includes(path.sep + "assets" + path.sep))) { // assets/ may hold saved exports
  const html = fs.readFileSync(file, "utf8");
  const refs = [...html.matchAll(/(?:href|src)="([^"#?]+)(?:[?#][^"]*)?"/g)].map((m) => m[1]).filter((u) => !/^(https?:|mailto:|data:|blob:|about:|\/\/)/.test(u) && !u.includes("{{") && !u.includes("${"));
  for (const ref of refs) {
    const target = ref.startsWith("/") ? path.join(root, ref) : path.resolve(path.dirname(file), ref);
    const candidates = [target, target + ".html"];
    if (!candidates.some((c) => fs.existsSync(c))) fail(path.relative(root, file) + " references missing " + ref);
  }
  ok(path.relative(root, file) + " (" + refs.length + " local refs)");
}

console.log("House style (landing page)");
for (const file of ["index.html", "login.html", "css/styles.css", "js/main.js"]) {
  const text = fs.readFileSync(path.join(root, file), "utf8");
  if (/[—–→]/.test(text)) fail(file + " contains an em dash, en dash, or arrow");
  else ok(file);
}

if (failures) { console.error(`\n${failures} check(s) failed`); process.exit(1); }
console.log("\nAll checks passed");
