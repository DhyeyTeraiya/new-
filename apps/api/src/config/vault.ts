import vault from 'node-vault';
import { logger } from '../utils/logger';

interface VaultConfig {
  endpoint: string;
  token?: string;
  roleId?: string;
  secretId?: string;
}

class VaultService {
  private client: any;
  private isInitialized = false;

  constructor(private config: VaultConfig) {
    this.client = vault({
      endpoint: config.endpoint,
      token: config.token,
    });
  }

  async initialize(): Promise<void> {
    try {
      if (this.config.roleId && this.config.secretId) {
        // AppRole authentication
        const result = await this.client.approleLogin({
          role_id: this.config.roleId,
          secret_id: this.config.secretId,
        });
        this.client.token = result.auth.client_token;
      }

      // Test connection
      await this.client.status();
      this.isInitialized = true;
      logger.info('Vault service initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize Vault service:', error);
      throw error;
    }
  }

  async getSecret(path: string): Promise<any> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    try {
      const result = await this.client.read(path);
      return result.data;
    } catch (error) {
      logger.error(`Failed to read secret from path ${path}:`, error);
      throw error;
    }
  }

  async setSecret(path: string, data: Record<string, any>): Promise<void> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    try {
      await this.client.write(path, data);
      logger.info(`Secret written to path ${path}`);
    } catch (error) {
      logger.error(`Failed to write secret to path ${path}:`, error);
      throw error;
    }
  }

  async rotateSecret(path: string, newData: Record<string, any>): Promise<void> {
    try {
      // Read current secret
      const currentSecret = await this.getSecret(path);
      
      // Write new secret
      await this.setSecret(path, { ...currentSecret, ...newData });
      
      logger.info(`Secret rotated at path ${path}`);
    } catch (error) {
      logger.error(`Failed to rotate secret at path ${path}:`, error);
      throw error;
    }
  }
}

// Initialize Vault service
const vaultConfig: VaultConfig = {
  endpoint: process.env.VAULT_ENDPOINT || 'http://localhost:8200',
  token: process.env.VAULT_TOKEN,
  roleId: process.env.VAULT_ROLE_ID,
  secretId: process.env.VAULT_SECRET_ID,
};

export const vaultService = new VaultService(vaultConfig);

// Enhanced environment configuration with Vault integration
export class EnhancedConfig {
  private static instance: EnhancedConfig;
  private secrets: Map<string, any> = new Map();

  private constructor() {}

  static getInstance(): EnhancedConfig {
    if (!EnhancedConfig.instance) {
      EnhancedConfig.instance = new EnhancedConfig();
    }
    return EnhancedConfig.instance;
  }

  async loadSecrets(): Promise<void> {
    try {
      // Load secrets from Vault
      const dbSecrets = await vaultService.getSecret('secret/database');
      const jwtSecrets = await vaultService.getSecret('secret/jwt');
      const apiSecrets = await vaultService.getSecret('secret/api-keys');

      this.secrets.set('database', dbSecrets);
      this.secrets.set('jwt', jwtSecrets);
      this.secrets.set('api-keys', apiSecrets);

      logger.info('Secrets loaded from Vault successfully');
    } catch (error) {
      logger.warn('Failed to load secrets from Vault, falling back to environment variables');
      // Fallback to environment variables
      this.loadFromEnv();
    }
  }

  private loadFromEnv(): void {
    this.secrets.set('database', {
      uri: process.env.MONGODB_URI,
      username: process.env.DB_USERNAME,
      password: process.env.DB_PASSWORD,
    });

    this.secrets.set('jwt', {
      secret: process.env.JWT_SECRET,
      refreshSecret: process.env.JWT_REFRESH_SECRET,
      expiresIn: process.env.JWT_EXPIRES_IN || '15m',
      refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d',
    });

    this.secrets.set('api-keys', {
      nvidia: process.env.NVIDIA_API_KEY,
      openai: process.env.OPENAI_API_KEY,
      anthropic: process.env.ANTHROPIC_API_KEY,
    });
  }

  getSecret(category: string, key?: string): any {
    const categorySecrets = this.secrets.get(category);
    if (!categorySecrets) {
      throw new Error(`No secrets found for category: ${category}`);
    }
    return key ? categorySecrets[key] : categorySecrets;
  }

  async rotateJWTSecrets(): Promise<void> {
    const newSecrets = {
      secret: this.generateSecureSecret(),
      refreshSecret: this.generateSecureSecret(),
    };

    await vaultService.rotateSecret('secret/jwt', newSecrets);
    this.secrets.set('jwt', { ...this.secrets.get('jwt'), ...newSecrets });
    
    logger.info('JWT secrets rotated successfully');
  }

  private generateSecureSecret(): string {
    const crypto = require('crypto');
    return crypto.randomBytes(64).toString('hex');
  }
}

export const enhancedConfig = EnhancedConfig.getInstance();