import Image from "next/image";
import { Ornament } from "@/components/layout/page-header";

/**
 * Every sign-in page (log in, register, forgot / reset password). Wide screens: a velvet panel
 * with the arch-framed necklace from the home page beside the form; phones: just the form.
 */
export function AuthCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mx-auto grid max-w-5xl gap-0 px-4 py-10 md:grid-cols-[1fr_1.1fr] md:py-16">
      <div className="bg-primary text-primary-foreground relative hidden overflow-hidden rounded-l-lg p-10 md:flex md:flex-col md:justify-between">
        <div>
          <p className="text-xs font-semibold tracking-[0.18em] text-[#e2c58a] uppercase">
            Welcome
          </p>
          <p className="mt-2 text-3xl leading-tight" style={{ fontFamily: "var(--font-display)" }}>
            Jewellery made to be handed down
          </p>
          <Ornament className="mt-4 text-[#c9a45c]" />
        </div>
        <div className="arch relative mx-auto mt-8 aspect-[4/5] w-full max-w-[15rem] border border-[#c9a45c]/60 bg-black">
          <Image
            src="/images/editorial/kundan-necklace.jpg"
            alt=""
            fill
            sizes="240px"
            className="object-cover opacity-90"
          />
        </div>
        <ul className="mt-8 space-y-1.5 text-sm text-[#ead9dd]">
          <li>BIS hallmarked gold · certified diamonds</li>
          <li>Insured shipping in tamper-proof boxes</li>
          <li>Your saved cart, wishlist and orders in one place</li>
        </ul>
      </div>
      <div className="border-border rounded-lg border bg-white/70 p-6 sm:p-10 md:rounded-l-none md:border-l-0">
        <h1 className="text-3xl md:text-4xl">{title}</h1>
        <Ornament className="mt-3" />
        <div className="mt-6 space-y-6">{children}</div>
      </div>
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
