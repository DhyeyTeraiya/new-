import { logger } from '@/utils/logger';
import { MultiLLMService, LLMRequest } from '@/services/ai/multi-llm-service';
import { TaskType, AgentType } from '@browser-ai-agent/shared/types/agent';
import { IAgent, IExtractorAgent } from '@browser-ai-agent/shared/types/agent';
import BrowserManager from '../automation/browser-manager';
import AIElementSelector from '../automation/element-selector';

// =============================================================================
// EXTRACTOR AGENT (Superior to Manus Data Extraction)
// Master Plan: NeMo Retriever for RAG + Mixtral-8x7B for structured data generation
// =============================================================================

export interface ExtractionTask {
  id: string;
  type: 'text' | 'data' | 'table' | 'form' | 'links' | 'images' | 'structured' | 'custom';
  target: ExtractionTarget;
  schema?: ExtractionSchema;
  filters?: ExtractionFilter[];
  validation?: ExtractionValidation;
  output: ExtractionOutput;
}

export interface ExtractionTarget {
  url?: string;
  selectors?: string[];
  regions?: Array<{
    name: string;
    selector: string;
    description: string;
  }>;
  context?: string;
  scope: 'page' | 'element' | 'region' | 'multiple';
}

export interface ExtractionSchema {
  type: 'object' | 'array' | 'primitive';
  properties?: Record<string, {
    type: string;
    description: string;
    required?: boolean;
    format?: string;
    validation?: string;
  }>;
  items?: ExtractionSchema;
  description: string;
}

export interface ExtractionFilter {
  field: string;
  operator: 'contains' | 'equals' | 'regex' | 'range' | 'exists';
  value: any;
  caseSensitive?: boolean;
}

export interface ExtractionValidation {
  required: boolean;
  minItems?: number;
  maxItems?: number;
  customValidator?: string;
  qualityThreshold?: number;
}

export interface ExtractionOutput {
  format: 'json' | 'csv' | 'xml' | 'text' | 'structured';
  destination?: 'return' | 'file' | 'database' | 'api';
  filename?: string;
  compression?: boolean;
}

export interface ExtractionResult {
  success: boolean;
  taskId: string;
  data: any;
  metadata: ExtractionMetadata;
  quality: QualityMetrics;
  error?: string;
  warnings: string[];
  duration: number;
}

export interface ExtractionMetadata {
  url: string;
  title: string;
  extractedAt: Date;
  itemCount: number;
  dataSize: number;
  confidence: number;
  source: {
    selectors: string[];
    regions: string[];
    method: string;
  };
}

export interface QualityMetrics {
  completeness: number; // 0-1
  accuracy: number; // 0-1
  consistency: number; // 0-1
  freshness: number; // 0-1
  overall: number; // 0-1
}

export interface DataEnrichment {
  type: 'classification' | 'sentiment' | 'entity_extraction' | 'summarization' | 'translation';
  config: Record<string, any>;
  enabled: boolean;
}

// =============================================================================
// EXTRACTOR AGENT IMPLEMENTATION
// =============================================================================

export class ExtractorAgent implements IExtractorAgent {
  public readonly id: string;
  public readonly type = AgentType.EXTRACTOR;
  private llmService: MultiLLMService;
  private browserManager: BrowserManager;
  private elementSelector: AIElementSelector;
  private extractionCache: Map<string, ExtractionResult> = new Map();
  private schemaLibrary: Map<string, ExtractionSchema> = new Map();

  constructor(id: string) {
    this.id = id;
    this.llmService = MultiLLMService.getInstance();
    this.browserManager = BrowserManager.getInstance();
    this.elementSelector = new AIElementSelector();
    this.initializeSchemaLibrary();
    logger.info('Extractor Agent initialized', { id: this.id });
  }

  // =============================================================================
  // CORE AGENT INTERFACE METHODS
  // =============================================================================

  async initialize(): Promise<void> {
    logger.info('Initializing Extractor Agent', { id: this.id });
  }

  async start(): Promise<void> {
    logger.info('Starting Extractor Agent', { id: this.id });
  }

  async stop(): Promise<void> {
    logger.info('Stopping Extractor Agent', { id: this.id });
    this.extractionCache.clear();
  }

