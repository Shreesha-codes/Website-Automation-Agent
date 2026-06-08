# Website Automation Agent

This project is an intelligent website automation agent built with a **Node.js / Express.js** backend running **Playwright** and a **React** (Vite-powered) frontend dashboard. 

The agent utilizes LLM capabilities (Gemini or OpenAI) to inspect browser state (screenshots + DOM element positions) and intelligently perform actions like clicking, typing, scrolling, and double-clicking to complete automation goals—such as filling in name and description forms dynamically.

---

## Technical Stack

- **Frontend**: React (Vite, custom glassmorphism Vanilla CSS design, Lucide icons).
- **Backend**: Node.js, Express, WebSockets (`ws` library for streaming real-time browser states/logs).
- **Automation Engine**: Playwright (for launching browser instances, taking screenshots, and injecting manual action triggers).
- **AI Engine**: Gemini API (`@google/genai`) or OpenAI API (`openai`) for step-by-step reasoning.

---

## Key Features

1. **AI Automation Loop**: Provide any target website and automation goal. Watch the AI analyze screenshots and DOM inputs, explain its thinking, select tools, and execute them in real-time.
2. **Live Viewport Streaming**: Visual updates of the Playwright browser context streamed instantly to the frontend using WebSockets.
3. **Interactive Grid Mapping**: Hovering over the live viewport overlay displays precise page coordinates `(X, Y)`. Clicking on the live viewport automatically populates coordinate fields in the manual sandbox.
4. **Manual Tool Sandbox**: Allows testing individual browser controls (`launch browser`, `navigate`, `click_on_screen(x,y)`, `send_keys`, `scroll`, `double_click`) manually for grading or verification.
5. **Real-time Terminal Logs**: Standard output from the browser, agent thoughts, actions, and network status piped straight to a responsive mock terminal console.

---

## Installation & Setup

### Prerequisites
- Node.js (v20+)
- npm (v10+)

### 1. Clone & Install Dependencies
From the root project folder, run the automated installation script:
```bash
npm run install-all
```
*This installs dependencies in the root folder, the Express backend, and the React frontend.*

### 2. Configure Environment Variables
Navigate to the `backend` folder, copy `.env.example` to `.env`, and add your API keys:
```bash
cd backend
cp .env.example .env
```
Inside `.env`, populate either `GEMINI_API_KEY` (recommended) or `OPENAI_API_KEY`:
```env
GEMINI_API_KEY=your-gemini-api-key-here
OPENAI_API_KEY=your-openai-api-key-here
PORT=5000
```
*Alternatively, you can paste your API keys directly into the frontend dashboard settings panel, which will save them securely in your browser's `localStorage`.*

### 3. Install Playwright Web Drivers
Install the browser engine binaries required by Playwright:
```bash
npx playwright install chromium
```

---

## Running the Application

To launch both the **Express backend** and **Vite frontend** concurrently, run the following command in the project root:
```bash
npm run dev
```

- **Frontend Dashboard**: [http://localhost:5173](http://localhost:5173)
- **Backend API Server**: [http://localhost:5000](http://localhost:5000)

---

## Target Task Execution Demo

To test the assignment's primary task:
1. Input your API key in the configuration panel.
2. Start the browser by clicking **Launch Headless** or **Launch Headed**.
3. Under the manual controls, input `https://ui.shadcn.com/docs/forms/react-hook-form` and click **Go** to navigate there.
4. In the **AI Automation Loop** text area, input the goal:
   > *Navigate to https://ui.shadcn.com/docs/forms/react-hook-form, identify Name/Username and Description fields, and automatically fill them in.*
5. Click **Start AI Automation Agent**.
6. Observe the agent:
   - Identify the input selectors using coordinates.
   - Click to focus each input.
   - Type input data (username and description).
   - Signal task completion when done.
