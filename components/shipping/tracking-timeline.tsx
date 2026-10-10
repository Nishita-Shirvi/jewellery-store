import type { ShipmentStatus } from "@prisma/client";

const dateFmt = new Intl.DateTimeFormat("en-IN", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Asia/Kolkata",
});

export const SHIPMENT_LABEL: Record<ShipmentStatus, string> = {
  CREATED: "Preparing shipment",
  AWB_ASSIGNED: "Packed, waiting for pickup",
  PICKUP_SCHEDULED: "Pickup scheduled",
  PICKED_UP: "Picked up by courier",
  IN_TRANSIT: "In transit",
  OUT_FOR_DELIVERY: "Out for delivery",
  DELIVERED: "Delivered",
  RTO: "Returning to us",
  CANCELLED: "Shipment cancelled",
};

export interface TimelineEvent {
  id: string;
  label: string;
  location: string | null;
  occurredAt: Date;
}

export function TrackingTimeline({ events }: { events: TimelineEvent[] }) {
  if (events.length === 0)
    return (
      <p className="text-muted-foreground text-sm">
        Tracking updates will appear here once the courier picks up the parcel.
      </p>
    );
  return (
    <ol className="border-border space-y-3 border-l pl-4 text-sm" aria-label="Tracking updates">
      {events.map((e, i) => (
        <li key={e.id} className="relative">
          <span
            className={`absolute top-1.5 -left-[21px] size-2.5 rounded-full ${i === 0 ? "bg-foreground" : "bg-border"}`}
            aria-hidden="true"
          />
          <p className={i === 0 ? "font-medium" : ""}>{e.label}</p>
          <p className="text-muted-foreground text-xs">
            {dateFmt.format(e.occurredAt)}
            {e.location ? ` · ${e.location}` : ""}
          </p>
        </li>
      ))}
    </ol>
  );
}
