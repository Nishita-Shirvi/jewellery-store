import type { BrowserOptions } from "@sentry/nextjs";

/**
 * What Sentry may collect: nothing about customers (Sentry 11 replaced `sendDefaultPii: false`
 * with `dataCollection`, whose defaults collect everything). No user info or IPs, cookies,
 * headers, request/response bodies, query strings, SQL values, or local variables.
 */
export const SENTRY_DATA_COLLECTION: NonNullable<BrowserOptions["dataCollection"]> = {
  userInfo: false,
  cookies: false,
  httpHeaders: false,
  httpBodies: [],
  urlQueryParams: false,
  databaseQueryData: false,
  stackFrameVariables: false,
  genAI: { inputs: false, outputs: false },
  mcp: { inputs: false, outputs: false },
  graphQL: { document: false, variables: false },
};
