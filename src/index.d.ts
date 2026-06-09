export interface ViewportLockOptions {
  /** 建立/更新 viewport meta(maximum-scale=1, user-scalable=no);Android Chrome 生效。預設 true */
  meta?: boolean;
  /** 加 html{touch-action:manipulation},擋雙擊縮放、保留捲動/單擊。預設 true */
  doubleTap?: boolean;
  /** iOS Safari gesture* 事件 preventDefault,擋雙指縮放(meta 在 iOS 無效)。預設 true */
  pinch?: boolean;
}

/**
 * 鎖住行動裝置縮放(雙指 + 雙擊),保留捲動。SSR 安全(無 document 時 no-op)。
 * @returns 清除函式,還原所有變更(給 React useEffect 回傳用)。
 */
export function lockViewport(options?: ViewportLockOptions): () => void;
export default lockViewport;
