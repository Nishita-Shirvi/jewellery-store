"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowRight, Check, X } from "lucide-react";
import { requestVisitAction } from "@/app/visit/actions";
import { subscribeNewsletterAction } from "@/app/marketing-actions";
import { emphasisParts } from "@/lib/appearance";
import { popupAllowedOn, popupDue, type PopupSettings } from "@/lib/popup";
import { VISIT_SLOTS } from "@/lib/storefront";
import { cn } from "@/lib/utils";

const SEEN_KEY = "vj_popup";

function readSeen(): { at: number; version: string } | null {
  try {
    const v = JSON.parse(localStorage.getItem(SEEN_KEY) ?? "null") as unknown;
    return v && typeof v === "object" && "at" in v && "version" in v
      ? (v as { at: number; version: string })
      : null;
  } catch {
    return null;
  }
}

function markSeen(version: string) {
  try {
    localStorage.setItem(SEEN_KEY, JSON.stringify({ at: Date.now(), version }));
  } catch {
    /* private mode: it may show again next visit */
  }
}

function Heading({ text }: { text: string }) {
  return (
    <>
      {emphasisParts(text).map((part, i) =>
        i % 2 === 1 ? (
          <em key={i} className="text-em font-normal">
            {part}
          </em>
        ) : (
          part
        ),
      )}
    </>
  );
}

const field =
  "border-line bg-card focus-within:border-brand flex min-w-0 rounded-[3px] border text-[15px]";
const label =
  "text-muted-foreground grid gap-1.5 text-[10.5px] font-bold tracking-[0.16em] uppercase";
const go =
  "bg-btn text-btnfg flex items-center justify-center gap-2.5 rounded-[2px] px-4 py-4 text-xs font-bold tracking-[0.16em] uppercase outline-none focus-visible:ring-2 focus-visible:ring-gilt focus-visible:ring-offset-2 disabled:opacity-60 [&_svg]:size-4";

type Done = { title: string; text: string };

/**
 * The card itself: picture in an arch on one side, words and one action on the other. Used by
 * the shop popup and, read-only, by the preview in Admin → Appearance → Popup.
 */
