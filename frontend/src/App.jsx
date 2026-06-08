import React, { useState, useEffect, useRef } from 'react';
import { 
  Play, Square, Globe, Terminal, Settings, Key, Cpu, 
  MousePointerClick, Keyboard, ChevronsUpDown, RefreshCw, 
  Chrome, CheckCircle, AlertCircle, Sparkles, BookOpen 
} from 'lucide-react';
import './App.css';

export default function App() {
  // Config States
  const [apiKey, setApiKey] = useState(() => localStorage.getItem('api_key') || '');
  const [provider, setProvider] = useState('gemini');
  const [modelName, setModelName] = useState('gemini-2.5-flash');
  const [delay, setDelay] = useState(2000);
  const [taskInput, setTaskInput] = useState(
    'Navigate to https://ui.shadcn.com/docs/forms/react-hook-form, identify Username/Name and Description fields, and automatically fill them in.'
  );
  
  // Browser Manual controls states
  const [targetUrl, setTargetUrl] = useState('https://ui.shadcn.com/docs/forms/react-hook-form');
  const [manualX, setManualX] = useState('');
  const [manualY, setManualY] = useState('');
  const [manualKeys, setManualKeys] = useState('');
  const [scrollDir, setScrollDir] = useState('down');
  const [scrollAmount, setScrollAmount] = useState('400');
  
  // Live States
  const [logs, setLogs] = useState([]);
  const [browserStatus, setBrowserStatus] = useState({
    isOpen: false,
    url: '',
    latestScreenshot: null
  });
  
  const [agentState, setAgentState] = useState({
    step: 0,
    thought: '',
    action: '',
    args: {},
    status: 'idle' // idle, running, completed, failed
  });

  const [hoverCoords, setHoverCoords] = useState(null);
  const [clickRipple, setClickRipple] = useState(null);
  const [loading, setLoading] = useState({});
  
  const consoleRef = useRef(null);
  const wsRef = useRef(null);

  // Sync API key to localStorage
  useEffect(() => {
    localStorage.setItem('api_key', apiKey);
  }, [apiKey]);

  // Connect to WebSocket Server
  useEffect(() => {
    const connectWS = () => {
      const wsUrl = `ws://${window.location.hostname}:5000`;
      addLog('system', `Connecting to WebSocket at ${wsUrl}...`);
      
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;
      
      ws.onopen = () => {
        addLog('system', 'WebSocket connection established.');
      };
      
      ws.onmessage = (event) => {
        const message = JSON.parse(event.data);
        const { type, data } = message;
        
        if (type === 'log') {
          addLog('browser', data);
        } else if (type === 'status') {
          setBrowserStatus({
            isOpen: data.browserOpen,
            url: data.url,
            latestScreenshot: data.screenshot
          });
        } else if (type === 'agent_step') {
          setAgentState({
            step: data.step,
            thought: data.thought,
            action: data.action,
            args: data.args,
            status: data.status
          });
          
          if (data.screenshot) {
            setBrowserStatus(prev => ({
              ...prev,
              latestScreenshot: data.screenshot
            }));
          }
          
          let logMsg = `Step ${data.step}: ${data.thought}`;
          if (data.action !== 'complete' && data.action !== 'error') {
            logMsg += ` -> Calling [${data.action}] with args: ${JSON.stringify(data.args)}`;
          }
          addLog('agent', logMsg);
        }
      };
      
      ws.onclose = () => {
        addLog('system', 'WebSocket connection closed. Retrying in 3 seconds...');
        setTimeout(connectWS, 3000);
      };
      
      ws.onerror = (err) => {
        console.error('WS Error:', err);
      };
    };
    
    connectWS();
    fetchBrowserStatus();
    
    return () => {
      if (wsRef.current) wsRef.current.close();
    };
  }, []);

  // Auto scroll console terminal to bottom on new logs
  useEffect(() => {
    if (consoleRef.current) {
      consoleRef.current.scrollTop = consoleRef.current.scrollHeight;
    }
  }, [logs]);

  // Adjust model selections based on provider
  useEffect(() => {
    if (provider === 'gemini') {
      setModelName('gemini-2.5-flash');
    } else {
      setModelName('gpt-4o');
    }
  }, [provider]);

  const addLog = (type, text) => {
    const timestamp = new Date().toLocaleTimeString();
    setLogs(prev => [...prev, { id: Math.random().toString(), timestamp, type, text }]);
  };

  const fetchBrowserStatus = async () => {
    try {
      const res = await fetch('http://localhost:5000/api/status');
      const data = await res.json();
      if (data.success) {
        setBrowserStatus({
          isOpen: data.isOpen,
          url: data.url,
          latestScreenshot: data.latestScreenshot
        });
      }
    } catch (err) {
      console.error('Failed to fetch browser status:', err);
    }
  };

  const startLoading = (key) => setLoading(prev => ({ ...prev, [key]: true }));
  const stopLoading = (key) => setLoading(prev => ({ ...prev, [key]: false }));

  // API Call Helpers
  const handleOpenBrowser = async (headed) => {
    const key = headed ? 'open_headed' : 'open_headless';
    startLoading(key);
    addLog('system', `Launching browser (${headed ? 'headed' : 'headless'})...`);
    try {
      const res = await fetch('http://localhost:5000/api/browser/open', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ headed })
      });
      const data = await res.json();
      if (data.success) {
        addLog('system', 'Browser opened successfully.');
        await fetchBrowserStatus();
      } else {
        addLog('error', `Failed to open browser: ${data.error}`);
      }
    } catch (err) {
      addLog('error', `Error calling API: ${err.message}`);
    } finally {
      stopLoading(key);
    }
  };

  const handleCloseBrowser = async () => {
    startLoading('close');
    addLog('system', 'Closing browser...');
    try {
      const res = await fetch('http://localhost:5000/api/browser/close', {
        method: 'POST'
      });
      const data = await res.json();
      if (data.success) {
        addLog('system', 'Browser closed successfully.');
        setBrowserStatus({ isOpen: false, url: '', latestScreenshot: null });
        setAgentState(prev => ({ ...prev, status: 'idle' }));
      } else {
        addLog('error', `Failed to close browser: ${data.error}`);
      }
    } catch (err) {
      addLog('error', `Error calling API: ${err.message}`);
    } finally {
      stopLoading('close');
    }
  };

  const handleNavigate = async () => {
    if (!targetUrl) return;
    startLoading('navigate');
    addLog('system', `Navigating page to ${targetUrl}...`);
    try {
      const res = await fetch('http://localhost:5000/api/browser/navigate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: targetUrl })
      });
      const data = await res.json();
      if (data.success) {
        addLog('system', `Successfully loaded page.`);
        setBrowserStatus({
          isOpen: true,
          url: data.url,
          latestScreenshot: data.screenshot
        });
      } else {
        addLog('error', `Navigation failed: ${data.error}`);
      }
    } catch (err) {
      addLog('error', `Navigation error: ${err.message}`);
    } finally {
      stopLoading('navigate');
    }
  };

  const handleManualAction = async (action, args) => {
    startLoading(action);
    addLog('system', `Sending manual command: ${action}...`);
    try {
      const res = await fetch('http://localhost:5000/api/browser/action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, args })
      });
      const data = await res.json();
      if (data.success) {
        addLog('system', `Manual action [${action}] succeeded.`);
        setBrowserStatus(prev => ({
          ...prev,
          latestScreenshot: data.screenshot,
          url: data.url
        }));
      } else {
        addLog('error', `Action failed: ${data.error}`);
      }
    } catch (err) {
      addLog('error', `Action error: ${err.message}`);
    } finally {
      stopLoading(action);
    }
  };

  const handleStartAgent = async () => {
    if (!apiKey) {
      addLog('error', 'API Key is required to run the AI Agent.');
      alert('Please fill in your LLM API Key first.');
      return;
    }
    if (!taskInput) return;

    startLoading('agent_run');
    addLog('system', 'Requesting Agent task start...');
    setAgentState({
      step: 0,
      thought: 'Initializing agent loops...',
      action: 'start',
      args: {},
      status: 'running'
    });

    try {
      const res = await fetch('http://localhost:5000/api/agent/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          taskDescription: taskInput,
          apiKey,
          provider,
          modelName,
          delayBetweenSteps: parseInt(delay)
        })
      });
      const data = await res.json();
      if (data.success) {
        addLog('system', 'AI Agent successfully launched in backend.');
      } else {
        addLog('error', `Failed to start AI Agent: ${data.error}`);
        setAgentState(prev => ({ ...prev, status: 'failed' }));
      }
    } catch (err) {
      addLog('error', `Agent execution launch error: ${err.message}`);
      setAgentState(prev => ({ ...prev, status: 'failed' }));
    } finally {
      stopLoading('agent_run');
    }
  };

  const handleStopAgent = async () => {
    startLoading('agent_stop');
    addLog('system', 'Sending cancellation command to Agent...');
    try {
      const res = await fetch('http://localhost:5000/api/agent/stop', {
        method: 'POST'
      });
      const data = await res.json();
      if (data.success) {
        addLog('system', 'Agent stop signal delivered.');
        setAgentState(prev => ({ ...prev, status: 'failed', thought: 'Agent task aborted by user.' }));
      }
    } catch (err) {
      addLog('error', `Stop command failed: ${err.message}`);
    } finally {
      stopLoading('agent_stop');
    }
  };

  // Canvas Mouse Coordinates Mapping
  const handleMouseMove = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = Math.round(((e.clientX - rect.left) / rect.width) * 1024);
    const y = Math.round(((e.clientY - rect.top) / rect.height) * 768);
    setHoverCoords({ x, y, clientX: e.clientX - rect.left, clientY: e.clientY - rect.top });
  };

  const handleMouseLeave = () => {
    setHoverCoords(null);
  };

  const handleCanvasClick = (e) => {
    if (!hoverCoords) return;
    const { x, y, clientX, clientY } = hoverCoords;
    setManualX(x.toString());
    setManualY(y.toString());
    
    // Trigger localized ripple
    setClickRipple({ x: clientX, y: clientY });
    setTimeout(() => setClickRipple(null), 600);
    
    addLog('system', `Selected viewport coordinate: (${x}, ${y})`);
  };

  const isAgentActive = agentState.status === 'running';

  return (
    <div className="dashboard-root">
      {/* Header */}
      <header className="app-header">
        <div className="logo-container">
          <Sparkles className="logo-icon" size={24} />
          <h1 className="logo-text">Antigravity <span>Agent</span></h1>
        </div>
        <div className="status-badge">
          <span className={`status-dot ${isAgentActive ? 'active' : browserStatus.isOpen ? 'loading' : 'inactive'}`}></span>
          <span className="status-label" style={{ color: '#fff', marginLeft: '0.25rem' }}>
            {isAgentActive ? 'Agent Active' : browserStatus.isOpen ? 'Browser Open' : 'Offline'}
          </span>
        </div>
      </header>

      {/* Main Grid */}
      <div className="app-container">
        
        {/* Left Column - Controls Sidebar */}
        <aside className="sidebar">
          
          {/* Section 1: LLM Engine Configuration */}
          <div className="glass-panel">
            <h2 className="section-title"><Settings size={18} /> LLM Engine Settings</h2>
            
            <div className="form-group">
              <label><Key size={14} style={{ marginRight: '4px' }} /> API Key Source</label>
              <input 
                type="password" 
                className="text-input" 
                placeholder="Enter LLM API Key..." 
                value={apiKey} 
                onChange={(e) => setApiKey(e.target.value)} 
              />
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.25rem', display: 'block' }}>
                🔑 Key is stored locally in your browser's LocalStorage.
              </span>
            </div>

            <div className="flex-row">
              <div className="form-group">
                <label><Cpu size={14} /> Provider</label>
                <select 
                  className="select-input"
                  value={provider} 
                  onChange={(e) => setProvider(e.target.value)}
                >
                  <option value="gemini">Gemini API</option>
                  <option value="openai">OpenAI API</option>
                </select>
              </div>

              <div className="form-group">
                <label>Model</label>
                <select 
                  className="select-input"
                  value={modelName} 
                  onChange={(e) => setModelName(e.target.value)}
                >
                  {provider === 'gemini' ? (
                    <>
                      <option value="gemini-2.5-flash">gemini-2.5-flash</option>
                      <option value="gemini-2.5-pro">gemini-2.5-pro</option>
                    </>
                  ) : (
                    <>
                      <option value="gpt-4o">gpt-4o</option>
                      <option value="gpt-4o-mini">gpt-4o-mini</option>
                    </>
                  )}
                </select>
              </div>
            </div>

            <div className="form-group">
              <label>Execution Delay (ms)</label>
              <select 
                className="select-input"
                value={delay} 
                onChange={(e) => setDelay(e.target.value)}
              >
                <option value="1000">1.0s (Fast)</option>
                <option value="2000">2.0s (Normal)</option>
                <option value="3500">3.5s (Slow-mo)</option>
                <option value="5000">5.0s (Thorough)</option>
              </select>
            </div>
          </div>

          {/* Section 2: AI Agent Control Center */}
          <div className="glass-panel">
            <h2 className="section-title"><Sparkles size={18} /> AI Automation Loop</h2>
            
            <div className="form-group">
              <label>Automation Goal / Prompt</label>
              <textarea 
                className="text-input" 
                rows="4" 
                style={{ resize: 'none' }}
                value={taskInput} 
                onChange={(e) => setTaskInput(e.target.value)}
                disabled={isAgentActive}
              />
            </div>

            {isAgentActive ? (
              <button 
                className="btn btn-danger"
                onClick={handleStopAgent}
                disabled={loading.agent_stop}
              >
                <Square size={16} /> Stop AI Agent Run
              </button>
            ) : (
              <button 
                className="btn btn-primary"
                onClick={handleStartAgent}
                disabled={loading.agent_run || !browserStatus.isOpen}
              >
                <Play size={16} /> Start AI Automation Agent
              </button>
            )}
            
            {!browserStatus.isOpen && (
              <span style={{ fontSize: '0.75rem', color: '#f59e0b', marginTop: '0.5rem', display: 'block', textAlign: 'center' }}>
                ⚠️ You must launch the browser environment first.
              </span>
            )}
          </div>

          {/* Section 3: Manual Browser Sandbox */}
          <div className="glass-panel">
            <h2 className="section-title"><Chrome size={18} /> Browser Sandbox</h2>
            
            <div className="sandbox-grid" style={{ marginBottom: '1rem' }}>
              <button 
                className="btn btn-secondary sandbox-btn" 
                onClick={() => handleOpenBrowser(false)}
                disabled={browserStatus.isOpen || loading.open_headless}
              >
                Launch Headless
              </button>
              <button 
                className="btn btn-secondary sandbox-btn" 
                onClick={() => handleOpenBrowser(true)}
                disabled={browserStatus.isOpen || loading.open_headed}
              >
                Launch Headed
              </button>
            </div>

            <button 
              className="btn btn-danger btn-secondary" 
              style={{ marginBottom: '1.25rem', padding: '0.5rem' }}
              onClick={handleCloseBrowser}
              disabled={!browserStatus.isOpen || loading.close}
            >
              Close Browser Engine
            </button>

            <div className="form-group">
              <label><Globe size={14} /> Navigate URL</label>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <input 
                  type="text" 
                  className="text-input" 
                  value={targetUrl} 
                  onChange={(e) => setTargetUrl(e.target.value)}
                  placeholder="https://..."
                />
                <button 
                  className="btn btn-primary" 
                  style={{ width: 'auto', padding: '0.75rem 1rem' }}
                  onClick={handleNavigate}
                  disabled={!browserStatus.isOpen || loading.navigate}
                >
                  Go
                </button>
              </div>
            </div>

            <div className="form-group">
              <label><MousePointerClick size={14} /> Screen Click Coordinates</label>
              <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem' }}>
                <input 
                  type="number" 
                  className="text-input" 
                  value={manualX} 
                  onChange={(e) => setManualX(e.target.value)} 
                  placeholder="X (px)"
                />
                <input 
                  type="number" 
                  className="text-input" 
                  value={manualY} 
                  onChange={(e) => setManualY(e.target.value)} 
                  placeholder="Y (px)"
                />
              </div>
              <div className="sandbox-grid">
                <button 
                  className="btn btn-secondary sandbox-btn"
                  onClick={() => handleManualAction('click_on_screen', { x: parseInt(manualX), y: parseInt(manualY) })}
                  disabled={!browserStatus.isOpen || !manualX || !manualY || loading.click_on_screen}
                >
                  Single Click
                </button>
                <button 
                  className="btn btn-secondary sandbox-btn"
                  onClick={() => handleManualAction('double_click', { x: parseInt(manualX), y: parseInt(manualY) })}
                  disabled={!browserStatus.isOpen || !manualX || !manualY || loading.double_click}
                >
                  Double Click
                </button>
              </div>
              <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '0.25rem', display: 'block' }}>
                💡 Tip: Click anywhere on the screenshot to capture coordinates.
              </span>
            </div>

            <div className="form-group">
              <label><Keyboard size={14} /> Keyboard Input</label>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <input 
                  type="text" 
                  className="text-input" 
                  value={manualKeys} 
                  onChange={(e) => setManualKeys(e.target.value)} 
                  placeholder="Keys or text (e.g. Enter, Hello)"
                />
                <button 
                  className="btn btn-secondary" 
                  style={{ width: 'auto' }}
                  onClick={() => handleManualAction('send_keys', { keys: manualKeys })}
                  disabled={!browserStatus.isOpen || !manualKeys || loading.send_keys}
                >
                  Send
                </button>
              </div>
            </div>

            <div className="form-group" style={{ marginBottom: 0 }}>
              <label><ChevronsUpDown size={14} /> Page Scroll</label>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <select 
                  className="select-input" 
                  style={{ flex: 1 }}
                  value={scrollDir} 
                  onChange={(e) => setScrollDir(e.target.value)}
                >
                  <option value="down">Scroll Down</option>
                  <option value="up">Scroll Up</option>
                </select>
                <input 
                  type="number" 
                  className="text-input" 
                  style={{ width: '80px' }}
                  value={scrollAmount} 
                  onChange={(e) => setScrollAmount(e.target.value)}
                  placeholder="px"
                />
                <button 
                  className="btn btn-secondary" 
                  style={{ width: 'auto' }}
                  onClick={() => handleManualAction('scroll', { direction: scrollDir, amount: parseInt(scrollAmount) })}
                  disabled={!browserStatus.isOpen || loading.scroll}
                >
                  Scroll
                </button>
              </div>
            </div>

          </div>

        </aside>

        {/* Right Column - Main Viewport & Logs */}
        <main className="main-content">
          
          {/* Browser View Panel */}
          <div className="glass-panel browser-panel" style={{ padding: 0 }}>
            <div className="browser-header">
              <div className="browser-dots">
                <span className="browser-dot"></span>
                <span className="browser-dot"></span>
                <span className="browser-dot"></span>
              </div>
              <div className="browser-address-bar">
                <Globe size={14} />
                <span>{browserStatus.isOpen ? (browserStatus.url || 'Blank Page') : 'Browser Engine Stopped'}</span>
              </div>
            </div>
            
            <div className="browser-viewport-container">
              {browserStatus.isOpen && browserStatus.latestScreenshot ? (
                <div 
                  className="browser-image-wrapper"
                  onMouseMove={handleMouseMove}
                  onMouseLeave={handleMouseLeave}
                  onClick={handleCanvasClick}
                >
                  <img 
                    src={`data:image/png;base64,${browserStatus.latestScreenshot}`} 
                    alt="Playwright Browser Live Capture" 
                    className="browser-screenshot"
                  />
                  
                  {/* Tooltip on Coordinate Hover */}
                  {hoverCoords && (
                    <div 
                      className="coordinate-tooltip"
                      style={{ left: hoverCoords.clientX, top: hoverCoords.clientY }}
                    >
                      X: {hoverCoords.x}px | Y: {hoverCoords.y}px
                    </div>
                  )}

                  {/* Manual Click Visual Indicator */}
                  {clickRipple && (
                    <div 
                      className="click-indicator"
                      style={{ left: clickRipple.x, top: clickRipple.y }}
                    />
                  )}
                  
                  {/* Active Agent Target Indicator */}
                  {isAgentActive && agentState.action === 'click_on_screen' && agentState.args.x && agentState.args.y && (
                    <div 
                      className="click-indicator" 
                      style={{ 
                        left: `${(agentState.args.x / 1024) * 100}%`, 
                        top: `${(agentState.args.y / 768) * 100}%`,
                        backgroundColor: 'rgba(99, 102, 241, 0.8)',
                        borderColor: '#06b6d4',
                        boxShadow: '0 0 15px #06b6d4',
                        width: '30px',
                        height: '30px',
                        animation: 'click-ripple 1s infinite'
                      }}
                    />
                  )}
                </div>
              ) : (
                <div className="empty-viewport">
                  <Chrome className="empty-viewport-icon" size={60} />
                  <div>
                    <h3>No Active Viewport Connection</h3>
                    <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginTop: '0.25rem' }}>
                      Launch the browser engine and navigate to a URL to load the live screenshot panel.
                    </p>
                  </div>
                </div>
              )}

              {/* Agent Thought Overlay */}
              {isAgentActive && agentState.thought && (
                <div className="agent-thought-overlay">
                  <div className="agent-brain-icon">
                    <Sparkles size={20} />
                  </div>
                  <div className="agent-thought-text">
                    <div className="agent-thought-title">Agent Thinking (Step {agentState.step})</div>
                    <div className="agent-thought-body">{agentState.thought}</div>
                  </div>
                </div>
              )}
              
              {agentState.status === 'completed' && (
                <div className="agent-thought-overlay" style={{ background: 'linear-gradient(to top, rgba(16, 185, 129, 0.95) 70%, rgba(0,0,0,0))' }}>
                  <div className="agent-brain-icon" style={{ background: 'rgba(255,255,255,0.1)', borderColor: 'white', color: 'white' }}>
                    <CheckCircle size={20} />
                  </div>
                  <div className="agent-thought-text">
                    <div className="agent-thought-title" style={{ color: 'white' }}>Task Completed!</div>
                    <div className="agent-thought-body" style={{ color: 'white' }}>{agentState.thought || 'The agent completed the automation sequence successfully.'}</div>
                  </div>
                </div>
              )}

              {agentState.status === 'failed' && (
                <div className="agent-thought-overlay" style={{ background: 'linear-gradient(to top, rgba(239, 68, 68, 0.95) 70%, rgba(0,0,0,0))' }}>
                  <div className="agent-brain-icon" style={{ background: 'rgba(255,255,255,0.1)', borderColor: 'white', color: 'white' }}>
                    <AlertCircle size={20} />
                  </div>
                  <div className="agent-thought-text">
                    <div className="agent-thought-title" style={{ color: 'white' }}>Task Interrupted / Failed</div>
                    <div className="agent-thought-body" style={{ color: 'white' }}>{agentState.thought || 'Execution error encountered during task execution.'}</div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Terminal Console Logs */}
          <div className="glass-panel terminal-panel">
            <div className="terminal-header">
              <span className="terminal-title"><Terminal size={14} style={{ marginRight: '6px', verticalAlign: 'middle' }} /> Execution Logs Console</span>
              <div className="terminal-controls">
                <span className="terminal-control"></span>
                <span className="terminal-control"></span>
                <span className="terminal-control"></span>
              </div>
            </div>
            <div className="terminal-console" ref={consoleRef}>
              {logs.length === 0 ? (
                <div className="log-line system">[System] Listening for execution signals... Ready.</div>
              ) : (
                logs.map(log => (
                  <div key={log.id} className={`log-line ${log.type}`}>
                    [{log.timestamp}] [{log.type.toUpperCase()}] {log.text}
                  </div>
                ))
              )}
            </div>
          </div>

        </main>

      </div>
    </div>
  );
}
