import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface FormFieldProps extends React.ComponentProps<"input"> {
  label: string;
  name: string;
  errors?: string[];
  hint?: string;
}

/** Label + input + error message, wired up for screen readers. */
export function FormField({ label, name, errors, hint, id, ...inputProps }: FormFieldProps) {
  const inputId = id ?? name;
  const errorId = `${inputId}-error`;
  const hintId = `${inputId}-hint`;
  const describedBy = [errors?.length ? errorId : null, hint ? hintId : null]
    .filter(Boolean)
    .join(" ");

  return (
    <div className="space-y-1.5">
      <Label htmlFor={inputId}>{label}</Label>
      <Input
        id={inputId}
        name={name}
        aria-invalid={errors?.length ? true : undefined}
        aria-describedby={describedBy || undefined}
        className="aria-invalid:border-red-600"
        {...inputProps}
      />
      {hint && !errors?.length && (
        <p id={hintId} className="text-muted-foreground text-xs">
          {hint}
        </p>
      )}
      {errors?.length ? (
        <p id={errorId} className="text-xs text-red-700">
          {errors[0]}
        </p>
      ) : null}
    </div>
  );
}
