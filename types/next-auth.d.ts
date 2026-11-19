import type { Role } from "@prisma/client";
import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface User {
    role?: Role;
  }

  interface Session {
    user: {
      id: string;
      role: Role;
    } & DefaultSession["user"];
  }
}

declare module "@auth/core/jwt" {
  interface JWT {
    id?: string;
    role?: Role;
    /** When this session signed in (ms). Sessions older than a password change are ended. */
    signedInAt?: number;
    /** Last time the server re-checked the account (ms). */
    checkedAt?: number;
  }
}
