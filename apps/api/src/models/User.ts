import mongoose, { Schema, Document } from 'mongoose';
import { UserProfile, UserRole, SubscriptionStatus, NotificationChannel, PrivacyLevel } from '@browser-ai-agent/shared/types/user';

// =============================================================================
// USER MODEL (MongoDB Schema)
// =============================================================================

export interface IUserDocument extends Omit<UserProfile, 'id'>, Document {
  _id: string;
  password_hash: string;
  email_verification_token?: string;
  password_reset_token?: string;
  password_reset_expires?: Date;
}

const UserSchema = new Schema<IUserDocument>({
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true,
    index: true,
  },
  username: {
    type: String,
    unique: true,
    sparse: true,
    trim: true,
    minlength: 3,
    maxlength: 50,
  },
  password_hash: {
    type: String,
    required: true,
  },
  
  // Personal Information
  personal_info: {
    first_name: { type: String, required: true, trim: true },
    last_name: { type: String, required: true, trim: true },
    full_name: { type: String, required: true, trim: true },
    phone: { type: String, trim: true },
    date_of_birth: Date,
    timezone: { type: String, default: 'UTC' },
    locale: { type: String, default: 'en-US' },
    avatar_url: String,
  },
  
  // Professional Information
  professional_info: {
    current_title: String,
    current_company: String,
    experience_level: {
      type: String,
      enum: ['entry', 'mid', 'senior', 'lead', 'executive'],
    },
    industry: String,
    skills: [String],
    certifications: [{
      name: String,
      issuer: String,
      date_obtained: Date,
      expiry_date: Date,
      credential_url: String,
    }],
    linkedin_url: String,
    portfolio_url: String,
    github_url: String,
  },
  
  // Job Search Preferences
  job_preferences: {
    desired_titles: [String],
    preferred_locations: [String],
    remote_preference: {
      type: String,
      enum: ['remote_only', 'hybrid', 'onsite', 'no_preference'],
      default: 'no_preference',
    },
    job_types: [{
      type: String,
      enum: ['full_time', 'part_time', 'contract', 'freelance', 'internship', 'temporary'],
    }],
    salary_expectations: {
      min: Number,
      max: Number,
      currency: { type: String, default: 'USD' },
    },
    preferred_company_sizes: [String],
    preferred_industries: [String],
    deal_breakers: [String],
  },
  
  // Documents & Assets
  documents: {
    resume: {
      filename: String,
      url: String,
      version: String,
      last_updated: Date,
    },
    cover_letter_template: String,
    portfolio_files: [{
      name: String,
      url: String,
      type: String,
    }],
  },
  
  // Account Settings
  role: {
    type: String,
    enum: Object.values(UserRole),
    default: UserRole.USER,
    index: true,
  },
  subscription: {
    plan: { type: String, required: true, default: 'free' },
    status: {
      type: String,
      enum: Object.values(SubscriptionStatus),
      default: SubscriptionStatus.TRIAL,
    },
    current_period_start: { type: Date, required: true, default: Date.now },
    current_period_end: { type: Date, required: true, default: () => new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) },
    trial_end: Date,
    cancel_at_period_end: { type: Boolean, default: false },
  },
  
  // Usage & Limits
  usage: {
    tasks_this_month: { type: Number, default: 0 },
    applications_this_month: { type: Number, default: 0 },
    api_calls_this_month: { type: Number, default: 0 },
    storage_used: { type: Number, default: 0 },
    last_active: Date,
  },
  
  // Preferences & Settings
  preferences: {
    notification_channels: [{
      type: String,
      enum: Object.values(NotificationChannel),
    }],
    email_notifications: {
      task_completion: { type: Boolean, default: true },
      application_updates: { type: Boolean, default: true },
      weekly_summary: { type: Boolean, default: true },
      marketing: { type: Boolean, default: false },
    },
    privacy_level: {
      type: String,
      enum: Object.values(PrivacyLevel),
      default: PrivacyLevel.PRIVATE,
    },
    data_retention_days: { type: Number, min: 30, max: 365, default: 90 },
    auto_apply_enabled: { type: Boolean, default: false },
    max_applications_per_day: { type: Number, min: 1, max: 100, default: 10 },
  },
  
  // Security & Authentication
  security: {
    two_factor_enabled: { type: Boolean, default: false },
    last_password_change: Date,
    failed_login_attempts: { type: Number, default: 0 },
    account_locked_until: Date,
    trusted_devices: [{
      device_id: String,
      device_name: String,
      last_used: Date,
      ip_address: String,
    }],
  },
  
  // API & Integration
  api_access: {
    api_key: { type: String, unique: true, sparse: true },
    webhook_url: String,
    webhook_secret: String,
    rate_limit: { type: Number, default: 1000 },
  },
  
  // Verification & Status
  email_verified: { type: Boolean, default: false },
  phone_verified: { type: Boolean, default: false },
  is_active: { type: Boolean, default: true, index: true },
  
  // Tokens
  email_verification_token: String,
  password_reset_token: String,
  password_reset_expires: Date,
  
  last_login: Date,
}, {
  timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
  toJSON: {
    transform: function(doc, ret) {
      ret.id = ret._id;
      delete ret._id;
      delete ret.__v;
      delete ret.password_hash;
      delete ret.email_verification_token;
      delete ret.password_reset_token;
      delete ret.password_reset_expires;
      return ret;
    }
  }
});