export function PopupCard({
  popup,
  siteName,
  days,
  onClose,
  preview = false,
  headingId = "vj-pop-h",
}: {
  popup: PopupSettings;
  siteName: string;
  days: { value: string; label: string }[];
  onClose?: (reason: "done" | "dismiss") => void;
  preview?: boolean;
  headingId?: string;
}) {
  const [done, setDone] = useState<Done | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [first, ...rest] = siteName.trim().split(/\s+/);
  const path = usePathname();

  function submitVisit(form: HTMLFormElement) {
    const fd = new FormData(form);
    fd.set("email", "");
    fd.set("message", "Asked for a private viewing from the website popup.");
    start(async () => {
      const res = await requestVisitAction({}, fd);
      if (res.ok) {
        setDone({
          title: "Request sent",
          text: "Thank you. We'll call you to confirm the day and time.",
        });
        onClose?.("done");
      } else {
        const fe = res.fieldErrors ?? {};
        setError(
          fe.phone?.[0] ??
            fe.name?.[0] ??
            fe.preferredDate?.[0] ??
            fe.timeSlot?.[0] ??
            res.error ??
            "Please check the form.",
        );
      }
    });
  }

  function submitNews(form: HTMLFormElement) {
    const fd = new FormData(form);
    start(async () => {
      const res = await subscribeNewsletterAction({
        email: String(fd.get("email") ?? ""),
        consent: fd.get("consent") === "on",
        source: "popup",
      });
      if (res.ok) {
        setDone({ title: "Almost done", text: res.message });
        onClose?.("done");
      } else setError(res.error);
    });
  }

  let action: React.ReactNode;
  if (done) {
    action = (
      <div role="status" className="grid gap-2.5 py-2.5">
        <b
          className="text-head flex items-center gap-2.5 text-3xl font-medium"
          style={{ fontFamily: "var(--font-display)" }}
        >
          <Check className="text-gilt size-6" aria-hidden="true" /> {done.title}
        </b>
        <p className="text-muted-foreground">{done.text}</p>
      </div>
    );
  } else if (popup.action === "visit") {
    action = (
      <form
        className="grid gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          setError(null);
          submitVisit(e.currentTarget);
        }}
      >
        <label className={label}>
          Your name
          <span className={field}>
            <input
              name="name"
              required
              autoComplete="name"
              maxLength={80}
              className="min-w-0 flex-1 bg-transparent px-3 py-3 text-[15px] font-normal tracking-normal normal-case outline-none"
            />
          </span>
        </label>
        <label className={label}>
          Mobile
          <span className={field}>
            <span className="border-line text-muted-foreground border-r px-3 py-3 font-medium tracking-normal normal-case">
              +91
            </span>
            <input
              name="phone"
              required
              inputMode="tel"
              autoComplete="tel-national"
              maxLength={14}
              className="min-w-0 flex-1 bg-transparent px-3 py-3 text-[15px] font-normal tracking-normal normal-case outline-none"
            />
          </span>
        </label>
        <fieldset className="grid gap-1.5">
          <legend className={cn(label, "mb-1.5")}>Day</legend>
          <div className="flex flex-wrap gap-2">
            {days.map((d, i) => (
              <label key={d.value} className="relative">
                <input
                  type="radio"
                  name="preferredDate"
                  value={d.value}
                  defaultChecked={i === 0}
                  className="peer absolute size-px opacity-0"
                />
                <span className="border-line bg-card peer-checked:bg-btn peer-checked:border-btn peer-checked:text-btnfg peer-focus-visible:ring-gilt block cursor-pointer rounded-full border px-3.5 py-2 text-[13.5px] font-medium peer-focus-visible:ring-2">
                  {d.label}
                </span>
              </label>
            ))}
          </div>
        </fieldset>
        <fieldset className="grid gap-1.5">
          <legend className={cn(label, "mb-1.5")}>Time</legend>
          <div className="flex flex-wrap gap-2">
            {VISIT_SLOTS.map((s, i) => (
              <label key={s} className="relative">
                <input
                  type="radio"
                  name="timeSlot"
                  value={s}
                  defaultChecked={i === 0}
                  className="peer absolute size-px opacity-0"
                />
                <span className="border-line bg-card peer-checked:bg-btn peer-checked:border-btn peer-checked:text-btnfg peer-focus-visible:ring-gilt block cursor-pointer rounded-full border px-3.5 py-2 text-[13.5px] font-medium peer-focus-visible:ring-2">
                  {s.replace(/ \(.*\)$/, "")}
                </span>
              </label>
            ))}
          </div>
        </fieldset>
        <input
          type="text"
          name="website"
          tabIndex={-1}
          autoComplete="off"
          aria-hidden="true"
          className="hidden"
        />
        <p className="text-muted-foreground text-[12.5px]">
          We&apos;ll only use your number to arrange the visit.
        </p>
        <button type="submit" className={go} disabled={pending || preview}>
          {pending ? "Sending…" : popup.cta} <ArrowRight aria-hidden="true" />
        </button>
      </form>
    );
  } else if (popup.action === "news") {
    action = (
      <form
        className="grid gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          setError(null);
          submitNews(e.currentTarget);
        }}
      >
        <label className={label}>
          Email
          <span className={field}>
            <input
              name="email"
              type="email"
              required
              autoComplete="email"
              maxLength={254}
              className="min-w-0 flex-1 bg-transparent px-3 py-3 text-[15px] font-normal tracking-normal normal-case outline-none"
            />
          </span>
        </label>
        <label className="text-muted-foreground flex items-start gap-2.5 text-[12.5px]">
          <input type="checkbox" name="consent" required className="accent-brand mt-1" />
          Send me news about new collections and offers by email. I can unsubscribe at any time.
        </label>
        <button type="submit" className={go} disabled={pending || preview}>
          {pending ? "Sending…" : popup.cta} <ArrowRight aria-hidden="true" />
        </button>
      </form>
    );
  } else if (popup.action === "signin") {
    action = (
      <div className="grid gap-3">
        <Link
          href={`/login?callbackUrl=${encodeURIComponent(path || "/")}`}
          className={go}
          onClick={() => onClose?.("done")}
          tabIndex={preview ? -1 : undefined}
        >
          {popup.cta} <ArrowRight aria-hidden="true" />
        </Link>
        <Link
          href="/register"
          className="text-eyebrow text-center text-sm underline underline-offset-4"
          onClick={() => onClose?.("done")}
          tabIndex={preview ? -1 : undefined}
        >
          New here? Create an account
        </Link>
      </div>
    );
  } else {
    action = (
      <Link
        href={popup.link}
        className={go}
        onClick={() => onClose?.("done")}
        tabIndex={preview ? -1 : undefined}
      >
        {popup.cta} <ArrowRight aria-hidden="true" />
      </Link>
    );
  }

  return (
    <div className="vj-pop-card">
      <div className="vj-pop-media">
        <span
          className="text-wordmark flex flex-col leading-none tracking-[0.2em] uppercase"
          style={{ fontFamily: "var(--font-display)", fontSize: 22 }}
        >
          {first}
          {rest.length > 0 && (
            <small className="mt-1 font-sans text-[8px] font-semibold tracking-[0.6em]">
              {rest.join(" ")}
            </small>
          )}
        </span>
        <div className="vj-pop-arch">
          {/* eslint-disable-next-line @next/next/no-img-element -- admin-chosen picture, any size */}
          <img src={popup.image} alt={popup.imageAlt} />
        </div>
      </div>
      <div className="vj-pop-body">
        {popup.eyebrow && (
          <span className="text-eyebrow flex items-center gap-2.5 text-[11px] font-bold tracking-[0.2em] uppercase after:block after:h-px after:w-8 after:bg-[var(--s-gold)]">
            {popup.eyebrow}
          </span>
        )}
        <h2 id={headingId} className="vj-pop-h">
          <Heading text={popup.heading} />
        </h2>
        {popup.text && !done && (
          <p className="text-muted-foreground max-w-[44ch] text-[15.5px]">{popup.text}</p>
        )}
        {error && (
          <p role="alert" className="text-sm text-red-700">
            {error}
          </p>
        )}
        {action}
        {!done && (
          <button
            type="button"
            className="text-muted-foreground justify-self-center p-1 text-[13px] underline underline-offset-[3px]"
            onClick={() => onClose?.("dismiss")}
            tabIndex={preview ? -1 : undefined}
          >
            Maybe later
          </button>
        )}
      </div>
      <button
        type="button"
        className="vj-pop-x"
        aria-label="Close"
        onClick={() => onClose?.("dismiss")}
        tabIndex={preview ? -1 : undefined}
      >
        <X className="size-[18px]" aria-hidden="true" />
      </button>
    </div>
  );
}

