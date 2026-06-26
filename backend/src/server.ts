import dotenv from 'dotenv';
dotenv.config();

import app from './app';

const PORT = process.env.PORT || 8080;

app.listen(Number(PORT), "0.0.0.0", () => {
  console.log(`🚀 OMS backend running on port ${PORT}`);
});