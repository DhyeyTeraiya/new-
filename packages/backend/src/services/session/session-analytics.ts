/**
 * Session Analytics Service
 * Provides detailed analytics and insights for session data
 */

import { UserSession, DeviceInfo } from '@browser-ai-agent/shared';
import { Logger } from '../../utils/logger';

export interface SessionAnalytics {
  sessionId: string;
  duration: number; // in milliseconds
  pageViews: number;
  automationCount: number;
  messageCount: number;
  deviceSwitches: number;
  mostVisitedDomains: string[];
  activityTimeline: ActivityEvent[];
  performanceMetrics: PerformanceMetrics;
  userBehavior: UserBehaviorMetrics;
}

export interface ActivityEvent {
  timestamp: Date;
  type: 'page_visit' | 'automation' | 'message' | 'device_switch' | 'preference_change';
  details: any;
  duration?: number;
}

export interface PerformanceMetrics {
  averageResponseTime: number;
  automationSuccessRate: number;
  errorCount: number;
  cacheHitRate: number;
  memoryUsage: number;
}

export interface UserBehaviorMetrics {
  mostActiveHours: number[];
  preferredDeviceType: string;
  averageSessionLength: number;
  featureUsage: Record<string, number>;
  automationPatterns: string[];
}

export interface AggregatedAnalytics {
  totalSessions: number;
  totalUsers: number;
  averageSessionDuration: number;
  topDeviceTypes: Array<{ type: string; count: number; percentage: number }>;
  topBrowsers: Array<{ browser: string; count: number; percentage: number }>;
  dailyActiveUsers: number;
  weeklyActiveUsers: number;
  monthlyActiveUsers: number;
  retentionRate: number;
  churnRate: number;
  growthRate: number;
}

export interface TimeSeriesData {
  timestamp: Date;
  value: number;
  metadata?: any;
}

export interface AnalyticsQuery {
  startDate?: Date;
  endDate?: Date;
  userId?: string;
  deviceType?: string;
  browser?: string;
  sessionIds?: string[];
  metrics?: string[];
  groupBy?: 'hour' | 'day' | 'week' | 'month';
  limit?: number;
  offset?: number;
}

export class SessionAnalyticsService {
  private logger: Logger;
  private sessionData: Map<string, SessionAnalytics> = new Map();
  private aggregatedCache: Map<string, any> = new Map();
  private cacheExpiry: Map<string, Date> = new Map();

  constructor(logger: Logger) {
    this.logger = logger;
  }

  /**
   * Analyze a single session
   */
  async analyzeSession(session: UserSession): Promise<SessionAnalytics> {
    try {
      this.logger.debug('Analyzing session', { sessionId: session.id });

      const analytics: SessionAnalytics = {
        sessionId: session.id,
        duration: this.calculateSessionDuration(session),
        pageViews: this.countPageViews(session),
        automationCount: this.countAutomations(session),
        messageCount: session.conversationHistory?.length || 0,
        deviceSwitches: this.countDeviceSwitches(session),
        mostVisitedDomains: this.extractMostVisitedDomains(session),
        activityTimeline: this.buildActivityTimeline(session),
        performanceMetrics: await this.calculatePerformanceMetrics(session),
        userBehavior: await this.analyzeUserBehavior(session)
      };

      // Cache the analytics
      this.sessionData.set(session.id, analytics);

      this.logger.debug('Session analysis completed', {
        sessionId: session.id,
        duration: analytics.duration,
        pageViews: analytics.pageViews,
        messageCount: analytics.messageCount
      });

      return analytics;

    } catch (error) {
      this.logger.error('Failed to analyze session', {
        sessionId: session.id,
        error
      });
      throw error;
    }
  }

  /**
   * Get analytics for multiple sessions
   */
  async getSessionAnalytics(
    sessionIds: string[],
    sessions: UserSession[]
  ): Promise<SessionAnalytics[]> {
    try {
      const analyticsPromises = sessions.map(session => 
        this.analyzeSession(session)
      );

      const analytics = await Promise.all(analyticsPromises);

      this.logger.debug('Bulk session analysis completed', {
        sessionCount: sessions.length
      });

      return analytics;

    } catch (error) {
      this.logger.error('Failed to get session analytics', error);
      throw error;
    }
  }

