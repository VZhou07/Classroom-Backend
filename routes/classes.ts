import { newClass } from "../src/db/schema/app";
import { db } from "../src/db/db";
import { classes } from "../src/db/schema/app";
import express from "express";
import crypto from "crypto";
import { departments } from "../src/db/schema/schema";
import { desc, eq, getTableColumns, SQL, sql } from "drizzle-orm";
import { and, or } from "drizzle-orm";
import { ilike } from "drizzle-orm";    
import { subjects } from "../src/db/schema/schema";
import { user } from "../src/db/schema/auth";
const router = express.Router();

router.get("/", async (req, res) => {
    try{
        const {search, page = '1', limit = '10' } = req.query;
        const currentPage = Math.max(1, parseInt(String(page),10)||1);
        const limitPerPage = Math.min(Math.max(1,parseInt(String(limit),10)||10),100);
        const offset = (currentPage - 1) * limitPerPage;
        const filterConditions: SQL[] = [];
        if (search!==undefined){
            const clause = or(
                ilike(classes.name, search as string),
                ilike(subjects.name, search as string),
                ilike(user.name, search as string),
            );
            if (clause) filterConditions.push(clause);
        }
        const whereClause= filterConditions.length>0?(
            and(...filterConditions)):undefined;
        const countResult= await db.select({count:sql<number>`count(*)::int`}).from(classes).leftJoin(subjects, eq(classes.subjectId, subjects.id)).leftJoin(user, eq(classes.teacherId, user.id)).where(whereClause);
        const totalCount=countResult[0]?.count??0;
        const classList= await db.select({...getTableColumns(classes),
            subject:{...getTableColumns(subjects)},
            teacher:{...getTableColumns(user)}
        }).from(classes).leftJoin(subjects, eq(classes.subjectId, subjects.id)).leftJoin(user, eq(classes.teacherId, user.id)).where(whereClause)
        .orderBy(desc(classes.createdAt)).limit(limitPerPage).offset(offset);
        return res.status(200).json({ data: classList , pagination:{page:currentPage,limit:limitPerPage,total:totalCount,totalPages:Math.ceil(totalCount/limitPerPage)}});
    }
    catch(error){
        console.error(error);
        return res.status(500).json({ error:`${error}`});
    }
});

router.post("/", async (req, res) => {
    try{
        const {name, description, subjectId, teacherId, capacity, status, bannerUrl, bannerCldPubId} = req.body;
        const classData:newClass={
            name,
            description,
            subjectId,
            teacherId,
            capacity,
            status,
            bannerUrl,
            bannerCldPubId,
            inviteCode: crypto.randomUUID(),
            schedules:[],
        }
        const [createdClass] = await db
            .insert(classes)
            .values(classData)
            .returning();

        if (!createdClass) {
            return res.status(400).json({ message: "Failed to create class" });
        }

        return res.status(200).json({ data: createdClass });
    }
    catch(error){
        console.error(error);
        return res.status(500).json({
            message: error instanceof Error ? error.message : "Failed to create class",
        });
    }

});

router.get("/:id",async(req,res)=>{
    const classId=Number(req.params.id);
    if(isNaN(classId)){
        return res.status(400).json({message:"Invalid class ID"});
    }
    const classData=await db.select(
        {...getTableColumns(classes),
        subject:{...getTableColumns(subjects)},
        teacher:{...getTableColumns(user)},
        department:{...getTableColumns(departments)},
    }).from(classes).leftJoin(subjects, eq(classes.subjectId, subjects.id)).leftJoin(user, eq(classes.teacherId, user.id)).leftJoin(departments, eq(subjects.departmentId, departments.id)).where(eq(classes.id,classId));
    if(!classData){
        return res.status(404).json({message:"Class not found"});
    }
    return res.status(200).json({data:classData[0]??null});

})

export default router;