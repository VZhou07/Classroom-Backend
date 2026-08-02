import "dotenv/config";
import { deleteExpiredSessions } from "../src/lib/session-cleanup.js";
import { pool } from "../src/db/db.js";

const main = async () => {
    const count = await deleteExpiredSessions();
    console.log(`Deleted ${count} expired session(s)`);
};

main()
    .catch((error) => {
        console.error(error);
        process.exitCode = 1;
    })
    .finally(async () => {
        await pool.end();
    });
