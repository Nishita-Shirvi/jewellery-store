/** Shared API response types. The future frontend design builds on these contracts. */

export type HealthStatus = "ok" | "error";

export interface HealthResponse {
  status: HealthStatus;
  db: HealthStatus;
}

/** /api/health?deep=1 with the cron secret (Phase 26): what the uptime check and Admin → System use. */
export interface DeepHealth extends HealthResponse {
  dbMs: number;
  /** Minutes since the scheduler last ran (null = never). */
  cronMinutesAgo: number | null;
  /** Jobs that should have run more than 15 minutes ago and haven't. */
  overdueJobs: number;
  deadJobs24h: number;
  firingAlerts: string[];
  release: string | null;
}
