import serverless from 'serverless-http';
import app from './app';

// Wrap the Express app for AWS Lambda
export const handler = serverless(app);