import { z } from 'zod';
import { JobType, ExperienceLevel, JobPortal } from './job';

// =============================================================================
// USER MANAGEMENT TYPES (Enterprise-Grade User System)
// =============================================================================

export enum UserRole {
  USER = 'user',
  PREMIUM = 'premium',
  ENTERPRISE = 'enterprise',
  ADMIN = 'admin',
  SUPER_ADMIN = 'super_admin',
}

export enum SubscriptionStatus {
  TRIAL = 'trial',
  ACTIVE = 'active',
  PAST_DUE = 'past_due',
  CANCELLED = 'cancelled',
  EXPIRED = 'expired',
}

export enum NotificationChannel {
  EMAIL = 'email',
  SMS = 'sms',
  PUSH = 'push',
  WEBHOOK = 'webhook',
  SLACK = 'slack',
  DISCORD = 'discord',
}

export enum PrivacyLevel {
  PUBLIC = 'public',
  PRIVATE = 'private',
  TEAM = 'team',
  ORGANIZATION = 'organization',
}

// =============================================================================
// USER PROFILE SCHEMA
// =============================================================================

export const UserProfileSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  username: z.string().min(3).max(50).optional(),
  
  // Personal Information
  personal_info: z.object({
    first_name: z.string().min(1),
    last_name: z.string().min(1),
    full_name: z.string().min(1),
    phone: z.string().optional(),
    date_of_birth: z.date().optional(),
    timezone: z.string().default('UTC'),
    locale: z.string().default('en-US'),
    avatar_url: z.string().url().optional(),
  }),
  
  // Professional Information
  professional_info: z.object({
    current_title: z.string().optional(),
    current_company: z.string().optional(),
    experience_level: z.nativeEnum(ExperienceLevel).optional(),
    industry: z.string().optional(),
    skills: z.array(z.string()),
    certifications: z.array(z.object({
      name: z.string(),
      issuer: z.string(),
      date_obtained: z.date(),
      expiry_date: z.date().optional(),
      credential_url: z.string().url().optional(),
    })),
    linkedin_url: z.string().url().optional(),
    portfolio_url: z.string().url().optional(),
    github_url: z.string().url().optional(),
  }),
  
  // Job Search Preferences
  job_preferences: z.object({
    desired_titles: z.array(z.string()),
    preferred_locations: z.array(z.string()),
    remote_preference: z.enum(['remote_only', 'hybrid', 'onsite', 'no_preference']).default('no_preference'),
    job_types: z.array(z.nativeEnum(JobType)),
    salary_expectations: z.object({
      min: z.number().optional(),
      max: z.number().optional(),
      currency: z.string().default('USD'),
    }).optional(),
    preferred_company_sizes: z.array(z.string()),
    preferred_industries: z.array(z.string()),
    deal_breakers: z.array(z.string()),
  }),
  
  // Documents & Assets
  documents: z.object({
    resume: z.object({
      filename: z.string(),
      url: z.string().url(),
      version: z.string(),
      last_updated: z.date(),
    }).optional(),
    cover_letter_template: z.string().optional(),
    portfolio_files: z.array(z.object({
      name: z.string(),
      url: z.string().url(),
      type: z.string(),
    })),
  }),
  
  // Account Settings
  role: z.nativeEnum(UserRole).default(UserRole.USER),
  subscription: z.object({
    plan: z.string(),
    status: z.nativeEnum(SubscriptionStatus),
    current_period_start: z.date(),
    current_period_end: z.date(),
    trial_end: z.date().optional(),
    cancel_at_period_end: z.boolean().default(false),
  }),
  
  // Usage & Limits
  usage: z.object({
    tasks_this_month: z.number().default(0),
    applications_this_month: z.number().default(0),
    api_calls_this_month: z.number().default(0),
    storage_used: z.number().default(0), // bytes
    last_active: z.date().optional(),
  }),
  
  // Preferences & Settings
  preferences: z.object({
    notification_channels: z.array(z.nativeEnum(NotificationChannel)),
    email_notifications: z.object({
      task_completion: z.boolean().default(true),
      application_updates: z.boolean().default(true),
      weekly_summary: z.boolean().default(true),
      marketing: z.boolean().default(false),
    }),
    privacy_level: z.nativeEnum(PrivacyLevel).default(PrivacyLevel.PRIVATE),
    data_retention_days: z.number().min(30).max(365).default(90),
    auto_apply_enabled: z.boolean().default(false),
    max_applications_per_day: z.number().min(1).max(100).default(10),
  }),
  
  // Security & Authentication
  security: z.object({
    two_factor_enabled: z.boolean().default(false),
    last_password_change: z.date().optional(),
    failed_login_attempts: z.number().default(0),
    account_locked_until: z.date().optional(),
    trusted_devices: z.array(z.object({
      device_id: z.string(),
      device_name: z.string(),
      last_used: z.date(),
      ip_address: z.string(),
    })),
  }),
  
  // API & Integration
  api_access: z.object({
    api_key: z.string().optional(),
    webhook_url: z.string().url().optional(),
    webhook_secret: z.string().optional(),
    rate_limit: z.number().default(1000), // requests per hour
  }),
  
  created_at: z.date(),
  updated_at: z.date(),
  last_login: z.date().optional(),
  email_verified: z.boolean().default(false),
  phone_verified: z.boolean().default(false),
  is_active: z.boolean().default(true),
});

// =============================================================================
// USER SESSION SCHEMA
// =============================================================================