  async executeTask(task: any): Promise<ExtractionResult> {
    logger.info('Extractor Agent executing task', {
      taskId: task.id,
      type: task.type,
      agentId: this.id,
    });

    const startTime = Date.now();
    const extractionTask: ExtractionTask = this.parseTask(task);

    try {
      // Check cache first
      const cacheKey = this.generateCacheKey(extractionTask);
      const cachedResult = this.extractionCache.get(cacheKey);
      
      if (cachedResult && this.isCacheValid(cachedResult)) {
        logger.info('Returning cached extraction result', {
          taskId: task.id,
          cacheKey,
        });
        return cachedResult;
      }

      // Execute extraction
      const result = await this.performExtraction(extractionTask, task.sessionId);
      
      // Cache result
      this.extractionCache.set(cacheKey, result);

      const duration = Date.now() - startTime;
      result.duration = duration;

      logger.info('Extraction task completed', {
        taskId: task.id,
        success: result.success,
        itemCount: result.metadata.itemCount,
        duration,
      });

      return result;

    } catch (error) {
      const duration = Date.now() - startTime;
      
      logger.error('Extraction task failed', {
        taskId: task.id,
        error: error.message,
      });

      return {
        success: false,
        taskId: task.id,
        data: null,
        metadata: {
          url: '',
          title: '',
          extractedAt: new Date(),
          itemCount: 0,
          dataSize: 0,
          confidence: 0,
          source: {
            selectors: [],
            regions: [],
            method: 'failed',
          },
        },
        quality: {
          completeness: 0,
          accuracy: 0,
          consistency: 0,
          freshness: 0,
          overall: 0,
        },
        error: error.message,
        warnings: [],
        duration,
      };
    }
  }

  async sendMessage(message: any): Promise<void> {
    logger.debug('Extractor Agent sending message', { message });
  }

  async receiveMessage(message: any): Promise<void> {
    logger.debug('Extractor Agent received message', { message });
  }

  getStatus(): any {
    return {
      id: this.id,
      type: this.type,
      status: 'active',
      cachedResults: this.extractionCache.size,
      schemasAvailable: this.schemaLibrary.size,
      lastActivity: new Date(),
    };
  }

  updateStatus(status: any): void {
    // Update agent status
  }

  // =============================================================================
  // EXTRACTION METHODS
  // =============================================================================

  async extractText(target: ExtractionTarget, sessionId: string): Promise<ExtractionResult> {
    logger.info('Extracting text content', { sessionId });

    try {
      const page = await this.browserManager.getPage(sessionId, 'default');
      if (!page) {
        throw new Error('Browser page not available');
      }

      let extractedText: string[] = [];

      if (target.selectors && target.selectors.length > 0) {
        // Extract from specific selectors
        for (const selector of target.selectors) {
          try {
            const elements = await page.locator(selector).all();
            for (const element of elements) {
              const text = await element.textContent();
              if (text && text.trim()) {
                extractedText.push(text.trim());
              }
            }
          } catch (error) {
            logger.warn('Failed to extract from selector', { selector, error: error.message });
          }
        }
      } else {
        // Extract all text from page
        const text = await page.textContent('body');
        if (text) {
          extractedText = [text.trim()];
        }
      }

      const result: ExtractionResult = {
        success: true,
        taskId: `extract_text_${Date.now()}`,
        data: extractedText,
        metadata: {
          url: page.url(),
          title: await page.title(),
          extractedAt: new Date(),
          itemCount: extractedText.length,
          dataSize: extractedText.join('').length,
          confidence: 0.9,
          source: {
            selectors: target.selectors || [],
            regions: [],
            method: 'text_extraction',
          },
        },
        quality: await this.assessTextQuality(extractedText),
        warnings: [],
        duration: 0,
      };

      return result;

    } catch (error) {
      throw new Error(`Text extraction failed: ${error.message}`);
    }
  }

