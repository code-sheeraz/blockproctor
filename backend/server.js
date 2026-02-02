// server.js
import express from 'express';
import dotenv from 'dotenv';

import userRoutes from './routes/userRoutes.js';
import examRoutes from './routes/examRoutes.js';
import attemptRoutes from './routes/attemptRoutes.js';
import instructorRoutes from './routes/instructorRoutes.js';
import blockchainRoutes from "./routes/blockchainRoutes.js";


dotenv.config();

const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// simple logger (optional, but you were using something like this before)
app.use((req, res, next) => {
  const now = new Date().toISOString();
  console.log(`${now} | ${req.method} ${req.url}`);
  next();
});

app.get('/', (req, res) => {
  res.send('BlockProctor backend is running');
});

// mount existing routes
app.use('/api/users', userRoutes);
app.use('/api', examRoutes);
app.use('/api', attemptRoutes);
app.use('/api', instructorRoutes);
app.use("/api/blockchain", blockchainRoutes);

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log(`${new Date().toISOString()} | Server listening on ${PORT}`);
});
