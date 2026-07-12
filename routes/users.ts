import express from 'express';
import { db } from '../src/db/db.js';
import { user } from '../src/db/schema/auth.js';
import { eq } from 'drizzle-orm';
import { requireAuth, requireRole } from '../src/middleware/auth.js';

const router = express.Router();

router.get('/', requireAuth, requireRole('admin'), async (req, res) => {
    try{
        const role=req.query.role as UserRole;
        const teachers= await db.select({id:user.id,name:user.name}).from(user).where(eq(user.role,role as UserRole));
        return res.status(200).json({data:teachers});
    } catch (error) {
        console.error('Error fetching teachers:', error);
        return res.status(500).json({ error: 'Internal server error' });
    }
});


export default router;
