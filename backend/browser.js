import { chromium } from 'playwright';

export class BrowserController {
  constructor() {
    this.browser = null;
    this.context = null;
    this.page = null;
    this.viewportWidth = 1024;
    this.viewportHeight = 768;
    this.latestScreenshot = null; // base64 string
    this.logsCallback = null;
  }

  setLogsCallback(callback) {
    this.logsCallback = callback;
  }

  log(message) {
    console.log(`[BrowserController] ${message}`);
    if (this.logsCallback) {
      this.logsCallback(message);
    }
  }

  async open_browser(headed = false) {
    if (this.browser) {
      this.log("Browser is already open.");
      return;
    }

    this.log(`Launching Chromium browser (${headed ? "headed" : "headless"})...`);
    this.browser = await chromium.launch({
      headless: !headed,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    this.context = await this.browser.newContext({
      viewport: { width: this.viewportWidth, height: this.viewportHeight },
      deviceScaleFactor: 1
    });

    this.page = await this.context.newPage();
    this.log("Browser instance successfully initialized.");
  }

  async navigate_to_url(url) {
    if (!this.page) {
      await this.open_browser();
    }
    this.log(`Navigating to URL: ${url}`);
    await this.page.goto(url, { waitUntil: 'load', timeout: 30000 });
    this.log(`Successfully loaded: ${url}`);
  }

  async take_screenshot() {
    if (!this.page) {
      throw new Error("No open browser page to take screenshot.");
    }
    this.log("Capturing screenshot...");
    const buffer = await this.page.screenshot({ type: 'png' });
    this.latestScreenshot = buffer.toString('base64');
    return this.latestScreenshot;
  }

  async click_on_screen(x, y) {
    if (!this.page) {
      throw new Error("No active browser page to perform click.");
    }
    this.log(`Clicking on screen at coordinates: (${x}, ${y})`);
    
    // Add visual click indicator briefly for the streamed recording
    try {
      await this.page.evaluate(({ cx, cy }) => {
        const marker = document.createElement('div');
        marker.style.position = 'absolute';
        marker.style.left = `${cx - 10}px`;
        marker.style.top = `${cy - 10}px`;
        marker.style.width = '20px';
        marker.style.height = '20px';
        marker.style.borderRadius = '50%';
        marker.style.backgroundColor = 'rgba(239, 68, 68, 0.7)'; // red-500
        marker.style.border = '2px solid white';
        marker.style.pointerEvents = 'none';
        marker.style.zIndex = '999999';
        marker.style.transition = 'all 0.5s ease-out';
        document.body.appendChild(marker);
        setTimeout(() => {
          marker.style.transform = 'scale(2)';
          marker.style.opacity = '0';
          setTimeout(() => marker.remove(), 500);
        }, 50);
      }, { cx: x, cy: y });
    } catch (e) {
      // Ignore click marker errors if page is unloading
    }

    await this.page.mouse.click(parseFloat(x), parseFloat(y));
  }

  async double_click(x, y) {
    if (!this.page) {
      throw new Error("No active browser page to perform double click.");
    }
    this.log(`Double-clicking on screen at coordinates: (${x}, ${y})`);
    await this.page.mouse.dblclick(parseFloat(x), parseFloat(y));
  }

  async send_keys(keys) {
    if (!this.page) {
      throw new Error("No active browser page to send keys.");
    }
    this.log(`Sending keys: "${keys}"`);
    
    const specialKeys = ["Enter", "Tab", "Escape", "Backspace", "ArrowDown", "ArrowUp", "ArrowLeft", "ArrowRight"];
    if (specialKeys.includes(keys)) {
      await this.page.keyboard.press(keys);
    } else {
      await this.page.keyboard.type(keys, { delay: 50 });
    }
  }

  async scroll(direction = "down", amount = 400) {
    if (!this.page) {
      throw new Error("No active browser page to scroll.");
    }
    this.log(`Scrolling ${direction} by ${amount}px...`);
    const scrollAmount = direction.toLowerCase() === "down" ? amount : -amount;
    await this.page.evaluate((offset) => {
      window.scrollBy({ top: offset, behavior: 'smooth' });
    }, scrollAmount);
    await this.page.waitForTimeout(500); // Wait for smooth scroll
  }

  async get_interactive_elements() {
    if (!this.page) return [];
    
    this.log("Extracting interactive elements from DOM...");
    
    const elements = await this.page.evaluate(() => {
      const interactiveSelectors = [
        'button', 'input', 'textarea', 'select', 'a[href]',
        '[role="button"]', '[role="link"]', '[role="checkbox"]', '[role="radio"]',
        '[contenteditable="true"]', '.clickable'
      ];
      
      const elementsList = [];
      const allElements = document.querySelectorAll(interactiveSelectors.join(','));
      
      let index = 0;
      allElements.forEach((el) => {
        const rect = el.getBoundingClientRect();
        const style = window.getComputedStyle(el);
        
        // Filter invisible elements
        const isVisible = rect.width > 0 && 
                          rect.height > 0 && 
                          style.display !== 'none' && 
                          style.visibility !== 'hidden' && 
                          style.opacity !== '0';
        
        if (!isVisible) return;
        
        const x = Math.round(rect.left + rect.width / 2);
        const y = Math.round(rect.top + rect.height / 2);
        
        let text = el.innerText || el.textContent || '';
        text = text.trim().replace(/\s+/g, ' ');
        
        if (!text) {
          text = el.getAttribute('placeholder') || 
                 el.getAttribute('value') || 
                 el.getAttribute('aria-label') || 
                 el.getAttribute('name') || 
                 el.getAttribute('id') || '';
        }
        
        if (text.length > 100) {
          text = text.substring(0, 97) + '...';
        }

        // Try to associate input elements with their label text
        if (el.tagName.toLowerCase() === 'input' || el.tagName.toLowerCase() === 'textarea') {
          const id = el.getAttribute('id');
          if (id) {
            const label = document.querySelector(`label[for="${id}"]`);
            if (label && label.innerText) {
              text = `Label: "${label.innerText.trim()}" | ${text}`;
            }
          }
          if (!text || !text.startsWith('Label:')) {
            let parent = el.parentElement;
            let foundLabel = false;
            for (let i = 0; i < 3 && parent; i++) { // Search up to 3 levels
              const labelEl = parent.querySelector('label');
              if (labelEl && labelEl.innerText) {
                text = `Label: "${labelEl.innerText.trim()}" | ${text}`;
                foundLabel = true;
                break;
              }
              parent = parent.parentElement;
            }
          }
        }
        
        elementsList.push({
          id: index++,
          tagName: el.tagName.toLowerCase(),
          type: el.getAttribute('type') || null,
          text: text.trim(),
          x,
          y,
          width: Math.round(rect.width),
          height: Math.round(rect.height)
        });
      });
      
      return elementsList;
    });

    this.log(`Found ${elements.length} interactive elements.`);
    return elements;
  }

  async close_browser() {
    if (this.browser) {
      this.log("Closing browser instance...");
      await this.browser.close();
      this.browser = null;
      this.context = null;
      this.page = null;
      this.log("Browser successfully closed.");
    }
  }
}
