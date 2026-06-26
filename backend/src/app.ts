import express from "express";
import cors, { CorsOptions } from "cors";
import router from "./routes";
import { errorHandler } from "./middleware/error.middleware"; // Assuming you have an error handler

const app = express();

const allowedOrigins = (process.env.CORS_ORIGINS || process.env.FRONTEND_URL || "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

// 1. Body Parsers
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// 2. CORS Setup - Added 'PUT' and 'DELETE' to allowed HTTP methods
const corsOptions: CorsOptions = {
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.length === 0 || allowedOrigins.includes(origin)) {
      return callback(null, true);
    }

    return callback(new Error(`CORS blocked for origin: ${origin}`));
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'], // <-- Fixed: Added PUT and DELETE
  credentials: true
};

app.use(cors(corsOptions));

// 3. Mount routes
app.use('/api', router);

// 4. Global Error Handling
app.use(errorHandler);

export default app;