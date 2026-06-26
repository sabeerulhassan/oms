import { Router, Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { requireAuth } from '../middleware/auth.middleware';
import { AppError } from '../utils/AppError';

import customerRouter from './customers';
import orderRouter from './orders';
import messageRouter from './messages';
import referralRouter from './referrals';
import trackingRouter from './tracking';
import productRouter from './products'; // <-- Import new product router

const router = Router();

router.get('/health', (req: Request, res: Response) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

router.post('/login', (req: Request, res: Response, next: NextFunction) => {
  const { email, password } = req.body;
  
  if (email === process.env.ADMIN_EMAIL && password === process.env.ADMIN_PASSWORD_HASH) {
    const secret = process.env.JWT_SECRET;

    if (!secret) {
      return next(new AppError('Server auth configuration error', 500));
    }

    const token = jwt.sign(
      { email, role: 'admin' }, 
      secret, 
      { expiresIn: '30d' }
    );
    return res.json({ token });
  }

  next(new AppError('Invalid credentials', 401));
});

router.use('/customers', customerRouter);
router.use('/orders', orderRouter);
router.use('/messages', messageRouter);
router.use('/referrals', referralRouter);
router.use('/tracking', trackingRouter);
router.use('/products', productRouter); // <-- Mount new product router

export default router;