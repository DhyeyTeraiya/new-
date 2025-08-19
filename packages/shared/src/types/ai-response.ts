// AI response types for NVIDIA API integration

export interface AIResponse {
  /** Unique response ID */
  id: string;
  /** AI response message */
  message: string;
  /** Planned browser actions */
  actions?: BrowserAction[];
  /** Suggested follow-up actions */
  suggestions?: string[];
  /** AI confidence level (0-1) */
  confidence: number;
  /** Response type */
  type: AIResponseType;
  /** Additional metadata */
  metadata?: AIResponseMetadata;
  /** Timestamp */
  timestamp: Date;
}

export type AIResponseType = 
  | 'chat'           // Simple chat response
  | 'action_plan'    // Action execution plan
  | 'confirmation'   // Confirmation request
  | 'error'          // Error response
  | 'success'        // Success notification
  | 'analysis'       // Page analysis result
  | 'extraction';    // Data extraction result

export interface AIResponseMetadata {
  /** Model used for this response */
  model: string;
  /** Processing time in milliseconds */
  processingTime: number;
  /** Token usage information */
  tokenUsage?: TokenUsage;
  /** Whether response was cached */
  cached: boolean;
  /** Context used for response */
  contextUsed?: string[];
}

export interface TokenUsage {
  /** Input tokens */
  promptTokens: number;
  /** Output tokens */
  completionTokens: number;
  /** Total tokens */
  totalTokens: number;
}

export interface UserIntent {
  /** Primary intent category */
  category: IntentCategory;
  /** Specific action to perform */
  action: string;
  /** Target elements or data */
  targets?: string[];
  /** Intent parameters */
  parameters?: Record<string, any>;
  /** Confidence score */
  confidence: number;
}

export type IntentCategory =
  | 'navigation'     // Navigate to pages, scroll, etc.
  | 'interaction'    // Click, type, select, etc.
  | 'extraction'     // Extract data from page
  | 'analysis'       // Analyze page content
  | 'automation'     // Multi-step automation
  | 'question'       // Answer questions about page
  | 'search'         // Search for information
  | 'form_fill';     // Fill out forms

export interface ActionPlan {
  /** Plan ID */
  id: string;
  /** Plan description */
  description: string;
  /** Ordered list of actions */
  steps: ActionStep[];
  /** Estimated execution time */
  estimatedTime: number;
  /** Risk level */
  riskLevel: 'low' | 'medium' | 'high';
  /** Whether confirmation is required */
  requiresConfirmation: boolean;
}

export interface ActionStep {
  /** Step ID */
  id: string;
  /** Step description */
  description: string;
  /** Browser action to execute */
  action: BrowserAction;
  /** Expected outcome */
  expectedOutcome: string;
  /** Fallback actions if this fails */
  fallbacks?: BrowserAction[];
}