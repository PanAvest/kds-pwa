type RateLimitOptions = {
  limit: number;
  windowMs: number;
};

type RateLimitState = {
  count: number;
  resetAt: number;
};

type RateLimitStore = Map<string, RateLimitState>;

declare global {
  // eslint-disable-next-line no-var
  var __kdsRateLimitStore: RateLimitStore | undefined;
}

const store: RateLimitStore = globalThis.__kdsRateLimitStore ?? new Map();
if (!globalThis.__kdsRateLimitStore) {
  globalThis.__kdsRateLimitStore = store;
}

export function getClientIp(req: Request) {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }

  return (
    req.headers.get("cf-connecting-ip")?.trim() ||
    req.headers.get("x-real-ip")?.trim() ||
    "unknown"
  );
}

function pruneExpired(now: number) {
  if (store.size < 2000) return;
  for (const [key, value] of store.entries()) {
    if (value.resetAt <= now) {
      store.delete(key);
    }
  }
}

export function checkRateLimit(req: Request, scope: string, options: RateLimitOptions) {
  const now = Date.now();
  pruneExpired(now);

  const ip = getClientIp(req);
  const key = `${scope}:${ip}`;
  const existing = store.get(key);

  if (!existing || existing.resetAt <= now) {
    const nextState = { count: 1, resetAt: now + options.windowMs };
    store.set(key, nextState);
    return {
      ok: true as const,
      headers: {
        "X-RateLimit-Limit": String(options.limit),
        "X-RateLimit-Remaining": String(Math.max(0, options.limit - nextState.count)),
        "X-RateLimit-Reset": String(Math.ceil(nextState.resetAt / 1000)),
      },
    };
  }

  existing.count += 1;
  store.set(key, existing);

  const remaining = Math.max(0, options.limit - existing.count);
  if (existing.count > options.limit) {
    return {
      ok: false as const,
      retryAfterSeconds: Math.max(1, Math.ceil((existing.resetAt - now) / 1000)),
      headers: {
        "X-RateLimit-Limit": String(options.limit),
        "X-RateLimit-Remaining": "0",
        "X-RateLimit-Reset": String(Math.ceil(existing.resetAt / 1000)),
      },
    };
  }

  return {
    ok: true as const,
    headers: {
      "X-RateLimit-Limit": String(options.limit),
      "X-RateLimit-Remaining": String(remaining),
      "X-RateLimit-Reset": String(Math.ceil(existing.resetAt / 1000)),
    },
  };
}
