import express from 'express';
import { type SQL, and, eq, getTableColumns, ilike, or, sql } from 'drizzle-orm';
import { departments, subjects, type newSubject } from '../src/db/schema/schema.js';
import { db } from '../src/db/db.js';
import { desc } from 'drizzle-orm';
import { requireAuth, requireRole } from '../src/middleware/auth.js';

/** First non-empty string from Express query (avoids arrays/objects in ILIKE patterns). */
function queryString(param: unknown): string | undefined {
  if (typeof param === 'string' && param.length > 0) return param;
  if (Array.isArray(param)) {
    const first = param.find((x): x is string => typeof x === 'string' && x.length > 0);
    return first;
  }
  return undefined;
}

/** Escape `\`, `%`, `_` for PostgreSQL LIKE/ILIKE (default escape `\`). */
function escapePgLikePattern(raw: string): string {
  return raw.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_');
}

function ilikeContains(column: Parameters<typeof ilike>[0], raw: string): ReturnType<typeof ilike> {
  const safe = `%${escapePgLikePattern(raw)}%`;
  return ilike(column, safe);
}

const router = express.Router();
// get all subjects with optional search filtering and pagination
router.get('/', async (req, res) => {
  try {
    const { search, department, page = '1', limit = '10' } = req.query;
    const currentPage = Math.max(1, parseInt(String(page),10)||1);
    const limitPerPage = Math.min(Math.max(1,parseInt(String(limit),10)||10),100);
    const offset = (currentPage - 1) * limitPerPage;
    const filterConditions: SQL[] = [];
    const searchTerm = queryString(search);
    if (searchTerm !== undefined) {
      const clause = or(
        ilikeContains(subjects.name, searchTerm),
        ilikeContains(subjects.code, searchTerm),
        ilikeContains(subjects.description, searchTerm),
        ilikeContains(departments.name, searchTerm),
        ilikeContains(departments.code, searchTerm),
        ilikeContains(departments.description, searchTerm),
      );
      if (clause) filterConditions.push(clause);
    }
    const departmentTerm = queryString(department);
    if (departmentTerm !== undefined) {
      const clause = or(
        ilikeContains(departments.name, departmentTerm),
        ilikeContains(departments.code, departmentTerm),
        ilikeContains(departments.description, departmentTerm),
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

router.post('/', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const { name, code, description, departmentId } = req.body as {
      name?: string;
      code?: string;
      description?: string;
      departmentId?: number | string;
    };

    const parsedDepartmentId =
      typeof departmentId === 'number'
        ? departmentId
        : typeof departmentId === 'string'
          ? Number(departmentId)
          : NaN;

    if (
      !name ||
      !code ||
      !description ||
      !Number.isInteger(parsedDepartmentId) ||
      parsedDepartmentId < 1
    ) {
      return res.status(400).json({
        message: 'name, code, description, and departmentId are required',
      });
    }

    const [matchedDepartment] = await db
      .select({ id: departments.id })
      .from(departments)
      .where(eq(departments.id, parsedDepartmentId))
      .limit(1);

    if (!matchedDepartment) {
      return res.status(404).json({ message: 'Department not found' });
    }

    const subjectData: newSubject = {
      name,
      code,
      description,
      departmentId: matchedDepartment.id,
    };

    const [createdSubject] = await db
      .insert(subjects)
      .values(subjectData)
      .returning();

    if (!createdSubject) {
      return res.status(400).json({ message: 'Failed to create subject' });
    }

    return res.status(200).json({ data: createdSubject });
  } catch (error) {
    console.error(error);
    return res.status(500).json({
      message: 'Failed to create subject',
    });
  }
});

export default router;
