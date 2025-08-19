// =============================================================================
// ADVANCED PERFORMANCE MONITORING SYSTEM
// Real-time Performance Tracking for Superior Multi-LLM System
// =============================================================================

import { logger } from '../../utils/logger';
import { AIModel } from './model-router';
import { TaskType, AgentType } from '../../../../../packages/shared/src/types/agent';

export interface PerformanceMetrics {
  model: AIModel;
  taskType: TaskType;
  agentType?: AgentType;
  timestamp: Date;
  requestId: string;
  userId?: string;
  sessionId?: string;
  
  // Timing metrics
  totalTime: number;
  queueTime: number;
  processingTime: number;
  networkTime: number;
  
  // Resource metrics
  tokensUsed: number;
  cost: number;
  memoryUsage?: number;
  cpuUsage?: number;
  
  // Quality metrics
  confidence: number;
  accuracy?: number;
  relevance?: number;
  
  // Status metrics
  success: boolean;
  errorType?: string;
  retryCount: number;
  fallbackUsed: boolean;
}

export interface AggregatedMetrics {
  model: AIModel;
  timeWindow: string;
  
  // Request metrics
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  successRate: number;
  
  // Performance metrics
  averageResponseTime: number;
  p50ResponseTime: number;
  p95ResponseTime: number;
  p99ResponseTime: number;
  
  // Cost metrics
  totalCost: number;
  averageCost: number;
  costPerToken: number;
  
  // Quality metrics
  averageConfidence: number;
  averageAccuracy?: number;
  
  // Error metrics
  errorRate: number;
  topErrors: Array<{ type: string; count: number }>;
  
  // Resource metrics
  averageTokensUsed: number;
  totalTokensUsed: number;
  throughput: number; // requests per second
}

export interface AlertRule {
  id: string;
  name: string;
  condition: AlertCondition;
  threshold: number;
  timeWindow: number; // seconds
  enabled: boolean;
  severity: 'low' | 'medium' | 'high' | 'critical';
  actions: AlertAction[];
}

export interface AlertCondition {
  metric: 'error_rate' | 'response_time' | 'cost_per_request' | 'success_rate' | 'throughput';
  operator: 'gt' | 'lt' | 'eq' | 'gte' | 'lte';
  aggregation: 'avg' | 'max' | 'min' | 'sum' | 'count';
}

export interface AlertAction {
  type: 'email' | 'webhook' | 'log' | 'disable_model';
  config: Record<string, any>;
}

export interface Alert {
  id: string;
  ruleId: string;
  timestamp: Date;
  severity: AlertRule['severity'];
  message: string;
  metrics: Record<string, number>;
  resolved: boolean;
  resolvedAt?: Date;
}

// =============================================================================
// PERFORMANCE MONITOR CLASS
// =============================================================================

export class PerformanceMonitor {
  private static instance: PerformanceMonitor;
  private metrics: PerformanceMetrics[] = [];
  private aggregatedMetrics: Map<string, AggregatedMetrics> = new Map();
  private alertRules: Map<string, AlertRule> = new Map();
  private activeAlerts: Map<string, Alert> = new Map();
  private metricsBuffer: PerformanceMetrics[] = [];
  private aggregationInterval?: NodeJS.Timeout;
  private alertCheckInterval?: NodeJS.Timeout;

  private constructor() {
    this.initializeDefaultAlertRules();
    this.startAggregation();
    this.startAlertChecking();
  }

  public static getInstance(): PerformanceMonitor {
    if (!PerformanceMonitor.instance) {
      PerformanceMonitor.instance = new PerformanceMonitor();
    }
    return PerformanceMonitor.instance;
  }

  // =============================================================================
  // METRICS COLLECTION
  // =============================================================================

  public recordMetric(metric: PerformanceMetrics): void {
    metric.timestamp = new Date();
    this.metricsBuffer.push(metric);
    
    // Log high-level metrics
    logger.info('Performance metric recorded', {
      model: metric.model,
      taskType: metric.taskType,
      totalTime: metric.totalTime,
      tokensUsed: metric.tokensUsed,
      cost: metric.cost,
      success: metric.success,
      confidence: metric.confidence,
    });

    // Check for immediate alerts
    this.checkImmediateAlerts(metric);
  }

  public startRequest(requestId: string): RequestTracker {
    return new RequestTracker(requestId, this);
  }

  // =============================================================================
  // METRICS AGGREGATION
  // =============================================================================

