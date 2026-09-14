// Canyon customer UI.
// The markup in <template id="dc"> is the Claude Design mockup, verbatim apart from colour tokens.
// Below is a small renderer for its template syntax ({{ path }}, <sc-if>, <sc-for>, sc-camel-on-click),
// a DOM morph so CSS transitions survive re-renders, and the mockup's own screen logic (Component).

// Shared runtime for the Canyon app mockups: a renderer for the design template syntax
// ({{ path }}, <sc-if>, <sc-for>, sc-camel-on-click), a DOM morph so transitions survive
// re-renders, and a stand-in for the design runtime's component base (DCLogic).

window.DC = (function () {
  "use strict";

  const root = document.getElementById("root");
  const tpl = document.getElementById("dc").content;

  const strip = (s) => (s || "").replace(/^\s*\{\{\s*|\s*\}\}\s*$/g, "").trim();
  const get = (scope, path) => {
    if (path === "true") return true;
    if (path === "false") return false;
    return path.split(".").reduce((o, k) => (o == null ? undefined : o[k]), scope);
  };
  const interp = (str, scope) => str.replace(/\{\{\s*([\w.$]+)\s*\}\}/g, (_, p) => {
    const v = get(scope, p);
    return v == null ? "" : String(v);
  });

  function renderNodes(nodes, scope, out) {
    for (const n of nodes) {
      if (n.nodeType === 3) { if (n.data.trim() || n.data.includes(" ")) out.appendChild(document.createTextNode(interp(n.data, scope))); continue; }
      if (n.nodeType !== 1) continue;
      const tag = n.tagName.toLowerCase();
      if (tag === "sc-if") { if (get(scope, strip(n.getAttribute("value")))) renderNodes(n.childNodes, scope, out); continue; }
      if (tag === "sc-for") {
        const list = get(scope, strip(n.getAttribute("list"))) || [];
        const as = n.getAttribute("as") || "item";
        list.forEach((item, i) => renderNodes(n.childNodes, Object.assign({}, scope, { [as]: item, $index: i }), out));
        continue;
      }
      if (n.hasAttribute("sc-when") && !get(scope, strip(n.getAttribute("sc-when")))) continue;
      if (n.hasAttribute("sc-each")) {
        const list = get(scope, strip(n.getAttribute("sc-each"))) || [];
        const as = n.getAttribute("sc-as") || "item";
        const clone = n.cloneNode(true);
        ["sc-each", "sc-as", "sc-when"].forEach((k) => clone.removeAttribute(k));
        list.forEach((item, i) => renderNodes([clone], Object.assign({}, scope, { [as]: item, $index: i }), out));
        continue;
      }
      const el = document.createElement(tag);
      for (const a of Array.from(n.attributes)) {
        if (a.name === "sc-when") continue;
        if (a.name === "sc-camel-on-click") { const fn = get(scope, strip(a.value)); if (typeof fn === "function") el.__click = fn; continue; }
        if (a.name.startsWith("hint-")) continue;
        if (a.name === "style-hover") { el.dataset.hover = a.value; continue; }
        el.setAttribute(a.name, interp(a.value, scope));
      }
      renderNodes(n.childNodes, scope, el);
      out.appendChild(el);
    }
  }

  // Morph: copy the new tree onto the old one in place so transitions on style changes play.
  function morph(oldN, newN) {
    if (oldN.nodeType !== newN.nodeType || (oldN.nodeType === 1 && oldN.tagName !== newN.tagName)) { oldN.replaceWith(newN); return; }
    if (oldN.nodeType === 3) { if (oldN.data !== newN.data) oldN.data = newN.data; return; }
    for (const a of Array.from(oldN.attributes)) if (!newN.hasAttribute(a.name)) oldN.removeAttribute(a.name);
    for (const a of Array.from(newN.attributes)) if (oldN.getAttribute(a.name) !== a.value) oldN.setAttribute(a.name, a.value);
    oldN.__click = newN.__click;
    morphChildren(oldN, newN);
  }
  function morphChildren(oldN, newN) {
    const oc = Array.from(oldN.childNodes), nc = Array.from(newN.childNodes);
    const len = Math.max(oc.length, nc.length);
    for (let i = 0; i < len; i++) {
      if (!oc[i]) oldN.appendChild(nc[i]);
      else if (!nc[i]) oc[i].remove();
      else morph(oc[i], nc[i]);
    }
  }

  root.addEventListener("click", (e) => {
    let t = e.target;
    while (t && t !== root) { if (t.__click) { t.__click(e); return; } t = t.parentNode; }
  });
  root.addEventListener("mouseover", (e) => {
    const t = e.target.closest && e.target.closest("[data-hover]");
    if (t && !t.__hoverBase) { t.__hoverBase = t.getAttribute("style") || ""; t.setAttribute("style", t.__hoverBase + ";" + t.dataset.hover); }
  });
  root.addEventListener("mouseout", (e) => {
    const t = e.target.closest && e.target.closest("[data-hover]");
    if (t && t.__hoverBase != null && !t.contains(e.relatedTarget)) { t.setAttribute("style", t.__hoverBase); t.__hoverBase = null; }
  });

  let app = null, lastScreen = null;
  function render() {
    const vals = app.renderVals();
    const frag = document.createDocumentFragment();
    renderNodes(tpl.childNodes, vals, frag);
    const fresh = document.createElement("div");
    fresh.append(frag);
    if (!root.firstChild || lastScreen !== app.state.screen) { root.replaceChildren(...Array.from(fresh.childNodes)); }
    else { morphChildren(root, fresh); }
    lastScreen = app.state.screen;
  }

  // Minimal stand-in for the design runtime's component base.
  class DCLogic {
    constructor() { this.state = {}; this.props = {}; }
    setState(u) {
      const prev = Object.assign({}, this.state);
      const next = typeof u === "function" ? u(this.state) : u;
      this.state = Object.assign({}, this.state, next);
      render();
      if (this.componentDidUpdate) this.componentDidUpdate(this.props, prev);
    }
  }

  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // Boot a screen component. finishedTicks maps screen id to its final tick for reduced motion.
  function mount(Component, finishedTicks) {
    app = new Component();
    render();
    if (reduceMotion && finishedTicks && app.run) {
      app.run = function () { clearInterval(this._iv); this.setState({ tick: finishedTicks[this.state.screen] || 8 }); };
    }
    if (app.componentDidMount) app.componentDidMount();
    return app;
  }
  return { DCLogic, mount, render: () => render() };
})();
