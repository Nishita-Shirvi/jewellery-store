"use client";

import { useActionState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { saveCategoryAction, type AdminFormState } from "@/app/admin/actions";

export function CategoryForm({
  category,
}: {
  category?: { id: string; name: string; slug: string; sortOrder: number; isActive: boolean };
}) {
  const [state, formAction, pending] = useActionState<AdminFormState, FormData>(
    saveCategoryAction,
    {},
  );
  // Submit without React's automatic form reset, so fields always keep what the admin typed.
  const [, startSubmit] = useTransition();
  const submitWithoutReset = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    startSubmit(() => formAction(data));
  };
  const e = state.fieldErrors ?? {};
  const prefix = category ? `cat-${category.id}` : "cat-new";

  return (
    <form
      onSubmit={submitWithoutReset}
      className="flex flex-wrap items-start gap-2"
      aria-label={category ? `Edit ${category.name}` : "New category"}
    >
      {category && <input type="hidden" name="id" value={category.id} />}
      <div>
        <Input
          name="name"
          defaultValue={category?.name}
          placeholder="Name"
          aria-label="Name"
          id={`${prefix}-name`}
          className="h-8 w-48"
          aria-invalid={e.name ? true : undefined}
        />
        {e.name && <p className="text-xs text-red-700">{e.name[0]}</p>}
      </div>
      <div>
        <Input
          name="slug"
          defaultValue={category?.slug}
          placeholder="url-name (optional)"
          aria-label="URL name"
          className="h-8 w-48"
          aria-invalid={e.slug ? true : undefined}
        />
        {e.slug && <p className="text-xs text-red-700">{e.slug[0]}</p>}
      </div>
      <Input
        name="sortOrder"
        type="number"
        min={0}
        defaultValue={category?.sortOrder ?? 0}
        aria-label="Sort order"
        className="h-8 w-20"
      />
      <label className="flex h-8 items-center gap-1 text-sm">
        <input type="checkbox" name="isActive" defaultChecked={category?.isActive ?? true} />{" "}
        Visible
      </label>
      <Button type="submit" size="sm" variant={category ? "outline" : "default"} disabled={pending}>
        {pending ? "Saving…" : category ? "Save" : "Add category"}
      </Button>
      {(state.error || state.message) && (
        <p
          role={state.error ? "alert" : "status"}
          className={`w-full text-xs ${state.error ? "text-red-700" : "text-emerald-700"}`}
        >
          {state.error ?? state.message}
        </p>
      )}
    </form>
  );
}
