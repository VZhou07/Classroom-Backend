import express from 'express';

const app = express();
const PORT = 8000;

app.use(express.json());

app.get('/', (req, res) => {
  res.json({ message: 'Classroom backend is up.' });
});

app.listen(PORT, () => {
  console.log(`Server listening at http://localhost:${PORT}/`);
});
