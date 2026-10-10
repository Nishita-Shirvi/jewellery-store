/** Shared API response types. The future frontend design builds on these contracts. */

export type HealthStatus = "ok" | "error";

export interface HealthResponse {
  status: HealthStatus;
  db: HealthStatus;
}
