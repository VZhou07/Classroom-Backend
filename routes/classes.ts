import { newClass } from "../src/db/schema/app";
import { db } from "../src/db/db";
import { classes } from "../src/db/schema/app";
import express from "express";
import crypto from "crypto";

const router = express.Router();

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
        const createdClass=res.status(200).json(await db.insert(classes).values(classData).returning());
        if(createdClass){
            return res.status(200).json(createdClass);
        }
        else{
            return res.status(400).json({error:"Failed to create class"});
        }
    }
    catch(error){
        console.error(error)
    }

});

export default router;