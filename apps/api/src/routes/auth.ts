import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { asyncHandler, AppError } from '@/middleware/error-handler';
import { authRateLimiter } from '@/middleware/rate-limiter';
import { config } from '@/config';
import SimpleDatabaseService from '@/services/simple-database';

const router = Router();

// Apply rate limiting to auth routes
router.use(authRateLimiter);

// POST /api/auth/register
router.post('/register', asyncHandler(async (req, res) => {
  const { name, email, password } = req.body;

  if (!name || !email || !password) {
    throw new AppError('VALIDATION_ERROR', 'Name, email, and password are required', 400);
  }

  const db = SimpleDatabaseService.getInstance();
  
  // Check if user already exists
  const existingUser = await db.findUser(email);
  if (existingUser) {
    throw new AppError('USER_EXISTS', 'User with this email already exists', 409);
  }

  // Hash password
  const passwordHash = await bcrypt.hash(password, 10);

  // Create user
  const user = await db.createUser({
    name,
    email,
    passwordHash,
  });

  // Generate JWT token
  const token = jwt.sign(
    { id: user.id, email: user.email, name: user.name },
    config.jwtSecret,
    { expiresIn: config.jwtExpiresIn }
  );

  res.status(201).json({
    success: true,
    message: 'User registered successfully',
    data: {
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
      },
      token,
    },
  });
}));

// POST /api/auth/login
router.post('/login', asyncHandler(async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    throw new AppError('VALIDATION_ERROR', 'Email and password are required', 400);
  }

  const db = SimpleDatabaseService.getInstance();
  
  // Find user
  const user = await db.findUser(email);
  if (!user) {
    throw new AppError('INVALID_CREDENTIALS', 'Invalid email or password', 401);
  }

  // Check password
  const isValidPassword = await bcrypt.compare(password, user.passwordHash);
  if (!isValidPassword) {
    throw new AppError('INVALID_CREDENTIALS', 'Invalid email or password', 401);
  }

  // Generate JWT token
  const token = jwt.sign(
    { id: user.id, email: user.email, name: user.name },
    config.jwtSecret,
    { expiresIn: config.jwtExpiresIn }
  );

  res.json({
    success: true,
    message: 'Login successful',
    data: {
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
      },
      token,
    },
  });
}));

// POST /api/auth/logout
router.post('/logout', asyncHandler(async (req, res) => {
  // TODO: Implement user logout
  res.json({
    success: true,
    message: 'Logout endpoint - to be implemented',
    data: null,
  });
}));

// POST /api/auth/refresh
router.post('/refresh', asyncHandler(async (req, res) => {
  // TODO: Implement token refresh
  res.json({
    success: true,
    message: 'Token refresh endpoint - to be implemented',
    data: null,
  });
}));

// POST /api/auth/forgot-password
router.post('/forgot-password', asyncHandler(async (req, res) => {
  // TODO: Implement forgot password
  res.json({
    success: true,
    message: 'Forgot password endpoint - to be implemented',
    data: null,
  });
}));

// POST /api/auth/reset-password
router.post('/reset-password', asyncHandler(async (req, res) => {
  // TODO: Implement reset password
  res.json({
    success: true,
    message: 'Reset password endpoint - to be implemented',
    data: null,
  });
}));

export default router;