import type { SessionUser } from "./types/session.js";

declare global{
    namespace Express{
        interface Request{
            user?: SessionUser;
        }
    }
}

export {};
