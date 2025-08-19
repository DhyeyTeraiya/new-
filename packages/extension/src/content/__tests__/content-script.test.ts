/**
 * Tests for Content Script
 */

// Mock the widget manager
jest.mock('../widget/widget-manager', () => ({
  WidgetManager: jest.fn().mockImplementation(() => ({
    initialize: jest.fn().mockResolvedValue(undefined),
    show: jest.fn(),
    hide: jest.fn(),
    handleWebSocketMessage: jest.fn()
  }))
}));

// Mock chrome APIs
const mockChrome = {
  runtime: {
    sendMessage: jest.fn().mockResolvedValue({ success: true }),
    onMessage: {
      addListener: jest.fn()
    }
  }
};

(global as any).chrome = mockChrome;

describe('ContentScript', () => {
  let contentScript: any;

  beforeEach(() => {
    // Reset DOM
    document.body.innerHTML = `
      <div id="test-container">
        <button id="test-button">Test Button</button>
        <input id="test-input" type="text" value="test" />
        <form id="test-form">
          <input name="username" type="text" />
          <input name="password" type="password" />
          <button type="submit">Submit</button>
        </form>
        <table id="test-table">
          <tr><th>Name</th><th>Age</th></tr>
          <tr><td>John</td><td>30</td></tr>
          <tr><td>Jane</td><td>25</td></tr>
        </table>
        <ul id="test-list">
          <li>Item 1</li>
          <li>Item 2</li>
          <li><a href="/link">Link Item</a></li>
        </ul>
      </div>
    `;

    // Mock window properties
    Object.defineProperty(window, 'innerWidth', { value: 1920, writable: true });
    Object.defineProperty(window, 'innerHeight', { value: 1080, writable: true });
    Object.defineProperty(window, 'scrollX', { value: 0, writable: true });
    Object.defineProperty(window, 'scrollY', { value: 0, writable: true });
    Object.defineProperty(window, 'devicePixelRatio', { value: 1, writable: true });

    // Mock document properties
    Object.defineProperty(document, 'title', { value: 'Test Page', writable: true });
    Object.defineProperty(document, 'characterSet', { value: 'UTF-8', writable: true });
    Object.defineProperty(document, 'readyState', { value: 'complete', writable: true });

    jest.clearAllMocks();
  });

  afterEach(() => {
    if (contentScript && contentScript.destroy) {
      contentScript.destroy();
    }
  });

  describe('Page Context Extraction', () => {
    beforeEach(async () => {
      // Import and initialize content script
      const { ContentScript } = await import('../index');
      contentScript = new (ContentScript as any)();
    });

    it('should extract page context correctly', async () => {
      const context = await contentScript.getPageContext();

      expect(context).toMatchObject({
        url: expect.any(String),
        title: 'Test Page',
        content: expect.any(String),
        elements: expect.any(Array),
        metadata: expect.objectContaining({
          title: 'Test Page',
          charset: 'UTF-8',
          loadingState: 'complete',
          hasForms: true,
          hasInteractiveElements: true
        }),
        viewport: expect.objectContaining({
          width: 1920,
          height: 1080,
          scrollX: 0,
          scrollY: 0,
          devicePixelRatio: 1
        }),
        timestamp: expect.any(Date)
      });
    });

    it('should extract interactive elements', async () => {
      const elements = contentScript.extractInteractiveElements();

      expect(elements).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            id: 'test-button',
            tagName: 'button',
            type: 'button',
            text: 'Test Button',
            visible: true,
            interactable: true
          }),
          expect.objectContaining({
            id: 'test-input',
            tagName: 'input',
            type: 'text',
            visible: true,
            interactable: true
          })
        ])
      );
    });

    it('should generate CSS selectors correctly', () => {
      const button = document.getElementById('test-button')!;
      const selector = contentScript.generateSelector(button, 0);
      expect(selector).toBe('#test-button');
    });

    it('should generate XPath correctly', () => {
      const button = document.getElementById('test-button')!;
      const xpath = contentScript.generateXPath(button);
      expect(xpath).toBe('//*[@id="test-button"]');
    });
  });

  describe('Element Interaction', () => {
    beforeEach(async () => {
      const { ContentScript } = await import('../index');
      contentScript = new (ContentScript as any)();
    });

    it('should highlight elements', () => {
      contentScript.highlightElement('#test-button');
      
      const button = document.getElementById('test-button')!;
      expect(button.classList.contains('ai-agent-highlight')).toBe(true);
    });

    it('should execute click actions', async () => {
      const clickSpy = jest.spyOn(HTMLElement.prototype, 'click');
      
      const result = await contentScript.executeAction({
        type: 'click',
        selector: '#test-button'
      });

      expect(clickSpy).toHaveBeenCalled();
      expect(result).toEqual({
        success: true,
        action: 'click',
        selector: '#test-button'
      });
    });

    it('should execute type actions', async () => {
      const result = await contentScript.executeAction({
        type: 'type',
        selector: '#test-input',
        value: 'new value'
      });

      const input = document.getElementById('test-input') as HTMLInputElement;
      expect(input.value).toBe('new value');
      expect(result).toEqual({
        success: true,
        action: 'type',
        selector: '#test-input',
        value: 'new value'
      });
    });

    it('should handle element not found errors', async () => {
      await expect(
        contentScript.executeAction({
          type: 'click',
          selector: '#non-existent'
        })
      ).rejects.toThrow('Element not found: #non-existent');
    });
  });

  describe('Data Extraction', () => {
    beforeEach(async () => {
      const { ContentScript } = await import('../index');
      contentScript = new (ContentScript as any)();
    });

    it('should extract table data', async () => {
      const data = await contentScript.extractData({
        type: 'table',
        selectors: ['#test-table']
      });

      expect(data).toEqual([{
        headers: ['Name', 'Age'],
        data: [
          { Name: 'John', Age: '30' },
          { Name: 'Jane', Age: '25' }
        ]
      }]);
    });

    it('should extract form data', async () => {
      // Set form values
      const usernameInput = document.querySelector('input[name="username"]') as HTMLInputElement;
      const passwordInput = document.querySelector('input[name="password"]') as HTMLInputElement;
      usernameInput.value = 'testuser';
      passwordInput.value = 'testpass';

      const data = await contentScript.extractData({
        type: 'form',
        selectors: ['#test-form']
      });

      expect(data).toEqual([{
        action: '',
        method: 'get',
        data: {
          username: 'testuser',
          password: 'testpass'
        }
      }]);
    });

    it('should extract list data', async () => {
      const data = await contentScript.extractData({
        type: 'list',
        selectors: ['#test-list']
      });

      expect(data[0]).toEqual([
        expect.objectContaining({ text: 'Item 1' }),
        expect.objectContaining({ text: 'Item 2' }),
        expect.objectContaining({ 
          text: 'Link Item',
          links: [{ text: 'Link Item', href: expect.stringContaining('/link') }]
        })
      ]);
    });
  });

  describe('User Interaction Simulation', () => {
    beforeEach(async () => {
      const { ContentScript } = await import('../index');
      contentScript = new (ContentScript as any)();
    });

    it('should simulate hover', async () => {
      const result = await contentScript.simulateUserInteraction({
        type: 'hover',
        selector: '#test-button'
      });

      expect(result).toEqual({
        success: true,
        action: 'hover'
      });
    });

    it('should simulate focus', async () => {
      const result = await contentScript.simulateUserInteraction({
        type: 'focus',
        selector: '#test-input'
      });

      expect(result).toEqual({
        success: true,
        action: 'focus'
      });
    });

    it('should simulate typing', async () => {
      const result = await contentScript.simulateUserInteraction({
        type: 'type',
        selector: '#test-input',
        value: 'simulated text',
        delay: 10
      });

      const input = document.getElementById('test-input') as HTMLInputElement;
      expect(input.value).toBe('simulated text');
      expect(result).toEqual({
        success: true,
        action: 'type',
        text: 'simulated text'
      });
    });

    it('should simulate key press', async () => {
      const result = await contentScript.simulateUserInteraction({
        type: 'keyPress',
        selector: '#test-input',
        value: 'Enter'
      });

      expect(result).toEqual({
        success: true,
        action: 'keyPress',
        key: 'Enter'
      });
    });
  });

  describe('Automation Mode', () => {
    beforeEach(async () => {
      const { ContentScript } = await import('../index');
      contentScript = new (ContentScript as any)();
    });

    it('should start automation mode', () => {
      contentScript.startAutomationMode();
      
      expect(contentScript.automationMode).toBe(true);
      expect(document.getElementById('ai-agent-automation-overlay')).toBeTruthy();
      expect(mockChrome.runtime.sendMessage).toHaveBeenCalledWith({
        type: 'AUTOMATION_MODE_STARTED',
        data: { timestamp: expect.any(Number) }
      });
    });

    it('should stop automation mode', () => {
      contentScript.startAutomationMode();
      contentScript.stopAutomationMode();
      
      expect(contentScript.automationMode).toBe(false);
      expect(document.getElementById('ai-agent-automation-overlay')).toBeFalsy();
      expect(mockChrome.runtime.sendMessage).toHaveBeenCalledWith({
        type: 'AUTOMATION_MODE_STOPPED',
        data: { timestamp: expect.any(Number) }
      });
    });
  });

  describe('Element Analysis', () => {
    beforeEach(async () => {
      const { ContentScript } = await import('../index');
      contentScript = new (ContentScript as any)();
    });

    it('should analyze element correctly', async () => {
      const analysis = await contentScript.analyzeElement('#test-button');

      expect(analysis).toMatchObject({
        selector: '#test-button',
        tagName: 'button',
        text: 'Test Button',
        visible: true,
        interactable: true,
        xpath: '//*[@id="test-button"]',
        bounds: expect.objectContaining({
          x: expect.any(Number),
          y: expect.any(Number),
          width: expect.any(Number),
          height: expect.any(Number)
        }),
        style: expect.objectContaining({
          display: expect.any(String),
          visibility: expect.any(String)
        })
      });
    });

    it('should throw error for non-existent element', async () => {
      await expect(
        contentScript.analyzeElement('#non-existent')
      ).rejects.toThrow('Element not found: #non-existent');
    });
  });

  describe('Visibility Detection', () => {
    beforeEach(async () => {
      const { ContentScript } = await import('../index');
      contentScript = new (ContentScript as any)();
    });

    it('should detect visible elements', () => {
      const button = document.getElementById('test-button')!;
      
      // Mock getBoundingClientRect
      jest.spyOn(button, 'getBoundingClientRect').mockReturnValue({
        width: 100,
        height: 30,
        x: 10,
        y: 10,
        top: 10,
        left: 10,
        bottom: 40,
        right: 110,
        toJSON: () => ({})
      });

      expect(contentScript.isElementVisible(button)).toBe(true);
    });

    it('should detect hidden elements', () => {
      const button = document.getElementById('test-button')!;
      button.style.display = 'none';

      expect(contentScript.isElementVisible(button)).toBe(false);
    });

    it('should detect interactable elements', () => {
      const button = document.getElementById('test-button')!;
      
      // Mock getBoundingClientRect for visibility
      jest.spyOn(button, 'getBoundingClientRect').mockReturnValue({
        width: 100,
        height: 30,
        x: 10,
        y: 10,
        top: 10,
        left: 10,
        bottom: 40,
        right: 110,
        toJSON: () => ({})
      });

      expect(contentScript.isElementInteractable(button)).toBe(true);
    });

    it('should detect non-interactable disabled elements', () => {
      const button = document.getElementById('test-button') as HTMLButtonElement;
      button.disabled = true;

      expect(contentScript.isElementInteractable(button)).toBe(false);
    });
  });
});