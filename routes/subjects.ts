import express from 'express';
import { type SQL, and, eq, getTableColumns, ilike, or, sql } from 'drizzle-orm';
import { departments, subjects } from '../src/db/schema/schema.js';
import { db } from '../src/db/db.js';
import { desc } from 'drizzle-orm';

const router = express.Router();
// get all subjects with optional search filtering and pagination
router.get('/', async (req, res) => {
  try {
    const { search, department, page = '1', limit = '10' } = req.query;
    const currentPage = Math.max(1, +page);
    const limitPerPage = Math.max(1, +limit);
    const offset = (currentPage - 1) * limitPerPage;
    const filterConditions: SQL[] = [];
    if (typeof search === 'string' && search.length > 0) {
      const clause = or(
        ilike(subjects.name, `%${search}%`),
        ilike(subjects.code, `%${search}%`),
        ilike(subjects.description, `%${search}%`),
        ilike(departments.name, `%${search}%`),
        ilike(departments.code, `%${search}%`),
        ilike(departments.description, `%${search}%`),
      );
      if (clause) filterConditions.push(clause);
    }
    if (department) {
      const clause = or(
        ilike(departments.name, `%${department}%`),
        ilike(departments.code, `%${department}%`),
        ilike(departments.description, `%${department}%`),
      );
      if (clause) filterConditions.push(clause);
    }
    const whereClause= filterConditions.length>0?(
        and(...filterConditions)):undefined;
        
    const countResult = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(subjects)
      .leftJoin(departments, eq(subjects.departmentId, departments.id))
      .where(whereClause);
    const totalCount=countResult[0]?.count??0;
    const subjectsList=await db.select({...getTableColumns(subjects),
        department:{...getTableColumns(departments)}
    }).from(subjects).leftJoin(departments,eq(subjects.departmentId,departments.id)).where(whereClause)
    .orderBy(desc(subjects.createdAt)).limit(limitPerPage).offset(offset);
    
    res.status(200).json({
        data:subjectsList,
        pagination:{
            page:currentPage,
            limit:limitPerPage,
            total:totalCount,
            totalPages:Math.ceil(totalCount/limitPerPage),
        }
      })
} catch (error) {
    console.error('Error fetching subjects:', error);
    res.status(500).json({ error: 'Internal server error' });
  }

});

export default router;