export const UserSessionSchema = z.object({
  id: z.string().uuid(),
  user_id: z.string().uuid(),
  session_token: z.string(),
  refresh_token: z.string().optional(),
  
  // Session Details
  device_info: z.object({
    user_agent: z.string(),
    ip_address: z.string(),
    device_type: z.enum(['desktop', 'mobile', 'tablet', 'api']),
    browser: z.string().optional(),
    os: z.string().optional(),
    location: z.object({
      country: z.string().optional(),
      city: z.string().optional(),
      coordinates: z.object({
        lat: z.number(),
        lng: z.number(),
      }).optional(),
    }).optional(),
  }),
  
  // Session State
  is_active: z.boolean().default(true),
  expires_at: z.date(),
  last_activity: z.date(),
  created_at: z.date(),
  
  // Security
  is_trusted: z.boolean().default(false),
  risk_score: z.number().min(0).max(100).default(0),
});

// =============================================================================
// USER ACTIVITY LOG SCHEMA
// =============================================================================

export const UserActivityLogSchema = z.object({
  id: z.string().uuid(),
  user_id: z.string().uuid(),
  session_id: z.string().uuid().optional(),
  
  // Activity Details
  action: z.string(),
  resource: z.string().optional(),
  resource_id: z.string().optional(),
  details: z.record(z.any()),
  
  // Context
  ip_address: z.string(),
  user_agent: z.string(),
  timestamp: z.date(),
  
  // Categorization
  category: z.enum(['auth', 'task', 'profile', 'billing', 'api', 'security']),
  severity: z.enum(['low', 'medium', 'high', 'critical']).default('low'),
  
  // Metadata
  metadata: z.object({
    execution_time: z.number().optional(), // milliseconds
    success: z.boolean(),
    error_message: z.string().optional(),
    trace_id: z.string().optional(),
  }),
});

// =============================================================================
// TEAM & ORGANIZATION SCHEMA
// =============================================================================

export const TeamSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1),
  description: z.string().optional(),
  
  // Organization
  organization_id: z.string().uuid().optional(),
  owner_id: z.string().uuid(),
  
  // Members
  members: z.array(z.object({
    user_id: z.string().uuid(),
    role: z.enum(['owner', 'admin', 'member', 'viewer']),
    permissions: z.array(z.string()),
    joined_at: z.date(),
  })),
  
  // Settings
  settings: z.object({
    shared_workflows: z.boolean().default(true),
    shared_templates: z.boolean().default(true),
    data_sharing: z.boolean().default(false),
    billing_shared: z.boolean().default(false),
  }),
  
  // Usage & Limits
  usage_limits: z.object({
    max_members: z.number().default(10),
    max_tasks_per_month: z.number().default(1000),
    max_storage: z.number().default(10737418240), // 10GB in bytes
  }),
  
  created_at: z.date(),
  updated_at: z.date(),
  is_active: z.boolean().default(true),
});

// =============================================================================
// TYPE EXPORTS
// =============================================================================

export type UserProfile = z.infer<typeof UserProfileSchema>;
export type UserSession = z.infer<typeof UserSessionSchema>;
export type UserActivityLog = z.infer<typeof UserActivityLogSchema>;
export type Team = z.infer<typeof TeamSchema>;

// =============================================================================
// USER MANAGEMENT INTERFACES
// =============================================================================

export interface IUserManager {
  createUser(userData: Partial<UserProfile>): Promise<UserProfile>;
  getUserById(userId: string): Promise<UserProfile | null>;
  getUserByEmail(email: string): Promise<UserProfile | null>;
  updateUser(userId: string, updates: Partial<UserProfile>): Promise<UserProfile>;
  deleteUser(userId: string): Promise<void>;
  verifyEmail(userId: string, token: string): Promise<boolean>;
  resetPassword(email: string): Promise<void>;
}

export interface ISessionManager {
  createSession(userId: string, deviceInfo: any): Promise<UserSession>;
  validateSession(sessionToken: string): Promise<UserSession | null>;
  refreshSession(refreshToken: string): Promise<UserSession>;
  revokeSession(sessionId: string): Promise<void>;
  revokeAllSessions(userId: string): Promise<void>;
  cleanupExpiredSessions(): Promise<number>;
}

export interface IActivityTracker {
  logActivity(activity: Omit<UserActivityLog, 'id' | 'timestamp'>): Promise<void>;
  getUserActivity(userId: string, limit?: number): Promise<UserActivityLog[]>;
  getSecurityEvents(userId: string): Promise<UserActivityLog[]>;
  generateActivityReport(userId: string, dateRange: { start: Date; end: Date }): Promise<any>;
}

// =============================================================================
// USER CONSTANTS
// =============================================================================

export const USER_LIMITS = {
  FREE: {
    tasks_per_month: 10,
    applications_per_month: 50,
    storage_mb: 100,
    api_calls_per_hour: 100,
  },
  PREMIUM: {
    tasks_per_month: 100,
    applications_per_month: 500,
    storage_mb: 1000,
    api_calls_per_hour: 1000,
  },
  ENTERPRISE: {
    tasks_per_month: 1000,
    applications_per_month: 5000,
    storage_mb: 10000,
    api_calls_per_hour: 10000,
  },
} as const;

export const SESSION_CONFIG = {
  ACCESS_TOKEN_EXPIRY: 15 * 60 * 1000, // 15 minutes
  REFRESH_TOKEN_EXPIRY: 7 * 24 * 60 * 60 * 1000, // 7 days
  MAX_SESSIONS_PER_USER: 10,
  TRUSTED_DEVICE_EXPIRY: 30 * 24 * 60 * 60 * 1000, // 30 days
} as const;