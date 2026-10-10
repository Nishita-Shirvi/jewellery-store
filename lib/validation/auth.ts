import { z } from "zod";

const email = z
  .string({ message: "Enter your email address" })
  .trim()
  .toLowerCase()
  .min(1, { message: "Enter your email address" })
  .max(254, { message: "Email address is too long" })
  .pipe(z.email({ message: "Enter a valid email address" }));

export const loginSchema = z.object({
  email,
  // No strength rules on login: just reject empty or absurdly long input.
  password: z
    .string({ message: "Enter your password" })
    .min(1, { message: "Enter your password" })
    .max(200, { message: "Password is too long" }),
});

export const passwordSchema = z
  .string({ message: "Enter a password" })
  .min(8, { message: "Password must be at least 8 characters" })
  .max(72, { message: "Password must be 72 characters or fewer" })
  .refine((value) => /[A-Za-z]/.test(value) && /\d/.test(value), {
    message: "Password must contain at least one letter and one number",
  });

export const registerSchema = z
  .object({
    name: z
      .string({ message: "Enter your name" })
      .trim()
      .min(1, { message: "Enter your name" })
      .min(2, { message: "Name must be at least 2 characters" })
      .max(80, { message: "Name must be 80 characters or fewer" }),
    email,
    password: passwordSchema,
    confirmPassword: z.string({ message: "Confirm your password" }),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords don't match",
    path: ["confirmPassword"],
  });

export type LoginInput = z.infer<typeof loginSchema>;
export type RegisterInput = z.infer<typeof registerSchema>;
