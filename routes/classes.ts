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

export default router;