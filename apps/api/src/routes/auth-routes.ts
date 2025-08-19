import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import bcrypt from 'bcryptjs';
import { logger } from '../utils/logger';
import JWTService from '../auth/jwt-service';
import { requireAuth, optionalAuth, AuthenticatedRequest } from '../middleware/auth-middleware';
import { DatabaseService } from '../services/database';

// =============================================================================
// SECURE AUTHENTICATION ROUTES
// Master Plan: Complete auth system with registration, login, and token management
// =============================================================================

interface RegisterRequest {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  acceptTerms: boolean;
}

interface LoginRequest {
  email: string;
  password: string;
  rememberMe?: boolean;
  deviceId?: string;
}

interface RefreshTokenRequest {
  refreshToken: string;
}

interface ChangePasswordRequest {
  currentPassword: string;
  newPassword: string;
}

interface ForgotPasswordRequest {
  email: string;
}

interface ResetPasswordRequest {
  token: string;
  newPassword: string;
}

// =============================================================================
// AUTHENTICATION ROUTES IMPLEMENTATION
// =============================================================================

export async function authRoutes(fastify: FastifyInstance) {
  const jwtService = JWTService.getInstance();
  const dbService = DatabaseService.getInstance();

  // =============================================================================
  // REGISTRATION ROUTE
  // =============================================================================

  fastify.post('/auth/register', {
    schema: {
      description: 'Register a new user account',
      tags: ['Authentication'],
      body: {
        type: 'object',
        required: ['email', 'password', 'firstName', 'lastName', 'acceptTerms'],
        properties: {
          email: {
            type: 'string',
            format: 'email',
            description: 'User email address',
          },
          password: {
            type: 'string',
            minLength: 8,
            description: 'User password (minimum 8 characters)',
          },
          firstName: {
            type: 'string',
            minLength: 1,
            maxLength: 50,
            description: 'User first name',
          },
          lastName: {
            type: 'string',
            minLength: 1,
            maxLength: 50,
            description: 'User last name',
          },
          acceptTerms: {
            type: 'boolean',
            description: 'User must accept terms and conditions',
          },
        },
      },
      response: {
        201: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            message: { type: 'string' },
            user: {
              type: 'object',
              properties: {
                id: { type: 'string' },
                email: { type: 'string' },
                firstName: { type: 'string' },
                lastName: { type: 'string' },
                role: { type: 'string' },
                createdAt: { type: 'string' },
              },
            },
            tokens: {
              type: 'object',
              properties: {
                accessToken: { type: 'string' },
                refreshToken: { type: 'string' },
                expiresIn: { type: 'number' },
                tokenType: { type: 'string' },
              },
            },
          },
        },
        400: {
          type: 'object',
          properties: {
            error: { type: 'string' },
            message: { type: 'string' },
          },
        },
      },
    },
  }, async (request: FastifyRequest<{ Body: RegisterRequest }>, reply: FastifyReply) => {
    const { email, password, firstName, lastName, acceptTerms } = request.body;

    try {
      // Validate terms acceptance
      if (!acceptTerms) {
        return reply.status(400).send({
          error: 'Terms not accepted',
          message: 'You must accept the terms and conditions to register',
        });
      }

      // Check if user already exists
      const existingUser = await dbService.findUserByEmail(email);
      if (existingUser) {
        return reply.status(400).send({
          error: 'User exists',
          message: 'An account with this email already exists',
        });
      }

      // Validate password strength
      const passwordValidation = validatePassword(password);
      if (!passwordValidation.valid) {
        return reply.status(400).send({
          error: 'Weak password',
          message: passwordValidation.message,
        });
      }

      // Hash password
      const saltRounds = 12;
      const hashedPassword = await bcrypt.hash(password, saltRounds);

      // Create user
      const user = await dbService.createUser({
        email: email.toLowerCase(),
        password: hashedPassword,
        firstName,
        lastName,
        role: 'user',
        isEmailVerified: false,
        acceptedTermsAt: new Date(),
      });

      // Generate session ID
      const sessionId = generateSessionId();

      // Generate tokens
      const tokens = await jwtService.generateTokenPair(
        user.id,
        user.email,
        user.role,
        ['user.profile.read', 'user.profile.update'], // Default permissions
        sessionId,
        {
          userAgent: request.headers['user-agent'],
          ip: request.ip,
        }
      );

      // Log registration
      logger.info('User registered successfully', {
        userId: user.id,
        email: user.email,
        ip: request.ip,
        userAgent: request.headers['user-agent'],
      });

      // Send verification email (would be implemented)
      // await emailService.sendVerificationEmail(user.email, user.id);

      reply.status(201).send({
        success: true,
        message: 'Account created successfully. Please check your email for verification.',
        user: {
          id: user.id,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          role: user.role,
          createdAt: user.createdAt.toISOString(),
        },
        tokens,
      });

    } catch (error) {
      logger.error('Registration failed', {
        email,
        error: error.message,
        ip: request.ip,
      });

      reply.status(500).send({
        error: 'Registration failed',
        message: 'An error occurred during registration. Please try again.',
      });
    }
  });

  // =============================================================================
  // LOGIN ROUTE
  // =============================================================================

  fastify.post('/auth/login', {
    schema: {
      description: 'Authenticate user and get access tokens',
      tags: ['Authentication'],
      body: {
        type: 'object',
        required: ['email', 'password'],
        properties: {
          email: {
            type: 'string',
            format: 'email',
            description: 'User email address',
          },
          password: {
            type: 'string',
            description: 'User password',
          },
          rememberMe: {
            type: 'boolean',
            description: 'Extend session duration',
          },
          deviceId: {
            type: 'string',
            description: 'Device identifier for tracking',
          },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            message: { type: 'string' },
            user: {
              type: 'object',
              properties: {
                id: { type: 'string' },
                email: { type: 'string' },
                firstName: { type: 'string' },
                lastName: { type: 'string' },
                role: { type: 'string' },
                lastLoginAt: { type: 'string' },
              },
            },
            tokens: {
              type: 'object',
              properties: {
                accessToken: { type: 'string' },
                refreshToken: { type: 'string' },
                expiresIn: { type: 'number' },
                tokenType: { type: 'string' },
              },
            },
          },
        },
        401: {
          type: 'object',
          properties: {
            error: { type: 'string' },
            message: { type: 'string' },
          },
        },
      },
    },
  }, async (request: FastifyRequest<{ Body: LoginRequest }>, reply: FastifyReply) => {
    const { email, password, rememberMe, deviceId } = request.body;

    try {
      // Find user by email
      const user = await dbService.findUserByEmail(email.toLowerCase());
      if (!user) {
        await simulatePasswordCheck(); // Prevent timing attacks
        return reply.status(401).send({
          error: 'Invalid credentials',
          message: 'Email or password is incorrect',
        });
      }

      // Check if account is locked
      if (user.isLocked && user.lockedUntil && user.lockedUntil > new Date()) {
        const unlockTime = Math.ceil((user.lockedUntil.getTime() - Date.now()) / 1000 / 60);
        return reply.status(401).send({
          error: 'Account locked',
          message: `Account is locked. Try again in ${unlockTime} minutes.`,
        });
      }

      // Verify password
      const isPasswordValid = await bcrypt.compare(password, user.password);
      if (!isPasswordValid) {
        // Increment failed login attempts
        await dbService.incrementFailedLoginAttempts(user.id);
        
        return reply.status(401).send({
          error: 'Invalid credentials',
          message: 'Email or password is incorrect',
        });
      }

      // Check if email is verified (optional enforcement)
      if (!user.isEmailVerified) {
        logger.warn('Login attempt with unverified email', {
          userId: user.id,
          email: user.email,
        });
        // Could enforce email verification here
      }

      // Reset failed login attempts on successful login
      await dbService.resetFailedLoginAttempts(user.id);

      // Update last login
      await dbService.updateLastLogin(user.id, request.ip, request.headers['user-agent']);

      // Generate session ID
      const sessionId = generateSessionId();

      // Get user permissions
      const permissions = await getUserPermissions(user.role);

      // Generate tokens
      const tokens = await jwtService.generateTokenPair(
        user.id,
        user.email,
        user.role,
        permissions,
        sessionId,
        {
          deviceId,
          userAgent: request.headers['user-agent'],
          ip: request.ip,
        }
      );

      // Log successful login
      logger.info('User logged in successfully', {
        userId: user.id,
        email: user.email,
        ip: request.ip,
        userAgent: request.headers['user-agent'],
        deviceId,
      });

      reply.send({
        success: true,
        message: 'Login successful',
        user: {
          id: user.id,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          role: user.role,
          lastLoginAt: new Date().toISOString(),
        },
        tokens,
      });

    } catch (error) {
      logger.error('Login failed', {
        email,
        error: error.message,
        ip: request.ip,
      });

      reply.status(500).send({
        error: 'Login failed',
        message: 'An error occurred during login. Please try again.',
      });
    }
  });

  // =============================================================================
  // REFRESH TOKEN ROUTE
  // =============================================================================

  fastify.post('/auth/refresh', {
    schema: {
      description: 'Refresh access token using refresh token',
      tags: ['Authentication'],
      body: {
        type: 'object',
        required: ['refreshToken'],
        properties: {
          refreshToken: {
            type: 'string',
            description: 'Valid refresh token',
          },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            tokens: {
              type: 'object',
              properties: {
                accessToken: { type: 'string' },
                refreshToken: { type: 'string' },
                expiresIn: { type: 'number' },
                tokenType: { type: 'string' },
              },
            },
          },
        },
        401: {
          type: 'object',
          properties: {
            error: { type: 'string' },
            message: { type: 'string' },
          },
        },
      },
    },
  }, async (request: FastifyRequest<{ Body: RefreshTokenRequest }>, reply: FastifyReply) => {
    const { refreshToken } = request.body;

    try {
      // Refresh tokens
      const tokens = await jwtService.refreshTokens(refreshToken, {
        userAgent: request.headers['user-agent'],
        ip: request.ip,
      });

      logger.info('Tokens refreshed successfully', {
        ip: request.ip,
        userAgent: request.headers['user-agent'],
      });

      reply.send({
        success: true,
        tokens,
      });

    } catch (error) {
      logger.error('Token refresh failed', {
        error: error.message,
        ip: request.ip,
      });

      reply.status(401).send({
        error: 'Token refresh failed',
        message: error.message,
      });
    }
  });

  // =============================================================================
  // LOGOUT ROUTE
  // =============================================================================

  fastify.post('/auth/logout', {
    preHandler: [requireAuth()],
    schema: {
      description: 'Logout user and revoke tokens',
      tags: ['Authentication'],
      security: [{ Bearer: [] }],
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            message: { type: 'string' },
          },
        },
      },
    },
  }, async (request: AuthenticatedRequest, reply: FastifyReply) => {
    try {
      // Revoke current session
      await jwtService.revokeSession(request.user.sessionId);

      logger.info('User logged out successfully', {
        userId: request.user.id,
        sessionId: request.user.sessionId,
        ip: request.ip,
      });

      reply.send({
        success: true,
        message: 'Logged out successfully',
      });

    } catch (error) {
      logger.error('Logout failed', {
        userId: request.user.id,
        error: error.message,
      });

      reply.status(500).send({
        error: 'Logout failed',
        message: 'An error occurred during logout',
      });
    }
  });

  // =============================================================================
  // LOGOUT ALL DEVICES ROUTE
  // =============================================================================

  fastify.post('/auth/logout-all', {
    preHandler: [requireAuth()],
    schema: {
      description: 'Logout from all devices and revoke all tokens',
      tags: ['Authentication'],
      security: [{ Bearer: [] }],
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            message: { type: 'string' },
          },
        },
      },
    },
  }, async (request: AuthenticatedRequest, reply: FastifyReply) => {
    try {
      // Revoke all user tokens
      await jwtService.revokeAllUserTokens(request.user.id);

      logger.info('User logged out from all devices', {
        userId: request.user.id,
        ip: request.ip,
      });

      reply.send({
        success: true,
        message: 'Logged out from all devices successfully',
      });

    } catch (error) {
      logger.error('Logout all failed', {
        userId: request.user.id,
        error: error.message,
      });

      reply.status(500).send({
        error: 'Logout all failed',
        message: 'An error occurred during logout',
      });
    }
  });

  // =============================================================================
  // CHANGE PASSWORD ROUTE
  // =============================================================================

  fastify.post('/auth/change-password', {
    preHandler: [requireAuth()],
    schema: {
      description: 'Change user password',
      tags: ['Authentication'],
      security: [{ Bearer: [] }],
      body: {
        type: 'object',
        required: ['currentPassword', 'newPassword'],
        properties: {
          currentPassword: {
            type: 'string',
            description: 'Current password',
          },
          newPassword: {
            type: 'string',
            minLength: 8,
            description: 'New password (minimum 8 characters)',
          },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            message: { type: 'string' },
          },
        },
        400: {
          type: 'object',
          properties: {
            error: { type: 'string' },
            message: { type: 'string' },
          },
        },
      },
    },
  }, async (request: AuthenticatedRequest & { Body: ChangePasswordRequest }, reply: FastifyReply) => {
    const { currentPassword, newPassword } = request.body;

    try {
      // Get user from database
      const user = await dbService.findUserById(request.user.id);
      if (!user) {
        return reply.status(404).send({
          error: 'User not found',
          message: 'User account not found',
        });
      }

      // Verify current password
      const isCurrentPasswordValid = await bcrypt.compare(currentPassword, user.password);
      if (!isCurrentPasswordValid) {
        return reply.status(400).send({
          error: 'Invalid password',
          message: 'Current password is incorrect',
        });
      }

      // Validate new password
      const passwordValidation = validatePassword(newPassword);
      if (!passwordValidation.valid) {
        return reply.status(400).send({
          error: 'Weak password',
          message: passwordValidation.message,
        });
      }

      // Check if new password is different from current
      const isSamePassword = await bcrypt.compare(newPassword, user.password);
      if (isSamePassword) {
        return reply.status(400).send({
          error: 'Same password',
          message: 'New password must be different from current password',
        });
      }

      // Hash new password
      const saltRounds = 12;
      const hashedPassword = await bcrypt.hash(newPassword, saltRounds);

      // Update password
      await dbService.updateUserPassword(user.id, hashedPassword);

      // Revoke all existing tokens (force re-login)
      await jwtService.revokeAllUserTokens(user.id);

      logger.info('Password changed successfully', {
        userId: user.id,
        ip: request.ip,
      });

      reply.send({
        success: true,
        message: 'Password changed successfully. Please log in again.',
      });

    } catch (error) {
      logger.error('Password change failed', {
        userId: request.user.id,
        error: error.message,
      });

      reply.status(500).send({
        error: 'Password change failed',
        message: 'An error occurred while changing password',
      });
    }
  });

  // =============================================================================
  // FORGOT PASSWORD ROUTE
  // =============================================================================

  fastify.post('/auth/forgot-password', {
    schema: {
      description: 'Request password reset email',
      tags: ['Authentication'],
      body: {
        type: 'object',
        required: ['email'],
        properties: {
          email: {
            type: 'string',
            format: 'email',
            description: 'User email address',
          },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            message: { type: 'string' },
          },
        },
      },
    },
  }, async (request: FastifyRequest<{ Body: ForgotPasswordRequest }>, reply: FastifyReply) => {
    const { email } = request.body;

    try {
      // Always return success to prevent email enumeration
      const user = await dbService.findUserByEmail(email.toLowerCase());
      
      if (user) {
        // Generate reset token
        const resetToken = generateResetToken();
        const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

        // Store reset token
        await dbService.createPasswordResetToken(user.id, resetToken, expiresAt);

        // Send reset email (would be implemented)
        // await emailService.sendPasswordResetEmail(user.email, resetToken);

        logger.info('Password reset requested', {
          userId: user.id,
          email: user.email,
          ip: request.ip,
        });
      }

      reply.send({
        success: true,
        message: 'If an account with that email exists, a password reset link has been sent.',
      });

    } catch (error) {
      logger.error('Forgot password failed', {
        email,
        error: error.message,
      });

      reply.send({
        success: true,
        message: 'If an account with that email exists, a password reset link has been sent.',
      });
    }
  });

  // =============================================================================
  // RESET PASSWORD ROUTE
  // =============================================================================

  fastify.post('/auth/reset-password', {
    schema: {
      description: 'Reset password using reset token',
      tags: ['Authentication'],
      body: {
        type: 'object',
        required: ['token', 'newPassword'],
        properties: {
          token: {
            type: 'string',
            description: 'Password reset token',
          },
          newPassword: {
            type: 'string',
            minLength: 8,
            description: 'New password (minimum 8 characters)',
          },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            message: { type: 'string' },
          },
        },
        400: {
          type: 'object',
          properties: {
            error: { type: 'string' },
            message: { type: 'string' },
          },
        },
      },
    },
  }, async (request: FastifyRequest<{ Body: ResetPasswordRequest }>, reply: FastifyReply) => {
    const { token, newPassword } = request.body;

    try {
      // Validate reset token
      const resetData = await dbService.findPasswordResetToken(token);
      if (!resetData || resetData.expiresAt < new Date()) {
        return reply.status(400).send({
          error: 'Invalid token',
          message: 'Password reset token is invalid or expired',
        });
      }

      // Validate new password
      const passwordValidation = validatePassword(newPassword);
      if (!passwordValidation.valid) {
        return reply.status(400).send({
          error: 'Weak password',
          message: passwordValidation.message,
        });
      }

      // Hash new password
      const saltRounds = 12;
      const hashedPassword = await bcrypt.hash(newPassword, saltRounds);

      // Update password
      await dbService.updateUserPassword(resetData.userId, hashedPassword);

      // Delete reset token
      await dbService.deletePasswordResetToken(token);

      // Revoke all existing tokens
      await jwtService.revokeAllUserTokens(resetData.userId);

      logger.info('Password reset successfully', {
        userId: resetData.userId,
        ip: request.ip,
      });

      reply.send({
        success: true,
        message: 'Password reset successfully. Please log in with your new password.',
      });

    } catch (error) {
      logger.error('Password reset failed', {
        error: error.message,
      });

      reply.status(500).send({
        error: 'Password reset failed',
        message: 'An error occurred while resetting password',
      });
    }
  });

  // =============================================================================
  // USER PROFILE ROUTE
  // =============================================================================

  fastify.get('/auth/profile', {
    preHandler: [requireAuth()],
    schema: {
      description: 'Get current user profile',
      tags: ['Authentication'],
      security: [{ Bearer: [] }],
      response: {
        200: {
          type: 'object',
          properties: {
            user: {
              type: 'object',
              properties: {
                id: { type: 'string' },
                email: { type: 'string' },
                firstName: { type: 'string' },
                lastName: { type: 'string' },
                role: { type: 'string' },
                isEmailVerified: { type: 'boolean' },
                createdAt: { type: 'string' },
                lastLoginAt: { type: 'string' },
              },
            },
          },
        },
      },
    },
  }, async (request: AuthenticatedRequest, reply: FastifyReply) => {
    try {
      const user = await dbService.findUserById(request.user.id);
      if (!user) {
        return reply.status(404).send({
          error: 'User not found',
          message: 'User account not found',
        });
      }

      reply.send({
        user: {
          id: user.id,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          role: user.role,
          isEmailVerified: user.isEmailVerified,
          createdAt: user.createdAt.toISOString(),
          lastLoginAt: user.lastLoginAt?.toISOString(),
        },
      });

    } catch (error) {
      logger.error('Get profile failed', {
        userId: request.user.id,
        error: error.message,
      });

      reply.status(500).send({
        error: 'Profile fetch failed',
        message: 'An error occurred while fetching profile',
      });
    }
  });
}

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

