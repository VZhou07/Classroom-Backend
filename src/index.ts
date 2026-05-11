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

app.use(securityMiddleware);

app.use(express.json());
app.use("/api/subjects",subjectsRoutes);

//routes

app.get('/', (req, res) => {
  res.json({ message: 'Classroom backend is up.' });
});

app.listen(PORT, () => {
  console.log(`Server listening at http://localhost:${PORT}/`);
});
