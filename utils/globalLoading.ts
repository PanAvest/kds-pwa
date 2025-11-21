const EVENT_START = "kds:loading:start";
const EVENT_STOP = "kds:loading:stop";

type LoadingDetail = { id: string; reason?: string; force?: boolean };

function makeId() {
  return `kds-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

/**
 * Dispatch a cross-app loading signal that the global overlay listens for.
 * Returns a disposer to stop the tracked state.
 */
export function startGlobalLoading(reason?: string, force = true) {
  if (typeof window === "undefined") return () => {};
  const id = makeId();
  const detail: LoadingDetail = { id, reason, force };
  window.dispatchEvent(new CustomEvent<LoadingDetail>(EVENT_START, { detail }));
  return () => window.dispatchEvent(new CustomEvent<LoadingDetail>(EVENT_STOP, { detail: { id } }));
}

/**
 * Wrap a promise and show the global loading overlay until it settles.
 */
export async function trackPromise<T>(promise: Promise<T>, reason?: string, force = true): Promise<T> {
  const stop = startGlobalLoading(reason, force);
  try {
    return await promise;
  } finally {
    stop();
  }
}