function validatePassword(password: string): { valid: boolean; message?: string } {
  if (password.length < 8) {
    return { valid: false, message: 'Password must be at least 8 characters long' };
  }

  if (!/[a-z]/.test(password)) {
    return { valid: false, message: 'Password must contain at least one lowercase letter' };
  }

  if (!/[A-Z]/.test(password)) {
    return { valid: false, message: 'Password must contain at least one uppercase letter' };
  }

  if (!/\d/.test(password)) {
    return { valid: false, message: 'Password must contain at least one number' };
  }

  if (!/[!@#$%^&*(),.?":{}|<>]/.test(password)) {
    return { valid: false, message: 'Password must contain at least one special character' };
  }

  return { valid: true };
}

function generateSessionId(): string {
  return `sess_${Date.now()}_${Math.random().toString(36).substr(2, 16)}`;
}

function generateResetToken(): string {
  return `reset_${Date.now()}_${Math.random().toString(36).substr(2, 32)}`;
}

async function simulatePasswordCheck(): Promise<void> {
  // Simulate password hashing time to prevent timing attacks
  await bcrypt.hash('dummy', 12);
}

async function getUserPermissions(role: string): Promise<string[]> {
  // This would fetch from database or authorization service
  const rolePermissions = {
    admin: ['*'],
    premium: [
      'user.profile.read',
      'user.profile.update',
      'automation.task.create',
      'automation.task.read',
      'automation.task.execute',
      'workflow.create',
      'workflow.read',
      'workflow.update',
      'workflow.delete',
    ],
    user: [
      'user.profile.read',
      'user.profile.update',
      'automation.task.create',
      'automation.task.read',
      'automation.task.execute',
      'workflow.create',
      'workflow.read',
      'workflow.update',
    ],
  };

  return rolePermissions[role] || rolePermissions.user;
}

export default authRoutes;