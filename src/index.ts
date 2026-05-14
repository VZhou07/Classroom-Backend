import express from 'express';
import subjectsRoutes from '../routes/subjects.js';
import cors from 'cors';
import {securityMiddleware} from './middleware/security.js';
const app = express();
const PORT = 8000;

//middleware
app.use(cors({
  origin:process.env.FRONTEND_URL,
  methods:['GET','POST','PUT','DELETE'],
  credentials:true,
}))

app.use(express.json());
app.use((req, _res, next) => {
  // #region agent log
  fetch('http://127.0.0.1:7737/ingest/1ef87483-3b9d-44bb-b521-32d323043ded',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'9f9886'},body:JSON.stringify({sessionId:'9f9886',runId:'pre-fix',hypothesisId:'H4',location:'src/index.ts:17',message:'Backend received request',data:{method:req.method,path:req.path,originalUrl:req.originalUrl,origin:req.headers.origin},timestamp:Date.now()})}).catch(()=>{});
  // #endregion
  next();
});
app.use(securityMiddleware);
app.use("/api/subjects",subjectsRoutes);

//routes

app.get('/', (req, res) => {
  res.json({ message: 'Classroom backend is up.' });
});

app.listen(PORT, () => {
  console.log(`Server listening at http://localhost:${PORT}/`);
});