  async extractStructuredData(target: ExtractionTarget, schema: ExtractionSchema, sessionId: string): Promise<ExtractionResult> {
    logger.info('Extracting structured data', { sessionId, schemaType: schema.type });

    try {
      const page = await this.browserManager.getPage(sessionId, 'default');
      if (!page) {
        throw new Error('Browser page not available');
      }

      // Get page content
      const pageContent = await this.getPageContent(page, target);

      // Use AI to extract structured data
      const extractedData = await this.aiStructuredExtraction(pageContent, schema);

      // Validate extracted data
      const validationResult = await this.validateExtractedData(extractedData, schema);

      const result: ExtractionResult = {
        success: validationResult.valid,
        taskId: `extract_structured_${Date.now()}`,
        data: extractedData,
        metadata: {
          url: page.url(),
          title: await page.title(),
          extractedAt: new Date(),
          itemCount: Array.isArray(extractedData) ? extractedData.length : 1,
          dataSize: JSON.stringify(extractedData).length,
          confidence: validationResult.confidence,
          source: {
            selectors: target.selectors || [],
            regions: target.regions?.map(r => r.name) || [],
            method: 'ai_structured_extraction',
          },
        },
        quality: await this.assessDataQuality(extractedData, schema),
        warnings: validationResult.warnings,
        duration: 0,
      };

      return result;

    } catch (error) {
      throw new Error(`Structured data extraction failed: ${error.message}`);
    }
  }

  async extractTable(target: ExtractionTarget, sessionId: string): Promise<ExtractionResult> {
    logger.info('Extracting table data', { sessionId });

    try {
      const page = await this.browserManager.getPage(sessionId, 'default');
      if (!page) {
        throw new Error('Browser page not available');
      }

      const tables: any[] = [];

      // Find all tables or specific table selectors
      const tableSelectors = target.selectors || ['table'];

      for (const selector of tableSelectors) {
        try {
          const tableElements = await page.locator(selector).all();

          for (const table of tableElements) {
            const tableData = await this.extractTableData(table);
            if (tableData.rows.length > 0) {
              tables.push(tableData);
            }
          }
        } catch (error) {
          logger.warn('Failed to extract table', { selector, error: error.message });
        }
      }

      const result: ExtractionResult = {
        success: tables.length > 0,
        taskId: `extract_table_${Date.now()}`,
        data: tables,
        metadata: {
          url: page.url(),
          title: await page.title(),
          extractedAt: new Date(),
          itemCount: tables.length,
          dataSize: JSON.stringify(tables).length,
          confidence: 0.85,
          source: {
            selectors: tableSelectors,
            regions: [],
            method: 'table_extraction',
          },
        },
        quality: await this.assessTableQuality(tables),
        warnings: [],
        duration: 0,
      };

      return result;

    } catch (error) {
      throw new Error(`Table extraction failed: ${error.message}`);
    }
  }

  async extractLinks(target: ExtractionTarget, sessionId: string): Promise<ExtractionResult> {
    logger.info('Extracting links', { sessionId });

    try {
      const page = await this.browserManager.getPage(sessionId, 'default');
      if (!page) {
        throw new Error('Browser page not available');
      }

      const links = await page.evaluate(() => {
        return Array.from(document.links).map(link => ({
          href: link.href,
          text: link.textContent?.trim() || '',
          title: link.title || '',
          target: link.target || '',
          rel: link.rel || '',
          download: link.download || '',
        }));
      });

      // Filter links if needed
      const filteredLinks = target.context ? 
        links.filter(link => link.text.toLowerCase().includes(target.context!.toLowerCase())) :
        links;

      const result: ExtractionResult = {
        success: true,
        taskId: `extract_links_${Date.now()}`,
        data: filteredLinks,
        metadata: {
          url: page.url(),
          title: await page.title(),
          extractedAt: new Date(),
          itemCount: filteredLinks.length,
          dataSize: JSON.stringify(filteredLinks).length,
          confidence: 0.95,
          source: {
            selectors: ['a[href]'],
            regions: [],
            method: 'link_extraction',
          },
        },
        quality: await this.assessLinkQuality(filteredLinks),
        warnings: [],
        duration: 0,
      };

      return result;

    } catch (error) {
      throw new Error(`Link extraction failed: ${error.message}`);
    }
  }

  // =============================================================================
  // AI-POWERED EXTRACTION
  // =============================================================================

