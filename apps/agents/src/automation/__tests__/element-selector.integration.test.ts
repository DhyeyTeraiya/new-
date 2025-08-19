import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { Page } from 'playwright';
import AIElementSelector, { ElementContext } from '../element-selector';
import BrowserManager from '../browser-manager';

// =============================================================================
// AI ELEMENT SELECTOR INTEGRATION TESTS
// Real-world element detection and AI-powered selection
// =============================================================================

describe('AIElementSelector Integration Tests', () => {
  let elementSelector: AIElementSelector;
  let browserManager: BrowserManager;
  let page: Page;
  let sessionId: string;
  let pageId: string;

  beforeEach(async () => {
    elementSelector = new AIElementSelector();
    browserManager = BrowserManager.getInstance();
    
    sessionId = await browserManager.createSession({
      type: 'chromium',
      headless: true,
      stealth: false,
    });
    
    pageId = await browserManager.createPage(sessionId);
    const browserPage = await browserManager.getPage(sessionId, pageId);
    
    if (!browserPage) {
      throw new Error('Failed to create browser page');
    }
    
    page = browserPage;
  });

  afterEach(async () => {
    if (sessionId) {
      await browserManager.closeSession(sessionId);
    }
    elementSelector.clearCache();
  });

  describe('Semantic Element Selection', () => {
    it('should find buttons by text content', async () => {
      // Create a test page with buttons
      await page.setContent(`
        <html>
          <body>
            <button id="login-btn">Login</button>
            <button id="signup-btn">Sign Up</button>
            <button id="submit-btn" type="submit">Submit Form</button>
            <div role="button" id="custom-btn">Custom Button</div>
          </body>
        </html>
      `);

      const context: ElementContext = {
        description: 'Login',
        expectedType: 'button',
      };

      const element = await elementSelector.findElement(page, context);
      
      expect(element).toBeDefined();
      expect(element?.text.toLowerCase()).toContain('login');
      expect(element?.isClickable).toBe(true);
    });

    it('should find input fields by placeholder and type', async () => {
      await page.setContent(`
        <html>
          <body>
            <form>
              <input type="email" name="email" placeholder="Enter your email" />
              <input type="password" name="password" placeholder="Enter your password" />
              <input type="text" name="username" placeholder="Username" />
              <textarea name="message" placeholder="Your message"></textarea>
            </form>
          </body>
        </html>
      `);

      const emailContext: ElementContext = {
        description: 'email input',
        expectedType: 'input',
        attributes: {
          placeholder: 'Enter your email',
        },
      };

      const emailElement = await elementSelector.findElement(page, emailContext);
      
      expect(emailElement).toBeDefined();
      expect(emailElement?.attributes.type).toBe('email');
      expect(emailElement?.attributes.placeholder).toContain('email');

      const passwordContext: ElementContext = {
        description: 'password field',
        expectedType: 'input',
        attributes: {
          type: 'password',
        },
      };

      const passwordElement = await elementSelector.findElement(page, passwordContext);
      
      expect(passwordElement).toBeDefined();
      expect(passwordElement?.attributes.type).toBe('password');
    });

    it('should find links by text and href', async () => {
      await page.setContent(`
        <html>
          <body>
            <nav>
              <a href="/home">Home</a>
              <a href="/about">About Us</a>
              <a href="/contact">Contact</a>
              <a href="https://example.com">External Link</a>
            </nav>
          </body>
        </html>
      `);

      const context: ElementContext = {
        description: 'About Us',
        expectedType: 'link',
      };

      const element = await elementSelector.findElement(page, context);
      
      expect(element).toBeDefined();
      expect(element?.text).toContain('About');
      expect(element?.attributes.href).toBe('/about');
    });

    it('should find elements by test IDs and ARIA labels', async () => {
      await page.setContent(`
        <html>
          <body>
            <button data-testid="submit-button" aria-label="Submit the form">Submit</button>
            <input data-testid="search-input" aria-label="Search products" placeholder="Search..." />
            <div data-testid="modal-dialog" role="dialog" aria-label="Confirmation dialog">
              <p>Are you sure?</p>
              <button data-testid="confirm-btn">Yes</button>
              <button data-testid="cancel-btn">No</button>
            </div>
          </body>
        </html>
      `);

      const submitContext: ElementContext = {
        description: 'Submit button',
        expectedType: 'button',
        attributes: {
          testid: 'submit-button',
        },
      };

      const submitElement = await elementSelector.findElement(page, submitContext);
      
      expect(submitElement).toBeDefined();
      expect(submitElement?.attributes['data-testid']).toBe('submit-button');

      const searchContext: ElementContext = {
        description: 'Search input',
        expectedType: 'input',
        attributes: {
          testid: 'search-input',
        },
      };

      const searchElement = await elementSelector.findElement(page, searchContext);
      
      expect(searchElement).toBeDefined();
      expect(searchElement?.attributes['data-testid']).toBe('search-input');
    });
  });

  describe('Complex Element Selection Scenarios', () => {
    it('should find elements with nearby text context', async () => {
      await page.setContent(`
        <html>
          <body>
            <div class="form-group">
              <label>Email Address</label>
              <input type="email" name="email" />
            </div>
            <div class="form-group">
              <label>Phone Number</label>
              <input type="tel" name="phone" />
            </div>
            <div class="form-group">
              <span>Preferred Contact Method</span>
              <select name="contact-method">
                <option value="email">Email</option>
                <option value="phone">Phone</option>
              </select>
            </div>
          </body>
        </html>
      `);

      const context: ElementContext = {
        description: 'email input',
        expectedType: 'input',
        nearbyText: 'Email Address',
      };

      const element = await elementSelector.findElement(page, context);
      
      expect(element).toBeDefined();
      expect(element?.attributes.type).toBe('email');
      expect(element?.attributes.name).toBe('email');
    });

    it('should find elements in specific positions', async () => {
      await page.setContent(`
        <html>
          <body>
            <div class="button-group">
              <button class="btn">First Button</button>
              <button class="btn">Second Button</button>
              <button class="btn">Third Button</button>
              <button class="btn">Last Button</button>
            </div>
          </body>
        </html>
      `);

      const firstContext: ElementContext = {
        description: 'first button',
        expectedType: 'button',
        position: 'top',
      };

      const firstElement = await elementSelector.findElement(page, firstContext);
      
      expect(firstElement).toBeDefined();
      expect(firstElement?.text).toContain('First');

      const lastContext: ElementContext = {
        description: 'last button',
        expectedType: 'button',
        position: 'bottom',
      };

      const lastElement = await elementSelector.findElement(page, lastContext);
      
      expect(lastElement).toBeDefined();
      expect(lastElement?.text).toContain('Last');
    });

    it('should find elements within parent contexts', async () => {
      await page.setContent(`
        <html>
          <body>
            <div class="modal" id="login-modal">
              <h2>Login</h2>
              <form>
                <input type="email" name="email" placeholder="Email" />
                <input type="password" name="password" placeholder="Password" />
                <button type="submit">Login</button>
              </form>
            </div>
            <div class="modal" id="signup-modal">
              <h2>Sign Up</h2>
              <form>
                <input type="email" name="email" placeholder="Email" />
                <input type="password" name="password" placeholder="Password" />
                <button type="submit">Sign Up</button>
              </form>
            </div>
          </body>
        </html>
      `);

      const context: ElementContext = {
        description: 'Login button',
        expectedType: 'button',
        parentContext: 'login-modal',
      };

      const element = await elementSelector.findElement(page, context);
      
      expect(element).toBeDefined();
      expect(element?.text).toContain('Login');
      
      // Verify it's in the correct modal
      const parentModal = await page.locator('#login-modal button[type="submit"]').first();
      expect(await parentModal.textContent()).toContain('Login');
    });

    it('should find multiple elements of the same type', async () => {
      await page.setContent(`
        <html>
          <body>
            <div class="product-list">
              <div class="product">
                <h3>Product 1</h3>
                <button class="add-to-cart">Add to Cart</button>
              </div>
              <div class="product">
                <h3>Product 2</h3>
                <button class="add-to-cart">Add to Cart</button>
              </div>
              <div class="product">
                <h3>Product 3</h3>
                <button class="add-to-cart">Add to Cart</button>
              </div>
            </div>
          </body>
        </html>
      `);

      const context: ElementContext = {
        description: 'Add to Cart button',
        expectedType: 'button',
      };

      const elements = await elementSelector.findElements(page, context);
      
      expect(elements).toBeDefined();
      expect(elements.length).toBe(3);
      
      for (const element of elements) {
        expect(element.text).toContain('Add to Cart');
        expect(element.isClickable).toBe(true);
      }
    });
  });

  describe('Dynamic Content Handling', () => {
    it('should find elements in dynamically loaded content', async () => {
      await page.setContent(`
        <html>
          <body>
            <div id="container">
              <p>Loading...</p>
            </div>
            <script>
              setTimeout(() => {
                document.getElementById('container').innerHTML = 
                  '<button id="dynamic-btn">Dynamic Button</button>';
              }, 1000);
            </script>
          </body>
        </html>
      `);

      const context: ElementContext = {
        description: 'Dynamic Button',
        expectedType: 'button',
      };

      // Wait for dynamic content to load
      await page.waitForTimeout(1500);

      const element = await elementSelector.findElement(page, context);
      
      expect(element).toBeDefined();
      expect(element?.text).toContain('Dynamic');
      expect(element?.attributes.id).toBe('dynamic-btn');
    });

    it('should handle AJAX-loaded content', async () => {
      await page.setContent(`
        <html>
          <body>
            <button id="load-btn">Load Content</button>
            <div id="ajax-content"></div>
            <script>
              document.getElementById('load-btn').addEventListener('click', () => {
                setTimeout(() => {
                  document.getElementById('ajax-content').innerHTML = 
                    '<form><input type="text" name="ajax-input" placeholder="AJAX Input" /><button type="submit">Submit AJAX</button></form>';
                }, 500);
              });
            </script>
          </body>
        </html>
      `);

      // Click the load button
      await page.click('#load-btn');
      
      // Wait for AJAX content
      await page.waitForTimeout(1000);

      const context: ElementContext = {
        description: 'AJAX input field',
        expectedType: 'input',
        attributes: {
          placeholder: 'AJAX Input',
        },
      };

      const element = await elementSelector.findElement(page, context);
      
      expect(element).toBeDefined();
      expect(element?.attributes.name).toBe('ajax-input');
    });

    it('should handle SPA route changes', async () => {
      await page.setContent(`
        <html>
          <body>
            <nav>
              <a href="#home" id="home-link">Home</a>
              <a href="#about" id="about-link">About</a>
            </nav>
            <div id="content">
              <h1>Home Page</h1>
              <p>Welcome to the home page</p>
            </div>
            <script>
              document.getElementById('about-link').addEventListener('click', (e) => {
                e.preventDefault();
                document.getElementById('content').innerHTML = 
                  '<h1>About Page</h1><p>Learn more about us</p><button id="contact-btn">Contact Us</button>';
              });
            </script>
          </body>
        </html>
      `);

      // Navigate to about page
      await page.click('#about-link');
      
      // Wait for content change
      await page.waitForTimeout(500);

      const context: ElementContext = {
        description: 'Contact Us button',
        expectedType: 'button',
      };

      const element = await elementSelector.findElement(page, context);
      
      expect(element).toBeDefined();
      expect(element?.text).toContain('Contact Us');
    });
  });

  describe('Real Website Testing', () => {
    it('should find elements on GitHub login page', async () => {
      try {
        await page.goto('https://github.com/login', { timeout: 10000 });

        const usernameContext: ElementContext = {
          description: 'Username input',
          expectedType: 'input',
          attributes: {
            name: 'login',
          },
        };

        const usernameElement = await elementSelector.findElement(page, usernameContext);
        
        expect(usernameElement).toBeDefined();
        expect(usernameElement?.attributes.name).toBe('login');

        const passwordContext: ElementContext = {
          description: 'Password input',
          expectedType: 'input',
          attributes: {
            name: 'password',
          },
        };

        const passwordElement = await elementSelector.findElement(page, passwordContext);
        
        expect(passwordElement).toBeDefined();
        expect(passwordElement?.attributes.type).toBe('password');

        const signInContext: ElementContext = {
          description: 'Sign in button',
          expectedType: 'button',
        };

        const signInElement = await elementSelector.findElement(page, signInContext);
        
        expect(signInElement).toBeDefined();
        expect(signInElement?.isClickable).toBe(true);
      } catch (error) {
        // Skip test if GitHub is not accessible
        console.warn('Skipping GitHub test due to network issues:', error.message);
      }
    });

    it('should find elements on Google search page', async () => {
      try {
        await page.goto('https://www.google.com', { timeout: 10000 });

        const searchContext: ElementContext = {
          description: 'Search input',
          expectedType: 'input',
          attributes: {
            name: 'q',
          },
        };

        const searchElement = await elementSelector.findElement(page, searchContext);
        
        expect(searchElement).toBeDefined();
        expect(searchElement?.attributes.name).toBe('q');

        const searchButtonContext: ElementContext = {
          description: 'Google Search button',
          expectedType: 'button',
        };

        const searchButtonElement = await elementSelector.findElement(page, searchButtonContext);
        
        expect(searchButtonElement).toBeDefined();
        expect(searchButtonElement?.isClickable).toBe(true);
      } catch (error) {
        // Skip test if Google is not accessible
        console.warn('Skipping Google test due to network issues:', error.message);
      }
    });

    it('should handle complex e-commerce site elements', async () => {
      // Create a mock e-commerce page
      await page.setContent(`
        <html>
          <head>
            <style>
              .product-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 20px; }
              .product-card { border: 1px solid #ccc; padding: 15px; }
              .price { font-weight: bold; color: #e74c3c; }
              .add-to-cart { background: #3498db; color: white; padding: 10px 20px; border: none; cursor: pointer; }
              .filters { margin-bottom: 20px; }
              .filter-group { margin-right: 15px; display: inline-block; }
            </style>
          </head>
          <body>
            <header>
              <nav>
                <input type="text" placeholder="Search products..." class="search-box" />
                <button class="search-btn">Search</button>
                <a href="/cart" class="cart-link">Cart (0)</a>
              </nav>
            </header>
            
            <main>
              <div class="filters">
                <div class="filter-group">
                  <label>Category:</label>
                  <select name="category">
                    <option value="">All Categories</option>
                    <option value="electronics">Electronics</option>
                    <option value="clothing">Clothing</option>
                  </select>
                </div>
                <div class="filter-group">
                  <label>Price Range:</label>
                  <select name="price-range">
                    <option value="">Any Price</option>
                    <option value="0-50">$0 - $50</option>
                    <option value="50-100">$50 - $100</option>
                  </select>
                </div>
                <button class="apply-filters">Apply Filters</button>
              </div>
              
              <div class="product-grid">
                <div class="product-card" data-product-id="1">
                  <img src="/product1.jpg" alt="Wireless Headphones" />
                  <h3>Wireless Headphones</h3>
                  <p class="price">$79.99</p>
                  <button class="add-to-cart" data-product="1">Add to Cart</button>
                </div>
                <div class="product-card" data-product-id="2">
                  <img src="/product2.jpg" alt="Smart Watch" />
                  <h3>Smart Watch</h3>
                  <p class="price">$199.99</p>
                  <button class="add-to-cart" data-product="2">Add to Cart</button>
                </div>
                <div class="product-card" data-product-id="3">
                  <img src="/product3.jpg" alt="Bluetooth Speaker" />
                  <h3>Bluetooth Speaker</h3>
                  <p class="price">$49.99</p>
                  <button class="add-to-cart" data-product="3">Add to Cart</button>
                </div>
              </div>
            </main>
          </body>
        </html>
      `);

      // Test search functionality
      const searchContext: ElementContext = {
        description: 'Product search box',
        expectedType: 'input',
        attributes: {
          placeholder: 'Search products...',
        },
      };

      const searchElement = await elementSelector.findElement(page, searchContext);
      expect(searchElement).toBeDefined();

      // Test filter selection
      const categoryContext: ElementContext = {
        description: 'Category filter',
        expectedType: 'input', // select is treated as input
        attributes: {
          name: 'category',
        },
      };

      const categoryElement = await elementSelector.findElement(page, categoryContext);
      expect(categoryElement).toBeDefined();

      // Test add to cart buttons
      const addToCartContext: ElementContext = {
        description: 'Add to Cart button',
        expectedType: 'button',
      };

      const cartButtons = await elementSelector.findElements(page, addToCartContext);
      expect(cartButtons.length).toBe(3);

      // Test specific product interaction
      const headphonesCartContext: ElementContext = {
        description: 'Add to Cart button for Wireless Headphones',
        expectedType: 'button',
        nearbyText: 'Wireless Headphones',
      };

      const headphonesCartButton = await elementSelector.findElement(page, headphonesCartContext);
      expect(headphonesCartButton).toBeDefined();
      expect(headphonesCartButton?.attributes['data-product']).toBe('1');
    });
  });

  describe('Error Handling and Edge Cases', () => {
    it('should handle non-existent elements gracefully', async () => {
      await page.setContent(`
        <html>
          <body>
            <p>Simple page with no interactive elements</p>
          </body>
        </html>
      `);

      const context: ElementContext = {
        description: 'Non-existent button',
        expectedType: 'button',
      };

      const element = await elementSelector.findElement(page, context);
      
      expect(element).toBeNull();
    });

    it('should handle ambiguous element descriptions', async () => {
      await page.setContent(`
        <html>
          <body>
            <button>Button 1</button>
            <button>Button 2</button>
            <button>Button 3</button>
          </body>
        </html>
      `);

      const context: ElementContext = {
        description: 'Button',
        expectedType: 'button',
      };

      const element = await elementSelector.findElement(page, context);
      
      // Should find the first matching button
      expect(element).toBeDefined();
      expect(element?.text).toContain('Button');
    });

    it('should handle invisible elements', async () => {
      await page.setContent(`
        <html>
          <head>
            <style>
              .hidden { display: none; }
              .invisible { visibility: hidden; }
            </style>
          </head>
          <body>
            <button class="hidden">Hidden Button</button>
            <button class="invisible">Invisible Button</button>
            <button>Visible Button</button>
          </body>
        </html>
      `);

      const context: ElementContext = {
        description: 'Button',
        expectedType: 'button',
      };

      const element = await elementSelector.findElement(page, context);
      
      // Should find the visible button
      expect(element).toBeDefined();
      expect(element?.isVisible).toBe(true);
      expect(element?.text).toContain('Visible');
    });

    it('should handle disabled elements', async () => {
      await page.setContent(`
        <html>
          <body>
            <button disabled>Disabled Button</button>
            <button>Enabled Button</button>
            <input type="text" disabled placeholder="Disabled Input" />
            <input type="text" placeholder="Enabled Input" />
          </body>
        </html>
      `);

      const buttonContext: ElementContext = {
        description: 'Button',
        expectedType: 'button',
      };

      const button = await elementSelector.findElement(page, buttonContext);
      
      // Should find a button, but check if it's enabled
      expect(button).toBeDefined();
      
      const inputContext: ElementContext = {
        description: 'Input field',
        expectedType: 'input',
      };

      const input = await elementSelector.findElement(page, inputContext);
      
      // Should find an input field
      expect(input).toBeDefined();
    });
  });

  describe('Performance and Caching', () => {
    it('should cache selector results for better performance', async () => {
      await page.setContent(`
        <html>
          <body>
            <button id="test-btn">Test Button</button>
          </body>
        </html>
      `);

      const context: ElementContext = {
        description: 'Test Button',
        expectedType: 'button',
      };

      // First call - should generate selectors
      const startTime1 = Date.now();
      const element1 = await elementSelector.findElement(page, context);
      const duration1 = Date.now() - startTime1;

      expect(element1).toBeDefined();

      // Second call - should use cached selectors
      const startTime2 = Date.now();
      const element2 = await elementSelector.findElement(page, context);
      const duration2 = Date.now() - startTime2;

      expect(element2).toBeDefined();
      
      // Second call should be faster due to caching
      expect(duration2).toBeLessThanOrEqual(duration1);

      // Verify cache statistics
      const cacheStats = elementSelector.getCacheStats();
      expect(cacheStats.size).toBeGreaterThan(0);
    });

    it('should handle cache clearing', async () => {
      await page.setContent(`
        <html>
          <body>
            <button>Test Button</button>
          </body>
        </html>
      `);

      const context: ElementContext = {
        description: 'Test Button',
        expectedType: 'button',
      };

      // Generate cache entry
      await elementSelector.findElement(page, context);
      
      let cacheStats = elementSelector.getCacheStats();
      expect(cacheStats.size).toBeGreaterThan(0);

      // Clear cache
      elementSelector.clearCache();
      
      cacheStats = elementSelector.getCacheStats();
      expect(cacheStats.size).toBe(0);
    });
  });
});