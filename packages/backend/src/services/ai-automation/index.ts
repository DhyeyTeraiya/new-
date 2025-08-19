/**
 * AI Automation Integration Module
 * Exports all AI automation integration components
 */

export { IntegrationService } from './integration-service';
export { AIAutomationCoordinator } from './ai-automation-coordinator';
export { ActionPlanner } from './action-planner';
export { FeedbackAnalyzer } from './feedback-analyzer';

export type {
  AIAutomationRequest,
  AIAutomationResponse,
  AutomationFeedback
} from './ai-automation-coordinator';

export type {
  PlanningContext,
  PlanningResult
} from './action-planner';

export type {
  FeedbackAnalysis,
  LearningData
} from './feedback-analyzer';

export type {
  IntegrationConfig
} from './integration-service';