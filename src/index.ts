import express from 'express';
import subjectsRoutes from '../routes/subjects.js';
const app = express();
const PORT = 8000;

app.use(express.json());

app.use("/api/subjects",subjectsRoutes);

app.get('/', (req, res) => {
  res.json({ message: 'Classroom backend is up.' });
});

app.listen(PORT, () => {
  console.log(`Server listening at http://localhost:${PORT}/`);
});
