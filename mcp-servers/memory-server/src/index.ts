// src/index.ts
// Full Memory Storage MCP Server with file persistence

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { 
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import fs from "fs/promises";
import path from "path";

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

class MemoryStorageServer {
  private server: Server;
  private memoryStore: MemoryEntry[] = [];
  private storageFile: string;

  constructor() {
    this.storageFile = path.join(__dirname, '../data/memories.json');
    
    this.server = new Server({
      name: "memory-storage-server",
      version: "1.0.0",
    }, {
      capabilities: {
        tools: {},
        resources: {},
      },
    });

    this.setupHandlers();
  }

  private async loadMemories() {
    try {
      // Ensure data directory exists
      await fs.mkdir(path.dirname(this.storageFile), { recursive: true });
      
      const data = await fs.readFile(this.storageFile, 'utf8');
      this.memoryStore = JSON.parse(data);
      console.log(`📚 Memory server loaded ${this.memoryStore.length} memories`);
    } catch (error: any) {
      if (error.code !== 'ENOENT') {
        console.error('❌ Error loading memories:', error);
      }
      this.memoryStore = [];
      console.log('📚 Starting with empty memory store');
    }
  }

  private async saveMemories() {
    try {
      await fs.writeFile(this.storageFile, JSON.stringify(this.memoryStore, null, 2));
    } catch (error) {
      console.error('❌ Error saving memories:', error);
    }
  }

  private generateId(): string {
    return 'mem_' + Date.now().toString(36) + Math.random().toString(36).substr(2);
  }

  private extractTags(content: string): string[] {
    const tags: string[] = [];
    
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
    
    return [...new Set(tags)];
  }

  private setupHandlers() {
    // List available tools
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: [
        {
          name: "store_memory",
          description: "Store new memory blocks from browser extension",
          inputSchema: {
            type: "object",
            properties: {
              blocks: {
                type: "array",
                description: "Array of memory blocks to store",
                items: {
                  type: "object",
                  properties: {
                    content: { type: "string", description: "Memory content" },
                    timestamp: { type: "string", description: "ISO timestamp" },
                    wordCount: { type: "number", description: "Word count" },
                    formatVersion: { type: "string", description: "Format version" }
                  },
                  required: ["content"]
                }
              },
              metadata: {
                type: "object",
                description: "Source metadata",
                properties: {
                  url: { type: "string" },
                  title: { type: "string" },
                  userAgent: { type: "string" }
                }
              }
            },
            required: ["blocks"]
          }
        },
        {
          name: "search_memories",
          description: "Search stored memories",
          inputSchema: {
            type: "object",
            properties: {
              query: { type: "string", description: "Search query" },
              tags: { type: "string", description: "Comma-separated tags" },
              limit: { type: "number", description: "Max results", default: 10 },
              since: { type: "string", description: "ISO timestamp for date filter" }
            }
          }
        },
        {
          name: "get_memory",
          description: "Get specific memory by ID",
          inputSchema: {
            type: "object",
            properties: {
              id: { type: "string", description: "Memory ID" }
            },
            required: ["id"]
          }
        },
        {
          name: "delete_memory",
          description: "Delete memory by ID",
          inputSchema: {
            type: "object",
            properties: {
              id: { type: "string", description: "Memory ID" }
            },
            required: ["id"]
          }
        },
        {
          name: "get_stats",
          description: "Get memory storage statistics",
          inputSchema: {
            type: "object",
            properties: {}
          }
        }
      ]
    }));

    // Handle tool calls
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;
      
      switch (name) {
        case "store_memory":
          return await this.storeMemory(args);
        case "search_memories":
          return await this.searchMemories(args);
        case "get_memory":
          return await this.getMemory(args);
        case "delete_memory":
          return await this.deleteMemory(args);
        case "get_stats":
          return await this.getStats();
        default:
          throw new Error(`Unknown tool: ${name}`);
      }
    });

    // List available resources
    this.server.setRequestHandler(ListResourcesRequestSchema, async () => ({
      resources: [
        {
          uri: "memory://stats",
          name: "Memory Statistics",
          description: "Current memory storage statistics",
          mimeType: "application/json"
        },
        {
          uri: "memory://recent",
          name: "Recent Memories",
          description: "Most recently stored memories",
          mimeType: "application/json"
        }
      ]
    }));

    // Handle resource reads
    this.server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
      const { uri } = request.params;
      
      switch (uri) {
        case "memory://stats":
          return {
            contents: [{
              uri,
              mimeType: "application/json",
              text: JSON.stringify(await this.getStatsData(), null, 2)
            }]
          };
          
        case "memory://recent":
          const recent = this.memoryStore.slice(-10).map(m => ({
            id: m.id,
            preview: m.content.substring(0, 100) + '...',
            timestamp: m.timestamp,
            wordCount: m.wordCount,
            tags: m.tags
          }));
          
          return {
            contents: [{
              uri,
              mimeType: "application/json",
              text: JSON.stringify(recent, null, 2)
            }]
          };
          
        default:
          throw new Error(`Unknown resource: ${uri}`);
      }
    });
  }

  private async storeMemory(args: any) {
    const { blocks = [], metadata = {} } = args || {};
    
    if (!Array.isArray(blocks)) {
      throw new Error('blocks must be an array');
    }

    const storedMemories: MemoryEntry[] = [];
    
    for (const block of blocks) {
      const memory: MemoryEntry = {
        id: this.generateId(),
        content: block.content || '',
        timestamp: block.timestamp || new Date().toISOString(),
        source: {
          url: metadata.url || 'unknown',
          title: metadata.title || 'unknown',
          userAgent: metadata.userAgent
        },
        tags: this.extractTags(block.content || ''),
        wordCount: block.wordCount || (block.content || '').split(/\s+/).length,
        formatVersion: block.formatVersion || 'legacy'
      };
      
      this.memoryStore.push(memory);
      storedMemories.push(memory);
    }

    await this.saveMemories();
    
    console.log(`📝 Stored ${storedMemories.length} memories. Total: ${this.memoryStore.length}`);
    
    return {
      content: [{
        type: "text",
        text: `Successfully stored ${storedMemories.length} memories. Total memories: ${this.memoryStore.length}`
      }],
      isError: false
    };
  }

  private async searchMemories(args: any) {
    const { query, tags, limit = 10, since } = args || {};
    
    let filtered = [...this.memoryStore];
    
    if (query) {
      const queryLower = query.toLowerCase();
      filtered = filtered.filter(memory => 
        memory.content.toLowerCase().includes(queryLower) ||
        memory.tags.some(tag => tag.toLowerCase().includes(queryLower))
      );
    }
    
    if (tags) {
      const tagList = tags.split(',').map((tag: string) => tag.trim().toLowerCase());
      filtered = filtered.filter(memory =>
        memory.tags.some(tag => tagList.includes(tag.toLowerCase()))
      );
    }
    
    if (since) {
      const sinceDate = new Date(since);
      filtered = filtered.filter(memory =>
        new Date(memory.timestamp) >= sinceDate
      );
    }
    
    filtered.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    filtered = filtered.slice(0, limit);
    
    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          results: filtered,
          total: this.memoryStore.length,
          filtered: filtered.length,
          query: query,
          searchParams: { tags, since, limit }
        }, null, 2)
      }]
    };
  }

  private async getMemory(args: any) {
    const { id } = args || {};
    const memory = this.memoryStore.find(m => m.id === id);
    
    if (!memory) {
      throw new Error(`Memory with ID ${id} not found`);
    }
    
    return {
      content: [{
        type: "text",
        text: JSON.stringify(memory, null, 2)
      }]
    };
  }

  private async deleteMemory(args: any) {
    const { id } = args || {};
    const index = this.memoryStore.findIndex(m => m.id === id);
    
    if (index === -1) {
      throw new Error(`Memory with ID ${id} not found`);
    }
    
    const deleted = this.memoryStore.splice(index, 1)[0];
    await this.saveMemories();
    
    console.log(`🗑️ Deleted memory: ${deleted.id}`);
    
    return {
      content: [{
        type: "text",
        text: `Successfully deleted memory: ${deleted.id}`
      }]
    };
  }

  private async getStats() {
    const stats = await this.getStatsData();
    
    return {
      content: [{
        type: "text",
        text: JSON.stringify(stats, null, 2)
      }]
    };
  }

  private async getStatsData() {
    const totalWords = this.memoryStore.reduce((sum, m) => sum + m.wordCount, 0);
    const allTags = [...new Set(this.memoryStore.flatMap(m => m.tags))];
    const formatVersions = [...new Set(this.memoryStore.map(m => m.formatVersion || 'legacy'))];
    
    return {
      totalMemories: this.memoryStore.length,
      totalWords,
      averageWordsPerMemory: this.memoryStore.length > 0 ? Math.round(totalWords / this.memoryStore.length) : 0,
      lastUpdated: this.memoryStore.length > 0 ? 
        this.memoryStore[this.memoryStore.length - 1].timestamp : null,
      uniqueTags: allTags.length,
      tags: allTags,
      formatVersions,
      oldestMemory: this.memoryStore.length > 0 ? this.memoryStore[0].timestamp : null,
      newestMemory: this.memoryStore.length > 0 ? 
        this.memoryStore[this.memoryStore.length - 1].timestamp : null
    };
  }

  async start() {
    await this.loadMemories();
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.log('✅ Memory Storage MCP Server started successfully (stdio transport)');
  }
}

// Start the server
async function main() {
  console.log('🚀 Starting Memory Storage MCP Server...');
  const server = new MemoryStorageServer();
  await server.start();
}

main().catch(error => {
  console.error('❌ Failed to start server:', error);
  process.exit(1);
});
