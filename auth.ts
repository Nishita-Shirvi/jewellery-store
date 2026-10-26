import NextAuth, { CredentialsSignin } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import { PrismaAdapter } from "@auth/prisma-adapter";
import type { Provider } from "next-auth/providers";
import { authConfig } from "@/auth.config";
import { db } from "@/lib/db";
import { env, isGoogleAuthEnabled } from "@/lib/env";
import { logger } from "@/lib/logger";
import { getClientIp } from "@/lib/request";
import { rateLimit, resetRateLimit } from "@/lib/rate-limit";
import { loginSchema } from "@/lib/validation/auth";
import { verifyCredentials } from "@/services/auth.service";
import { mergeGuestCartIntoUser } from "@/services/cart.service";

/** Thrown from authorize() when there are too many attempts. */
export class TooManyAttempts extends CredentialsSignin {
  code = "rate_limited";
}

const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_LIMIT_PER_EMAIL = 5; // per email + IP
const LOGIN_LIMIT_PER_IP = 30; // across all emails from one IP

const providers: Provider[] = [
  Credentials({
    credentials: {
      email: { label: "Email", type: "email" },
      password: { label: "Password", type: "password" },
    },
    // Rate limiting lives here (not only in the form action) so that posting straight
    // to /api/auth/callback/credentials is limited too.
    async authorize(rawCredentials, request) {
      const parsed = loginSchema.safeParse(rawCredentials);
      if (!parsed.success) return null;

      const ip = getClientIp(request.headers);
      const emailKey = `login:${parsed.data.email}:${ip}`;
      const ipLimit = rateLimit(`login-ip:${ip}`, LOGIN_LIMIT_PER_IP, LOGIN_WINDOW_MS);
      const emailLimit = rateLimit(emailKey, LOGIN_LIMIT_PER_EMAIL, LOGIN_WINDOW_MS);
      if (!ipLimit.ok || !emailLimit.ok) {
        logger.warn("auth.login_rate_limited", { ip });
        throw new TooManyAttempts();
      }

      const user = await verifyCredentials(parsed.data);
      if (!user) return null;

      resetRateLimit(emailKey);
      return { id: user.id, email: user.email, name: user.name, role: user.role };
    },
  }),
];

if (isGoogleAuthEnabled) {
  providers.push(
    Google({
      clientId: env.AUTH_GOOGLE_ID,
      clientSecret: env.AUTH_GOOGLE_SECRET,
      // Linking a Google login to an existing email+password account is OFF on purpose:
      // emails aren't verified at registration, so automatic linking could let someone
      // who registered with another person's email keep access. See Docs/note.md.
      allowDangerousEmailAccountLinking: false,
    }),
  );
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  adapter: PrismaAdapter(db),
  providers,
  callbacks: {
    ...authConfig.callbacks,
    signIn({ account, profile }) {
      // Only accept Google accounts whose email Google has verified.
      if (account?.provider === "google") return profile?.email_verified === true;
      return true;
    },
  },
  events: {
    async signIn({ user, account }) {
      logger.info("auth.sign_in", { userId: user.id, provider: account?.provider });
      // Move anything added to the cart while logged out into the saved cart.
      if (user.id) {
        try {
          await mergeGuestCartIntoUser(user.id);
        } catch (error) {
          logger.error("cart.merge_after_login_failed", { userId: user.id, error }); // never block login
        }
      }
    },
  },
});
