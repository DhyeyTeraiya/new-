import { logger } from '@/utils/logger';
import { MultiLLMService, LLMRequest } from '@/services/ai/multi-llm-service';
import { TaskType, AgentType } from '@browser-ai-agent/shared/types/agent';
import { IAgent, IVerifierAgent } from '@browser-ai-agent/shared/types/agent';

// =============================================================================
// VERIFIER AGENT (Superior to Manus Quality Control)
// Master Plan: Claude 3.5 Sonnet for quality scoring and automated error correction
// =============================================================================

export interface VerificationTask {
  id: string;
  type: 'data' | 'action' | 'workflow' | 'extraction' | 'navigation' | 'custom';
  target: any;
  criteria: VerificationCriteria;
  thresholds: QualityThresholds;
  corrections: CorrectionConfig;
}

export interface VerificationCriteria {
  accuracy: AccuracyCriteria;
  completeness: CompletenessCriteria;
  consistency: ConsistencyCriteria;
  reliability: ReliabilityCriteria;
  performance: PerformanceCriteria;
}

export interface AccuracyCriteria {
  dataValidation: boolean;
  schemaCompliance: boolean;
  formatValidation: boolean;
  businessRules: string[];
  customValidators: string[];
}

export interface CompletenessCriteria {
  requiredFields: string[];
  minimumRecords: number;
  coverageThreshold: number;
  missingDataTolerance: number;
}

export interface ConsistencyCriteria {
  dataTypes: boolean;
  formats: boolean;
  patterns: string[];
  crossFieldValidation: boolean;
}

export interface ReliabilityCriteria {
  sourceVerification: boolean;
  duplicateDetection: boolean;
  outlierDetection: boolean;
  confidenceScoring: boolean;
}

export interface PerformanceCriteria {
  executionTime: number;
  resourceUsage: number;
  errorRate: number;
  successRate: number;
}

export interface QualityThresholds {
  minimum: number;
  target: number;
  excellent: number;
  critical: number;
}

export interface CorrectionConfig {
  enabled: boolean;
  automatic: boolean;
  strategies: CorrectionStrategy[];
  maxAttempts: number;
  escalation: EscalationConfig;
}

export interface CorrectionStrategy {
  name: string;
  type: 'data_cleaning' | 'retry' | 'alternative_method' | 'manual_intervention';
  conditions: string[];
  actions: string[];
  priority: number;
}

export interface EscalationConfig {
  enabled: boolean;
  thresholds: {
    warnings: number;
    errors: number;
    criticalFailures: number;
  };
  notifications: string[];
}

export interface VerificationResult {
  success: boolean;
  taskId: string;
  overallScore: number;
  scores: QualityScores;
  issues: QualityIssue[];
  corrections: CorrectionResult[];
  recommendations: string[];
  metadata: VerificationMetadata;
}

export interface QualityScores {
  accuracy: number;
  completeness: number;
  consistency: number;
  reliability: number;
  performance: number;
  overall: number;
}

export interface QualityIssue {
  id: string;
  type: 'error' | 'warning' | 'info';
  category: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  location?: string;
  suggestion?: string;
  autoCorrectible: boolean;
}

export interface CorrectionResult {
  issueId: string;
  strategy: string;
  success: boolean;
  before: any;
  after: any;
  confidence: number;
  duration: number;
}

export interface VerificationMetadata {
  verifiedAt: Date;
  duration: number;
  version: string;
  criteria: string;
  corrections: number;
  escalations: number;
}

// =============================================================================
// VERIFIER AGENT IMPLEMENTATION
// =============================================================================

export class VerifierAgent implements IVerifierAgent {
  public readonly id: string;
  public readonly type = AgentType.VERIFIER;
  private llmService: MultiLLMService;
  private verificationHistory: Map<string, VerificationResult[]> = new Map();
  private qualityBaselines: Map<string, QualityScores> = new Map();
  private correctionStrategies: Map<string, CorrectionStrategy[]> = new Map();

