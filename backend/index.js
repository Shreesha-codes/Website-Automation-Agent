import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import dotenv from 'dotenv';
import { BrowserController } from './browser.js';
import { runAgentTask } from './agent.js';

dotenv.config();

const app = express();
const port = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

const server = createServer(app);
const wss = new WebSocketServer({ server });

const browserController = new BrowserController();
let activeAgentSignal = null;

// Broadcast a message to all connected WebSocket clients
function broadcast(type, data) {
  const message = JSON.stringify({ type, data });
  wss.clients.forEach((client) => {
    if (client.readyState === 1) { // OPEN
      client.send(message);
    }
  });
}

// Redirect browser logs to WebSockets so frontend receives them live
browserController.setLogsCallback((msg) => {
  broadcast('log', msg);
});

// WebSocket connection handler
wss.on('connection', (ws) => {
  console.log('Client connected to WebSockets.');
  
  // Send initial connection greeting
  ws.send(JSON.stringify({ type: 'log', data: 'Connected to Agent WebSocket stream.' }));
  
  // Send current screenshot if browser is already open
  if (browserController.page && browserController.latestScreenshot) {
    ws.send(JSON.stringify({
      type: 'status',
      data: {
        browserOpen: true,
        url: browserController.page.url(),
        screenshot: browserController.latestScreenshot
      }
    }));
  }
});

// REST ENDPOINTS

// Get current status of the browser
app.get('/api/status', async (req, res) => {
  try {
    const isOpen = !!browserController.browser;
    const url = isOpen && browserController.page ? browserController.page.url() : '';
    res.json({
      success: true,
      isOpen,
      url,
      latestScreenshot: browserController.latestScreenshot
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Open browser instance
app.post('/api/browser/open', async (req, res) => {
  try {
    const { headed } = req.body;
    await browserController.open_browser(headed === true);
    res.json({ success: true, message: 'Browser opened successfully' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Close browser instance
app.post('/api/browser/close', async (req, res) => {
  try {
    await browserController.close_browser();
    res.json({ success: true, message: 'Browser closed successfully' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Navigate browser to specific URL
app.post('/api/browser/navigate', async (req, res) => {
  try {
    const { url } = req.body;
    if (!url) {
      return res.status(400).json({ success: false, error: 'URL is required' });
    }
    await browserController.navigate_to_url(url);
    const screenshot = await browserController.take_screenshot();
    res.json({ success: true, screenshot, url: browserController.page.url() });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Trigger a manual tool action on the browser
app.post('/api/browser/action', async (req, res) => {
  try {
    const { action, args } = req.body;
    if (!browserController.page) {
      return res.status(400).json({ success: false, error: 'Browser is not open or page is not loaded.' });
    }

    browserController.log(`Executing manual action: ${action} with args: ${JSON.stringify(args)}`);

    switch (action) {
      case 'click_on_screen':
        await browserController.click_on_screen(args.x, args.y);
        break;
      case 'double_click':
        await browserController.double_click(args.x, args.y);
        break;
      case 'send_keys':
        await browserController.send_keys(args.keys);
        break;
      case 'scroll':
        await browserController.scroll(args.direction || 'down', args.amount || 400);
        break;
      case 'take_screenshot':
        await browserController.take_screenshot();
        break;
      default:
        return res.status(400).json({ success: false, error: `Invalid action: ${action}` });
    }

    const screenshot = await browserController.take_screenshot();
    res.json({
      success: true,
      screenshot,
      url: browserController.page.url()
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Start the AI automation agent loop
app.post('/api/agent/run', async (req, res) => {
  try {
    const {
      taskDescription,
      apiKey,
      provider,
      modelName,
      delayBetweenSteps
    } = req.body;

    const key = apiKey || (provider === 'gemini' ? process.env.GEMINI_API_KEY : process.env.OPENAI_API_KEY);
    if (!key) {
      return res.status(400).json({ success: false, error: `API key for ${provider} is missing.` });
    }

    if (activeAgentSignal) {
      return res.status(400).json({ success: false, error: 'An agent task is already running.' });
    }

    activeAgentSignal = { abort: false };
    const currentSignal = activeAgentSignal;

    // Run agent in background
    runAgentTask({
      browserController,
      taskDescription,
      apiKey: key,
      provider: provider || 'gemini',
      modelName: modelName,
      delayBetweenSteps: delayBetweenSteps || 1500,
      signal: currentSignal,
      onStep: async (stepData) => {
        // Check if aborted mid-execution
        if (currentSignal.abort) {
          throw new Error('Task run aborted by user.');
        }
        // Broadcast step information to frontends
        broadcast('agent_step', stepData);
      }
    }).then(() => {
      browserController.log('Agent run completed.');
    }).catch((err) => {
      browserController.log(`Agent run finished with error: ${err.message}`);
    }).finally(() => {
      if (activeAgentSignal === currentSignal) {
        activeAgentSignal = null;
      }
    });

    res.json({ success: true, message: 'Agent task started in background.' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Stop any active AI agent run
app.post('/api/agent/stop', (req, res) => {
  if (activeAgentSignal) {
    activeAgentSignal.abort = true;
    activeAgentSignal = null;
    browserController.log('Stopping active agent run...');
    res.json({ success: true, message: 'Agent stop signal sent.' });
  } else {
    res.json({ success: true, message: 'No active agent run found.' });
  }
});

server.listen(port, () => {
  console.log(`Backend server running on http://localhost:${port}`);
});