  private async aiStructuredExtraction(content: string, schema: ExtractionSchema): Promise<any> {
    logger.info('Performing AI-powered structured extraction');

    const llmRequest: LLMRequest = {
      taskContext: {
        type: TaskType.DATA_EXTRACTION,
        agent_type: AgentType.EXTRACTOR,
        complexity: 'high',
        priority: 'normal',
        user_tier: 'premium',
      },
      messages: [
        {
          role: 'user',
          content: `Extract structured data from this content according to the provided schema:

SCHEMA:
${JSON.stringify(schema, null, 2)}

CONTENT:
${content.substring(0, 8000)} ${content.length > 8000 ? '...[truncated]' : ''}

Instructions:
1. Extract data that matches the schema structure exactly
2. Ensure all required fields are present
3. Validate data types and formats
4. Return only valid, complete data
5. If multiple items, return as array
6. Include confidence scores for extracted fields

Return the extracted data as valid JSON that conforms to the schema.`,
        },
      ],
      systemPrompt: 'You are an expert data extraction specialist. Extract structured data with high accuracy and completeness.',
      temperature: 0.1, // Low temperature for consistent extraction
    };

    const response = await this.llmService.complete(llmRequest);

    try {
      const extractedData = JSON.parse(response.content);
      
      logger.info('AI structured extraction completed', {
        dataType: typeof extractedData,
        itemCount: Array.isArray(extractedData) ? extractedData.length : 1,
      });

      return extractedData;
    } catch (parseError) {
      logger.error('Failed to parse AI extraction result', {
        response: response.content.substring(0, 500),
        error: parseError.message,
      });
      throw new Error('AI extraction returned invalid JSON');
    }
  }

  private async enrichData(data: any, enrichments: DataEnrichment[]): Promise<any> {
    logger.info('Enriching extracted data', { enrichments: enrichments.length });

    let enrichedData = { ...data };

    for (const enrichment of enrichments.filter(e => e.enabled)) {
      try {
        switch (enrichment.type) {
          case 'classification':
            enrichedData = await this.classifyData(enrichedData, enrichment.config);
            break;
          case 'sentiment':
            enrichedData = await this.analyzeSentiment(enrichedData, enrichment.config);
            break;
          case 'entity_extraction':
            enrichedData = await this.extractEntities(enrichedData, enrichment.config);
            break;
          case 'summarization':
            enrichedData = await this.summarizeData(enrichedData, enrichment.config);
            break;
          case 'translation':
            enrichedData = await this.translateData(enrichedData, enrichment.config);
            break;
        }
      } catch (error) {
        logger.warn('Data enrichment failed', {
          type: enrichment.type,
          error: error.message,
        });
      }
    }

    return enrichedData;
  }

  // =============================================================================
  // QUALITY ASSESSMENT
  // =============================================================================

  private async assessTextQuality(texts: string[]): Promise<QualityMetrics> {
    const completeness = texts.length > 0 ? 1.0 : 0.0;
    const accuracy = 0.9; // Would implement actual accuracy assessment
    const consistency = 0.85;
    const freshness = 1.0; // Just extracted
    
    return {
      completeness,
      accuracy,
      consistency,
      freshness,
      overall: (completeness + accuracy + consistency + freshness) / 4,
    };
  }

  private async assessDataQuality(data: any, schema: ExtractionSchema): Promise<QualityMetrics> {
    // Assess completeness based on required fields
    const completeness = this.calculateCompleteness(data, schema);
    
    // Assess accuracy based on data validation
    const accuracy = this.calculateAccuracy(data, schema);
    
    // Assess consistency
    const consistency = this.calculateConsistency(data);
    
    const freshness = 1.0; // Just extracted
    
    return {
      completeness,
      accuracy,
      consistency,
      freshness,
      overall: (completeness + accuracy + consistency + freshness) / 4,
    };
  }

  private async assessTableQuality(tables: any[]): Promise<QualityMetrics> {
    if (tables.length === 0) {
      return {
        completeness: 0,
        accuracy: 0,
        consistency: 0,
        freshness: 0,
        overall: 0,
      };
    }

    // Assess table structure and data quality
    const completeness = tables.every(t => t.headers.length > 0 && t.rows.length > 0) ? 1.0 : 0.7;
    const accuracy = 0.9; // Would implement actual accuracy assessment
    const consistency = 0.85;
    const freshness = 1.0;
    
    return {
      completeness,
      accuracy,
      consistency,
      freshness,
      overall: (completeness + accuracy + consistency + freshness) / 4,
    };
  }

