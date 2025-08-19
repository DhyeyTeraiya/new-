import { NVIDIAClient, NVIDIAClientConfig } from '../nvidia-client';
import axios from 'axios';

// Mock axios
jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('NVIDIAClient', () => {
  let client: NVIDIAClient;
  let config: NVIDIAClientConfig;

  beforeEach(() => {
    config = {
      baseUrl: 'https://integrate.api.nvidia.com/v1',
      models: {
        primary: { 
          name: 'meta/llama-3.3-70b-instruct', 
          apiKey: 'test-primary-key' 
        },
        vision: { 
          name: 'meta/llama-3.2-90b-vision-instruct', 
          apiKey: 'test-vision-key' 
        },
        complex: { 
          name: 'meta/llama-3.1-405B-instruct', 
          apiKey: 'test-complex-key' 
        },
      },
      timeout: 30000,
      maxRetries: 3,
      retryDelay: 1000,
    };

    // Mock axios.create to return a mock instance
    const mockAxiosInstance = {
      post: jest.fn(),
      interceptors: {
        request: { use: jest.fn() },
        response: { use: jest.fn() },
      },
    };
    mockedAxios.create.mockReturnValue(mockAxiosInstance as any);

    client = new NVIDIAClient(config);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('initialization', () => {
    it('should initialize with correct configuration', () => {
      expect(mockedAxios.create).toHaveBeenCalledTimes(3); // One for each model
      
      const modelInfo = client.getModelInfo();
      expect(modelInfo.primary.name).toBe('meta/llama-3.3-70b-instruct');
      expect(modelInfo.primary.hasApiKey).toBe(true);
      expect(modelInfo.vision.name).toBe('meta/llama-3.2-90b-vision-instruct');
      expect(modelInfo.complex.name).toBe('meta/llama-3.1-405B-instruct');
    });
  });

  describe('sendPrimaryRequest', () => {
    it('should send request to primary model successfully', async () => {
      const mockResponse = {
        data: {
          id: 'test-response-id',
          choices: [
            {
              index: 0,
              message: {
                role: 'assistant',
                content: 'Test response from primary model',
              },
              finish_reason: 'stop',
            },
          ],
          usage: {
            prompt_tokens: 10,
            completion_tokens: 5,
            total_tokens: 15,
          },
          model: 'meta/llama-3.3-70b-instruct',
          created: Date.now(),
        },
      };

      // Mock the HTTP client post method
      const mockHttpClient = mockedAxios.create();
      (mockHttpClient.post as jest.Mock).mockResolvedValue(mockResponse);

      const messages = [
        { role: 'user' as const, content: 'Hello, test message' },
      ];

      const result = await client.sendPrimaryRequest(messages);

      expect(result).toEqual(mockResponse.data);
      expect(mockHttpClient.post).toHaveBeenCalledWith(
        '/chat/completions',
        expect.objectContaining({
          model: 'meta/llama-3.3-70b-instruct',
          messages,
          parameters: expect.objectContaining({
            max_tokens: 2000,
            temperature: 0.7,
            top_p: 0.9,
            stream: false,
          }),
        })
      );
    });

    it('should handle API errors gracefully', async () => {
      const mockError = {
        response: {
          status: 401,
          data: { message: 'Unauthorized' },
        },
        isAxiosError: true,
      };

      const mockHttpClient = mockedAxios.create();
      (mockHttpClient.post as jest.Mock).mockRejectedValue(mockError);

      const messages = [
        { role: 'user' as const, content: 'Test message' },
      ];

      await expect(client.sendPrimaryRequest(messages)).rejects.toThrow(
        'NVIDIA API authentication failed for primary model'
      );
    });
  });

  describe('sendVisionRequest', () => {
    it('should send request to vision model successfully', async () => {
      const mockResponse = {
        data: {
          id: 'test-vision-response-id',
          choices: [
            {
              index: 0,
              message: {
                role: 'assistant',
                content: 'I can see a webpage with various elements',
              },
              finish_reason: 'stop',
            },
          ],
          usage: {
            prompt_tokens: 20,
            completion_tokens: 10,
            total_tokens: 30,
          },
          model: 'meta/llama-3.2-90b-vision-instruct',
          created: Date.now(),
        },
      };

      const mockHttpClient = mockedAxios.create();
      (mockHttpClient.post as jest.Mock).mockResolvedValue(mockResponse);

      const messages = [
        { 
          role: 'user' as const, 
          content: 'Analyze this screenshot' 
        },
      ];

      const result = await client.sendVisionRequest(messages);

      expect(result).toEqual(mockResponse.data);
      expect(mockHttpClient.post).toHaveBeenCalledWith(
        '/chat/completions',
        expect.objectContaining({
          model: 'meta/llama-3.2-90b-vision-instruct',
          messages,
        })
      );
    });
  });

  describe('sendComplexRequest', () => {
    it('should send request to complex model successfully', async () => {
      const mockResponse = {
        data: {
          id: 'test-complex-response-id',
          choices: [
            {
              index: 0,
              message: {
                role: 'assistant',
                content: 'Complex reasoning response',
              },
              finish_reason: 'stop',
            },
          ],
          usage: {
            prompt_tokens: 50,
            completion_tokens: 25,
            total_tokens: 75,
          },
          model: 'meta/llama-3.1-405B-instruct',
          created: Date.now(),
        },
      };

      const mockHttpClient = mockedAxios.create();
      (mockHttpClient.post as jest.Mock).mockResolvedValue(mockResponse);

      const messages = [
        { 
          role: 'user' as const, 
          content: 'Create a complex automation plan' 
        },
      ];

      const result = await client.sendComplexRequest(messages);

      expect(result).toEqual(mockResponse.data);
      expect(mockHttpClient.post).toHaveBeenCalledWith(
        '/chat/completions',
        expect.objectContaining({
          model: 'meta/llama-3.1-405B-instruct',
          messages,
        })
      );
    });
  });

  describe('retry logic', () => {
    it('should retry on retryable errors', async () => {
      const mockError = {
        response: { status: 500 },
        isAxiosError: true,
      };

      const mockSuccess = {
        data: {
          id: 'success-after-retry',
          choices: [{ message: { content: 'Success' } }],
          usage: { total_tokens: 10 },
        },
      };

      const mockHttpClient = mockedAxios.create();
      (mockHttpClient.post as jest.Mock)
        .mockRejectedValueOnce(mockError)
        .mockRejectedValueOnce(mockError)
        .mockResolvedValueOnce(mockSuccess);

      const messages = [
        { role: 'user' as const, content: 'Test retry' },
      ];

      const result = await client.sendPrimaryRequest(messages);
      expect(result).toEqual(mockSuccess.data);
      expect(mockHttpClient.post).toHaveBeenCalledTimes(3);
    });

    it('should not retry on non-retryable errors', async () => {
      const mockError = {
        response: { status: 400, data: { message: 'Bad Request' } },
        isAxiosError: true,
      };

      const mockHttpClient = mockedAxios.create();
      (mockHttpClient.post as jest.Mock).mockRejectedValue(mockError);

      const messages = [
        { role: 'user' as const, content: 'Test non-retryable' },
      ];

      await expect(client.sendPrimaryRequest(messages)).rejects.toThrow();
      expect(mockHttpClient.post).toHaveBeenCalledTimes(1);
    });
  });

  describe('healthCheck', () => {
    it('should return health status for all models', async () => {
      const mockHttpClient = mockedAxios.create();
      (mockHttpClient.post as jest.Mock).mockResolvedValue({
        data: { choices: [{ message: { content: 'OK' } }] },
      });

      const health = await client.healthCheck();

      expect(health).toEqual({
        primary: true,
        vision: true,
        complex: true,
      });
    });

    it('should handle unhealthy models', async () => {
      const mockHttpClient = mockedAxios.create();
      (mockHttpClient.post as jest.Mock)
        .mockResolvedValueOnce({ data: { choices: [{ message: { content: 'OK' } }] } })
        .mockRejectedValueOnce(new Error('Model unavailable'))
        .mockResolvedValueOnce({ data: { choices: [{ message: { content: 'OK' } }] } });

      const health = await client.healthCheck();

      expect(health).toEqual({
        primary: true,
        vision: false,
        complex: true,
      });
    });
  });
});