/**
 * The shop popup (Admin → Appearance → Popup). Opens once after its delay (or when a computer
 * user heads for the address bar), on the pages it's set for, and not again for that shopper
 * until its "show again" period passes or the popup changes. Never on checkout, cart, sign-in,
 * account or admin pages. A native <dialog>: focus stays inside, Esc and the backdrop close it.
 */
export function SitePopup({
  popup,
  siteName,
  days,
  signedIn,
}: {
  popup: PopupSettings;
  siteName: string;
  days: { value: string; label: string }[];
  signedIn: boolean;
}) {
  const pathname = usePathname();
  const ref = useRef<HTMLDialogElement>(null);
  const [opened, setOpened] = useState(false);
  const shown = useRef(false);
  const skip = popup.action === "signin" && signedIn;

  useEffect(() => {
    if (skip || shown.current || !popupAllowedOn(pathname, popup.where)) return;
    if (!popupDue(readSeen(), popup)) return;
    const open = () => {
      const dialog = ref.current;
      if (shown.current || !dialog || dialog.open) return;
      shown.current = true;
      setOpened(true);
      dialog.showModal();
    };
    const coarse = window.matchMedia("(pointer: coarse)").matches;
    if (popup.delay === "exit" && !coarse) {
      const onLeave = (e: MouseEvent) => {
        if (!e.relatedTarget && e.clientY <= 0) open();
      };
      document.addEventListener("mouseout", onLeave);
      return () => document.removeEventListener("mouseout", onLeave);
    }
    const seconds = popup.delay === "exit" ? 20 : Number(popup.delay);
    const timer = window.setTimeout(open, seconds * 1000);
    return () => window.clearTimeout(timer);
  }, [pathname, popup, skip]);

  function close(reason: "done" | "dismiss") {
    markSeen(popup.version);
    if (reason === "dismiss") ref.current?.close();
  }

  if (skip) return null;
  return (
    <dialog
      ref={ref}
      aria-labelledby="vj-pop-h"
      className="vj-pop"
      onCancel={() => markSeen(popup.version)}
      onClick={(e) => {
        // A click on the backdrop (outside the card) closes it.
        if (e.target === e.currentTarget) close("dismiss");
      }}
    >
      {opened && <PopupCard popup={popup} siteName={siteName} days={days} onClose={close} />}
    </dialog>
  );
}