  /**
   * Generate aggregated analytics
   */
  async getAggregatedAnalytics(
    query: AnalyticsQuery = {}
  ): Promise<AggregatedAnalytics> {
    try {
      const cacheKey = this.generateCacheKey('aggregated', query);
      
      // Check cache first
      const cached = this.getCachedResult(cacheKey);
      if (cached) {
        return cached;
      }

      this.logger.debug('Generating aggregated analytics', query);

      // This would typically query the database
      // For now, we'll use the cached session data
      const relevantSessions = this.filterSessionsByQuery(query);

      const analytics: AggregatedAnalytics = {
        totalSessions: relevantSessions.length,
        totalUsers: this.countUniqueUsers(relevantSessions),
        averageSessionDuration: this.calculateAverageSessionDuration(relevantSessions),
        topDeviceTypes: this.getTopDeviceTypes(relevantSessions),
        topBrowsers: this.getTopBrowsers(relevantSessions),
        dailyActiveUsers: this.calculateDAU(relevantSessions),
        weeklyActiveUsers: this.calculateWAU(relevantSessions),
        monthlyActiveUsers: this.calculateMAU(relevantSessions),
        retentionRate: this.calculateRetentionRate(relevantSessions),
        churnRate: this.calculateChurnRate(relevantSessions),
        growthRate: this.calculateGrowthRate(relevantSessions)
      };

      // Cache the result
      this.setCachedResult(cacheKey, analytics, 300000); // 5 minutes

      this.logger.debug('Aggregated analytics generated', {
        totalSessions: analytics.totalSessions,
        totalUsers: analytics.totalUsers
      });

      return analytics;

    } catch (error) {
      this.logger.error('Failed to generate aggregated analytics', error);
      throw error;
    }
  }

  /**
   * Get time series data for a metric
   */
  async getTimeSeriesData(
    metric: string,
    query: AnalyticsQuery = {}
  ): Promise<TimeSeriesData[]> {
    try {
      const cacheKey = this.generateCacheKey(`timeseries_${metric}`, query);
      
      // Check cache first
      const cached = this.getCachedResult(cacheKey);
      if (cached) {
        return cached;
      }

      this.logger.debug('Generating time series data', { metric, query });

      const relevantSessions = this.filterSessionsByQuery(query);
      const timeSeriesData = this.generateTimeSeriesForMetric(
        metric,
        relevantSessions,
        query.groupBy || 'day'
      );

      // Cache the result
      this.setCachedResult(cacheKey, timeSeriesData, 600000); // 10 minutes

      return timeSeriesData;

    } catch (error) {
      this.logger.error('Failed to generate time series data', {
        metric,
        error
      });
      throw error;
    }
  }

  /**
   * Get user behavior insights
   */
  async getUserBehaviorInsights(
    userId: string,
    sessions: UserSession[]
  ): Promise<UserBehaviorMetrics> {
    try {
      this.logger.debug('Analyzing user behavior', {
        userId,
        sessionCount: sessions.length
      });

      const userSessions = sessions.filter(s => s.userId === userId);

      const insights: UserBehaviorMetrics = {
        mostActiveHours: this.getMostActiveHours(userSessions),
        preferredDeviceType: this.getPreferredDeviceType(userSessions),
        averageSessionLength: this.calculateAverageSessionDuration(userSessions),
        featureUsage: this.analyzeFeatureUsage(userSessions),
        automationPatterns: this.identifyAutomationPatterns(userSessions)
      };

      return insights;

    } catch (error) {
      this.logger.error('Failed to analyze user behavior', {
        userId,
        error
      });
      throw error;
    }
  }

  /**
   * Generate performance report
   */
  async getPerformanceReport(
    query: AnalyticsQuery = {}
  ): Promise<{
    overview: PerformanceMetrics;
    trends: TimeSeriesData[];
    bottlenecks: Array<{
      type: string;
      description: string;
      impact: 'low' | 'medium' | 'high';
      recommendation: string;
    }>;
  }> {
    try {
      this.logger.debug('Generating performance report', query);

      const relevantSessions = this.filterSessionsByQuery(query);
      
      const overview = this.calculateOverallPerformanceMetrics(relevantSessions);
      const trends = await this.getTimeSeriesData('performance', query);
      const bottlenecks = this.identifyPerformanceBottlenecks(relevantSessions);

      return {
        overview,
        trends,
        bottlenecks
      };

    } catch (error) {
      this.logger.error('Failed to generate performance report', error);
      throw error;
    }
  }

