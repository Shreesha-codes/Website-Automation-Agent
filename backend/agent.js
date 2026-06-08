import { GoogleGenAI } from '@google/genai';
import OpenAI from 'openai';

const SYSTEM_PROMPT = `
You are an intelligent website automation agent control system. Your goal is to complete the user's task by selecting the correct tools to interact with the web browser.
You will be provided with:
1. A screenshot of the current browser state.
2. A list of interactive elements found in the DOM, including their ID, HTML tag name, type, descriptive label/text, and center coordinates (x, y).

You can use the following tools:
- "click_on_screen": Clicks the mouse at the specified (x, y) coordinates. Args: { "x": number, "y": number }. Use this to focus input fields, click buttons, select options, etc.
- "send_keys": Types the specified string. Args: { "keys": "text to type" }. If keys is a special key like "Enter", "Tab", "Escape", "Backspace", it presses the key. Use this AFTER clicking/focusing an input element.
- "scroll": Scrolls the page. Args: { "direction": "down" | "up", "amount": number }. Use this to reveal elements that are hidden below or above the viewport.
- "double_click": Double-clicks the mouse at specified coordinates. Args: { "x": number, "y": number }.
- "complete": Call this when you have successfully completed the user's task. Args: {}

Rules:
1. To fill in a form field, you MUST first focus it by calling click_on_screen at its center coordinates, and then send_keys with the text.
2. Analyze the screenshot and DOM elements carefully. Locate the input fields corresponding to the task (e.g. Username/Name and Description).
3. If target fields or the submit button are not visible, use the scroll tool.
4. Respond ONLY with a valid JSON object in the following format:
{
  "thought": "Reasoning explaining what you see on the screen and what action you will take.",
  "action": "click_on_screen" | "send_keys" | "scroll" | "double_click" | "complete",
  "args": { ... }
}
`;

export async function runAgentTask({
  browserController,
  taskDescription,
  apiKey,
  provider = "gemini",
  modelName = "gemini-2.5-flash",
  delayBetweenSteps = 1500,
  signal = null,
  onStep = async () => {}
}) {
  let step = 0;
  const maxSteps = 15;
  let isDone = false;

  browserController.log(`Starting AI Agent loop using ${provider} (${modelName})...`);

  // Ensure browser is running and has a page
  if (!browserController.page) {
    await browserController.open_browser();
  }

  while (step < maxSteps && !isDone) {
    if (signal && signal.abort) {
      browserController.log("Agent run was aborted by signal.");
      break;
    }

    step++;
    browserController.log(`\n--- Agent Step ${step} ---`);

    try {
      // 1. Capture browser screenshot (base64)
      const screenshotBase64 = await browserController.take_screenshot();

      // 2. Extract visible interactive elements
      const elements = await browserController.get_interactive_elements();

      // 3. Prepare Prompt Text
      const promptText = `
User's Target Task: "${taskDescription}"

Currently at Step: ${step} of ${maxSteps}

Here is the list of currently visible interactive elements in the DOM:
${JSON.stringify(elements, null, 2)}

Look at the screenshot and the DOM elements listed above. Identify where you need to click, type, or scroll to achieve the task. Respond with a JSON object.
`;

      let agentResponseText = "";

      // 4. Query LLM
      if (provider === "gemini") {
        const ai = new GoogleGenAI({ apiKey });
        const geminiModel = modelName || "gemini-2.5-flash";
        
        browserController.log(`Querying Gemini model ${geminiModel}...`);
        const response = await ai.models.generateContent({
          model: geminiModel,
          contents: [
            {
              role: 'user',
              parts: [
                { text: SYSTEM_PROMPT + "\n\n" + promptText },
                { inlineData: { data: screenshotBase64, mimeType: 'image/png' } }
              ]
            }
          ],
          config: {
            responseMimeType: 'application/json'
          }
        });
        agentResponseText = response.text;
      } else if (provider === "openai") {
        const openai = new OpenAI({ apiKey });
        const openAIModel = modelName || "gpt-4o";

        browserController.log(`Querying OpenAI model ${openAIModel}...`);
        const response = await openai.chat.completions.create({
          model: openAIModel,
          response_format: { type: 'json_object' },
          messages: [
            {
              role: 'system',
              content: SYSTEM_PROMPT
            },
            {
              role: 'user',
              content: [
                { type: 'text', text: promptText },
                { type: 'image_url', image_url: { url: `data:image/png;base64,${screenshotBase64}` } }
              ]
            }
          ]
        });
        agentResponseText = response.choices[0].message.content;
      } else {
        throw new Error(`Unsupported LLM provider: ${provider}`);
      }

      // 5. Parse LLM response
      browserController.log(`Agent response: ${agentResponseText}`);
      let decision;
      try {
        decision = JSON.parse(agentResponseText.trim());
      } catch (e) {
        // Fallback: search for json in text
        const jsonMatch = agentResponseText.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          decision = JSON.parse(jsonMatch[0]);
        } else {
          throw new Error("Failed to parse agent response as JSON.");
        }
      }

      // Send update to frontend before executing action
      await onStep({
        step,
        thought: decision.thought,
        action: decision.action,
        args: decision.args,
        screenshot: screenshotBase64,
        status: "executing"
      });

      // 6. Execute chosen action
      if (decision.action === "click_on_screen") {
        const { x, y } = decision.args;
        await browserController.click_on_screen(x, y);
      } else if (decision.action === "send_keys") {
        const { keys } = decision.args;
        await browserController.send_keys(keys);
      } else if (decision.action === "scroll") {
        const { direction, amount } = decision.args;
        await browserController.scroll(direction, amount || 400);
      } else if (decision.action === "double_click") {
        const { x, y } = decision.args;
        await browserController.double_click(x, y);
      } else if (decision.action === "complete") {
        browserController.log("Agent signaled task completion!");
        isDone = true;
        
        await onStep({
          step,
          thought: decision.thought,
          action: "complete",
          args: {},
          screenshot: screenshotBase64,
          status: "completed"
        });
        break;
      } else {
        throw new Error(`Unknown action: ${decision.action}`);
      }

      // Wait between steps
      await new Promise(resolve => setTimeout(resolve, delayBetweenSteps));

    } catch (error) {
      browserController.log(`Error in agent loop step ${step}: ${error.message}`);
      await onStep({
        step,
        thought: `Error encountered: ${error.message}`,
        action: "error",
        args: { error: error.message },
        screenshot: browserController.latestScreenshot,
        status: "failed"
      });
      break;
    }
  }

  if (!isDone && step >= maxSteps) {
    browserController.log("Agent reached maximum step limit without completion.");
    await onStep({
      step,
      thought: "Max steps limit reached.",
      action: "error",
      args: { error: "Max steps reached" },
      screenshot: browserController.latestScreenshot,
      status: "failed"
    });
  }
}
