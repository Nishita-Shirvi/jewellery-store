"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export interface FestivalPreset {
  name: string;
  /** YYYY-MM-DD, first day */
  from: string;
  /** YYYY-MM-DD, last day (included) */
  to: string;
}

/** The day after "YYYY-MM-DD" (so a sale ending on the last festival day runs all that day). */
function nextDay(date: string): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

/**
 * Status plus "live from / until" (India time) for banners, collections and announcements.
 * Festival buttons fill both dates in one click (from config.ini [festivals]).
 */
export function ScheduleFields({
  idPrefix,
  status,
  startsAt,
  endsAt,
  festivals,
}: {
  idPrefix: string;
  status: "DRAFT" | "PUBLISHED";
  startsAt: string;
  endsAt: string;
  festivals: FestivalPreset[];
}) {
  const [from, setFrom] = useState(startsAt);
  const [until, setUntil] = useState(endsAt);
  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-medium">When it shows</legend>
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="space-y-1.5">
          <Label htmlFor={`${idPrefix}-status`}>Status</Label>
          <select
            id={`${idPrefix}-status`}
            name="contentStatus"
            defaultValue={status}
            className="border-input bg-background h-9 w-full rounded-md border px-2 text-sm"
          >
            <option value="DRAFT">Draft (hidden)</option>
            <option value="PUBLISHED">Published</option>
          </select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`${idPrefix}-from`}>Live from (India time)</Label>
          <Input
            id={`${idPrefix}-from`}
            type="datetime-local"
            name="startsAt"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`${idPrefix}-until`}>Until</Label>
          <Input
            id={`${idPrefix}-until`}
            type="datetime-local"
            name="endsAt"
            value={until}
            onChange={(e) => setUntil(e.target.value)}
          />
        </div>
      </div>
      <p className="text-muted-foreground text-xs">
        Leave the dates empty to show it as soon as it&apos;s published, with no end. Published
        items go live and disappear on these dates by themselves.
      </p>
      {festivals.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="text-muted-foreground">Quick dates:</span>
          {festivals.map((f) => (
            <button
              key={f.name}
              type="button"
              className="border-border hover:bg-muted rounded border px-2 py-1"
              onClick={() => {
                setFrom(`${f.from}T00:00`);
                setUntil(`${nextDay(f.to)}T00:00`);
              }}
            >
              {f.name} ({f.from === f.to ? f.from : `${f.from} – ${f.to}`})
            </button>
          ))}
          <button
            type="button"
            className="text-muted-foreground underline"
            onClick={() => {
              setFrom("");
              setUntil("");
            }}
          >
            Clear dates
          </button>
        </div>
      )}
    </fieldset>
  );
}
