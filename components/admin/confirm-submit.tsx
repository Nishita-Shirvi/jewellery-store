"use client";

import { useRef } from "react";
import type { buttonVariants } from "@/components/ui/button";
import { Button } from "@/components/ui/button";
import type { VariantProps } from "class-variance-authority";

/**
 * A button that asks "Are you sure?" in an accessible <dialog> before submitting its form.
 * Use for destructive admin actions (deactivate, delete, cancel order).
 */
export function ConfirmSubmit({
  label,
  title,
  description,
  confirmLabel = "Yes, continue",
  variant = "outline",
  size = "sm",
}: {
  label: string;
  title: string;
  description: string;
  confirmLabel?: string;
} & VariantProps<typeof buttonVariants>) {
  const dialog = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);

  return (
    <>
      <Button
        ref={trigger}
        type="button"
        variant={variant}
        size={size}
        onClick={() => dialog.current?.showModal()}
      >
        {label}
      </Button>
      <dialog
        ref={dialog}
        className="border-border bg-background text-foreground m-auto w-[min(92vw,420px)] rounded-lg border p-6 shadow-xl backdrop:bg-black/40"
        aria-labelledby="confirm-title"
      >
        <h2 id="confirm-title" className="text-lg font-semibold">
          {title}
        </h2>
        <p className="text-muted-foreground mt-2 text-sm">{description}</p>
        <div className="mt-6 flex justify-end gap-2">
          <Button type="button" variant="outline" size="sm" onClick={() => dialog.current?.close()}>
            Keep it
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={() => {
              dialog.current?.close();
              trigger.current?.closest("form")?.requestSubmit();
            }}
          >
            {confirmLabel}
          </Button>
        </div>
      </dialog>
    </>
  );
}
