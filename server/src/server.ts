import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import router from './routes_v2';
import { statusGuard } from './middleware/auth';

dotenv.config();

const app = express();
const port = process.env.PORT || 9102;

app.use(cors());
app.use(express.json());

// Apply Status Guard to all API routes
app.use('/api', statusGuard);
app.use('/api', router);

console.log('Routes mounted at /api');

app.post('/api/test', (req, res) => res.json({ message: 'Direct route works' }));

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
