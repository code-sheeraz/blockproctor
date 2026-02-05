import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import authRoutes from './routes/authRoutes.js';
import userRoutes from './routes/userRoutes.js';
import enrollRoutes from './routes/enrollRoutes.js';
import adminRoutes from './routes/adminRoutes.js';
import examRoutes from './routes/examRoutes.js';

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' })); // Increased limit for Base64 photos

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/enroll', enrollRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/exams', examRoutes);

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
//HEALTH CHECK
app.get('/', (req, res) => {
    res.send(`
      <h1>✅ BlockProctor Backend is Online!</h1>
      <p>Try accessing these endpoints:</p>
      <ul>
        <li><a href="/api/exams">/api/exams</a> (List Exams)</li>
        <li><a href="/api/users/6/face">/api/users/6/face</a> (Check User Face)</li>
      </ul>
    `);
});