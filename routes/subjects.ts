import express from 'express';
import { type SQL, and, eq, getTableColumns, ilike, or, sql } from 'drizzle-orm';
import { departments, subjects } from '../src/db/schema/schema.js';
import { db } from '../src/db/db.js';
import { desc } from 'drizzle-orm';

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
    // #region agent log
    fetch('http://127.0.0.1:7737/ingest/1ef87483-3b9d-44bb-b521-32d323043ded',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'9f9886'},body:JSON.stringify({sessionId:'9f9886',runId:'pre-fix',hypothesisId:'H5',location:'routes/subjects.ts:32',message:'Entered subjects route handler',data:{path:req.path,originalUrl:req.originalUrl,query:req.query},timestamp:Date.now()})}).catch(()=>{});
    // #endregion
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

export default router;