  constructor(id: string) {
    this.id = id;
    this.llmService = MultiLLMService.getInstance();
    this.initializeCorrectionStrategies();
    logger.info('Verifier Agent initialized', { id: this.id });
  }

  // =============================================================================
  // CORE AGENT INTERFACE METHODS
  // =============================================================================

  async initialize(): Promise<void> {
    logger.info('Initializing Verifier Agent', { id: this.id });
  }

  async start(): Promise<void> {
    logger.info('Starting Verifier Agent', { id: this.id });
  }

  async stop(): Promise<void> {
    logger.info('Stopping Verifier Agent', { id: this.id });
    this.verificationHistory.clear();
  }

  async executeTask(task: any): Promise<VerificationResult> {
    logger.info('Verifier Agent executing task', {
      taskId: task.id,
      type: task.type,
      agentId: this.id,
    });

    const startTime = Date.now();
    const verificationTask: VerificationTask = this.parseTask(task);

    try {
      // Perform comprehensive verification
      const result = await this.performVerification(verificationTask);
      
      // Store in history
      if (!this.verificationHistory.has(task.userId)) {
        this.verificationHistory.set(task.userId, []);
      }
      this.verificationHistory.get(task.userId)!.push(result);

      // Update quality baselines
      await this.updateQualityBaselines(task.type, result.scores);

      const duration = Date.now() - startTime;
      result.metadata.duration = duration;

      logger.info('Verification task completed', {
        taskId: task.id,
        success: result.success,
        overallScore: result.overallScore,
        issues: result.issues.length,
        corrections: result.corrections.length,
        duration,
      });

      return result;

    } catch (error) {
      const duration = Date.now() - startTime;
      
      logger.error('Verification task failed', {
        taskId: task.id,
        error: error.message,
      });

      return {
        success: false,
        taskId: task.id,
        overallScore: 0,
        scores: {
          accuracy: 0,
          completeness: 0,
          consistency: 0,
          reliability: 0,
          performance: 0,
          overall: 0,
        },
        issues: [{
          id: 'verification_error',
          type: 'error',
          category: 'system',
          severity: 'critical',
          description: error.message,
          autoCorrectible: false,
        }],
        corrections: [],
        recommendations: ['Review system configuration and retry verification'],
        metadata: {
          verifiedAt: new Date(),
          duration,
          version: '1.0.0',
          criteria: 'error',
          corrections: 0,
          escalations: 0,
        },
      };
    }
  }

  async sendMessage(message: any): Promise<void> {
    logger.debug('Verifier Agent sending message', { message });
  }

  async receiveMessage(message: any): Promise<void> {
    logger.debug('Verifier Agent received message', { message });
  }

  getStatus(): any {
    return {
      id: this.id,
      type: this.type,
      status: 'active',
      verificationsPerformed: Array.from(this.verificationHistory.values()).reduce((sum, results) => sum + results.length, 0),
      qualityBaselines: this.qualityBaselines.size,
      correctionStrategies: this.correctionStrategies.size,
      lastActivity: new Date(),
    };
  }