  private async assessLinkQuality(links: any[]): Promise<QualityMetrics> {
    if (links.length === 0) {
      return {
        completeness: 0,
        accuracy: 0,
        consistency: 0,
        freshness: 0,
        overall: 0,
      };
    }

    // Assess link quality
    const validLinks = links.filter(link => link.href && link.href.startsWith('http'));
    const completeness = validLinks.length / links.length;
    const accuracy = 0.95; // Links are usually accurate
    const consistency = 0.9;
    const freshness = 1.0;
    
    return {
      completeness,
      accuracy,
      consistency,
      freshness,
      overall: (completeness + accuracy + consistency + freshness) / 4,
    };
  }

  // =============================================================================
  // HELPER METHODS
  // =============================================================================

  private parseTask(task: any): ExtractionTask {
    return {
      id: task.id,
      type: task.type || 'text',
      target: task.target || { scope: 'page' },
      schema: task.schema,
      filters: task.filters || [],
      validation: task.validation || { required: true },
      output: task.output || { format: 'json', destination: 'return' },
    };
  }

  private async performExtraction(task: ExtractionTask, sessionId: string): Promise<ExtractionResult> {
    switch (task.type) {
      case 'text':
        return await this.extractText(task.target, sessionId);
      case 'structured':
        if (!task.schema) {
          throw new Error('Schema is required for structured data extraction');
        }
        return await this.extractStructuredData(task.target, task.schema, sessionId);
      case 'table':
        return await this.extractTable(task.target, sessionId);
      case 'links':
        return await this.extractLinks(task.target, sessionId);
      default:
        throw new Error(`Unknown extraction type: ${task.type}`);
    }
  }

  private async getPageContent(page: any, target: ExtractionTarget): Promise<string> {
    if (target.regions && target.regions.length > 0) {
      // Extract content from specific regions
      const regionContents: string[] = [];
      
      for (const region of target.regions) {
        try {
          const content = await page.textContent(region.selector);
          if (content) {
            regionContents.push(`[${region.name}]: ${content.trim()}`);
          }
        } catch (error) {
          logger.warn('Failed to extract region content', {
            region: region.name,
            selector: region.selector,
            error: error.message,
          });
        }
      }
      
      return regionContents.join('\n\n');
    } else if (target.selectors && target.selectors.length > 0) {
      // Extract content from specific selectors
      const selectorContents: string[] = [];
      
      for (const selector of target.selectors) {
        try {
          const elements = await page.locator(selector).all();
          for (const element of elements) {
            const content = await element.textContent();
            if (content && content.trim()) {
              selectorContents.push(content.trim());
            }
          }
        } catch (error) {
          logger.warn('Failed to extract selector content', {
            selector,
            error: error.message,
          });
        }
      }
      
      return selectorContents.join('\n\n');
    } else {
      // Extract all page content
      const content = await page.textContent('body');
      return content || '';
    }
  }

  private async extractTableData(tableElement: any): Promise<any> {
    return await tableElement.evaluate((table: HTMLTableElement) => {
      const headers: string[] = [];
      const rows: string[][] = [];

      // Extract headers
      const headerRow = table.querySelector('thead tr, tr:first-child');
      if (headerRow) {
        const headerCells = headerRow.querySelectorAll('th, td');
        headerCells.forEach(cell => {
          headers.push(cell.textContent?.trim() || '');
        });
      }

      // Extract data rows
      const dataRows = table.querySelectorAll('tbody tr, tr:not(:first-child)');
      dataRows.forEach(row => {
        const cells = row.querySelectorAll('td, th');
        const rowData: string[] = [];
        cells.forEach(cell => {
          rowData.push(cell.textContent?.trim() || '');
        });
        if (rowData.length > 0) {
          rows.push(rowData);
        }
      });

      return { headers, rows };
    });
  }

  private async validateExtractedData(data: any, schema: ExtractionSchema): Promise<{ valid: boolean; confidence: number; warnings: string[] }> {
    const warnings: string[] = [];
    let confidence = 1.0;

    // Basic validation logic
    if (schema.type === 'object' && typeof data !== 'object') {
      return { valid: false, confidence: 0, warnings: ['Data type mismatch'] };
    }

    if (schema.type === 'array' && !Array.isArray(data)) {
      return { valid: false, confidence: 0, warnings: ['Expected array but got different type'] };
    }

    // Check required properties
    if (schema.properties) {
      for (const [key, prop] of Object.entries(schema.properties)) {
        if (prop.required && (!data || !data.hasOwnProperty(key))) {
          warnings.push(`Missing required field: ${key}`);
          confidence -= 0.2;
        }
      }
    }

    return {
      valid: confidence > 0.5,
      confidence: Math.max(0, confidence),
      warnings,
    };
  }

