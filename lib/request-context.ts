import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";

/**
 * Correlation IDs (Phase 26). Everything logged while handling one request — or one background
 * job — carries the same `requestId` (and `jobId`), so a customer's problem can be followed
 * through the logs: Vercel → Logs → search the id.
 *
 * Vercel already gives every request an id (x-vercel-id); we reuse it so our lines and Vercel's
 * own request log match. Elsewhere (local, tests) a random one is made.
 */
export interface RequestContext {
  requestId: string;
  jobId?: string;
  jobType?: string;
}

const storage = new AsyncLocalStorage<RequestContext>();

export function currentContext(): RequestContext | undefined {
  return storage.getStore();
}

export function requestIdFrom(headers: Headers): string {
  const given = headers.get("x-vercel-id") ?? headers.get("x-request-id") ?? "";
  // Only ids that look like ids (no log injection through a header).
  return /^[A-Za-z0-9:_-]{6,120}$/.test(given) ? given : randomUUID();
}

export function runWithContext<T>(ctx: RequestContext, fn: () => T): T {
  return storage.run(ctx, fn);
}

/**
 * Wraps a route handler so all its logs share one id, and returns that id to the caller in an
 * `x-request-id` response header (support can ask a customer for it).
 */
export function withRequestId<A extends unknown[]>(
  handler: (request: Request, ...rest: A) => Promise<Response>,
) {
  return (request: Request, ...rest: A): Promise<Response> => {
    const requestId = requestIdFrom(request.headers);
    return storage.run({ requestId }, async () => {
      const response = await handler(request, ...rest);
      try {
        response.headers.set("x-request-id", requestId);
      } catch {
        /* immutable headers (redirects): the id is still in the logs */
      }
      return response;
    });
  };
}

/**
 * The same for server actions (checkout, payments): their log lines share one id too.
 * Inside an existing context (e.g. called from a route), it just runs `fn`.
 */
export async function inActionContext<T>(fn: () => Promise<T>): Promise<T> {
  if (storage.getStore()) return fn();
  let requestId: string;
  try {
    const { headers } = await import("next/headers");
    requestId = requestIdFrom(await headers());
  } catch {
    requestId = randomUUID(); // outside a request (tests, scripts)
  }
  return storage.run({ requestId }, fn);
}
