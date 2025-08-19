/**
 * Tests for Background Service Worker
 */

import { MessageHandler } from '../message-handler';

describe('MessageHandler', () => {
  let messageHandler: MessageHandler;

  beforeEach(() => {
    jest.clearAllMocks();
    messageHandler = new MessageHandler();
  });

  describe('Message Handling', () => {
    it('should handle PING messages', async () => {
      const mockSendResponse = jest.fn();
      const message = { type: 'PING' };
      const sender = {} as chrome.runtime.MessageSender;

      // Access private method for testing
      const handleMessage = (messageHandler as any).handleMessage.bind(messageHandler);
      await handleMessage(message, sender, mockSendResponse);

      expect(mockSendResponse).toHaveBeenCalledWith({
        type: 'PONG',
        timestamp: expect.any(Number)
      });
    });

    it('should queue messages', async () => {
      const mockSendResponse = jest.fn();
      const message = {
        type: 'QUEUE_MESSAGE',
        id: 'test-id',
        data: { test: 'data' }
      };
      const sender = {} as chrome.runtime.MessageSender;

      const handleMessage = (messageHandler as any).handleMessage.bind(messageHandler);
      await handleMessage(message, sender, mockSendResponse);

      expect(mockSendResponse).toHaveBeenCalledWith({ success: true });
      expect(messageHandler.getQueueSize()).toBe(1);
    });

    it('should retrieve queued messages', async () => {
      // First queue a message
      const queueMessage = (messageHandler as any).queueMessage.bind(messageHandler);
      queueMessage('test-id', { test: 'data' });

      // Then retrieve it
      const mockSendResponse = jest.fn();
      const message = {
        type: 'GET_QUEUED_MESSAGE',
        id: 'test-id'
      };
      const sender = {} as chrome.runtime.MessageSender;

      const handleMessage = (messageHandler as any).handleMessage.bind(messageHandler);
      await handleMessage(message, sender, mockSendResponse);

      expect(mockSendResponse).toHaveBeenCalledWith({
        success: true,
        data: { test: 'data' }
      });
      expect(messageHandler.getQueueSize()).toBe(0);
    });

    it('should handle unknown message types', async () => {
      const mockSendResponse = jest.fn();
      const message = { type: 'UNKNOWN_TYPE' };
      const sender = {} as chrome.runtime.MessageSender;

      const handleMessage = (messageHandler as any).handleMessage.bind(messageHandler);
      await handleMessage(message, sender, mockSendResponse);

      expect(mockSendResponse).toHaveBeenCalledWith({
        success: false,
        error: 'Unknown message type'
      });
    });
  });

  describe('External Message Handling', () => {
    it('should reject messages from unauthorized origins', async () => {
      const mockSendResponse = jest.fn();
      const message = { type: 'EXTENSION_PING' };
      const sender = {
        origin: 'https://malicious-site.com'
      } as chrome.runtime.MessageSender;

      const handleExternalMessage = (messageHandler as any).handleExternalMessage.bind(messageHandler);
      await handleExternalMessage(message, sender, mockSendResponse);

      expect(mockSendResponse).toHaveBeenCalledWith({
        success: false,
        error: 'Unauthorized origin'
      });
    });

    it('should handle EXTENSION_PING from authorized origins', async () => {
      const mockSendResponse = jest.fn();
      const message = { type: 'EXTENSION_PING' };
      const sender = {
        origin: 'http://localhost:3000'
      } as chrome.runtime.MessageSender;

      const handleExternalMessage = (messageHandler as any).handleExternalMessage.bind(messageHandler);
      await handleExternalMessage(message, sender, mockSendResponse);

      expect(mockSendResponse).toHaveBeenCalledWith({
        success: true,
        extensionId: 'test-extension-id'
      });
    });
  });

  describe('Message Queue Management', () => {
    it('should clear message queue', () => {
      // Add some messages
      const queueMessage = (messageHandler as any).queueMessage.bind(messageHandler);
      queueMessage('id1', { data: 1 });
      queueMessage('id2', { data: 2 });

      expect(messageHandler.getQueueSize()).toBe(2);

      // Clear queue
      const clearMessageQueue = (messageHandler as any).clearMessageQueue.bind(messageHandler);
      clearMessageQueue();

      expect(messageHandler.getQueueSize()).toBe(0);
    });

    it('should clean up expired messages', () => {
      jest.useFakeTimers();

      const queueMessage = (messageHandler as any).queueMessage.bind(messageHandler);
      queueMessage('test-id', { test: 'data' });

      expect(messageHandler.getQueueSize()).toBe(1);

      // Fast forward time beyond TTL (5 minutes)
      jest.advanceTimersByTime(6 * 60 * 1000);

      // Trigger cleanup by adding another message
      queueMessage('new-id', { new: 'data' });

      expect(messageHandler.getQueueSize()).toBe(1); // Only new message should remain

      jest.useRealTimers();
    });
  });

  describe('Callback Management', () => {
    it('should register and trigger callbacks', () => {
      const mockCallback = jest.fn();
      const registerCallback = (messageHandler as any).registerCallback.bind(messageHandler);
      
      registerCallback('test-id', mockCallback);
      expect(messageHandler.getCallbackCount()).toBe(1);

      messageHandler.triggerCallback('test-id', { result: 'success' });
      
      expect(mockCallback).toHaveBeenCalledWith({ result: 'success' });
      expect(messageHandler.getCallbackCount()).toBe(0);
    });

    it('should auto-cleanup callbacks after timeout', () => {
      jest.useFakeTimers();

      const mockCallback = jest.fn();
      const registerCallback = (messageHandler as any).registerCallback.bind(messageHandler);
      
      registerCallback('test-id', mockCallback);
      expect(messageHandler.getCallbackCount()).toBe(1);

      // Fast forward 30 seconds
      jest.advanceTimersByTime(30000);

      expect(messageHandler.getCallbackCount()).toBe(0);

      jest.useRealTimers();
    });
  });

  describe('Tab Communication', () => {
    it('should send message to specific tab', async () => {
      const mockTabsMessage = chrome.tabs.sendMessage as jest.Mock;
      mockTabsMessage.mockResolvedValue({ success: true });

      const result = await messageHandler.sendMessageToTab(123, { type: 'TEST' });

      expect(mockTabsMessage).toHaveBeenCalledWith(123, { type: 'TEST' });
      expect(result).toEqual({ success: true });
    });

    it('should handle tab message errors', async () => {
      const mockTabsMessage = chrome.tabs.sendMessage as jest.Mock;
      mockTabsMessage.mockRejectedValue(new Error('Tab not found'));

      await expect(
        messageHandler.sendMessageToTab(123, { type: 'TEST' })
      ).rejects.toThrow('Tab not found');
    });

    it('should broadcast to all tabs', async () => {
      const mockTabsQuery = chrome.tabs.query as jest.Mock;
      const mockTabsMessage = chrome.tabs.sendMessage as jest.Mock;

      mockTabsQuery.mockResolvedValue([
        { id: 1 },
        { id: 2 },
        { id: 3 }
      ]);
      mockTabsMessage.mockResolvedValue({ success: true });

      const broadcastToTabs = (messageHandler as any).broadcastToTabs.bind(messageHandler);
      await broadcastToTabs({ type: 'BROADCAST' });

      expect(mockTabsQuery).toHaveBeenCalledWith({});
      expect(mockTabsMessage).toHaveBeenCalledTimes(3);
      expect(mockTabsMessage).toHaveBeenCalledWith(1, { type: 'BROADCAST' });
      expect(mockTabsMessage).toHaveBeenCalledWith(2, { type: 'BROADCAST' });
      expect(mockTabsMessage).toHaveBeenCalledWith(3, { type: 'BROADCAST' });
    });
  });
});