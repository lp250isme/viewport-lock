// src/index.js
var VIEWPORT_ON = { "maximum-scale": "1", "user-scalable": "no" };
function mergeViewportContent(prev) {
  const map = /* @__PURE__ */ new Map();
  prev.split(",").map((s) => s.trim()).filter(Boolean).forEach((pair) => {
    const i = pair.indexOf("=");
    if (i < 0) map.set(pair, null);
    else map.set(pair.slice(0, i).trim(), pair.slice(i + 1).trim());
  });
  if (!map.has("width")) map.set("width", "device-width");
  if (!map.has("initial-scale")) map.set("initial-scale", "1");
  for (const [k, v] of Object.entries(VIEWPORT_ON)) map.set(k, v);
  return [...map].map(([k, v]) => v == null ? k : `${k}=${v}`).join(", ");
}
function lockViewport(options = {}) {
  if (typeof document === "undefined") return () => {
  };
  const { meta = true, doubleTap = true, pinch = true } = options;
  const cleanups = [];
  if (meta) {
    let el = document.querySelector('meta[name="viewport"]');
    const created = !el;
    if (!el) {
      el = document.createElement("meta");
      el.setAttribute("name", "viewport");
      document.head.appendChild(el);
    }
    const prev = el.getAttribute("content") || "";
    el.setAttribute("content", mergeViewportContent(prev));
    cleanups.push(() => {
      if (created) el.remove();
      else el.setAttribute("content", prev);
    });
  }
  if (doubleTap) {
    const id = "viewport-lock-style";
    let style = document.getElementById(id);
    const created = !style;
    if (!style) {
      style = document.createElement("style");
      style.id = id;
      style.textContent = "html{touch-action:manipulation}";
      document.head.appendChild(style);
    }
    cleanups.push(() => {
      if (created && style) style.remove();
    });
  }
  if (pinch) {
    const block = (e) => e.preventDefault();
    const types = ["gesturestart", "gesturechange", "gestureend"];
    types.forEach((t) => document.addEventListener(t, block, { passive: false }));
    cleanups.push(() => types.forEach((t) => document.removeEventListener(t, block)));
  }
  return () => cleanups.forEach((fn) => fn());
}
var index_default = lockViewport;
export {
  index_default as default,
  lockViewport
};
