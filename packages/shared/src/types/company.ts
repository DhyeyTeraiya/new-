import { z } from 'zod';

// =============================================================================
// COMPANY RESEARCH TYPES (Master Plan B2B Lead Gen & Due Diligence)
// =============================================================================

export enum CompanySize {
  STARTUP = 'startup', // 1-10 employees
  SMALL = 'small', // 11-50 employees
  MEDIUM = 'medium', // 51-200 employees
  LARGE = 'large', // 201-1000 employees
  ENTERPRISE = 'enterprise', // 1000+ employees
}

export enum CompanyStage {
  IDEA = 'idea',
  SEED = 'seed',
  SERIES_A = 'series_a',
  SERIES_B = 'series_b',
  SERIES_C = 'series_c',
  GROWTH = 'growth',
  IPO = 'ipo',
  PUBLIC = 'public',
  ACQUIRED = 'acquired',
}

export enum ContactRole {
  CEO = 'ceo',
  CTO = 'cto',
  CFO = 'cfo',
  VP_ENGINEERING = 'vp_engineering',
  VP_SALES = 'vp_sales',
  VP_MARKETING = 'vp_marketing',
  DIRECTOR = 'director',
  MANAGER = 'manager',
  ENGINEER = 'engineer',
  RECRUITER = 'recruiter',
  HR = 'hr',
  OTHER = 'other',
}

export enum DataSource {
  COMPANY_WEBSITE = 'company_website',
  LINKEDIN = 'linkedin',
  CRUNCHBASE = 'crunchbase',
  GLASSDOOR = 'glassdoor',
  PITCHBOOK = 'pitchbook',
  BLOOMBERG = 'bloomberg',
  SEC_FILINGS = 'sec_filings',
  NEWS_ARTICLES = 'news_articles',
  SOCIAL_MEDIA = 'social_media',
  DIRECTORY = 'directory',
}

// =============================================================================
// COMPANY PROFILE SCHEMA
// =============================================================================

export const CompanyProfileSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1),
  legal_name: z.string().optional(),
  domain: z.string().optional(),
  website: z.string().url().optional(),
  description: z.string().optional(),
  tagline: z.string().optional(),
  logo_url: z.string().url().optional(),
  
  // Basic Info
  founded_year: z.number().min(1800).max(new Date().getFullYear()).optional(),
  headquarters: z.object({
    address: z.string().optional(),
    city: z.string().optional(),
    state: z.string().optional(),
    country: z.string().optional(),
    postal_code: z.string().optional(),
    coordinates: z.object({
      lat: z.number(),
      lng: z.number(),
    }).optional(),
  }).optional(),
  
  // Size & Structure
  employee_count: z.number().min(0).optional(),
  employee_count_range: z.nativeEnum(CompanySize).optional(),
  annual_revenue: z.number().min(0).optional(),
  revenue_range: z.string().optional(),
  
  // Industry & Market
  industry: z.string().optional(),
  sub_industry: z.string().optional(),
  market_cap: z.number().min(0).optional(),
  stage: z.nativeEnum(CompanyStage).optional(),
  
  // Funding & Financials
  total_funding: z.number().min(0).optional(),
  last_funding_round: z.object({
    type: z.string(),
    amount: z.number(),
    date: z.date(),
    investors: z.array(z.string()),
  }).optional(),
  valuation: z.number().min(0).optional(),
  
  // Technology Stack
  technologies: z.array(z.object({
    name: z.string(),
    category: z.string(),
    confidence: z.number().min(0).max(100),
  })),
  
  // Social & Online Presence
  social_media: z.object({
    linkedin: z.string().url().optional(),
    twitter: z.string().url().optional(),
    facebook: z.string().url().optional(),
    instagram: z.string().url().optional(),
    youtube: z.string().url().optional(),
    github: z.string().url().optional(),
  }),
  
  // Contact Information
  contact_info: z.object({
    phone: z.string().optional(),
    email: z.string().email().optional(),
    support_email: z.string().email().optional(),
    sales_email: z.string().email().optional(),
    careers_email: z.string().email().optional(),
  }),
  
  // Key People
  key_people: z.array(z.object({
    name: z.string(),
    role: z.nativeEnum(ContactRole),
    title: z.string().optional(),
    email: z.string().email().optional(),
    linkedin: z.string().url().optional(),
    phone: z.string().optional(),
    bio: z.string().optional(),
    photo_url: z.string().url().optional(),
    start_date: z.date().optional(),
  })),
  
  // Business Intelligence
  competitors: z.array(z.string()),
  partnerships: z.array(z.string()),
  customers: z.array(z.string()),
  news_mentions: z.array(z.object({
    title: z.string(),
    url: z.string().url(),
    source: z.string(),
    published_date: z.date(),
    sentiment: z.enum(['positive', 'neutral', 'negative']),
  })),
  
  // Data Quality & Metadata
  confidence_score: z.number().min(0).max(100),
  last_updated: z.date(),
  data_sources: z.array(z.nativeEnum(DataSource)),
  verification_status: z.enum(['verified', 'unverified', 'disputed']),
  
  // Automation Metadata
  scraping_metadata: z.object({
    scraped_at: z.date(),
    scraper_version: z.string(),
    pages_scraped: z.number(),
    extraction_time: z.number(), // milliseconds
    success_rate: z.number().min(0).max(100),
    errors: z.array(z.string()),
  }),
  
  created_at: z.date(),
  updated_at: z.date(),
});

// =============================================================================
// CONTACT PROFILE SCHEMA
// =============================================================================

