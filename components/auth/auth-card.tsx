import Image from "next/image";
import { AuthBackdrop } from "@/components/auth/auth-backdrop";
import { Ornament } from "@/components/layout/page-header";
import { entranceVideo, type EntranceSettings } from "@/lib/entrance";
import { cn } from "@/lib/utils";

const BENEFITS = [
  "BIS hallmarked gold · certified diamonds",
  "Insured shipping in tamper-proof boxes",
  "Your saved cart, wishlist and orders in one place",
];

/**
 * Every sign-in page (log in, register, forgot / reset password). Wide screens: a velvet panel
 * beside the form; phones: just the form. With `entrance` (log in and create account only) the
 * page sits on the background video or still from Admin → Appearance → Sign-in & top bar, and the
 * panel shows its words; otherwise the panel shows the arch-framed necklace from the home page.
 */
export function AuthCard({
  title,
  children,
  entrance,
}: {
  title: string;
  children: React.ReactNode;
  entrance?: EntranceSettings;
}) {
  const grid = (
    <div className="mx-auto grid max-w-5xl gap-0 px-4 py-10 md:grid-cols-[1fr_1.1fr] md:py-16">
      <div
        className={cn(
          "text-on relative hidden overflow-hidden rounded-l-lg p-10 md:flex md:flex-col md:justify-between",
          entrance ? "border-gilt/40 border bg-black/35 backdrop-blur-[2px]" : "bg-brand",
        )}
      >
        <div>
          {(!entrance || entrance.eyebrow) && (
            <p className="text-goldlight text-xs font-semibold tracking-[0.18em] uppercase">
              {entrance ? entrance.eyebrow : "Welcome"}
            </p>
          )}
          <p className="mt-2 text-3xl leading-tight" style={{ fontFamily: "var(--font-display)" }}>
            {entrance ? entrance.heading : "Jewellery made to be handed down"}
          </p>
          <Ornament className="text-gilt mt-4" />
          {entrance?.text && <p className="mt-4 text-sm opacity-90">{entrance.text}</p>}
        </div>
        {!entrance && (
          <div className="arch border-gilt/60 relative mx-auto mt-8 aspect-[4/5] w-full max-w-[15rem] border bg-black">
            <Image
              src="/images/editorial/kundan-necklace.jpg"
              alt=""
              fill
              sizes="240px"
              className="object-cover opacity-90"
            />
          </div>
        )}
        <ul className="mt-8 space-y-1.5 text-sm opacity-90">
          {BENEFITS.map((b) => (
            <li key={b}>{b}</li>
          ))}
        </ul>
      </div>
      <div className="border-border bg-card rounded-lg border p-6 sm:p-10 md:rounded-l-none md:border-l-0">
        <h1 className="text-3xl md:text-4xl">{title}</h1>
        <Ornament className="mt-3" />
        <div className="mt-6 space-y-6">{children}</div>
      </div>
    </div>
  );
  if (!entrance) return grid;
  return (
    // Extra room at the bottom on phones keeps the pause button clear of the form.
    <div className="relative isolate overflow-hidden max-md:pb-8" data-testid="auth-backdrop">
      <AuthBackdrop video={entranceVideo(entrance)} poster={entrance.poster} />
      {grid}
    </div>
  );
}

export function OrDivider() {
  return (
    <div className="text-muted-foreground flex items-center gap-3 text-xs">
      <span className="bg-border h-px flex-1" />
      or
      <span className="bg-border h-px flex-1" />
    </div>
  );
}
