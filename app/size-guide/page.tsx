import type { Metadata } from "next";
import Link from "next/link";
import { config } from "@/lib/config";
import { BANGLE_SIZES, RING_SIZES } from "@/lib/storefront";

export const metadata: Metadata = {
  title: "Ring and bangle size guide",
  description: "Find your Indian ring and bangle size at home with a thread or an old ring.",
  alternates: { canonical: "/size-guide" },
};

export default function SizeGuidePage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-12">
      <h1 className="text-3xl md:text-4xl">Size guide</h1>
      <p className="text-muted-foreground mt-3">
        Measurements are a guide. Fingers change size through the day, so measure in the evening,
        when they are largest. Not sure?{" "}
        {config.features.visit_booking ? (
          <>
            <Link href="/visit" className="underline underline-offset-4">
              Visit the showroom
            </Link>{" "}
            and we&apos;ll size you properly
          </>
        ) : (
          "Contact us and we'll help"
        )}
        .
      </p>

      <section aria-labelledby="ring-heading" className="mt-10">
        <h2 id="ring-heading" className="text-2xl">
          Rings
        </h2>
        <ol className="mt-3 list-decimal space-y-1 pl-5 text-sm">
          <li>Wrap a strip of paper or thread around the base of the finger.</li>
          <li>Mark where it overlaps and measure the length in millimetres.</li>
          <li>
            That is the circumference: pick the size with the nearest value (choose the larger one
            if you&apos;re between sizes).
          </li>
        </ol>
        <p className="text-muted-foreground mt-2 text-sm">
          Already have a ring that fits? Measure its inside diameter instead.
        </p>
        <div className="border-border mt-4 overflow-x-auto rounded-md border">
          <table className="w-full text-sm">
            <caption className="sr-only">Indian ring sizes</caption>
            <thead className="bg-muted text-muted-foreground text-left text-xs">
              <tr>
                <th className="p-3">Indian size</th>
                <th className="p-3">Inside circumference</th>
                <th className="p-3">Inside diameter</th>
              </tr>
            </thead>
            <tbody className="divide-border divide-y">
              {RING_SIZES.map((r) => (
                <tr key={r.size}>
                  <td className="p-3 font-medium">{r.size}</td>
                  <td className="p-3">{r.circumferenceMm.toFixed(1)} mm</td>
                  <td className="p-3">{r.diameterMm.toFixed(1)} mm</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section aria-labelledby="bangle-heading" className="mt-12">
        <h2 id="bangle-heading" className="text-2xl">
          Bangles
        </h2>
        <ol className="mt-3 list-decimal space-y-1 pl-5 text-sm">
          <li>Take a bangle that slips over your hand comfortably.</li>
          <li>Measure its inside diameter (edge to edge, through the centre) in millimetres.</li>
          <li>Pick the size with the nearest diameter.</li>
        </ol>
        <div className="border-border mt-4 overflow-x-auto rounded-md border">
          <table className="w-full text-sm">
            <caption className="sr-only">Bangle sizes</caption>
            <thead className="bg-muted text-muted-foreground text-left text-xs">
              <tr>
                <th className="p-3">Size</th>
                <th className="p-3">Inside diameter</th>
              </tr>
            </thead>
            <tbody className="divide-border divide-y">
              {BANGLE_SIZES.map((b) => (
                <tr key={b.size}>
                  <td className="p-3 font-medium">{b.size}</td>
                  <td className="p-3">{b.diameterMm.toFixed(1)} mm</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
