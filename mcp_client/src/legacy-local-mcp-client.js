// local-mcp-client.js
// Simple local MCP client to receive and store memory blocks
// This simulates what will eventually be a proper MCP server

const express = require('express');
const cors = require('cors');
const fs = require('fs').promises;
const path = require('path');

class LocalMCPClient {
    constructor(port = 3001) {
        this.port = port;
        this.app = express();
        this.memoryStore = [];
        this.storageFile = path.join(__dirname, 'mcp-memory.json');
        
        this.setupMiddleware();
        this.setupRoutes();
        this.loadMemoryStore();
    }

    setupMiddleware() {
        // Enable CORS for browser extension
        this.app.use(cors({
            origin: '*', // Allow all origins for development
            methods: ['GET', 'POST', 'PUT', 'DELETE'],
            allowedHeaders: ['Content-Type', 'Authorization']
        }));
        
        this.app.use(express.json({ limit: '10mb' }));
        this.app.use(express.static('public')); // For serving a simple web interface
    }

    setupRoutes() {
        // Health check
        this.app.get('/health', (req, res) => {
            res.json({ 
                status: 'healthy', 
                memoryCount: this.memoryStore.length,
                timestamp: new Date().toISOString()
            });
        });

        // Check if hashes already exist (new endpoint)
        this.app.post('/mcp/check-hashes', (req, res) => {
            try {
                const { hashes } = req.body;
                
                if (!hashes || !Array.isArray(hashes)) {
                    return res.status(400).json({ error: 'Invalid hashes array' });
                }

                console.log(`🔍 Checking ${hashes.length} hashes for duplicates...`);

                const hashStatus = {};
                hashes.forEach(hash => {
                    // Check if any existing memory has this hash
                    const exists = this.memoryStore.some(memory => 
                        memory.contentHash === hash
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

        // Enhanced store endpoint with hash support
        this.app.post('/mcp/store', async (req, res) => {
            try {
                const { blocks, metadata = {} } = req.body;
                
                if (!blocks || !Array.isArray(blocks)) {
                    return res.status(400).json({ error: 'Invalid blocks data' });
                }

                const storedBlocks = [];
                const duplicateBlocks = [];
                
                for (const block of blocks) {
                    // Generate hash if not provided
                    const contentHash = block.hash || this.generateContentHash(block.content);
                    
                    // Check for duplicates
                    const existingMemory = this.memoryStore.find(memory => 
                        memory.contentHash === contentHash
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
                    
                    const memoryEntry = {
                        id: this.generateId(),
                        content: block.content,
                        contentHash: contentHash,
                        timestamp: new Date().toISOString(),
                        source: {
                            url: metadata.url || 'unknown',
                            title: metadata.title || 'unknown',
                            userAgent: req.headers['user-agent']
                        },
                        tags: this.extractTags(block.content),
                        wordCount: block.wordCount || block.content.split(' ').length,
                        formatVersion: block.formatVersion || 'v1'
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
                        hash: b.contentHash,
                        preview: b.content.substring(0, 100) + '...' 
                    })),
                    duplicateDetails: duplicateBlocks
                });
                
            } catch (error) {
                console.error('❌ Error storing MCP blocks:', error);
                res.status(500).json({ error: 'Failed to store memory blocks' });
            }
        });

        // Retrieve memories (for Claude to query later)
        this.app.get('/mcp/memories', (req, res) => {
            const { limit = 50, search, tags, since } = req.query;
            
            let filteredMemories = [...this.memoryStore];
            
            // Filter by search term
            if (search) {
                const searchLower = search.toLowerCase();
                filteredMemories = filteredMemories.filter(memory => 
                    memory.content.toLowerCase().includes(searchLower) ||
                    memory.tags.some(tag => tag.toLowerCase().includes(searchLower))
                );
            }
            
            // Filter by tags
            if (tags) {
                const tagList = tags.split(',').map(tag => tag.trim().toLowerCase());
                filteredMemories = filteredMemories.filter(memory =>
                    memory.tags.some(tag => tagList.includes(tag.toLowerCase()))
                );
            }
            
            // Filter by date
            if (since) {
                const sinceDate = new Date(since);
                filteredMemories = filteredMemories.filter(memory =>
                    new Date(memory.timestamp) >= sinceDate
                );
            }
            
            // Sort by most recent first
            filteredMemories.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
            
            // Limit results
            filteredMemories = filteredMemories.slice(0, parseInt(limit));
            
            res.json({
                memories: filteredMemories,
                total: this.memoryStore.length,
                filtered: filteredMemories.length
            });
        });

        // Get specific memory by ID
        this.app.get('/mcp/memories/:id', (req, res) => {
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

        // Clear all memories (for testing)
        this.app.delete('/mcp/memories', async (req, res) => {
            const count = this.memoryStore.length;
            this.memoryStore = [];
            await this.saveMemoryStore();
            
            console.log(`🗑️ Cleared ${count} memory entries`);
            res.json({ success: true, cleared: count });
        });

        // Enhanced web interface
        this.app.get('/', (req, res) => {
            res.send(this.generateWebInterface());
        });

        // Get hash statistics
        this.app.get('/mcp/hash-stats', (req, res) => {
            const hashCounts = {};
            this.memoryStore.forEach(memory => {
                const hash = memory.contentHash;
                hashCounts[hash] = (hashCounts[hash] || 0) + 1;
            });

            const duplicateHashes = Object.entries(hashCounts)
                .filter(([hash, count]) => count > 1)
                .map(([hash, count]) => ({ hash, count }));

            res.json({
                totalMemories: this.memoryStore.length,
                uniqueHashes: Object.keys(hashCounts).length,
                duplicateHashes: duplicateHashes,
                duplicateCount: duplicateHashes.length
            });
        });
    }

    generateId() {
        return Date.now().toString(36) + Math.random().toString(36).substr(2);
    }

    generateContentHash(content) {
        // Create a consistent hash of the content
        // Using a simple but effective hash function
        let hash = 0;
        const str = content.trim(); // Normalize whitespace
        for (let i = 0; i < str.length; i++) {
            const char = str.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash; // Convert to 32-bit integer
        }
        return Math.abs(hash).toString(36);
    }

    extractTags(content) {
        // Simple tag extraction - look for hashtags, code blocks, etc.
        const tags = [];
        
        // Extract hashtags
        const hashtags = content.match(/#[\w]+/g);
        if (hashtags) tags.push(...hashtags.map(tag => tag.substring(1)));
        
        // Detect content types
        if (content.includes('```') || content.includes('function') || content.includes('class')) {
            tags.push('code');
        }
        if (content.includes('TODO') || content.includes('FIXME')) {
            tags.push('todo');
        }
        if (content.includes('http://') || content.includes('https://')) {
            tags.push('url');
        }
        
        return [...new Set(tags)]; // Remove duplicates
    }

    async loadMemoryStore() {
        try {
            const data = await fs.readFile(this.storageFile, 'utf8');
            this.memoryStore = JSON.parse(data);
            console.log(`📚 Loaded ${this.memoryStore.length} existing memories`);
        } catch (error) {
            if (error.code !== 'ENOENT') {
                console.error('❌ Error loading memory store:', error);
            }
            this.memoryStore = [];
        }
    }

    async saveMemoryStore() {
        try {
            await fs.writeFile(this.storageFile, JSON.stringify(this.memoryStore, null, 2));
        } catch (error) {
            console.error('❌ Error saving memory store:', error);
        }
    }

    generateWebInterface() {
        return `
<!DOCTYPE html>
<html>
<head>
    <title>MCP Local Client</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 20px; background: #f5f5f5; }
        .container { max-width: 1200px; margin: 0 auto; background: white; padding: 20px; border-radius: 8px; }
        .header { border-bottom: 2px solid #007acc; padding-bottom: 10px; margin-bottom: 20px; }
        .stats { display: flex; gap: 20px; margin: 20px 0; }
        .stat { background: #e8f4fd; padding: 15px; border-radius: 5px; text-align: center; }
        .stat-number { font-size: 24px; font-weight: bold; color: #007acc; }
        .stat-label { font-size: 12px; color: #666; }
        .memory-item { background: #f9f9f9; padding: 15px; margin: 10px 0; border-radius: 5px; border-left: 4px solid #007acc; }
        .memory-content { margin: 10px 0; max-height: 200px; overflow-y: auto; }
        .memory-meta { font-size: 12px; color: #666; }
        .api-example { background: #f0f0f0; padding: 15px; border-radius: 5px; margin: 10px 0; }
        .code { font-family: monospace; background: #e8e8e8; padding: 2px 4px; border-radius: 3px; }
        button { background: #007acc; color: white; border: none; padding: 8px 16px; border-radius: 4px; cursor: pointer; }
        button:hover { background: #005fa3; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>🧠 MCP Local Client</h1>
            <p>Memory Collection Protocol - Local Development Server</p>
        </div>
        
        <div class="stats">
            <div class="stat">
                <div class="stat-number" id="memoryCount">0</div>
                <div class="stat-label">Total Memories</div>
            </div>
            <div class="stat">
                <div class="stat-number" id="serverStatus">Running</div>
                <div class="stat-label">Server Status</div>
            </div>
            <div class="stat">
                <div class="stat-number">Port ${this.port}</div>
                <div class="stat-label">Listening On</div>
            </div>
        </div>
        
        <h3>API Endpoints</h3>
        <div class="api-example">
            <strong>Store Memory:</strong> <span class="code">POST /mcp/store</span><br>
            <strong>Get Memories:</strong> <span class="code">GET /mcp/memories</span><br>
            <strong>Search:</strong> <span class="code">GET /mcp/memories?search=keyword&limit=10</span>
        </div>
        
        <div style="text-align: center; margin: 20px;">
            <button onclick="loadMemories()">Refresh Memories</button>
            <button onclick="clearMemories()" style="background: #dc3545;">Clear All</button>
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
                
                data.memories.forEach(memory => {
                    const div = document.createElement('div');
                    div.className = 'memory-item';
                    div.innerHTML = \`
                        <div class="memory-meta">
                            ID: \${memory.id} | \${new Date(memory.timestamp).toLocaleString()} | 
                            Words: \${memory.wordCount} | Tags: \${memory.tags.join(', ') || 'none'}
                        </div>
                        <div class="memory-content"><pre>\${memory.content}</pre></div>
                    \`;
                    memoriesDiv.appendChild(div);
                });
            } catch (error) {
                console.error('Error loading memories:', error);
            }
        }
        
        async function loadHashStats() {
            try {
                const response = await fetch('/mcp/hash-stats');
                const stats = await response.json();
                
                const statsDiv = document.getElementById('hashStats');
                const contentDiv = document.getElementById('hashStatsContent');
                
                contentDiv.innerHTML = \`
                    <div class="stats">
                        <div class="stat">
                            <div class="stat-number">\${stats.totalMemories}</div>
                            <div class="stat-label">Total Memories</div>
                        </div>
                        <div class="stat">
                            <div class="stat-number">\${stats.uniqueHashes}</div>
                            <div class="stat-label">Unique Hashes</div>
                        </div>
                        <div class="stat">
                            <div class="stat-number">\${stats.duplicateCount}</div>
                            <div class="stat-label">Duplicate Hashes</div>
                        </div>
                    </div>
                    \${stats.duplicateHashes.length > 0 ? \`
                        <h4>Duplicate Hash Details:</h4>
                        <div style="max-height: 200px; overflow-y: auto;">
                            \${stats.duplicateHashes.map(dup => \`
                                <div class="memory-item">
                                    Hash: \${dup.hash} (appears \${dup.count} times)
                                </div>
                            \`).join('')}
                        </div>
                    \` : '<p>✅ No duplicate hashes found!</p>'}
                \`;
                
                statsDiv.style.display = 'block';
            } catch (error) {
                console.error('Error loading hash stats:', error);
            }
        }
        
        async function clearMemories() {
            if (confirm('Clear all memories? This cannot be undone.')) {
                try {
                    await fetch('/mcp/memories', { method: 'DELETE' });
                    loadMemories();
                    // Hide hash stats since they'll be outdated
                    document.getElementById('hashStats').style.display = 'none';
                } catch (error) {
                    console.error('Error clearing memories:', error);
                }
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

    start() {
        this.app.listen(this.port, () => {
            console.log(`🚀 MCP Local Client running on http://localhost:${this.port}`);
            console.log(`📡 Ready to receive memory blocks from browser extension`);
            console.log(`🌐 Web interface: http://localhost:${this.port}`);
        });
    }
}

// Start the server
if (require.main === module) {
    const client = new LocalMCPClient();
    client.start();
}

module.exports = LocalMCPClient;
