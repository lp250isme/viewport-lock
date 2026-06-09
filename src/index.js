// viewport-lock — 阻止行動裝置「雙指縮放 / 雙擊縮放」,保留正常捲動。
//
// 為什麼不只是改 <meta viewport user-scalable=no>?
//   iOS Safari 自 iOS 10 起「故意無視」meta 的 user-scalable=no / maximum-scale
//   (無障礙考量),所以光改 meta 在 iPhone 上完全沒用。真正要擋 iOS 的雙指縮放,
//   得靠 Safari 專屬的 gesture* 事件 preventDefault。Android Chrome 則吃 meta。
//   雙擊縮放交給 CSS touch-action:manipulation(iOS 9.3+/Android 皆支援)。
//
// SSR 安全:沒有 document 時直接 no-op。回傳清除函式(給 React useEffect 用)。

const VIEWPORT_ON = { 'maximum-scale': '1', 'user-scalable': 'no' };

/** 在不破壞既有設定(width/initial-scale/viewport-fit…)的前提下,補上鎖縮放的鍵 */
function mergeViewportContent(prev) {
  const map = new Map();
  prev
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .forEach((pair) => {
      const i = pair.indexOf('=');
      if (i < 0) map.set(pair, null);
      else map.set(pair.slice(0, i).trim(), pair.slice(i + 1).trim());
    });
  if (!map.has('width')) map.set('width', 'device-width');
  if (!map.has('initial-scale')) map.set('initial-scale', '1');
  for (const [k, v] of Object.entries(VIEWPORT_ON)) map.set(k, v);
  return [...map].map(([k, v]) => (v == null ? k : `${k}=${v}`)).join(', ');
}

/**
 * 鎖住行動裝置縮放(雙指 + 雙擊),保留捲動 / 單擊。
 * @param {{ meta?: boolean, doubleTap?: boolean, pinch?: boolean }} [options]
 * @returns {() => void} 清除函式,還原所有變更
 */
export function lockViewport(options = {}) {
  if (typeof document === 'undefined') return () => {};
  const { meta = true, doubleTap = true, pinch = true } = options;
  const cleanups = [];

  // 1) viewport meta(Android Chrome 生效;iOS 會無視,靠 (3))
  if (meta) {
    let el = document.querySelector('meta[name="viewport"]');
    const created = !el;
    if (!el) {
      el = document.createElement('meta');
      el.setAttribute('name', 'viewport');
      document.head.appendChild(el);
    }
    const prev = el.getAttribute('content') || '';
    el.setAttribute('content', mergeViewportContent(prev));
    cleanups.push(() => {
      if (created) el.remove();
      else el.setAttribute('content', prev);
    });
  }

  // 2) touch-action:manipulation = 保留捲動/單擊,擋雙擊縮放(iOS 9.3+/Android)
  if (doubleTap) {
    const id = 'viewport-lock-style';
    let style = document.getElementById(id);
    const created = !style;
    if (!style) {
      style = document.createElement('style');
      style.id = id;
      style.textContent = 'html{touch-action:manipulation}';
      document.head.appendChild(style);
    }
    cleanups.push(() => {
      if (created && style) style.remove();
    });
  }

  // 3) iOS Safari 專屬 gesture 事件:擋整頁雙指縮放(meta 在 iOS 無效)
  if (pinch) {
    const block = (e) => e.preventDefault();
    const types = ['gesturestart', 'gesturechange', 'gestureend'];
    types.forEach((t) => document.addEventListener(t, block, { passive: false }));
    cleanups.push(() => types.forEach((t) => document.removeEventListener(t, block)));
  }

  return () => cleanups.forEach((fn) => fn());
}

export default lockViewport;
