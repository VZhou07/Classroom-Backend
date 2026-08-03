import { lt } from "drizzle-orm";
import { db } from "../db/db.js";
import { session } from "../db/schema/auth.js";

export async function deleteExpiredSessions(): Promise<number> {
    const deleted = await db
        .delete(session)
        .where(lt(session.expiresAt, new Date()))
        .returning({ id: session.id });

    return deleted.length;
}
