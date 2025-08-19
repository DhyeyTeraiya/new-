import {
  PageContextSchema,
  BrowserActionSchema,
  ChatRequestSchema,
  NVIDIARequestSchema,
} from '../schemas';

describe('Schema Validation Tests', () => {
  describe('PageContextSchema', () => {
    it('should validate a valid page context', () => {
      const validPageContext = {
        url: 'https://example.com',
        title: 'Example Page',
        content: 'This is example content',
        elements: [
          {
            id: 'element-1',
            tagName: 'button',
            selector: '#submit-btn',
            xpath: '//button[@id="submit-btn"]',
            text: 'Submit',
            attributes: { id: 'submit-btn', class: 'btn btn-primary' },
            bounds: { x: 100, y: 200, width: 80, height: 30 },
            visible: true,
            interactive: true,
          },
        ],
        viewport: {
          width: 1920,
          height: 1080,
          scrollX: 0,
          scrollY: 0,
          devicePixelRatio: 1,
        },
        metadata: {
          loadingState: 'complete' as const,
          hasForms: false,
          hasInteractiveElements: true,
        },
        timestamp: new Date(),
      };

      const result = PageContextSchema.safeParse(validPageContext);
      expect(result.success).toBe(true);
    });

    it('should reject invalid URL', () => {
      const invalidPageContext = {
        url: 'not-a-valid-url',
        title: 'Example Page',
        content: 'Content',
        elements: [],
        viewport: {
          width: 1920,
          height: 1080,
          scrollX: 0,
          scrollY: 0,
          devicePixelRatio: 1,
        },
        metadata: {
          loadingState: 'complete' as const,
          hasForms: false,
          hasInteractiveElements: false,
        },
        timestamp: new Date(),
      };

      const result = PageContextSchema.safeParse(invalidPageContext);
      expect(result.success).toBe(false);
    });
  });

  describe('BrowserActionSchema', () => {
    it('should validate a valid browser action', () => {
      const validAction = {
        id: 'action-1',
        type: 'click' as const,
        target: {
          css: '#submit-btn',
          strategy: ['css' as const],
        },
        description: 'Click the submit button',
        options: {
          timeout: 5000,
          waitForVisible: true,
          highlight: true,
        },
      };

      const result = BrowserActionSchema.safeParse(validAction);
      expect(result.success).toBe(true);
    });

    it('should reject invalid action type', () => {
      const invalidAction = {
        id: 'action-1',
        type: 'invalid-action',
        description: 'Invalid action',
      };

      const result = BrowserActionSchema.safeParse(invalidAction);
      expect(result.success).toBe(false);
    });
  });

  describe('ChatRequestSchema', () => {
    it('should validate a valid chat request', () => {
      const validRequest = {
        message: 'Click the submit button',
        sessionId: 'session-123',
        type: 'command' as const,
        metadata: {
          userAgent: 'Mozilla/5.0...',
        },
      };

      const result = ChatRequestSchema.safeParse(validRequest);
      expect(result.success).toBe(true);
    });

    it('should reject empty message', () => {
      const invalidRequest = {
        message: '',
        sessionId: 'session-123',
        type: 'command' as const,
      };

      const result = ChatRequestSchema.safeParse(invalidRequest);
      expect(result.success).toBe(false);
    });
  });

  describe('NVIDIARequestSchema', () => {
    it('should validate a valid NVIDIA request', () => {
      const validRequest = {
        model: 'meta/llama-3.3-70b-instruct',
        messages: [
          {
            role: 'user' as const,
            content: 'Help me click the submit button',
          },
        ],
        parameters: {
          max_tokens: 1000,
          temperature: 0.7,
          top_p: 0.9,
        },
      };

      const result = NVIDIARequestSchema.safeParse(validRequest);
      expect(result.success).toBe(true);
    });

    it('should reject invalid temperature', () => {
      const invalidRequest = {
        model: 'meta/llama-3.3-70b-instruct',
        messages: [
          {
            role: 'user' as const,
            content: 'Help me click the submit button',
          },
        ],
        parameters: {
          temperature: 3.0, // Invalid: should be 0-2
        },
      };

      const result = NVIDIARequestSchema.safeParse(invalidRequest);
      expect(result.success).toBe(false);
    });
  });
});