  private calculateCompleteness(data: any, schema: ExtractionSchema): number {
    if (!schema.properties) return 1.0;

    const totalFields = Object.keys(schema.properties).length;
    const presentFields = Object.keys(data || {}).length;
    
    return Math.min(presentFields / totalFields, 1.0);
  }

  private calculateAccuracy(data: any, schema: ExtractionSchema): number {
    // Simplified accuracy calculation
    return 0.9; // Would implement actual accuracy assessment
  }

  private calculateConsistency(data: any): number {
    // Simplified consistency calculation
    return 0.85; // Would implement actual consistency assessment
  }

  private generateCacheKey(task: ExtractionTask): string {
    return `${task.type}_${JSON.stringify(task.target)}_${JSON.stringify(task.schema)}`;
  }

  private isCacheValid(result: ExtractionResult): boolean {
    const maxAge = 5 * 60 * 1000; // 5 minutes
    return Date.now() - result.metadata.extractedAt.getTime() < maxAge;
  }

  private initializeSchemaLibrary(): void {
    // Initialize common extraction schemas
    this.schemaLibrary.set('job_posting', {
      type: 'object',
      description: 'Job posting information',
      properties: {
        title: { type: 'string', description: 'Job title', required: true },
        company: { type: 'string', description: 'Company name', required: true },
        location: { type: 'string', description: 'Job location' },
        salary: { type: 'string', description: 'Salary information' },
        description: { type: 'string', description: 'Job description' },
        requirements: { type: 'array', description: 'Job requirements' },
        benefits: { type: 'array', description: 'Job benefits' },
        posted_date: { type: 'string', description: 'Posted date', format: 'date' },
        apply_url: { type: 'string', description: 'Application URL', format: 'url' },
      },
    });

    this.schemaLibrary.set('contact_info', {
      type: 'object',
      description: 'Contact information',
      properties: {
        name: { type: 'string', description: 'Full name', required: true },
        email: { type: 'string', description: 'Email address', format: 'email' },
        phone: { type: 'string', description: 'Phone number' },
        title: { type: 'string', description: 'Job title' },
        company: { type: 'string', description: 'Company name' },
        linkedin: { type: 'string', description: 'LinkedIn profile URL' },
      },
    });

    logger.info('Schema library initialized', { schemas: this.schemaLibrary.size });
  }

  // Placeholder methods for data enrichment
  private async classifyData(data: any, config: Record<string, any>): Promise<any> {
    return data; // Would implement actual classification
  }

  private async analyzeSentiment(data: any, config: Record<string, any>): Promise<any> {
    return data; // Would implement actual sentiment analysis
  }

  private async extractEntities(data: any, config: Record<string, any>): Promise<any> {
    return data; // Would implement actual entity extraction
  }

  private async summarizeData(data: any, config: Record<string, any>): Promise<any> {
    return data; // Would implement actual summarization
  }

  private async translateData(data: any, config: Record<string, any>): Promise<any> {
    return data; // Would implement actual translation
  }

  // =============================================================================
  // PUBLIC API METHODS
  // =============================================================================

  public getSchema(schemaName: string): ExtractionSchema | undefined {
    return this.schemaLibrary.get(schemaName);
  }

  public addSchema(name: string, schema: ExtractionSchema): void {
    this.schemaLibrary.set(name, schema);
    logger.info('Schema added to library', { name });
  }

  public getCachedResult(cacheKey: string): ExtractionResult | undefined {
    return this.extractionCache.get(cacheKey);
  }

  public clearCache(): void {
    this.extractionCache.clear();
    logger.info('Extraction cache cleared');
  }

  public getStats(): any {
    return {
      id: this.id,
      type: this.type,
      cachedResults: this.extractionCache.size,
      schemasAvailable: this.schemaLibrary.size,
      cacheHitRate: this.calculateCacheHitRate(),
    };
  }

  private calculateCacheHitRate(): number {
    // Would implement actual cache hit rate calculation
    return 0.75; // Placeholder
  }
}

export default ExtractorAgent;