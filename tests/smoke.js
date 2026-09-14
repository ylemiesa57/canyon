// Headless smoke tests for the buyer and shop apps. Runs the real pages in jsdom with the
// site-absolute asset paths rewritten to a temp folder, drives the main flows, and asserts
// on what the screens say. Kept independent of visual details so a design pass does not break it.
const fs = require("fs");
const os = require("os");
const path = require("path");
const { JSDOM } = require("jsdom");

const root = path.resolve(__dirname, "..");
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
let failures = 0;
const check = (cond, msg) => { if (cond) console.log("  ok  ", msg); else { failures++; console.error("  FAIL", msg); } };

function stage() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "canyon-smoke-"));
  const copy = (src, dst, rewrite) => {
    let s = fs.readFileSync(path.join(root, src), "utf8");
    if (rewrite) s = rewrite(s);
    fs.mkdirSync(path.dirname(path.join(dir, dst)), { recursive: true });
    fs.writeFileSync(path.join(dir, dst), s);
  };
  copy("app/index.html", "buyer.html", (s) => s.replace(/\/app\/app\.css/g, "app.css").replace(/\/app\/runtime\.js/g, "runtime.js").replace(/\/app\/buyer\.js/g, "buyer.js").replace(/src="\/app\/viewer[^"]*"/g, 'src="about:blank"'));
  copy("app/shop/index.html", "shop.html", (s) => s.replace(/\/app\/app\.css/g, "app.css").replace(/\/app\/runtime\.js/g, "runtime.js").replace(/\/app\/shop\/shop\.js/g, "shop.js").replace(/src="\/app\/viewer[^"]*"/g, 'src="about:blank"'));
  copy("app/app.css", "app.css"); copy("app/runtime.js", "runtime.js"); copy("app/buyer.js", "buyer.js"); copy("app/shop/shop.js", "shop.js");
  return dir;
}

async function load(file, reducedMotion) {
  const dom = await JSDOM.fromFile(file, {
    runScripts: "dangerously", resources: "usable", pretendToBeVisual: true,
    beforeParse(w) {
      w.matchMedia = () => ({ matches: reducedMotion, addEventListener() {} });
      // file:// documents cannot change history in jsdom; the apps only use it for the hash
      w.history.replaceState = () => {}; w.history.pushState = () => {};
    },
  });
  const w = dom.window; const errors = [];
  w.addEventListener("error", (e) => errors.push(e.message));
  await new Promise((r) => w.addEventListener("load", r));
  await wait(150);
  const root = w.document.getElementById("root");
  const api = {
    w, errors, root,
    text: () => root.textContent.replace(/\s+/g, " ").trim(),
    has: (s) => api.text().includes(s),
    btn: (label) => Array.from(root.querySelectorAll("button,a")).find((b) => b.textContent.trim() === label),
    btnStarts: (prefix) => Array.from(root.querySelectorAll("button,a")).find((b) => b.textContent.trim().startsWith(prefix)),
    btnHas: (part) => Array.from(root.querySelectorAll("button,a")).find((b) => b.textContent.includes(part)),
    click: async (el, ms = 80) => { if (!el) throw new Error("missing element"); el.dispatchEvent(new w.MouseEvent("click", { bubbles: true })); await wait(ms); },
    type: async (input, value) => { input.value = value; input.dispatchEvent(new w.Event("input", { bubbles: true })); await wait(40); },
  };
  return api;
}

(async () => {
  const dir = stage();

  console.log("Buyer app");
  let b = await load(path.join(dir, "buyer.html"), true); // finished states, no timers to wait on
  check(b.has("Request queue"), "opens on the queue");
  check(b.has("Set your mandate first"), "asks for the mandate before first release");
  const newTab = () => b.btnStarts("New re") || b.btnStarts("New R");
  await b.click(newTab());
  check(!!b.btnStarts("Release anyway"), "release is flagged on the example part");
  check(!b.has("correct anything Canyon got wrong"), "spec screen does not ask to correct Canyon");
  check(b.root.querySelectorAll("input.input").length >= 2, "quantity and need-by are inputs");
  const picker = b.root.querySelector('input[type="file"]');
  check(!!picker, "Browse files is a real file input");
  if (picker) {
    Object.defineProperty(picker, "files", { value: [new b.w.File(["solid x endsolid x"], "my-part.stl", { type: "model/stl" }), new b.w.File(["%PDF"], "my-part.pdf")], configurable: true });
    picker.dispatchEvent(new b.w.Event("change", { bubbles: true })); await wait(200);
    check(b.has("my-part.stl") && b.has("2 files from your machine"), "picked files replace the example list");
    check(b.has("Your agent") && b.has("Reading my-part.stl"), "agent narrates the read from the buyer's file name");
  }
  await b.click(b.btnHas("Part & DFM")); // a global tab on main, a stage-strip step after the daylight pass
  const apply = Array.from(b.root.querySelectorAll("button")).find((x) => x.textContent.includes("Apply change"));
  check(!!apply, "findings have an apply action");
  await b.click(apply);
  check(b.has("2 findings open"), "applying a finding reduces the open count");
  await b.click(b.btnStarts("Profile"));
  await b.click(b.btn("Save mandate"));
  check(b.has("Request queue") && !b.has("Set your mandate first"), "saving the mandate returns to a queue without the banner");
  await b.click(newTab());
  check(!!b.btn("Release to shops") && !b.btnStarts("Release anyway"), "release is clean after the fix and the mandate");
  await b.click(b.btn("Release to shops"));
  check(/Negotiation/.test(b.text()) && b.has("Shops considered") && b.has("Matched"), "release opens the negotiation with the shops considered");
  await b.click(b.btn("Go to offers"));
  check(/\d shops responded/.test(b.text()), "offers screen lists the responding shops");
  await b.click(b.btn("Accept recommendation"));
  check(b.has("Awarded."), "accepting the split awards the RFQ");
  await b.click(b.btnStarts("Profile"));
  check(b.has("Awards") && /Profile1/.test(b.text().replace(/\s+/g, "")), "award lands on Profile with a badge");
  await b.click(b.btnStarts("Quote PDF"));
  check(b.has("Quotation Q-4417") && b.has("Halcyon Industrial"), "quote opens as a paper document");
  await b.click(b.btn("Queue"));
  check(/RFQ-4417.*?Awarded/.test(b.text()), "queue shows the RFQ as awarded");
  check(b.has("Your agent") && b.has("Sent your award"), "agent band leads the queue and reflects the award");
  check(b.errors.length === 0, "no runtime errors (" + b.errors.join("; ") + ")");
  b.w.close();

  console.log("Shop app");
  const s = await load(path.join(dir, "shop.html"), false);
  check((s.text().match(/RFQ \d{4}/g) || []).length >= 8, "inbox lists the RFQs");
  check(s.has("Halcyon Industrial") && !s.has("US$"), "cast and currency are synced with the buyer side");
  await s.click(s.btn("Parts"), 60);
  const strip = () => Array.from(s.root.querySelectorAll(".stage-strip button"));
  check(strip().length === 6, "Parts shows the six-stage strip");
  const stageBtn = (label) => strip().find((b) => b.textContent.includes(label));
  for (const stage of ["Ingest", "Part", "Costing", "Quote", "Negotiation", "Quote PDF"]) {
    await s.click(stageBtn(stage), 60);
    check(s.text().length > 600 && stageBtn(stage).getAttribute("aria-current") === "step", "stage renders and is current: " + stage);
  }
  await s.click(stageBtn("Part"), 60);
  check(!!s.root.querySelector('iframe[title="Part viewer"]'), "Part stage embeds the 3D viewer");
  await s.click(stageBtn("Costing"), 60);
  check(s.root.querySelectorAll(".cost-table").length === 2, "Costing keeps its two tables");
  for (const tab of ["My shop", "Inbox"]) {
    await s.click(s.btn(tab), 60);
    check(s.text().length > 600 && !s.root.querySelector(".stage-strip"), "tab renders without the strip: " + tab);
  }
  check(!s.root.querySelector("aside"), "agent drawer starts closed");
  await s.click(s.btn("Agent"));
  check(!!s.root.querySelector("aside"), "agent drawer opens");
  await s.click(s.btn("Close"));
  check(!s.root.querySelector("aside"), "agent drawer closes");
  check(s.errors.length === 0, "no runtime errors (" + s.errors.join("; ") + ")");
  s.w.close();

  fs.rmSync(dir, { recursive: true, force: true });
  if (failures) { console.error(`\n${failures} smoke check(s) failed`); process.exit(1); }
  console.log("\nAll smoke checks passed");
})().catch((e) => { console.error("SMOKE FAIL", e); process.exit(1); });
