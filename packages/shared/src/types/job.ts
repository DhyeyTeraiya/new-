import { z } from 'zod';

// =============================================================================
// JOB AUTOMATION TYPES (Based on Master Plan Appendix B)
// =============================================================================

export enum JobPortal {
  LINKEDIN = 'linkedin',
  INDEED = 'indeed',
  NAUKRI = 'naukri',
  GLASSDOOR = 'glassdoor',
  MONSTER = 'monster',
  ANGELLIST = 'angellist',
  DICE = 'dice',
  STACKOVERFLOW = 'stackoverflow',
}

export enum ApplicationStatus {
  PENDING = 'pending',
  SUBMITTED = 'submitted',
  VIEWED = 'viewed',
  REJECTED = 'rejected',
  INTERVIEW = 'interview',
  OFFER = 'offer',
  WITHDRAWN = 'withdrawn',
}

export enum JobType {
  FULL_TIME = 'full_time',
  PART_TIME = 'part_time',
  CONTRACT = 'contract',
  FREELANCE = 'freelance',
  INTERNSHIP = 'internship',
  TEMPORARY = 'temporary',
}

export enum ExperienceLevel {
  ENTRY = 'entry',
  MID = 'mid',
  SENIOR = 'senior',
  LEAD = 'lead',
  EXECUTIVE = 'executive',
}

export enum SalaryType {
  HOURLY = 'hourly',
  MONTHLY = 'monthly',
  YEARLY = 'yearly',
  PROJECT = 'project',
}

// =============================================================================
// JOB POSTING SCHEMA (Master Plan Appendix B)
// =============================================================================

export const JobPostingSchema = z.object({
  id: z.string().uuid(),
  title: z.string().min(1),
  company: z.string().min(1),
  location: z.string(),
  salary: z.object({
    min: z.number().optional(),
    max: z.number().optional(),
    currency: z.string().default('USD'),
    type: z.nativeEnum(SalaryType),
  }).optional(),
  description: z.string(),
  requirements: z.array(z.string()),
  benefits: z.array(z.string()),
  url: z.string().url(),
  source: z.nativeEnum(JobPortal),
  posted_at: z.date(),
  expires_at: z.date().optional(),
  job_type: z.nativeEnum(JobType),
  experience_level: z.nativeEnum(ExperienceLevel),
  remote_allowed: z.boolean().default(false),
  contacts: z.array(z.object({
    name: z.string().optional(),
    email: z.string().email().optional(),
    phone: z.string().optional(),
    linkedin: z.string().url().optional(),
    role: z.string().optional(),
  })),
  confidence: z.number().min(0).max(100), // Data quality confidence score
  metadata: z.object({
    scraped_at: z.date(),
    scraper_version: z.string(),
    dom_snapshot_url: z.string().optional(),
    extraction_method: z.string(),
    validation_score: z.number().min(0).max(100),
  }),
  tags: z.array(z.string()),
  skills_required: z.array(z.string()),
  company_size: z.string().optional(),
  industry: z.string().optional(),
  is_active: z.boolean().default(true),
  duplicate_of: z.string().uuid().optional(),
  created_at: z.date(),
  updated_at: z.date(),
});

// =============================================================================
// APPLICATION LOG SCHEMA (Master Plan Appendix B)
// =============================================================================

export const ApplicationLogSchema = z.object({
  id: z.string().uuid(),
  job_id: z.string().uuid(),
  user_id: z.string().uuid(),
  portal: z.nativeEnum(JobPortal),
  submitted_at: z.date(),
  status: z.nativeEnum(ApplicationStatus),
  answers: z.record(z.any()), // Form answers as key-value pairs
  artifacts: z.object({
    resume: z.object({
      filename: z.string(),
      url: z.string().url(),
      version: z.string(),
    }).optional(),
    cover_letter: z.object({
      content: z.string(),
      template_id: z.string().optional(),
      customized: z.boolean().default(false),
    }).optional(),
    portfolio: z.string().url().optional(),
  }),
  notes: z.string().optional(),
  proof_link: z.string().url().optional(), // Screenshot or confirmation page
  automation_log: z.object({
    steps_completed: z.number(),
    total_steps: z.number(),
    execution_time: z.number(), // milliseconds
    errors: z.array(z.string()),
    screenshots: z.array(z.string().url()),
    dom_snapshots: z.array(z.string().url()),
  }),
  success_probability: z.number().min(0).max(100),
  follow_up_required: z.boolean().default(false),
  follow_up_date: z.date().optional(),
  created_at: z.date(),
  updated_at: z.date(),
});

// =============================================================================
// JOB SEARCH CRITERIA SCHEMA
// =============================================================================

