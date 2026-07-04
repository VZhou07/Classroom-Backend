import "dotenv/config";
import { eq } from "drizzle-orm";
import { auth } from "../src/lib/auth.js";
import { db, pool } from "../src/db/db.js";
import { user } from "../src/db/schema/auth.js";

/**
 * Creates the first admin account. This is the only supported way to
 * produce an "admin" user - the public sign-up flow can never set role.
 *
 * Usage: ADMIN_EMAIL=... ADMIN_PASSWORD=... ADMIN_NAME=... npm run seed:admin
 */
const main = async () => {
    const email = process.env.ADMIN_EMAIL;
    const password = process.env.ADMIN_PASSWORD;
    const name = process.env.ADMIN_NAME ?? "Admin";

    if (!email || !password) {
        throw new Error(
            "ADMIN_EMAIL and ADMIN_PASSWORD env vars are required to seed an admin account",
        );
    }

    const [existing] = await db
        .select()
        .from(user)
        .where(eq(user.email, email))
        .limit(1);

    if (existing) {
        if (existing.role === "admin") {
            console.log(`Admin account already exists for ${email}`);
            return;
        }

        await db.update(user).set({ role: "admin" }).where(eq(user.id, existing.id));
        console.log(`Promoted existing user ${email} to admin`);
        return;
    }

    const result = await auth.api.signUpEmail({
        body: { email, password, name },
    });

    if (!result?.user) {
        throw new Error("Failed to create admin user");
    }

    await db.update(user).set({ role: "admin" }).where(eq(user.id, result.user.id));

    console.log(`Created admin account for ${email}`);
};

main()
    .catch((error) => {
        console.error(error);
        process.exitCode = 1;
    })
    .finally(async () => {
        await pool.end();
    });