// =============================================================================
// INDEXES FOR PERFORMANCE
// =============================================================================

UserSchema.index({ email: 1 });
UserSchema.index({ username: 1 });
UserSchema.index({ role: 1 });
UserSchema.index({ 'subscription.status': 1 });
UserSchema.index({ is_active: 1 });
UserSchema.index({ created_at: -1 });
UserSchema.index({ last_login: -1 });
UserSchema.index({ 'usage.last_active': -1 });

// Compound indexes for common queries
UserSchema.index({ email: 1, is_active: 1 });
UserSchema.index({ role: 1, is_active: 1 });
UserSchema.index({ 'subscription.status': 1, is_active: 1 });

// =============================================================================
// METHODS
// =============================================================================

UserSchema.methods.toPublicJSON = function() {
  const user = this.toObject();
  delete user.password_hash;
  delete user.email_verification_token;
  delete user.password_reset_token;
  delete user.password_reset_expires;
  delete user.security;
  delete user.api_access.api_key;
  delete user.api_access.webhook_secret;
  return user;
};

UserSchema.methods.canPerformAction = function(action: string): boolean {
  const limits = {
    free: { tasks_per_month: 10, applications_per_month: 50 },
    premium: { tasks_per_month: 100, applications_per_month: 500 },
    enterprise: { tasks_per_month: 1000, applications_per_month: 5000 },
  };
  
  const userLimits = limits[this.subscription.plan as keyof typeof limits] || limits.free;
  
  switch (action) {
    case 'create_task':
      return this.usage.tasks_this_month < userLimits.tasks_per_month;
    case 'apply_to_job':
      return this.usage.applications_this_month < userLimits.applications_per_month;
    default:
      return true;
  }
};

UserSchema.methods.incrementUsage = function(type: 'tasks' | 'applications' | 'api_calls'): void {
  switch (type) {
    case 'tasks':
      this.usage.tasks_this_month += 1;
      break;
    case 'applications':
      this.usage.applications_this_month += 1;
      break;
    case 'api_calls':
      this.usage.api_calls_this_month += 1;
      break;
  }
  this.usage.last_active = new Date();
};

// =============================================================================
// STATIC METHODS
// =============================================================================

UserSchema.statics.findByEmail = function(email: string) {
  return this.findOne({ email: email.toLowerCase(), is_active: true });
};

UserSchema.statics.findByApiKey = function(apiKey: string) {
  return this.findOne({ 'api_access.api_key': apiKey, is_active: true });
};

UserSchema.statics.resetMonthlyUsage = function() {
  return this.updateMany(
    {},
    {
      $set: {
        'usage.tasks_this_month': 0,
        'usage.applications_this_month': 0,
        'usage.api_calls_this_month': 0,
      }
    }
  );
};

// =============================================================================
// MIDDLEWARE
// =============================================================================

UserSchema.pre('save', function(next) {
  // Update full_name when first_name or last_name changes
  if (this.isModified('personal_info.first_name') || this.isModified('personal_info.last_name')) {
    this.personal_info.full_name = `${this.personal_info.first_name} ${this.personal_info.last_name}`.trim();
  }
  
  // Reset failed login attempts when password is changed
  if (this.isModified('password_hash')) {
    this.security.failed_login_attempts = 0;
    this.security.account_locked_until = undefined;
    this.security.last_password_change = new Date();
  }
  
  next();
});

export const User = mongoose.model<IUserDocument>('User', UserSchema);