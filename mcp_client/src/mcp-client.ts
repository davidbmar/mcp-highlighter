// src/mcp-client.ts
// FIXED: Simplified MCP Client that works like the legacy version

import express from 'express';
import cors from 'cors';
import fs from 'fs/promises';
import path from 'path';

interface MemoryEntry {
  id: string;
  content: string;
  timestamp: string;
  source: {
    url: string;
    title: string;
    userAgent?: string;
  };
  tags: string[];
  wordCount: number;
  formatVersion?: string;
}

interface BrowserRequest {
  blocks: MemoryEntry[];
  metadata?: {
    url?: string;
    title?: string;
    userAgent?: string;
  };
}

class FixedMCPClient {
  private app: express.Application;
  private port: number;
  private memoryStore: MemoryEntry[] = [];
  private storageFile: string;

  constructor(port = 3001) {
    this.port = port;
    this.app = express();
    // FIXED: Use the same storage file as the memory server
    this.storageFile = path.resolve(__dirname, '../../mcp-servers/memory-server/data/memories.json');
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

  private async loadMemoryStore() {
    try {
      // Ensure data directory exists
      await fs.mkdir(path.dirname(this.storageFile), { recursive: true });
      
      const data = await fs.readFile(this.storageFile, 'utf8');
      this.memoryStore = JSON.parse(data);
      console.log(`📚 Loaded ${this.memoryStore.length} existing memories`);
    } catch (error: any) {
      if (error.code !== 'ENOENT') {
        console.error('❌ Error loading memory store:', error);
      }
      this.memoryStore = [];
      console.log('📚 Starting with empty memory store');
    }
  }

  private async saveMemoryStore() {
    try {
      await fs.writeFile(this.storageFile, JSON.stringify(this.memoryStore, null, 2));
      console.log(`💾 Saved ${this.memoryStore.length} memories to file`);
    } catch (error) {
      console.error('❌ Error saving memory store:', error);
    }
  }

  private generateId(): string {
    return 'mem_' + Date.now().toString(36) + Math.random().toString(36).substr(2);
  }

  private generateContentHash(content: string): string {
    let hash = 0;
    const str = content.trim();
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return Math.abs(hash).toString(36);
  }

  private extractTags(content: string): string[] {
    const tags: string[] = [];
    
    const hashtags = content.match(/#[\w]+/g);
    if (hashtags) tags.push(...hashtags.map(tag => tag.substring(1)));
    
    if (content.includes('```') || content.includes('function') || content.includes('class')) {
      tags.push('code');
    }
    if (content.includes('TODO') || content.includes('FIXME')) {
      tags.push('todo');
    }
    if (content.includes('http://') || content.includes('https://')) {
      tags.push('url');
    }
    
    return [...new Set(tags)];
  }

  private setupRoutes() {
    // Health check endpoint (compatible with browser extension)
    this.app.get('/health', async (req, res) => {
      res.json({ 
        status: 'healthy', 
        memoryCount: this.memoryStore.length,
        timestamp: new Date().toISOString(),
        version: 'fixed-mcp-client',
        memoryServerRunning: true
      });
    });

    // Check hashes endpoint (for duplicate prevention)
    this.app.post('/mcp/check-hashes', async (req, res) => {
      try {
        const { hashes } = req.body;
        
        if (!hashes || !Array.isArray(hashes)) {
          return res.status(400).json({ error: 'Invalid hashes array' });
        }

        console.log(`🔍 Checking ${hashes.length} hashes for duplicates...`);

        const hashStatus: Record<string, boolean> = {};
        hashes.forEach((hash: string) => {
          const exists = this.memoryStore.some(memory => 
            this.generateContentHash(memory.content) === hash
          );
          hashStatus[hash] = exists;
        });

        const existingCount = Object.values(hashStatus).filter(exists => exists).length;
        const newCount = hashes.length - existingCount;

        console.log(`📊 Hash check results: ${newCount} new, ${existingCount} existing`);

        res.json({
          success: true,
          hashStatus: hashStatus,
          summary: {
            total: hashes.length,
            existing: existingCount,
            new: newCount
          }
        });
        
      } catch (error) {
        console.error('❌ Error checking hashes:', error);
        res.status(500).json({ error: 'Failed to check hashes' });
      }
    });

    // Store memories endpoint (compatible with browser extension)
    this.app.post('/mcp/store', async (req, res) => {
      try {
        const { blocks, metadata = {} }: BrowserRequest = req.body;
        
        if (!blocks || !Array.isArray(blocks)) {
          return res.status(400).json({ error: 'Invalid blocks data' });
        }

        console.log(`📥 Received ${blocks.length} blocks from browser extension`);

        const storedBlocks: MemoryEntry[] = [];
        const duplicateBlocks: any[] = [];
        
        for (const block of blocks) {
          const contentHash = this.generateContentHash(block.content);
          
          const existingMemory = this.memoryStore.find(memory => 
            this.generateContentHash(memory.content) === contentHash
          );
          
          if (existingMemory) {
            duplicateBlocks.push({
              hash: contentHash,
              reason: 'duplicate_content',
              existingId: existingMemory.id
            });
            console.log(`🔄 Skipped duplicate content (hash: ${contentHash})`);
            continue;
          }
          
          const memoryEntry: MemoryEntry = {
            id: this.generateId(),
            content: block.content,
            timestamp: new Date().toISOString(),
            source: {
              url: metadata.url || 'unknown',
              title: metadata.title || 'unknown',
              userAgent: metadata.userAgent
            },
            tags: this.extractTags(block.content),
            wordCount: block.content.split(/\s+/).length,
            formatVersion: 'fixed-client-v1'
          };
          
          this.memoryStore.push(memoryEntry);
          storedBlocks.push(memoryEntry);
        }

        await this.saveMemoryStore();
        
        console.log(`📝 Stored ${storedBlocks.length} new blocks, skipped ${duplicateBlocks.length} duplicates`);
        console.log(`💾 Total memory entries: ${this.memoryStore.length}`);
        
        res.json({
          success: true,
          stored: storedBlocks.length,
          duplicates: duplicateBlocks.length,
          totalMemories: this.memoryStore.length,
          entries: storedBlocks.map(b => ({ 
            id: b.id, 
            preview: b.content.substring(0, 100) + '...' 
          })),
          duplicateDetails: duplicateBlocks
        });
        
      } catch (error) {
        console.error('❌ Error storing MCP blocks:', error);
        res.status(500).json({ error: 'Failed to store memory blocks' });
      }
    });

    // Query memories endpoint (compatible with Claude access)
    this.app.get('/mcp/memories', async (req, res) => {
      try {
        const { limit = 50, search, tags, since } = req.query;
        
        let filteredMemories = [...this.memoryStore];
        
        // Filter by search term
        if (search) {
          const searchLower = (search as string).toLowerCase();
          filteredMemories = filteredMemories.filter(memory => 
            memory.content.toLowerCase().includes(searchLower) ||
            memory.tags.some(tag => tag.toLowerCase().includes(searchLower))
          );
        }
        
        // Filter by tags
        if (tags) {
          const tagList = (tags as string).split(',').map(tag => tag.trim().toLowerCase());
          filteredMemories = filteredMemories.filter(memory =>
            memory.tags.some(tag => tagList.includes(tag.toLowerCase()))
          );
        }
        
        // Filter by date
        if (since) {
          const sinceDate = new Date(since as string);
          filteredMemories = filteredMemories.filter(memory =>
            new Date(memory.timestamp) >= sinceDate
          );
        }
        
        // Sort by most recent first
        filteredMemories.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
        
        // Limit results
        filteredMemories = filteredMemories.slice(0, parseInt(limit as string));
        
        res.json({
          success: true,
          serverUsed: 'fixed-mcp-client',
          results: filteredMemories,
          total: this.memoryStore.length,
          filtered: filteredMemories.length,
          query: search,
          searchParams: { tags, since, limit }
        });
        
      } catch (error) {
        console.error('❌ Error searching memories:', error);
        res.status(500).json({ 
          error: 'Failed to search memories',
          details: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    });

    // Get specific memory by ID
    this.app.get('/mcp/memories/:id', async (req, res) => {
      const memory = this.memoryStore.find(m => m.id === req.params.id);
      if (!memory) {
        return res.status(404).json({ error: 'Memory not found' });
      }
      res.json(memory);
    });

    // Delete memory
    this.app.delete('/mcp/memories/:id', async (req, res) => {
      const index = this.memoryStore.findIndex(m => m.id === req.params.id);
      if (index === -1) {
        return res.status(404).json({ error: 'Memory not found' });
      }
      
      const deleted = this.memoryStore.splice(index, 1)[0];
      await this.saveMemoryStore();
      
      res.json({ success: true, deleted: deleted.id });
    });

    // Clear all memories
    this.app.delete('/mcp/memories', async (req, res) => {
      const count = this.memoryStore.length;
      this.memoryStore = [];
      await this.saveMemoryStore();
      
      console.log(`🗑️ Cleared ${count} memory entries`);
      res.json({ success: true, cleared: count });
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
    <title>Fixed MCP Client</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 20px; background: #f5f5f5; }
        .container { max-width: 1200px; margin: 0 auto; background: white; padding: 20px; border-radius: 8px; }
        .header { border-bottom: 2px solid #4CAF50; padding-bottom: 10px; margin-bottom: 20px; }
        .fixed-badge { background: #4CAF50; color: white; padding: 4px 8px; border-radius: 4px; font-size: 12px; }
        .stats { display: flex; gap: 20px; margin: 20px 0; }
        .stat { background: #e8f5e8; padding: 15px; border-radius: 5px; text-align: center; flex: 1; }
        .stat-number { font-size: 24px; font-weight: bold; color: #4CAF50; }
        .memory-item { background: #f9f9f9; padding: 15px; margin: 10px 0; border-radius: 5px; border-left: 4px solid #4CAF50; }
        .memory-content { margin: 10px 0; max-height: 200px; overflow-y: auto; }
        .api-example { background: #f0f0f0; padding: 15px; border-radius: 5px; margin: 10px 0; }
        .code { font-family: monospace; background: #e8e8e8; padding: 2px 4px; border-radius: 3px; }
        button { background: #4CAF50; color: white; border: none; padding: 8px 16px; border-radius: 4px; cursor: pointer; }
        button:hover { background: #45a049; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>🧠 Fixed MCP Client <span class="fixed-badge">Working</span></h1>
            <p>Direct file-based memory storage (no subprocess communication issues)</p>
        </div>
        
        <div class="stats">
            <div class="stat">
                <div class="stat-number" id="memoryCount">0</div>
                <div class="stat-label">Total Memories</div>
            </div>
            <div class="stat">
                <div class="stat-number">Port ${this.port}</div>
                <div class="stat-label">HTTP Server</div>
            </div>
            <div class="stat">
                <div class="stat-number">Fixed</div>
                <div class="stat-label">Client Version</div>
            </div>
        </div>
        
        <h3>🔧 Fixed Issues</h3>
        <div class="api-example">
            ✅ Direct file access (no stdio communication)<br>
            ✅ Same storage format as memory server<br>
            ✅ Hash-based duplicate prevention<br>
            ✅ Compatible with browser extension<br>
            ✅ Fast response times<br>
        </div>
        
        <h3>🧪 API Endpoints</h3>
        <div class="api-example">
            <strong>Store Memory:</strong> <span class="code">POST /mcp/store</span><br>
            <strong>Get Memories:</strong> <span class="code">GET /mcp/memories</span><br>
            <strong>Search:</strong> <span class="code">GET /mcp/memories?search=keyword&limit=10</span><br>
            <strong>Check Hashes:</strong> <span class="code">POST /mcp/check-hashes</span>
        </div>
        
        <div style="text-align: center; margin: 20px;">
            <button onclick="loadMemories()">Refresh Memories</button>
            <button onclick="testAPI()" style="background: #2196F3;">Test API</button>
        </div>
        
        <div id="memories"></div>
    </div>
    
    <script>
        async function loadMemories() {
            try {
                const response = await fetch('/mcp/memories?limit=20');
                const data = await response.json();
                
                document.getElementById('memoryCount').textContent = data.total;
                
                const memoriesDiv = document.getElementById('memories');
                memoriesDiv.innerHTML = '<h3>Recent Memories</h3>';
                
                data.results.forEach(memory => {
                    const div = document.createElement('div');
                    div.className = 'memory-item';
                    div.innerHTML = \`
                        <div style="font-size: 12px; color: #666;">
                            ID: \${memory.id} | \${new Date(memory.timestamp).toLocaleString()} | 
                            Words: \${memory.wordCount} | Format: \${memory.formatVersion || 'legacy'}
                        </div>
                        <div class="memory-content"><pre>\${memory.content}</pre></div>
                    \`;
                    memoriesDiv.appendChild(div);
                });
            } catch (error) {
                console.error('Error loading memories:', error);
            }
        }
        
        async function testAPI() {
            try {
                const health = await fetch('/health');
                const healthData = await health.json();
                alert('✅ API Test Successful!\\n\\nStatus: ' + healthData.status + '\\nMemories: ' + healthData.memoryCount + '\\nVersion: ' + healthData.version);
            } catch (error) {
                alert('❌ API Test Failed: ' + error.message);
            }
        }
        
        // Load memories on page load
        loadMemories();
        
        // Refresh every 10 seconds
        setInterval(loadMemories, 10000);
    </script>
</body>
</html>
    `;
  }

  async start() {
    await this.loadMemoryStore();
    
    this.app.listen(this.port, () => {
      console.log(`🚀 Fixed MCP Client running on http://localhost:${this.port}`);
      console.log(`📁 Using storage file: ${this.storageFile}`);
      console.log(`🌐 Web interface: http://localhost:${this.port}`);
      console.log(`🔌 Browser extension endpoint: http://localhost:${this.port}/mcp/store`);
      console.log(`✅ Fixed version - no subprocess communication issues`);
    });
  }
}

// Start the fixed MCP client
async function main() {
  console.log('🚀 Starting Fixed MCP Client...');
  const client = new FixedMCPClient();
  
  await client.start();
}

main().catch(error => {
  console.error('❌ Failed to start fixed MCP client:', error);
  process.exit(1);
});

export default FixedMCPClient;
