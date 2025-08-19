import Bull from 'bull';
import { config } from '@/config';
import { logger } from '@/utils/logger';

export class QueueService {
  private static instance: QueueService;
  private queues: Map<string, Bull.Queue> = new Map();

  private constructor() {}

  public static getInstance(): QueueService {
    if (!QueueService.instance) {
      QueueService.instance = new QueueService();
    }
    return QueueService.instance;
  }

  public async initialize(): Promise<void> {
    try {
      // Create queues
      this.createQueue('email', this.processEmailJob);
      this.createQueue('automation', this.processAutomationJob);
      this.createQueue('analysis', this.processAnalysisJob);
      this.createQueue('cleanup', this.processCleanupJob);

      logger.info('Queue service initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize queue service:', error);
      throw error;
    }
  }

  private createQueue(name: string, processor: (job: Bull.Job) => Promise<any>): void {
    const queue = new Bull(name, config.redisUrl, {
      defaultJobOptions: {
        removeOnComplete: 10,
        removeOnFail: 5,
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 2000,
        },
      },
    });

    queue.process(processor);

    queue.on('completed', (job) => {
      logger.info(`Job ${job.id} in queue ${name} completed`);
    });

    queue.on('failed', (job, err) => {
      logger.error(`Job ${job.id} in queue ${name} failed:`, err);
    });

    queue.on('stalled', (job) => {
      logger.warn(`Job ${job.id} in queue ${name} stalled`);
    });

    this.queues.set(name, queue);
  }

  public async addJob(queueName: string, data: any, options?: Bull.JobOptions): Promise<Bull.Job> {
    const queue = this.queues.get(queueName);
    if (!queue) {
      throw new Error(`Queue ${queueName} not found`);
    }

    return queue.add(data, options);
  }

  public getQueue(name: string): Bull.Queue | undefined {
    return this.queues.get(name);
  }

  public async close(): Promise<void> {
    const closePromises = Array.from(this.queues.values()).map(queue => queue.close());
    await Promise.all(closePromises);
    logger.info('All queues closed');
  }

  // Job processors
  private async processEmailJob(job: Bull.Job): Promise<void> {
    const { to, subject, body, template } = job.data;
    
    try {
      // TODO: Implement email sending logic
      logger.info(`Processing email job: ${subject} to ${to}`);
      
      // Simulate email sending
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      logger.info(`Email sent successfully to ${to}`);
    } catch (error) {
      logger.error('Failed to send email:', error);
      throw error;
    }
  }

  private async processAutomationJob(job: Bull.Job): Promise<void> {
    const { workflowId, userId, inputData } = job.data;
    
    try {
      logger.info(`Processing automation job for workflow ${workflowId}`);
      
      // TODO: Implement automation execution logic
      
      // Simulate automation execution
      await new Promise(resolve => setTimeout(resolve, 5000));
      
      logger.info(`Automation completed for workflow ${workflowId}`);
    } catch (error) {
      logger.error('Failed to execute automation:', error);
      throw error;
    }
  }

  private async processAnalysisJob(job: Bull.Job): Promise<void> {
    const { url, userId, analysisType } = job.data;
    
    try {
      logger.info(`Processing analysis job for URL: ${url}`);
      
      // TODO: Implement page analysis logic
      
      // Simulate analysis
      await new Promise(resolve => setTimeout(resolve, 3000));
      
      logger.info(`Analysis completed for URL: ${url}`);
    } catch (error) {
      logger.error('Failed to analyze page:', error);
      throw error;
    }
  }

  private async processCleanupJob(job: Bull.Job): Promise<void> {
    const { type, olderThan } = job.data;
    
    try {
      logger.info(`Processing cleanup job: ${type}`);
      
      // TODO: Implement cleanup logic
      
      // Simulate cleanup
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      logger.info(`Cleanup completed: ${type}`);
    } catch (error) {
      logger.error('Failed to perform cleanup:', error);
      throw error;
    }
  }
}

export default QueueService;