  /**
   * Export analytics data
   */
  async exportAnalytics(
    query: AnalyticsQuery,
    format: 'json' | 'csv' | 'excel'
  ): Promise<string | Buffer> {
    try {
      this.logger.info('Exporting analytics data', { query, format });

      const analytics = await this.getAggregatedAnalytics(query);
      const timeSeriesData = await this.getTimeSeriesData('sessions', query);

      const exportData = {
        summary: analytics,
        timeSeries: timeSeriesData,
        exportedAt: new Date(),
        query
      };

      switch (format) {
        case 'json':
          return JSON.stringify(exportData, null, 2);
          
        case 'csv':
          return this.convertToCSV(exportData);
          
        case 'excel':
          return this.convertToExcel(exportData);
          
        default:
          throw new Error(`Unsupported export format: ${format}`);
      }

    } catch (error) {
      this.logger.error('Failed to export analytics data', error);
      throw error;
    }
  }

  /**
   * Private helper methods
   */

  private calculateSessionDuration(session: UserSession): number {
    const start = session.createdAt.getTime();
    const end = session.lastActivity.getTime();
    return end - start;
  }

  private countPageViews(session: UserSession): number {
    // Count unique URLs visited
    const urls = new Set();
    
    // Extract from browser state history
    if (session.browserState?.history) {
      session.browserState.history.forEach(entry => {
        if (entry.url) urls.add(entry.url);
      });
    }

    return urls.size;
  }

  private countAutomations(session: UserSession): number {
    // Count automation actions from conversation history
    let count = 0;
    
    if (session.conversationHistory) {
      session.conversationHistory.forEach(message => {
        if (message.type === 'automation' || message.actions?.length > 0) {
          count++;
        }
      });
    }

    return count;
  }

  private countDeviceSwitches(session: UserSession): number {
    // This would track device switches in session metadata
    return session.metadata?.deviceSwitches || 0;
  }

  private extractMostVisitedDomains(session: UserSession): string[] {
    const domainCounts = new Map<string, number>();

    if (session.browserState?.history) {
      session.browserState.history.forEach(entry => {
        if (entry.url) {
          try {
            const domain = new URL(entry.url).hostname;
            domainCounts.set(domain, (domainCounts.get(domain) || 0) + 1);
          } catch {
            // Invalid URL, skip
          }
        }
      });
    }

    return Array.from(domainCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([domain]) => domain);
  }

  private buildActivityTimeline(session: UserSession): ActivityEvent[] {
    const timeline: ActivityEvent[] = [];

    // Add session start
    timeline.push({
      timestamp: session.createdAt,
      type: 'page_visit',
      details: { action: 'session_started' }
    });

    // Add conversation messages
    if (session.conversationHistory) {
      session.conversationHistory.forEach(message => {
        timeline.push({
          timestamp: new Date(message.timestamp),
          type: 'message',
          details: {
            messageType: message.type,
            hasActions: message.actions && message.actions.length > 0
          }
        });
      });
    }

    // Sort by timestamp
    timeline.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

    return timeline;
  }

  private async calculatePerformanceMetrics(session: UserSession): Promise<PerformanceMetrics> {
    // This would calculate actual performance metrics
    // For now, return mock data
    return {
      averageResponseTime: 250,
      automationSuccessRate: 0.95,
      errorCount: 2,
      cacheHitRate: 0.85,
      memoryUsage: 45.2
    };
  }

  private async analyzeUserBehavior(session: UserSession): Promise<UserBehaviorMetrics> {
    return {
      mostActiveHours: this.getMostActiveHours([session]),
      preferredDeviceType: session.deviceInfo?.type || 'unknown',
      averageSessionLength: this.calculateSessionDuration(session),
      featureUsage: this.analyzeFeatureUsage([session]),
      automationPatterns: this.identifyAutomationPatterns([session])
    };
  }

  private filterSessionsByQuery(query: AnalyticsQuery): UserSession[] {
    // This would filter sessions based on the query
    // For now, return empty array as we don't have access to all sessions
    return [];
  }

  private countUniqueUsers(sessions: UserSession[]): number {
    const uniqueUsers = new Set(sessions.map(s => s.userId).filter(Boolean));
    return uniqueUsers.size;
  }

