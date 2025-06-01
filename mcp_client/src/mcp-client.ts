// src/mcp-client.ts
// Simplified MCP Client compatible with current SDK

import express from 'express';
import cors from 'cors';
import { spawn, ChildProcess } from 'child_process';
import path from 'path';

interface MemoryBlock {
  content: string;
  timestamp?: string;
  wordCount?: number;
  formatVersion?: string;
}

interface BrowserRequest {
  blocks: MemoryBlock[];
  metadata?: {
    url?: string;
    title?: string;
    userAgent?: string;
  };
}

class MCPMemoryClient {
  private app: express.Application;
  private port: number;
  private memoryServerProcess: ChildProcess | null = null;
  private memoryServerPath: string;

  constructor(port = 3001) {
    this.port = port;
    this.app = express();
    this.memoryServerPath = path.resolve(__dirname, '../../mcp-servers/memory-server/build/index.js');
    this.setupMiddleware();
    this.setupRoutes();
  }

  private setupMiddleware() {
    this.app.use(cors({
      origin: '*',
      methods: ['GET', 'POST', 'PUT', 'DELETE'],
      allowedHeaders: ['Content-Type', 'Authorization']
    }));
    
    this.app.use(express.json({ limit: '10mb' }));
    this.app.use(express.static('public'));
  }

  private async startMemoryServer() {
    console.log('🚀 Starting MCP Memory Server...');
    
    this.memoryServerProcess = spawn('node', [this.memoryServerPath], {
      cwd: path.dirname(this.memoryServerPath),
      stdio: ['pipe', 'pipe', 'pipe']
    });

    // Handle server process events
    this.memoryServerProcess.on('error', (error) => {
      console.error('❌ Memory server process error:', error);
    });

    this.memoryServerProcess.on('exit', (code, signal) => {
      console.log(`⚠️ Memory server exited with code ${code}, signal ${signal}`);
      this.memoryServerProcess = null;
    });

    // Log server output
    this.memoryServerProcess.stdout?.on('data', (data) => {
      const output = data.toString().trim();
      if (output) {
        console.log(`📝 Memory Server: ${output}`);
      }
    });

    this.memoryServerProcess.stderr?.on('data', (data) => {
      console.error(`🔴 Memory Server Error: ${data.toString()}`);
    });

    // Give the server a moment to start
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    console.log('✅ Memory server started');
  }

  private async sendToMemoryServer(message: any): Promise<any> {
    return new Promise((resolve, reject) => {
      if (!this.memoryServerProcess || !this.memoryServerProcess.stdin) {
        reject(new Error('Memory server not running'));
        return;
      }

      const jsonMessage = JSON.stringify(message) + '\n';
      
      // Set up one-time response listener
      const responseHandler = (data: Buffer) => {
        try {
          const response = JSON.parse(data.toString().trim());
          this.memoryServerProcess?.stdout?.off('data', responseHandler);
          resolve(response);
        } catch (error) {
          // Might be partial data, keep listening
        }
      };

      this.memoryServerProcess.stdout?.on('data', responseHandler);
      
      // Send the message
      this.memoryServerProcess.stdin.write(jsonMessage);
      
      // Timeout after 5 seconds
      setTimeout(() => {
        this.memoryServerProcess?.stdout?.off('data', responseHandler);
        reject(new Error('Memory server request timeout'));
      }, 5000);
    });
  }

