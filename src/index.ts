import express from 'express';
import subjectsRoutes from '../routes/subjects.js';
import departmentsRoutes from '../routes/departments.js';
import cors from 'cors';
import {securityMiddleware} from './middleware/security.js';
import { attachUser } from './middleware/auth.js';
import { toNodeHandler } from "better-auth/node";
import { auth } from './lib/auth.js';
import usersRoutes from '../routes/users.js';
import classesRoutes from '../routes/classes.js';
import invitesRoutes from '../routes/invites.js';
import dashboardRoutes from '../routes/dashboard.js';
import gradesRoutes from '../routes/grades.js';


const app = express();
const PORT_RAW = process.env.PORT;
const PORT = PORT_RAW && Number.isFinite(Number(PORT_RAW)) ? Number(PORT_RAW) : 8000;

//middleware
app.use(cors({
  origin:process.env.FRONTEND_URL,
  methods:['GET','POST','PUT','DELETE'],
  credentials:true,
}))

app.all("/api/auth/*splat",toNodeHandler(auth));

app.use(express.json());
app.use(attachUser);
app.use(securityMiddleware);
app.use("/api/subjects",subjectsRoutes);
app.use("/api/departments",departmentsRoutes);
app.use("/api/users",usersRoutes);
app.use("/api/classes",classesRoutes);
app.use("/api/invites",invitesRoutes);
app.use("/api/dashboard", dashboardRoutes);
app.use("/api", gradesRoutes);
//routes

app.get('/', (req, res) => {
  res.json({ message: 'Classroom backend is up.' });
});

app.listen(PORT, () => {
  console.log(`Server listening at http://localhost:${PORT}/`);
});