export const JobSearchCriteriaSchema = z.object({
  id: z.string().uuid(),
  user_id: z.string().uuid(),
  name: z.string().min(1),
  keywords: z.array(z.string()),
  locations: z.array(z.string()),
  job_types: z.array(z.nativeEnum(JobType)),
  experience_levels: z.array(z.nativeEnum(ExperienceLevel)),
  salary_range: z.object({
    min: z.number().optional(),
    max: z.number().optional(),
    currency: z.string().default('USD'),
  }).optional(),
  remote_only: z.boolean().default(false),
  portals: z.array(z.nativeEnum(JobPortal)),
  exclude_companies: z.array(z.string()),
  required_skills: z.array(z.string()),
  preferred_skills: z.array(z.string()),
  company_size_preference: z.array(z.string()),
  industry_preference: z.array(z.string()),
  auto_apply: z.boolean().default(false),
  max_applications_per_day: z.number().min(1).max(100).default(10),
  is_active: z.boolean().default(true),
  created_at: z.date(),
  updated_at: z.date(),
});

// =============================================================================
// JOB ALERT SCHEMA
// =============================================================================

export const JobAlertSchema = z.object({
  id: z.string().uuid(),
  user_id: z.string().uuid(),
  search_criteria_id: z.string().uuid(),
  frequency: z.enum(['realtime', 'hourly', 'daily', 'weekly']),
  last_run: z.date().optional(),
  next_run: z.date(),
  is_active: z.boolean().default(true),
  notification_channels: z.array(z.enum(['email', 'sms', 'push', 'webhook'])),
  webhook_url: z.string().url().optional(),
  results_found: z.number().default(0),
  applications_sent: z.number().default(0),
  created_at: z.date(),
  updated_at: z.date(),
});

// =============================================================================
// TYPE EXPORTS
// =============================================================================

export type JobPosting = z.infer<typeof JobPostingSchema>;
export type ApplicationLog = z.infer<typeof ApplicationLogSchema>;
export type JobSearchCriteria = z.infer<typeof JobSearchCriteriaSchema>;
export type JobAlert = z.infer<typeof JobAlertSchema>;

// =============================================================================
// JOB AUTOMATION INTERFACES
// =============================================================================

export interface IJobScraper {
  portal: JobPortal;
  scrapeJobs(criteria: JobSearchCriteria): Promise<JobPosting[]>;
  applyToJob(job: JobPosting, userProfile: any): Promise<ApplicationLog>;
  checkApplicationStatus(applicationId: string): Promise<ApplicationStatus>;
  getJobDetails(jobUrl: string): Promise<JobPosting>;
}

export interface IJobMatcher {
  calculateMatchScore(job: JobPosting, criteria: JobSearchCriteria): number;
  filterJobs(jobs: JobPosting[], criteria: JobSearchCriteria): JobPosting[];
  rankJobs(jobs: JobPosting[], userProfile: any): JobPosting[];
}

export interface IApplicationTracker {
  trackApplication(application: ApplicationLog): Promise<void>;
  updateApplicationStatus(applicationId: string, status: ApplicationStatus): Promise<void>;
  getApplicationHistory(userId: string): Promise<ApplicationLog[]>;
  generateApplicationReport(userId: string, dateRange?: { start: Date; end: Date }): Promise<any>;
}

// =============================================================================
// JOB AUTOMATION CONSTANTS
// =============================================================================

export const JOB_PORTAL_CONFIGS = {
  [JobPortal.LINKEDIN]: {
    baseUrl: 'https://www.linkedin.com',
    searchPath: '/jobs/search',
    rateLimit: { requests: 100, window: 3600000 }, // 100 requests per hour
    requiresAuth: true,
    supportedFeatures: ['search', 'apply', 'save', 'track'],
  },
  [JobPortal.INDEED]: {
    baseUrl: 'https://www.indeed.com',
    searchPath: '/jobs',
    rateLimit: { requests: 200, window: 3600000 }, // 200 requests per hour
    requiresAuth: false,
    supportedFeatures: ['search', 'apply', 'save'],
  },
  [JobPortal.NAUKRI]: {
    baseUrl: 'https://www.naukri.com',
    searchPath: '/jobs-in-india',
    rateLimit: { requests: 150, window: 3600000 }, // 150 requests per hour
    requiresAuth: true,
    supportedFeatures: ['search', 'apply', 'save', 'track'],
  },
  [JobPortal.GLASSDOOR]: {
    baseUrl: 'https://www.glassdoor.com',
    searchPath: '/Job/jobs.htm',
    rateLimit: { requests: 50, window: 3600000 }, // 50 requests per hour
    requiresAuth: false,
    supportedFeatures: ['search', 'save'],
  },
} as const;

export const SUCCESS_METRICS = {
  TARGET_SUCCESS_RATE: 92, // > 92% success rate (Master Plan requirement)
  MAX_HUMAN_INTERVENTION: 10, // < 10% human intervention rate
  TARGET_TTFWO: 60, // < 60 seconds Time-To-First-Working-Output
  MIN_CONFIDENCE_SCORE: 80, // Minimum confidence for auto-apply
} as const;