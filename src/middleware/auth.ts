import type { NextFunction, Request, Response } from "express";
import { fromNodeHeaders } from "better-auth/node";
import { auth } from "../lib/auth.js";
import type { SessionUser } from "../types/session.js";

export const requireAuth = async (
    req: Request,
    res: Response,
    next: NextFunction,
) => {
    try {
        const session = await auth.api.getSession({
            headers: fromNodeHeaders(req.headers),
        });

        if (!session) {
            return res.status(401).json({ message: "Unauthorized" });
        }

        req.user = session.user as SessionUser;
        next();
    } catch (error) {
        console.error(error);
        return res.status(401).json({ message: "Unauthorized" });
    }
};

export const requireRole = (...roles: UserRole[]) => {
    return (req: Request, res: Response, next: NextFunction) => {
        if (!req.user || !roles.includes(req.user.role)) {
            return res.status(403).json({ message: "Forbidden" });
        }
        next();
    };
};

/**
 * Best-effort session lookup that never blocks the request. Populates
 * `req.user` when a valid session exists so downstream middleware (e.g. rate
 * limiting by role) and routes can read it without forcing authentication.
 */
export const attachUser = async (
    req: Request,
    _res: Response,
    next: NextFunction,
) => {
    try {
        const session = await auth.api.getSession({
            headers: fromNodeHeaders(req.headers),
        });

        if (session) {
            req.user = session.user as SessionUser;
        }
    } catch (error) {
        console.error(error);
    }

    next();
};
