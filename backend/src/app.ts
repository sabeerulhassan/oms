import express from "express";
import cors from "cors";
import router from "./routes";
import { errorHandler } from "./middleware/error.middleware"; // Assuming you have an error handler

const app = express();

// 1. Body Parsers
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// 2. CORS Setup - Added 'PUT' and 'DELETE' to allowed HTTP methods
app.use(cors({
  origin: process.env.FRONTEND_URL || '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'], // <-- Fixed: Added PUT and DELETE
  credentials: true
}));

// 3. Mount routes
app.use('/api', router);

// 4. Global Error Handling
app.use(errorHandler);

export default app;