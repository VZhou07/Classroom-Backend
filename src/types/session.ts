import type { auth } from "../lib/auth.js";

// better-auth types the `role` additional field as a generic `string`; narrow it
// back to the actual Postgres enum since that's what the DB guarantees.
export type SessionUser = Omit<
    NonNullable<Awaited<ReturnType<typeof auth.api.getSession>>>["user"],
    "role"
> & { role: UserRole };