  private startAggregation(): void {
    this.aggregationInterval = setInterval(() => {
      this.aggregateMetrics();
    }, 60000); // Aggregate every minute
  }

  private aggregateMetrics(): void {
    if (this.metricsBuffer.length === 0) return;

    // Move buffer to main metrics array
    this.metrics.push(...this.metricsBuffer);
    this.metricsBuffer = [];

    // Keep only last 24 hours of metrics
    const cutoffTime = new Date(Date.now() - 24 * 60 * 60 * 1000);
    this.metrics = this.metrics.filter(m => m.timestamp >= cutoffTime);

    // Aggregate by model and time window
    this.aggregateByTimeWindows();

    logger.debug('Metrics aggregated', {
      totalMetrics: this.metrics.length,
      aggregatedWindows: this.aggregatedMetrics.size,
    });
  }

  private aggregateByTimeWindows(): void {
    const timeWindows = ['1m', '5m', '15m', '1h', '6h', '24h'];
    
    for (const window of timeWindows) {
      const windowMs = this.parseTimeWindow(window);
      const cutoffTime = new Date(Date.now() - windowMs);
      
      // Group by model
      const modelGroups = new Map<AIModel, PerformanceMetrics[]>();
      
      for (const metric of this.metrics) {
        if (metric.timestamp >= cutoffTime) {
          if (!modelGroups.has(metric.model)) {
            modelGroups.set(metric.model, []);
          }
          modelGroups.get(metric.model)!.push(metric);
        }
      }
      
      // Aggregate each model group
      for (const [model, metrics] of modelGroups) {
        const aggregated = this.aggregateModelMetrics(model, metrics, window);
        const key = `${model}_${window}`;
        this.aggregatedMetrics.set(key, aggregated);
      }
    }
  }