export const ContactProfileSchema = z.object({
  id: z.string().uuid(),
  company_id: z.string().uuid(),
  
  // Personal Info
  first_name: z.string().min(1),
  last_name: z.string().min(1),
  full_name: z.string().min(1),
  title: z.string().optional(),
  role: z.nativeEnum(ContactRole),
  department: z.string().optional(),
  seniority_level: z.enum(['junior', 'mid', 'senior', 'executive']).optional(),
  
  // Contact Details
  email: z.string().email().optional(),
  phone: z.string().optional(),
  mobile: z.string().optional(),
  
  // Professional Info
  linkedin_url: z.string().url().optional(),
  linkedin_profile: z.object({
    headline: z.string().optional(),
    summary: z.string().optional(),
    connections: z.number().optional(),
    experience: z.array(z.object({
      company: z.string(),
      title: z.string(),
      duration: z.string(),
      description: z.string().optional(),
    })),
    education: z.array(z.object({
      school: z.string(),
      degree: z.string().optional(),
      field: z.string().optional(),
      year: z.number().optional(),
    })),
    skills: z.array(z.string()),
  }).optional(),
  
  // Additional Social Profiles
  twitter_url: z.string().url().optional(),
  github_url: z.string().url().optional(),
  personal_website: z.string().url().optional(),
  
  // Engagement Data
  last_activity: z.date().optional(),
  engagement_score: z.number().min(0).max(100).optional(),
  response_rate: z.number().min(0).max(100).optional(),
  
  // Data Quality
  confidence_score: z.number().min(0).max(100),
  verification_status: z.enum(['verified', 'unverified', 'bounced']),
  data_sources: z.array(z.nativeEnum(DataSource)),
  
  created_at: z.date(),
  updated_at: z.date(),
});

// =============================================================================
// RESEARCH TASK SCHEMA
// =============================================================================

export const ResearchTaskSchema = z.object({
  id: z.string().uuid(),
  user_id: z.string().uuid(),
  type: z.enum(['company_profile', 'contact_discovery', 'competitive_analysis', 'due_diligence']),
  
  // Task Configuration
  targets: z.array(z.object({
    type: z.enum(['company_name', 'domain', 'linkedin_url', 'person_name']),
    value: z.string(),
  })),
  
  depth: z.enum(['basic', 'standard', 'comprehensive']),
  include_contacts: z.boolean().default(true),
  max_contacts_per_company: z.number().min(1).max(100).default(20),
  contact_roles: z.array(z.nativeEnum(ContactRole)),
  
  // Execution Status
  status: z.enum(['pending', 'running', 'completed', 'failed', 'cancelled']),
  progress: z.object({
    companies_processed: z.number().default(0),
    contacts_found: z.number().default(0),
    pages_scraped: z.number().default(0),
    current_step: z.string().optional(),
    estimated_completion: z.date().optional(),
  }),
  
  // Results
  results: z.object({
    companies: z.array(z.string().uuid()),
    contacts: z.array(z.string().uuid()),
    total_data_points: z.number().default(0),
    quality_score: z.number().min(0).max(100).optional(),
  }).optional(),
  
  // Configuration
  automation_config: z.object({
    use_proxies: z.boolean().default(true),
    respect_robots_txt: z.boolean().default(true),
    max_pages_per_domain: z.number().min(1).max(1000).default(100),
    delay_between_requests: z.number().min(100).max(10000).default(1000),
    captcha_solving: z.boolean().default(true),
  }),
  
  created_at: z.date(),
  updated_at: z.date(),
  completed_at: z.date().optional(),
});

// =============================================================================
// TYPE EXPORTS
// =============================================================================

export type CompanyProfile = z.infer<typeof CompanyProfileSchema>;
export type ContactProfile = z.infer<typeof ContactProfileSchema>;
export type ResearchTask = z.infer<typeof ResearchTaskSchema>;

// =============================================================================
// COMPANY RESEARCH INTERFACES
// =============================================================================

export interface ICompanyResearcher {
  researchCompany(identifier: string, depth: 'basic' | 'standard' | 'comprehensive'): Promise<CompanyProfile>;
  findContacts(companyId: string, roles: ContactRole[], maxContacts: number): Promise<ContactProfile[]>;
  verifyContactInfo(contact: ContactProfile): Promise<ContactProfile>;
  enrichCompanyData(company: CompanyProfile): Promise<CompanyProfile>;
}

export interface IContactFinder {
  findContactsByCompany(companyDomain: string, roles: ContactRole[]): Promise<ContactProfile[]>;
  findContactByName(name: string, company?: string): Promise<ContactProfile[]>;
  verifyEmail(email: string): Promise<{ valid: boolean; deliverable: boolean; risk: string }>;
  enrichContactProfile(contact: ContactProfile): Promise<ContactProfile>;
}

export interface ICompetitiveAnalyzer {
  findCompetitors(companyId: string): Promise<CompanyProfile[]>;
  compareCompanies(companyIds: string[]): Promise<any>;
  analyzeMarketPosition(companyId: string): Promise<any>;
  trackCompanyChanges(companyId: string): Promise<any>;
}

// =============================================================================
// RESEARCH CONSTANTS
// =============================================================================

export const RESEARCH_LIMITS = {
  MAX_COMPANIES_PER_TASK: 1000,
  MAX_CONTACTS_PER_COMPANY: 100,
  MAX_PAGES_PER_DOMAIN: 1000,
  MIN_CONFIDENCE_SCORE: 70,
  MAX_CONCURRENT_REQUESTS: 10,
} as const;

export const DATA_RETENTION_POLICIES = {
  COMPANY_DATA: 365, // days
  CONTACT_DATA: 180, // days
  RESEARCH_LOGS: 90, // days
  SCREENSHOTS: 30, // days
} as const;