  private setupRoutes() {
    // Health check endpoint (backwards compatible with browser extension)
    this.app.get('/health', async (req, res) => {
      try {
        let memoryCount = 0;
        
        if (this.memoryServerProcess) {
          try {
            const statsResponse = await this.sendToMemoryServer({
              jsonrpc: '2.0',
              id: Date.now(),
              method: 'tools/call',
              params: {
                name: 'get_stats',
                arguments: {}
              }
            });
            
            if (statsResponse.result?.content?.[0]?.text) {
              const stats = JSON.parse(statsResponse.result.content[0].text);
              memoryCount = stats.totalMemories || 0;
            }
          } catch (error) {
            console.warn('Could not get memory count:', error);
          }
        }
        
        res.json({ 
          status: 'healthy', 
          memoryCount: memoryCount,
          timestamp: new Date().toISOString(),
          mcpClientActive: true,
          memoryServerRunning: !!this.memoryServerProcess,
          serverPath: this.memoryServerPath
        });
      } catch (error) {
        res.status(500).json({
          status: 'error',
          error: 'Failed to get health status'
        });
      }
    });

    // Browser extension endpoint (backwards compatible)
    this.app.post('/mcp/store', async (req, res) => {
      try {
        const { blocks, metadata = {} }: BrowserRequest = req.body;
        
        if (!blocks || !Array.isArray(blocks)) {
          return res.status(400).json({ error: 'Invalid blocks data' });
        }

        console.log(`📥 Received ${blocks.length} blocks from browser extension`);

        if (!this.memoryServerProcess) {
          return res.status(500).json({ 
            error: 'Memory server not running' 
          });
        }

        // Send to memory server via JSON-RPC
        try {
          const storeResponse = await this.sendToMemoryServer({
            jsonrpc: '2.0',
            id: Date.now(),
            method: 'tools/call',
            params: {
              name: 'store_memory',
              arguments: {
                blocks,
                metadata
              }
            }
          });

          console.log(`✅ Memory server response:`, storeResponse);
          
          // Get total count
          let totalCount = 'unknown';
          try {
            const statsResponse = await this.sendToMemoryServer({
              jsonrpc: '2.0',
              id: Date.now(),
              method: 'tools/call',
              params: {
                name: 'get_stats',
                arguments: {}
              }
            });
            
            if (statsResponse.result?.content?.[0]?.text) {
              const stats = JSON.parse(statsResponse.result.content[0].text);
              totalCount = stats.totalMemories;
            }
          } catch (error) {
            console.warn('Could not get total count:', error);
          }

          console.log(`✅ Successfully stored ${blocks.length} blocks via MCP`);
          res.json({
            success: true,
            stored: blocks.length,
            totalMemories: totalCount,
            mcpServer: 'memory-storage',
            method: 'mcp-protocol',
            response: storeResponse
          });
          
        } catch (error) {
          console.error('❌ Failed to communicate with memory server:', error);
          res.status(500).json({ 
            error: 'Failed to store memory blocks',
            details: error instanceof Error ? error.message : 'Unknown error'
          });
        }
        
      } catch (error) {
        console.error('❌ Error in /mcp/store endpoint:', error);
        res.status(500).json({ error: 'Failed to store memory blocks' });
      }
    });

    // Test memory server connection
    this.app.get('/mcp/test', async (req, res) => {
      try {
        if (!this.memoryServerProcess) {
          return res.json({
            connected: false,
            error: 'Memory server not running'
          });
        }

        const toolsResponse = await this.sendToMemoryServer({
          jsonrpc: '2.0',
          id: Date.now(),
          method: 'tools/list',
          params: {}
        });

        res.json({
          connected: true,
          tools: toolsResponse.result?.tools?.length || 0,
          response: toolsResponse
        });
        
      } catch (error) {
        res.json({
          connected: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    });

    // Query memories
    this.app.get('/mcp/memories', async (req, res) => {
      try {
        const { search, limit = 50, tags, since } = req.query;
        
        if (!this.memoryServerProcess) {
          return res.status(500).json({ 
            error: 'Memory server not running',
            memories: [],
            total: 0
          });
        }

        const searchResponse = await this.sendToMemoryServer({
          jsonrpc: '2.0',
          id: Date.now(),
          method: 'tools/call',
          params: {
            name: 'search_memories',
            arguments: {
              query: search as string,
              limit: parseInt(limit as string),
              tags: tags as string,
              since: since as string
            }
          }
        });

        if (searchResponse.result?.content?.[0]?.text) {
          const searchResult = JSON.parse(searchResponse.result.content[0].text);
          res.json({
            success: true,
            serverUsed: 'memory-storage',
            ...searchResult
          });
        } else {
          res.json({
            success: false,
            error: 'Invalid response format',
            memories: [],
            total: 0
          });
        }
        
      } catch (error) {
        console.error('❌ Error searching memories:', error);
        res.status(500).json({ 
          error: 'Failed to search memories',
          details: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    });

    // Web interface
    this.app.get('/', (req, res) => {
      res.send(this.generateWebInterface());
    });
  }

  private generateWebInterface(): string {
    return `
<!DOCTYPE html>
<html>
<head>
    <title>MCP Memory Client</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 20px; background: #f5f5f5; }
        .container { max-width: 1200px; margin: 0 auto; background: white; padding: 20px; border-radius: 8px; }
        .header { border-bottom: 2px solid #007acc; padding-bottom: 10px; margin-bottom: 20px; }
        .mcp-badge { background: #28a745; color: white; padding: 4px 8px; border-radius: 4px; font-size: 12px; }
        .server-list { background: #e8f4fd; padding: 15px; border-radius: 5px; margin: 20px 0; }
        .server-item { background: white; padding: 10px; margin: 5px 0; border-radius: 4px; border-left: 4px solid #28a745; }
        .stats { display: flex; gap: 20px; margin: 20px 0; }
        .stat { background: #e8f4fd; padding: 15px; border-radius: 5px; text-align: center; flex: 1; }
        .stat-number { font-size: 24px; font-weight: bold; color: #007acc; }
        .code { background: #f8f9fa; padding: 15px; border-radius: 5px; font-family: monospace; margin: 10px 0; }
        button { background: #007acc; color: white; border: none; padding: 8px 16px; border-radius: 4px; cursor: pointer; margin: 5px; }
        button:hover { background: #005fa3; }
        .status { padding: 10px; border-radius: 4px; margin: 10px 0; }
        .success { background: #d4edda; }
        .error { background: #f8d7da; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>🧠 MCP Memory Client <span class="mcp-badge">Simplified Bridge</span></h1>
            <p>Memory Collection Protocol - Simplified Client for Browser Extension</p>
        </div>
        
        <div class="server-list">
            <h3>📡 MCP Memory Server</h3>
            <div class="server-item">
                <strong>memory-storage</strong> - <span id="serverStatus">Checking...</span>
            </div>
        </div>
        
        <div class="stats">
            <div class="stat">
                <div class="stat-number" id="memoryCount">Loading...</div>
                <div class="stat-label">Total Memories</div>
            </div>
            <div class="stat">
                <div class="stat-number">Port ${this.port}</div>
                <div class="stat-label">HTTP Server</div>
            </div>
            <div class="stat">
                <div class="stat-number" id="toolCount">-</div>
                <div class="stat-label">Available Tools</div>
            </div>
        </div>
        
        <h3>🔧 Architecture</h3>
        <div class="code">
Browser Extension (HTTP) → MCP Client (this) → Memory Server (JSON-RPC)<br>
&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;↓<br>
&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;File Storage
        </div>
        
        <h3>🧪 API Endpoints</h3>
        <div class="code">
GET /health - Health check and memory count<br>
POST /mcp/store - Store memories from browser extension<br>
GET /mcp/memories - Search stored memories<br>
GET /mcp/test - Test memory server connection
        </div>
        
        <div style="text-align: center; margin: 20px;">
            <button onclick="location.reload()">Refresh Status</button>
            <button onclick="testConnection()">Test Connection</button>
            <button onclick="loadStats()">Update Stats</button>
        </div>
        
        <div id="status"></div>
    </div>
    
    <script>
        async function testConnection() {
            try {
                const response = await fetch('/mcp/test');
                const data = await response.json();
                document.getElementById('status').innerHTML = 
                  '<div class="status ' + (data.connected ? 'success' : 'error') + '">' +
                  '<strong>Connection Test:</strong><br>' + 
                  JSON.stringify(data, null, 2) + '</div>';
                
                document.getElementById('serverStatus').textContent = 
                  data.connected ? '✅ Connected' : '❌ Disconnected';
                
                if (data.tools) {
                  document.getElementById('toolCount').textContent = data.tools;
                }
            } catch (error) {
                document.getElementById('status').innerHTML = 
                  '<div class="status error">Error: ' + error.message + '</div>';
            }
        }
        
        async function loadStats() {
            try {
                const response = await fetch('/health');
                const data = await response.json();
                document.getElementById('memoryCount').textContent = data.memoryCount || 0;
                document.getElementById('serverStatus').textContent = 
                  data.memoryServerRunning ? '✅ Running' : '❌ Stopped';
            } catch (error) {
                console.error('Failed to load stats:', error);
                document.getElementById('memoryCount').textContent = 'Error';
            }
        }
        
        // Auto-refresh stats
        setInterval(loadStats, 5000);
        
        // Load initial stats
        loadStats();
        testConnection();
    </script>
</body>
</html>
    `;
  }

  async start() {
    try {
      // Start the memory server first
      await this.startMemoryServer();
      
      // Start the HTTP server for browser extension
      this.app.listen(this.port, () => {
        console.log(`🚀 MCP Memory Client running on http://localhost:${this.port}`);
        console.log(`📡 Memory server started as subprocess`);
        console.log(`🌐 Web interface: http://localhost:${this.port}`);
        console.log(`🔌 Browser extension endpoint: http://localhost:${this.port}/mcp/store`);
      });
      
    } catch (error) {
      console.error('❌ Failed to start MCP client:', error);
      process.exit(1);
    }
  }

  async stop() {
    console.log('🛑 Shutting down MCP client...');
    
    if (this.memoryServerProcess) {
      this.memoryServerProcess.kill();
      console.log('⚡ Memory server process terminated');
    }
  }
}

// Start the MCP client
async function main() {
  console.log('🚀 Starting Simple MCP Memory Client...');
  const client = new MCPMemoryClient();
  
  await client.start();
  
  // Graceful shutdown
  process.on('SIGINT', async () => {
    await client.stop();
    process.exit(0);
  });
  
  process.on('SIGTERM', async () => {
    await client.stop();
    process.exit(0);
  });
}

main().catch(error => {
  console.error('❌ Failed to start MCP client:', error);
  process.exit(1);
});

export default MCPMemoryClient;