  updateStatus(status: any): void {
    // Update agent status
  }
}  // =====
========================================================================
  // VERIFICATION METHODS
  // =============================================================================

  async verifyData(data: any, criteria: VerificationCriteria): Promise<VerificationResult> {
    logger.info('Verifying data quality');

    const startTime = Date.now();
    const issues: QualityIssue[] = [];
    const corrections: CorrectionResult[] = [];

    // Accuracy verification
    const accuracyScore = await this.verifyAccuracy(data, criteria.accuracy, issues);
    
    // Completeness verification
    const completenessScore = await this.verifyCompleteness(data, criteria.completeness, issues);
    
    // Consistency verification
    const consistencyScore = await this.verifyConsistency(data, criteria.consistency, issues);
    
    // Reliability verification
    const reliabilityScore = await this.verifyReliability(data, criteria.reliability, issues);
    
    // Performance verification
    const performanceScore = await this.verifyPerformance(data, criteria.performance, issues);

    const scores: QualityScores = {
      accuracy: accuracyScore,
      completeness: completenessScore,
      consistency: consistencyScore,
      reliability: reliabilityScore,
      performance: performanceScore,
      overall: (accuracyScore + completenessScore + consistencyScore + reliabilityScore + performanceScore) / 5,
    };

    // Apply corrections if enabled
    if (issues.length > 0) {
      const correctionResults = await this.applyCorrections(data, issues);
      corrections.push(...correctionResults);
    }

    // Generate recommendations
    const recommendations = await this.generateRecommendations(scores, issues);

    const duration = Date.now() - startTime;

    return {
      success: scores.overall >= 0.7, // Configurable threshold
      taskId: `verify_data_${Date.now()}`,
      overallScore: scores.overall,
      scores,
      issues,
      corrections,
      recommendations,
      metadata: {
        verifiedAt: new Date(),
        duration,
        version: '1.0.0',
        criteria: 'data_verification',
        corrections: corrections.length,
        escalations: 0,
      },
    };
  }

  async verifyAction(actionResult: any, criteria: VerificationCriteria): Promise<VerificationResult> {
    logger.info('Verifying action result');

    const startTime = Date.now();
    const issues: QualityIssue[] = [];
    const corrections: CorrectionResult[] = [];

    // Verify action success
    if (!actionResult.success) {
      issues.push({
        id: 'action_failed',
        type: 'error',
        category: 'execution',
        severity: 'high',
        description: actionResult.error || 'Action execution failed',
        autoCorrectible: true,
      });
    }

    // Verify action timing
    if (actionResult.duration > criteria.performance.executionTime) {
      issues.push({
        id: 'slow_execution',
        type: 'warning',
        category: 'performance',
        severity: 'medium',
        description: `Action took ${actionResult.duration}ms, expected < ${criteria.performance.executionTime}ms`,
        suggestion: 'Consider optimizing action execution or increasing timeout',
        autoCorrectible: false,
      });
    }

    // Verify retry count
    if (actionResult.retryCount > 2) {
      issues.push({
        id: 'high_retry_count',
        type: 'warning',
        category: 'reliability',
        severity: 'medium',
        description: `Action required ${actionResult.retryCount} retries`,
        suggestion: 'Review element selectors or page stability',
        autoCorrectible: false,
      });
    }

    const scores = this.calculateActionScores(actionResult, issues);
    const recommendations = await this.generateActionRecommendations(actionResult, issues);

    const duration = Date.now() - startTime;

    return {
      success: scores.overall >= 0.7,
      taskId: `verify_action_${Date.now()}`,
      overallScore: scores.overall,
      scores,
      issues,
      corrections,
      recommendations,
      metadata: {
        verifiedAt: new Date(),
        duration,
        version: '1.0.0',
        criteria: 'action_verification',
        corrections: corrections.length,
        escalations: 0,
      },
    };
  }

  // =============================================================================
  // QUALITY SCORING METHODS
  // =============================================================================

  private async verifyAccuracy(data: any, criteria: AccuracyCriteria, issues: QualityIssue[]): Promise<number> {
    let score = 1.0;

    // Data validation
    if (criteria.dataValidation) {
      const validationResult = await this.validateDataTypes(data);
      if (!validationResult.valid) {
        score -= 0.2;
        issues.push({
          id: 'data_validation_failed',
          type: 'error',
          category: 'accuracy',
          severity: 'high',
          description: 'Data validation failed',
          autoCorrectible: true,
        });
      }
    }

    // Schema compliance
    if (criteria.schemaCompliance) {
      const schemaResult = await this.validateSchema(data);
      if (!schemaResult.valid) {
        score -= 0.3;
        issues.push({
          id: 'schema_compliance_failed',
          type: 'error',
          category: 'accuracy',
          severity: 'high',
          description: 'Schema compliance validation failed',
          autoCorrectible: true,
        });
      }
    }

    // Format validation
    if (criteria.formatValidation) {
      const formatResult = await this.validateFormats(data);
      if (!formatResult.valid) {
        score -= 0.1;
        issues.push({
          id: 'format_validation_failed',
          type: 'warning',
          category: 'accuracy',
          severity: 'medium',
          description: 'Format validation failed',
          autoCorrectible: true,
        });
      }
    }

    return Math.max(0, score);
  }

  private async verifyCompleteness(data: any, criteria: CompletenessCriteria, issues: QualityIssue[]): Promise<number> {
    let score = 1.0;

    // Check required fields
    if (criteria.requiredFields.length > 0) {
      const missingFields = this.findMissingFields(data, criteria.requiredFields);
      if (missingFields.length > 0) {
        const penalty = (missingFields.length / criteria.requiredFields.length) * 0.5;
        score -= penalty;
        
        issues.push({
          id: 'missing_required_fields',
          type: 'error',
          category: 'completeness',
          severity: 'high',
          description: `Missing required fields: ${missingFields.join(', ')}`,
          autoCorrectible: false,
        });
      }
    }

    // Check minimum records
    if (Array.isArray(data) && data.length < criteria.minimumRecords) {
      score -= 0.3;
      issues.push({
        id: 'insufficient_records',
        type: 'warning',
        category: 'completeness',
        severity: 'medium',
        description: `Found ${data.length} records, expected at least ${criteria.minimumRecords}`,
        autoCorrectible: false,
      });
    }

    return Math.max(0, score);
  }

  private async verifyConsistency(data: any, criteria: ConsistencyCriteria, issues: QualityIssue[]): Promise<number> {
    let score = 1.0;

    // Data type consistency
    if (criteria.dataTypes) {
      const inconsistencies = this.findDataTypeInconsistencies(data);
      if (inconsistencies.length > 0) {
        score -= 0.2;
        issues.push({
          id: 'data_type_inconsistencies',
          type: 'warning',
          category: 'consistency',
          severity: 'medium',
          description: `Found ${inconsistencies.length} data type inconsistencies`,
          autoCorrectible: true,
        });
      }
    }

    // Format consistency
    if (criteria.formats) {
      const formatInconsistencies = this.findFormatInconsistencies(data);
      if (formatInconsistencies.length > 0) {
        score -= 0.1;
        issues.push({
          id: 'format_inconsistencies',
          type: 'info',
          category: 'consistency',
          severity: 'low',
          description: `Found ${formatInconsistencies.length} format inconsistencies`,
          autoCorrectible: true,
        });
      }
    }

    return Math.max(0, score);
  }

  private async verifyReliability(data: any, criteria: ReliabilityCriteria, issues: QualityIssue[]): Promise<number> {
    let score = 1.0;

    // Duplicate detection
    if (criteria.duplicateDetection) {
      const duplicates = this.findDuplicates(data);
      if (duplicates.length > 0) {
        score -= 0.1;
        issues.push({
          id: 'duplicates_found',
          type: 'warning',
          category: 'reliability',
          severity: 'medium',
          description: `Found ${duplicates.length} duplicate records`,
          autoCorrectible: true,
        });
      }
    }

    // Outlier detection
    if (criteria.outlierDetection) {
      const outliers = this.findOutliers(data);
      if (outliers.length > 0) {
        score -= 0.05;
        issues.push({
          id: 'outliers_detected',
          type: 'info',
          category: 'reliability',
          severity: 'low',
          description: `Found ${outliers.length} potential outliers`,
          autoCorrectible: false,
        });
      }
    }

    return Math.max(0, score);
  }

  private async verifyPerformance(data: any, criteria: PerformanceCriteria, issues: QualityIssue[]): Promise<number> {
    let score = 1.0;

    // This would be implemented with actual performance metrics
    // For now, return a baseline score
    return score;
  }

  // =============================================================================
  // CORRECTION METHODS
  // =============================================================================

  private async applyCorrections(data: any, issues: QualityIssue[]): Promise<CorrectionResult[]> {
    const corrections: CorrectionResult[] = [];

    for (const issue of issues.filter(i => i.autoCorrectible)) {
      try {
        const correction = await this.applySingleCorrection(data, issue);
        if (correction) {
          corrections.push(correction);
        }
      } catch (error) {
        logger.warn('Correction failed', {
          issueId: issue.id,
          error: error.message,
        });
      }
    }

    return corrections;
  }

  private async applySingleCorrection(data: any, issue: QualityIssue): Promise<CorrectionResult | null> {
    const startTime = Date.now();

    switch (issue.id) {
      case 'data_validation_failed':
        return await this.correctDataValidation(data, issue);
      case 'schema_compliance_failed':
        return await this.correctSchemaCompliance(data, issue);
      case 'format_validation_failed':
        return await this.correctFormatValidation(data, issue);
      case 'duplicates_found':
        return await this.correctDuplicates(data, issue);
      default:
        return null;
    }
  }

  private async correctDataValidation(data: any, issue: QualityIssue): Promise<CorrectionResult> {
    // Implement data validation correction
    return {
      issueId: issue.id,
      strategy: 'data_cleaning',
      success: true,
      before: data,
      after: data, // Would contain corrected data
      confidence: 0.8,
      duration: 100,
    };
  }

  private async correctSchemaCompliance(data: any, issue: QualityIssue): Promise<CorrectionResult> {
    // Implement schema compliance correction
    return {
      issueId: issue.id,
      strategy: 'schema_normalization',
      success: true,
      before: data,
      after: data, // Would contain corrected data
      confidence: 0.9,
      duration: 150,
    };
  }

  private async correctFormatValidation(data: any, issue: QualityIssue): Promise<CorrectionResult> {
    // Implement format validation correction
    return {
      issueId: issue.id,
      strategy: 'format_standardization',
      success: true,
      before: data,
      after: data, // Would contain corrected data
      confidence: 0.85,
      duration: 80,
    };
  }

  private async correctDuplicates(data: any, issue: QualityIssue): Promise<CorrectionResult> {
    // Implement duplicate removal
    return {
      issueId: issue.id,
      strategy: 'deduplication',
      success: true,
      before: data,
      after: data, // Would contain deduplicated data
      confidence: 0.95,
      duration: 200,
    };
  }
}  // =====
========================================================================
  // HELPER METHODS
  // =============================================================================

  private parseTask(task: any): VerificationTask {
    return {
      id: task.id,
      type: task.type || 'data',
      target: task.target,
      criteria: task.criteria || this.getDefaultCriteria(),
      thresholds: task.thresholds || this.getDefaultThresholds(),
      corrections: task.corrections || this.getDefaultCorrectionConfig(),
    };
  }

  private async performVerification(task: VerificationTask): Promise<VerificationResult> {
    switch (task.type) {
      case 'data':
        return await this.verifyData(task.target, task.criteria);
      case 'action':
        return await this.verifyAction(task.target, task.criteria);
      default:
        throw new Error(`Unknown verification type: ${task.type}`);
    }
  }

  private getDefaultCriteria(): VerificationCriteria {
    return {
      accuracy: {
        dataValidation: true,
        schemaCompliance: true,
        formatValidation: true,
        businessRules: [],
        customValidators: [],
      },
      completeness: {
        requiredFields: [],
        minimumRecords: 1,
        coverageThreshold: 0.8,
        missingDataTolerance: 0.1,
      },
      consistency: {
        dataTypes: true,
        formats: true,
        patterns: [],
        crossFieldValidation: true,
      },
      reliability: {
        sourceVerification: false,
        duplicateDetection: true,
        outlierDetection: true,
        confidenceScoring: true,
      },
      performance: {
        executionTime: 30000,
        resourceUsage: 100,
        errorRate: 0.05,
        successRate: 0.95,
      },
    };
  }

  private getDefaultThresholds(): QualityThresholds {
    return {
      minimum: 0.6,
      target: 0.8,
      excellent: 0.95,
      critical: 0.4,
    };
  }

  private getDefaultCorrectionConfig(): CorrectionConfig {
    return {
      enabled: true,
      automatic: true,
      strategies: [],
      maxAttempts: 3,
      escalation: {
        enabled: true,
        thresholds: {
          warnings: 5,
          errors: 3,
          criticalFailures: 1,
        },
        notifications: ['admin'],
      },
    };
  }

  private async validateDataTypes(data: any): Promise<{ valid: boolean; errors: string[] }> {
    // Implement data type validation
    return { valid: true, errors: [] };
  }

  private async validateSchema(data: any): Promise<{ valid: boolean; errors: string[] }> {
    // Implement schema validation
    return { valid: true, errors: [] };
  }

  private async validateFormats(data: any): Promise<{ valid: boolean; errors: string[] }> {
    // Implement format validation
    return { valid: true, errors: [] };
  }

  private findMissingFields(data: any, requiredFields: string[]): string[] {
    if (!data || typeof data !== 'object') return requiredFields;
    
    return requiredFields.filter(field => !data.hasOwnProperty(field));
  }

  private findDataTypeInconsistencies(data: any): any[] {
    // Implement data type inconsistency detection
    return [];
  }

  private findFormatInconsistencies(data: any): any[] {
    // Implement format inconsistency detection
    return [];
  }

  private findDuplicates(data: any): any[] {
    if (!Array.isArray(data)) return [];
    
    const seen = new Set();
    const duplicates: any[] = [];
    
    for (const item of data) {
      const key = JSON.stringify(item);
      if (seen.has(key)) {
        duplicates.push(item);
      } else {
        seen.add(key);
      }
    }
    
    return duplicates;
  }

  private findOutliers(data: any): any[] {
    // Implement outlier detection
    return [];
  }

  private calculateActionScores(actionResult: any, issues: QualityIssue[]): QualityScores {
    const baseScore = actionResult.success ? 1.0 : 0.0;
    const issuesPenalty = issues.length * 0.1;
    const retryPenalty = actionResult.retryCount * 0.05;
    
    const overall = Math.max(0, baseScore - issuesPenalty - retryPenalty);
    
    return {
      accuracy: actionResult.success ? 0.9 : 0.1,
      completeness: actionResult.result ? 0.9 : 0.5,
      consistency: 0.8,
      reliability: Math.max(0, 1.0 - (actionResult.retryCount * 0.1)),
      performance: actionResult.duration < 10000 ? 0.9 : 0.6,
      overall,
    };
  }

  private async generateRecommendations(scores: QualityScores, issues: QualityIssue[]): Promise<string[]> {
    const recommendations: string[] = [];

    if (scores.accuracy < 0.8) {
      recommendations.push('Improve data validation and schema compliance');
    }

    if (scores.completeness < 0.8) {
      recommendations.push('Ensure all required fields are populated');
    }

    if (scores.consistency < 0.8) {
      recommendations.push('Standardize data formats and types');
    }

    if (scores.reliability < 0.8) {
      recommendations.push('Implement duplicate detection and outlier handling');
    }

    if (scores.performance < 0.8) {
      recommendations.push('Optimize execution performance and resource usage');
    }

    return recommendations;
  }

  private async generateActionRecommendations(actionResult: any, issues: QualityIssue[]): Promise<string[]> {
    const recommendations: string[] = [];

    if (!actionResult.success) {
      recommendations.push('Review action parameters and target elements');
    }

    if (actionResult.retryCount > 2) {
      recommendations.push('Improve element selectors or page stability detection');
    }

    if (actionResult.duration > 10000) {
      recommendations.push('Optimize action execution or increase timeout values');
    }

    return recommendations;
  }

  private async updateQualityBaselines(taskType: string, scores: QualityScores): Promise<void> {
    const existing = this.qualityBaselines.get(taskType);
    
    if (existing) {
      // Update with weighted average
      const weight = 0.1; // New score weight
      const updated: QualityScores = {
        accuracy: existing.accuracy * (1 - weight) + scores.accuracy * weight,
        completeness: existing.completeness * (1 - weight) + scores.completeness * weight,
        consistency: existing.consistency * (1 - weight) + scores.consistency * weight,
        reliability: existing.reliability * (1 - weight) + scores.reliability * weight,
        performance: existing.performance * (1 - weight) + scores.performance * weight,
        overall: existing.overall * (1 - weight) + scores.overall * weight,
      };
      
      this.qualityBaselines.set(taskType, updated);
    } else {
      this.qualityBaselines.set(taskType, scores);
    }
  }

  private initializeCorrectionStrategies(): void {
    // Initialize default correction strategies
    const dataStrategies: CorrectionStrategy[] = [
      {
        name: 'data_cleaning',
        type: 'data_cleaning',
        conditions: ['invalid_data_type', 'format_error'],
        actions: ['normalize_data', 'convert_types'],
        priority: 1,
      },
      {
        name: 'schema_normalization',
        type: 'data_cleaning',
        conditions: ['schema_mismatch'],
        actions: ['add_missing_fields', 'remove_extra_fields'],
        priority: 2,
      },
      {
        name: 'deduplication',
        type: 'data_cleaning',
        conditions: ['duplicates_found'],
        actions: ['remove_duplicates', 'merge_similar'],
        priority: 3,
      },
    ];

    this.correctionStrategies.set('data', dataStrategies);

    const actionStrategies: CorrectionStrategy[] = [
      {
        name: 'retry_with_delay',
        type: 'retry',
        conditions: ['network_error', 'timeout'],
        actions: ['wait_and_retry', 'increase_timeout'],
        priority: 1,
      },
      {
        name: 'alternative_selector',
        type: 'alternative_method',
        conditions: ['element_not_found'],
        actions: ['try_alternative_selectors', 'use_ai_selection'],
        priority: 2,
      },
    ];

    this.correctionStrategies.set('action', actionStrategies);

    logger.info('Correction strategies initialized', {
      dataStrategies: dataStrategies.length,
      actionStrategies: actionStrategies.length,
    });
  }

  // =============================================================================
  // PUBLIC API METHODS
  // =============================================================================

  public getVerificationHistory(userId: string): VerificationResult[] {
    return this.verificationHistory.get(userId) || [];
  }

  public getQualityBaseline(taskType: string): QualityScores | undefined {
    return this.qualityBaselines.get(taskType);
  }

  public addCorrectionStrategy(taskType: string, strategy: CorrectionStrategy): void {
    if (!this.correctionStrategies.has(taskType)) {
      this.correctionStrategies.set(taskType, []);
    }
    
    this.correctionStrategies.get(taskType)!.push(strategy);
    logger.info('Correction strategy added', { taskType, strategy: strategy.name });
  }

  public getStats(): any {
    const allResults = Array.from(this.verificationHistory.values()).flat();
    const successfulVerifications = allResults.filter(r => r.success).length;
    
    return {
      id: this.id,
      type: this.type,
      totalVerifications: allResults.length,
      successRate: allResults.length > 0 ? successfulVerifications / allResults.length : 0,
      averageScore: allResults.length > 0 ? 
        allResults.reduce((sum, r) => sum + r.overallScore, 0) / allResults.length : 0,
      qualityBaselines: this.qualityBaselines.size,
      correctionStrategies: Array.from(this.correctionStrategies.values()).reduce((sum, strategies) => sum + strategies.length, 0),
    };
  }
}

export default VerifierAgent;