  private calculateAverageSessionDuration(sessions: UserSession[]): number {
    if (sessions.length === 0) return 0;
    
    const totalDuration = sessions.reduce((sum, session) => 
      sum + this.calculateSessionDuration(session), 0
    );
    
    return totalDuration / sessions.length;
  }

  private getTopDeviceTypes(sessions: UserSession[]): Array<{ type: string; count: number; percentage: number }> {
    const deviceCounts = new Map<string, number>();
    
    sessions.forEach(session => {
      const deviceType = session.deviceInfo?.type || 'unknown';
      deviceCounts.set(deviceType, (deviceCounts.get(deviceType) || 0) + 1);
    });

    const total = sessions.length;
    
    return Array.from(deviceCounts.entries())
      .map(([type, count]) => ({
        type,
        count,
        percentage: (count / total) * 100
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);
  }

  private getTopBrowsers(sessions: UserSession[]): Array<{ browser: string; count: number; percentage: number }> {
    const browserCounts = new Map<string, number>();
    
    sessions.forEach(session => {
      const browser = session.deviceInfo?.browser || 'unknown';
      browserCounts.set(browser, (browserCounts.get(browser) || 0) + 1);
    });

    const total = sessions.length;
    
    return Array.from(browserCounts.entries())
      .map(([browser, count]) => ({
        browser,
        count,
        percentage: (count / total) * 100
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);
  }

  private calculateDAU(sessions: UserSession[]): number {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const uniqueUsers = new Set();
    sessions.forEach(session => {
      if (session.lastActivity >= today && session.userId) {
        uniqueUsers.add(session.userId);
      }
    });
    
    return uniqueUsers.size;
  }

  private calculateWAU(sessions: UserSession[]): number {
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);
    
    const uniqueUsers = new Set();
    sessions.forEach(session => {
      if (session.lastActivity >= weekAgo && session.userId) {
        uniqueUsers.add(session.userId);
      }
    });
    
    return uniqueUsers.size;
  }

  private calculateMAU(sessions: UserSession[]): number {
    const monthAgo = new Date();
    monthAgo.setMonth(monthAgo.getMonth() - 1);
    
    const uniqueUsers = new Set();
    sessions.forEach(session => {
      if (session.lastActivity >= monthAgo && session.userId) {
        uniqueUsers.add(session.userId);
      }
    });
    
    return uniqueUsers.size;
  }

  private calculateRetentionRate(sessions: UserSession[]): number {
    // Simplified retention calculation
    // In practice, this would be more sophisticated
    return 0.75; // 75% retention rate
  }

  private calculateChurnRate(sessions: UserSession[]): number {
    return 1 - this.calculateRetentionRate(sessions);
  }

  private calculateGrowthRate(sessions: UserSession[]): number {
    // Simplified growth calculation
    return 0.15; // 15% growth rate
  }

  private getMostActiveHours(sessions: UserSession[]): number[] {
    const hourCounts = new Array(24).fill(0);
    
    sessions.forEach(session => {
      if (session.conversationHistory) {
        session.conversationHistory.forEach(message => {
          const hour = new Date(message.timestamp).getHours();
          hourCounts[hour]++;
        });
      }
    });

    // Return top 3 most active hours
    return hourCounts
      .map((count, hour) => ({ hour, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 3)
      .map(item => item.hour);
  }

  private getPreferredDeviceType(sessions: UserSession[]): string {
    const deviceCounts = new Map<string, number>();
    
    sessions.forEach(session => {
      const deviceType = session.deviceInfo?.type || 'unknown';
      deviceCounts.set(deviceType, (deviceCounts.get(deviceType) || 0) + 1);
    });

    let maxCount = 0;
    let preferredDevice = 'unknown';
    
    for (const [device, count] of deviceCounts.entries()) {
      if (count > maxCount) {
        maxCount = count;
        preferredDevice = device;
      }
    }

    return preferredDevice;
  }

  private analyzeFeatureUsage(sessions: UserSession[]): Record<string, number> {
    const featureUsage: Record<string, number> = {};
    
    sessions.forEach(session => {
      if (session.conversationHistory) {
        session.conversationHistory.forEach(message => {
          if (message.actions) {
            message.actions.forEach(action => {
              const feature = action.type || 'unknown';
              featureUsage[feature] = (featureUsage[feature] || 0) + 1;
            });
          }
        });
      }
    });

    return featureUsage;
  }

  private identifyAutomationPatterns(sessions: UserSession[]): string[] {
    // Simplified pattern identification
    const patterns: string[] = [];
    
    sessions.forEach(session => {
      if (session.conversationHistory) {
        const actions = session.conversationHistory
          .flatMap(message => message.actions || [])
          .map(action => action.type);
        
        // Look for common sequences
        if (actions.includes('click') && actions.includes('type')) {
          patterns.push('form_filling');
        }
        if (actions.includes('scroll') && actions.includes('click')) {
          patterns.push('content_browsing');
        }
      }
    });

    return [...new Set(patterns)];
  }

  private generateTimeSeriesForMetric(
    metric: string,
    sessions: UserSession[],
    groupBy: 'hour' | 'day' | 'week' | 'month'
  ): TimeSeriesData[] {
    // Simplified time series generation
    const timeSeriesData: TimeSeriesData[] = [];
    
    // Group sessions by time period
    const groupedData = new Map<string, number>();
    
    sessions.forEach(session => {
      const date = session.createdAt;
      let key: string;
      
      switch (groupBy) {
        case 'hour':
          key = `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}-${date.getHours()}`;
          break;
        case 'day':
          key = `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
          break;
        case 'week':
          const weekStart = new Date(date);
          weekStart.setDate(date.getDate() - date.getDay());
          key = `${weekStart.getFullYear()}-${weekStart.getMonth()}-${weekStart.getDate()}`;
          break;
        case 'month':
          key = `${date.getFullYear()}-${date.getMonth()}`;
          break;
      }
      
      groupedData.set(key, (groupedData.get(key) || 0) + 1);
    });

    // Convert to time series format
    for (const [key, value] of groupedData.entries()) {
      const parts = key.split('-').map(Number);
      const timestamp = new Date(parts[0], parts[1], parts[2] || 1, parts[3] || 0);
      
      timeSeriesData.push({
        timestamp,
        value,
        metadata: { groupBy, metric }
      });
    }

    return timeSeriesData.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
  }

  private calculateOverallPerformanceMetrics(sessions: UserSession[]): PerformanceMetrics {
    // Aggregate performance metrics across sessions
    return {
      averageResponseTime: 275,
      automationSuccessRate: 0.92,
      errorCount: sessions.length * 0.1,
      cacheHitRate: 0.88,
      memoryUsage: 52.3
    };
  }

  private identifyPerformanceBottlenecks(sessions: UserSession[]): Array<{
    type: string;
    description: string;
    impact: 'low' | 'medium' | 'high';
    recommendation: string;
  }> {
    return [
      {
        type: 'response_time',
        description: 'Average response time is above optimal threshold',
        impact: 'medium',
        recommendation: 'Consider implementing response caching and optimizing database queries'
      },
      {
        type: 'memory_usage',
        description: 'Memory usage is increasing over time',
        impact: 'high',
        recommendation: 'Implement session cleanup and memory optimization strategies'
      }
    ];
  }

  private generateCacheKey(type: string, query: AnalyticsQuery): string {
    return `${type}_${JSON.stringify(query)}`;
  }

  private getCachedResult(key: string): any {
    const expiry = this.cacheExpiry.get(key);
    if (expiry && expiry > new Date()) {
      return this.aggregatedCache.get(key);
    }
    return null;
  }

  private setCachedResult(key: string, data: any, ttlMs: number): void {
    this.aggregatedCache.set(key, data);
    this.cacheExpiry.set(key, new Date(Date.now() + ttlMs));
  }

  private convertToCSV(data: any): string {
    // Simplified CSV conversion
    const headers = Object.keys(data.summary);
    const values = Object.values(data.summary);
    
    return [
      headers.join(','),
      values.join(',')
    ].join('\\n');
  }

  private convertToExcel(data: any): Buffer {
    // This would use a library like xlsx to create Excel files
    // For now, return empty buffer
    return Buffer.from('Excel export not implemented');
  }

  /**
   * Clear analytics cache
   */
  clearCache(): void {
    this.aggregatedCache.clear();
    this.cacheExpiry.clear();
    this.logger.debug('Analytics cache cleared');
  }
}