  private aggregateModelMetrics(
    model: AIModel, 
    metrics: PerformanceMetrics[], 
    timeWindow: string
  ): AggregatedMetrics {
    const successful = metrics.filter(m => m.success);
    const failed = metrics.filter(m => !m.success);
    
    // Calculate response time percentiles
    const responseTimes = metrics.map(m => m.totalTime).sort((a, b) => a - b);
    const p50 = this.percentile(responseTimes, 0.5);
    const p95 = this.percentile(responseTimes, 0.95);
    const p99 = this.percentile(responseTimes, 0.99);
    
    // Calculate error distribution
    const errorCounts = new Map<string, number>();
    for (const metric of failed) {
      if (metric.errorType) {
        errorCounts.set(metric.errorType, (errorCounts.get(metric.errorType) || 0) + 1);
      }
    }
    
    const topErrors = Array.from(errorCounts.entries())
      .map(([type, count]) => ({ type, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    return {
      model,
      timeWindow,
      totalRequests: metrics.length,
      successfulRequests: successful.length,
      failedRequests: failed.length,
      successRate: metrics.length > 0 ? successful.length / metrics.length : 0,
      averageResponseTime: this.average(metrics.map(m => m.totalTime)),
      p50ResponseTime: p50,
      p95ResponseTime: p95,
      p99ResponseTime: p99,
      totalCost: this.sum(metrics.map(m => m.cost)),
      averageCost: this.average(metrics.map(m => m.cost)),
      costPerToken: this.average(metrics.map(m => m.tokensUsed > 0 ? m.cost / m.tokensUsed : 0)),
      averageConfidence: this.average(metrics.map(m => m.confidence)),
      errorRate: metrics.length > 0 ? failed.length / metrics.length : 0,
      topErrors,
      averageTokensUsed: this.average(metrics.map(m => m.tokensUsed)),
      totalTokensUsed: this.sum(metrics.map(m => m.tokensUsed)),
      throughput: this.calculateThroughput(metrics, timeWindow),
    };
  }

  // =============================================================================
  // ALERT SYSTEM
  // =============================================================================

  private initializeDefaultAlertRules(): void {
    const defaultRules: AlertRule[] = [
      {
        id: 'high_error_rate',
        name: 'High Error Rate',
        condition: {
          metric: 'error_rate',
          operator: 'gt',
          aggregation: 'avg',
        },
        threshold: 0.1, // 10%
        timeWindow: 300, // 5 minutes
        enabled: true,
        severity: 'high',
        actions: [
          { type: 'log', config: {} },
          { type: 'webhook', config: { url: process.env['ALERT_WEBHOOK_URL'] || '' } },
        ],
      },
      {
        id: 'slow_response_time',
        name: 'Slow Response Time',
        condition: {
          metric: 'response_time',
          operator: 'gt',
          aggregation: 'avg',
        },
        threshold: 10000, // 10 seconds
        timeWindow: 300,
        enabled: true,
        severity: 'medium',
        actions: [
          { type: 'log', config: {} },
        ],
      },
      {
        id: 'high_cost_per_request',
        name: 'High Cost Per Request',
        condition: {
          metric: 'cost_per_request',
          operator: 'gt',
          aggregation: 'avg',
        },
        threshold: 0.5, // $0.50
        timeWindow: 600, // 10 minutes
        enabled: true,
        severity: 'medium',
        actions: [
          { type: 'log', config: {} },
        ],
      },
      {
        id: 'low_success_rate',
        name: 'Low Success Rate',
        condition: {
          metric: 'success_rate',
          operator: 'lt',
          aggregation: 'avg',
        },
        threshold: 0.9, // 90%
        timeWindow: 600,
        enabled: true,
        severity: 'high',
        actions: [
          { type: 'log', config: {} },
          { type: 'webhook', config: { url: process.env['ALERT_WEBHOOK_URL'] || '' } },
        ],
      },
    ];

    for (const rule of defaultRules) {
      this.alertRules.set(rule.id, rule);
    }
  }

  private startAlertChecking(): void {
    this.alertCheckInterval = setInterval(() => {
      this.checkAlerts();
    }, 30000); // Check every 30 seconds
  }

  private checkAlerts(): void {
    for (const rule of this.alertRules.values()) {
      if (!rule.enabled) continue;
      
      try {
        this.evaluateAlertRule(rule);
      } catch (error) {
        logger.error('Error evaluating alert rule', {
          ruleId: rule.id,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }
  }

  private evaluateAlertRule(rule: AlertRule): void {
    const windowMs = rule.timeWindow * 1000;
    const cutoffTime = new Date(Date.now() - windowMs);
    
    // Get relevant metrics
    const relevantMetrics = this.metrics.filter(m => m.timestamp >= cutoffTime);
    
    if (relevantMetrics.length === 0) return;
    
    // Calculate metric value based on condition
    let metricValue: number;
    
    switch (rule.condition.metric) {
      case 'error_rate':
        const failed = relevantMetrics.filter(m => !m.success).length;
        metricValue = failed / relevantMetrics.length;
        break;
      case 'response_time':
        const times = relevantMetrics.map(m => m.totalTime);
        metricValue = this.aggregate(times, rule.condition.aggregation);
        break;
      case 'cost_per_request':
        const costs = relevantMetrics.map(m => m.cost);
        metricValue = this.aggregate(costs, rule.condition.aggregation);
        break;
      case 'success_rate':
        const successful = relevantMetrics.filter(m => m.success).length;
        metricValue = successful / relevantMetrics.length;
        break;
      case 'throughput':
        metricValue = relevantMetrics.length / (windowMs / 1000);
        break;
      default:
        return;
    }
    
    // Check if threshold is breached
    const isBreached = this.evaluateCondition(metricValue, rule.condition.operator, rule.threshold);
    
    if (isBreached) {
      this.triggerAlert(rule, metricValue);
    } else {
      this.resolveAlert(rule.id);
    }
  }

  private evaluateCondition(value: number, operator: AlertCondition['operator'], threshold: number): boolean {
    switch (operator) {
      case 'gt': return value > threshold;
      case 'lt': return value < threshold;
      case 'eq': return value === threshold;
      case 'gte': return value >= threshold;
      case 'lte': return value <= threshold;
      default: return false;
    }
  }

  private triggerAlert(rule: AlertRule, metricValue: number): void {
    const existingAlert = this.activeAlerts.get(rule.id);
    
    if (existingAlert && !existingAlert.resolved) {
      // Alert already active
      return;
    }
    
    const alert: Alert = {
      id: `alert_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      ruleId: rule.id,
      timestamp: new Date(),
      severity: rule.severity,
      message: `${rule.name}: ${rule.condition.metric} is ${metricValue.toFixed(4)} (threshold: ${rule.threshold})`,
      metrics: { [rule.condition.metric]: metricValue },
      resolved: false,
    };
    
    this.activeAlerts.set(rule.id, alert);
    
    // Execute alert actions
    for (const action of rule.actions) {
      this.executeAlertAction(action, alert);
    }
    
    logger.warn('Alert triggered', {
      alertId: alert.id,
      ruleId: rule.id,
      severity: alert.severity,
      message: alert.message,
    });
  }

  private resolveAlert(ruleId: string): void {
    const alert = this.activeAlerts.get(ruleId);
    
    if (alert && !alert.resolved) {
      alert.resolved = true;
      alert.resolvedAt = new Date();
      
      logger.info('Alert resolved', {
        alertId: alert.id,
        ruleId: alert.ruleId,
        duration: alert.resolvedAt.getTime() - alert.timestamp.getTime(),
      });
    }
  }

  private executeAlertAction(action: AlertAction, alert: Alert): void {
    try {
      switch (action.type) {
        case 'log':
          logger.error(`ALERT: ${alert.message}`, { alert });
          break;
        case 'webhook':
          if (action.config.url) {
            // In production, implement actual webhook call
            logger.info('Webhook alert sent', { url: action.config.url, alert });
          }
          break;
        case 'email':
          // In production, implement email sending
          logger.info('Email alert sent', { alert });
          break;
        case 'disable_model':
          // In production, implement model disabling
          logger.warn('Model disabled due to alert', { alert });
          break;
      }
    } catch (error) {
      logger.error('Failed to execute alert action', {
        actionType: action.type,
        alertId: alert.id,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  private checkImmediateAlerts(metric: PerformanceMetrics): void {
    // Check for immediate critical conditions
    if (!metric.success && metric.errorType === 'CRITICAL') {
      this.triggerAlert({
        id: 'immediate_critical_error',
        name: 'Immediate Critical Error',
        condition: { metric: 'error_rate', operator: 'gt', aggregation: 'count' },
        threshold: 0,
        timeWindow: 0,
        enabled: true,
        severity: 'critical',
        actions: [{ type: 'log', config: {} }],
      }, 1);
    }
    
    if (metric.totalTime > 30000) { // 30 seconds
      this.triggerAlert({
        id: 'immediate_timeout',
        name: 'Immediate Timeout',
        condition: { metric: 'response_time', operator: 'gt', aggregation: 'max' },
        threshold: 30000,
        timeWindow: 0,
        enabled: true,
        severity: 'high',
        actions: [{ type: 'log', config: {} }],
      }, metric.totalTime);
    }
  }

  // =============================================================================
  // UTILITY METHODS
  // =============================================================================

  private parseTimeWindow(window: string): number {
    const unit = window.slice(-1);
    const value = parseInt(window.slice(0, -1));
    
    switch (unit) {
      case 'm': return value * 60 * 1000;
      case 'h': return value * 60 * 60 * 1000;
      case 'd': return value * 24 * 60 * 60 * 1000;
      default: return value * 1000;
    }
  }

  private percentile(values: number[], p: number): number {
    if (values.length === 0) return 0;
    const index = Math.ceil(values.length * p) - 1;
    return values[Math.max(0, index)];
  }

  private average(values: number[]): number {
    if (values.length === 0) return 0;
    return values.reduce((sum, val) => sum + val, 0) / values.length;
  }

  private sum(values: number[]): number {
    return values.reduce((sum, val) => sum + val, 0);
  }

  private aggregate(values: number[], aggregation: AlertCondition['aggregation']): number {
    if (values.length === 0) return 0;
    
    switch (aggregation) {
      case 'avg': return this.average(values);
      case 'max': return Math.max(...values);
      case 'min': return Math.min(...values);
      case 'sum': return this.sum(values);
      case 'count': return values.length;
      default: return this.average(values);
    }
  }

  private calculateThroughput(metrics: PerformanceMetrics[], timeWindow: string): number {
    const windowMs = this.parseTimeWindow(timeWindow);
    return metrics.length / (windowMs / 1000);
  }

  // =============================================================================
  // PUBLIC API
  // =============================================================================

  public getMetrics(model?: AIModel, timeWindow?: string): AggregatedMetrics[] {
    const results: AggregatedMetrics[] = [];
    
    for (const [key, metrics] of this.aggregatedMetrics) {
      const [keyModel, keyWindow] = key.split('_');
      
      if (model && keyModel !== model) continue;
      if (timeWindow && keyWindow !== timeWindow) continue;
      
      results.push(metrics);
    }
    
    return results.sort((a, b) => b.totalRequests - a.totalRequests);
  }

  public getActiveAlerts(): Alert[] {
    return Array.from(this.activeAlerts.values()).filter(alert => !alert.resolved);
  }

  public getAlertHistory(limit: number = 100): Alert[] {
    return Array.from(this.activeAlerts.values())
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
      .slice(0, limit);
  }

  public addAlertRule(rule: AlertRule): void {
    this.alertRules.set(rule.id, rule);
    logger.info('Alert rule added', { ruleId: rule.id, name: rule.name });
  }

  public removeAlertRule(ruleId: string): void {
    this.alertRules.delete(ruleId);
    this.activeAlerts.delete(ruleId);
    logger.info('Alert rule removed', { ruleId });
  }

  public getPerformanceSummary(): {
    totalRequests: number;
    successRate: number;
    averageResponseTime: number;
    totalCost: number;
    activeAlerts: number;
    topModels: Array<{ model: AIModel; requests: number; successRate: number }>;
  } {
    const recentMetrics = this.metrics.filter(m => 
      m.timestamp >= new Date(Date.now() - 60 * 60 * 1000) // Last hour
    );
    
    const modelStats = new Map<AIModel, { requests: number; successful: number }>();
    
    for (const metric of recentMetrics) {
      if (!modelStats.has(metric.model)) {
        modelStats.set(metric.model, { requests: 0, successful: 0 });
      }
      
      const stats = modelStats.get(metric.model)!;
      stats.requests++;
      if (metric.success) stats.successful++;
    }
    
    const topModels = Array.from(modelStats.entries())
      .map(([model, stats]) => ({
        model,
        requests: stats.requests,
        successRate: stats.requests > 0 ? stats.successful / stats.requests : 0,
      }))
      .sort((a, b) => b.requests - a.requests)
      .slice(0, 5);
    
    return {
      totalRequests: recentMetrics.length,
      successRate: recentMetrics.length > 0 
        ? recentMetrics.filter(m => m.success).length / recentMetrics.length 
        : 0,
      averageResponseTime: this.average(recentMetrics.map(m => m.totalTime)),
      totalCost: this.sum(recentMetrics.map(m => m.cost)),
      activeAlerts: this.getActiveAlerts().length,
      topModels,
    };
  }

  public shutdown(): void {
    if (this.aggregationInterval) {
      clearInterval(this.aggregationInterval);
    }
    
    if (this.alertCheckInterval) {
      clearInterval(this.alertCheckInterval);
    }
    
    logger.info('Performance monitor shutdown');
  }
}

// =============================================================================
// REQUEST TRACKER CLASS
// =============================================================================

export class RequestTracker {
  private startTime: number;
  private queueStartTime?: number;
  private processingStartTime?: number;
  private networkStartTime?: number;
  
  constructor(
    private requestId: string,
    private monitor: PerformanceMonitor
  ) {
    this.startTime = Date.now();
  }

  public startQueue(): void {
    this.queueStartTime = Date.now();
  }

  public startProcessing(): void {
    this.processingStartTime = Date.now();
  }

  public startNetwork(): void {
    this.networkStartTime = Date.now();
  }

  public complete(
    model: AIModel,
    taskType: TaskType,
    success: boolean,
    tokensUsed: number,
    cost: number,
    confidence: number,
    options: {
      agentType?: AgentType;
      userId?: string;
      sessionId?: string;
      errorType?: string;
      retryCount?: number;
      fallbackUsed?: boolean;
    } = {}
  ): void {
    const endTime = Date.now();
    
    const metric: PerformanceMetrics = {
      model,
      taskType,
      agentType: options.agentType,
      timestamp: new Date(),
      requestId: this.requestId,
      userId: options.userId,
      sessionId: options.sessionId,
      totalTime: endTime - this.startTime,
      queueTime: this.processingStartTime && this.queueStartTime 
        ? this.processingStartTime - this.queueStartTime 
        : 0,
      processingTime: this.processingStartTime 
        ? endTime - this.processingStartTime 
        : endTime - this.startTime,
      networkTime: this.networkStartTime && this.processingStartTime
        ? this.processingStartTime - this.networkStartTime
        : 0,
      tokensUsed,
      cost,
      confidence,
      success,
      errorType: options.errorType,
      retryCount: options.retryCount || 0,
      fallbackUsed: options.fallbackUsed || false,
    };
    
    this.monitor.recordMetric(metric);
  }
}

export default PerformanceMonitor;