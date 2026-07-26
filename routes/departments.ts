import express from 'express';
import { getTableColumns } from 'drizzle-orm';
import { departments } from '../src/db/schema/schema.js';
import { db } from '../src/db/db.js';
import { asc } from 'drizzle-orm';

const router = express.Router();

router.get('/', async (_req, res) => {
  try {
    const departmentsList = await db
      .select(getTableColumns(departments))
      .from(departments)
      .orderBy(asc(departments.name));

    return res.status(200).json({
      data: departmentsList,
      pagination: {
        page: 1,
        limit: departmentsList.length,
        total: departmentsList.length,
        totalPages: 1,
      },
    });
  } catch (error) {
    console.error('Error fetching departments:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
