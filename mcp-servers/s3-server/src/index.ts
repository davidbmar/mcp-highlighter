// mcp-servers/s3-server/src/index.ts
// Dedicated MCP Server for S3 storage operations

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { 
  S3Client, 
  GetObjectCommand, 
  PutObjectCommand,
  DeleteObjectCommand,
  ListObjectsV2Command 
} from '@aws-sdk/client-s3';

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

class S3StorageServer {
  private server: McpServer;
  private s3Client: S3Client;
  private bucketName: string;
  private prefix: string;

  constructor() {
    // Get configuration from environment variables
    this.bucketName = process.env.S3_BUCKET_NAME || 'mcp-memory-storage';
    this.prefix = process.env.S3_PREFIX || 'memories/';
    
    const region = process.env.AWS_REGION || 'us-east-1';
    
    this.s3Client = new S3Client({
      region,
      credentials: process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY ? {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
      } : undefined // Use default credential chain
    });
    
    this.server = new McpServer({
      name: "s3-storage-server",
      version: "1.0.0",
      description: "MCP server for S3 storage operations"
    });

    this.setupTools();
    this.setupResources();
  }

  private setupTools() {
    this.server.setRequestHandler("tools/call", async (request) => {
      const { name, arguments: args } = request.params;
      
      switch (name) {
        case "store_to_s3":
          return await this.storeToS3(args);
        case "search_s3_memories":
          return await this.searchS3Memories(args);
        case "get_from_s3":
          return await this.getFromS3(args);
        case "delete_from_s3":
          return await this.deleteFromS3(args);
        case "backup_to_s3":
          return await this.backupToS3(args);
        case "list_s3_backups":
          return await this.listS3Backups();
        default:
          throw new Error(`Unknown tool: ${name}`);
      }
    });

    this.server.setRequestHandler("tools/list", async () => ({
      tools: [
        {
          name: "store_to_s3",
          description: "Store memory blocks to S3",
          inputSchema: {
            type: "object",
            properties: {
              blocks: {
                type: "array",
                description: "Array of memory blocks to store",
                items: {
                  type: "object",
                  properties: {
                    content: { type: "string" },
                    timestamp: { type: "string" },
                    wordCount: { type: "number" },
                    formatVersion: { type: "string" }
                  },
                  required: ["content"]
                }
              },
              metadata: {
                type: "object",
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
          name: "search_s3_memories",
          description: "Search memories stored in S3",
          inputSchema: {
            type: "object",
            properties: {
              query: { type: "string", description: "Search query" },
              limit: { type: "number", description: "Max results", default: 10 },
              prefix: { type: "string", description: "S3 key prefix filter" }
            }
          }
        },
        {
          name: "get_from_s3",
          description: "Get specific memory from S3 by key",
          inputSchema: {
            type: "object",
            properties: {
              key: { type: "string", description: "S3 object key" }
            },
            required: ["key"]
          }
        },
        {
          name: "delete_from_s3",
          description: "Delete memory from S3",
          inputSchema: {
            type: "object",
            properties: {
              key: { type: "string", description: "S3 object key" }
            },
            required: ["key"]
          }
        },
        {
          name: "backup_to_s3",
          description: "Create a backup of all memories to S3",
          inputSchema: {
            type: "object",
            properties: {
              memories: {
                type: "array",
                description: "Array of all memories to backup"
              },
              backupName: { 
                type: "string", 
                description: "Optional backup name",
                default: "auto-backup"
              }
            },
            required: ["memories"]
          }
        },
        {
          name: "list_s3_backups",
          description: "List available backups in S3",
          inputSchema: {
            type: "object",
            properties: {}
          }
        }
      ]
    }));
  }

  private setupResources() {
    this.server.setRequestHandler("resources/list", async () => ({
      resources: [
        {
          uri: "s3://bucket-info",
          name: "S3 Bucket Information",
          description: "Current S3 bucket configuration and stats",
          mimeType: "application/json"
        },
        {
          uri: "s3://recent-objects",
          name: "Recent S3 Objects",
          description: "Recently stored objects in S3",
          mimeType: "application/json"
        }
      ]
    }));

    this.server.setRequestHandler("resources/read", async (request) => {
      const { uri } = request.params;
      
      switch (uri) {
        case "s3://bucket-info":
          return {
            contents: [{
              uri,
              mimeType: "application/json",
              text: JSON.stringify({
                bucketName: this.bucketName,
                prefix: this.prefix,
                region: process.env.AWS_REGION || 'us-east-1',
                timestamp: new Date().toISOString()
              }, null, 2)
            }]
          };
          
        case "s3://recent-objects":
          const recentObjects = await this.listRecentObjects();
          return {
            contents: [{
              uri,
              mimeType: "application/json",
              text: JSON.stringify(recentObjects, null, 2)
            }]
          };
          
        default:
          throw new Error(`Unknown resource: ${uri}`);
      }
    });
  }

  private generateId(): string {
    return 's3_' + Date.now().toString(36) + Math.random().toString(36).substr(2);
  }

  private extractTags(content: string): string[] {
    const tags: string[] = [];
    const hashtags = content.match(/#[\w]+/g);
    if (hashtags) tags.push(...hashtags.map(tag => tag.substring(1)));
    
    if (content.includes('```') || content.includes('function')) {
      tags.push('code');
    }
    if (content.includes('TODO')) {
      tags.push('todo');
    }
    if (content.includes('http')) {
      tags.push('url');
    }
    
    return [...new Set(tags)];
  }

  private async storeToS3(args: any) {
    const { blocks = [], metadata = {} } = args;
    
    if (!Array.isArray(blocks)) {
      throw new Error('blocks must be an array');
    }

    const storedKeys: string[] = [];
    
    for (const block of blocks) {
      const memory: MemoryEntry = {
        id: this.generateId(),
        content: block.content,
        timestamp: block.timestamp || new Date().toISOString(),
        source: {
          url: metadata.url || 'unknown',
          title: metadata.title || 'unknown',
          userAgent: metadata.userAgent
        },
        tags: this.extractTags(block.content),
        wordCount: block.wordCount || block.content.split(/\s+/).length,
        formatVersion: block.formatVersion || 'legacy'
      };
      
      const key = `${this.prefix}${memory.timestamp.split('T')[0]}/${memory.id}.json`;
      
      const putCommand = new PutObjectCommand({
        Bucket: this.bucketName,
        Key: key,
        Body: JSON.stringify(memory, null, 2),
        ContentType: 'application/json',
        Metadata: {
          'memory-id': memory.id,
          'timestamp': memory.timestamp,
          'word-count': memory.wordCount.toString(),
          'format-version': memory.formatVersion || 'legacy',
          'tags': memory.tags.join(','),
          'source-url': memory.source.url
        }
      });
      
      await this.s3Client.send(putCommand);
      storedKeys.push(key);
      
      console.log(`📝 Stored memory to S3: ${key}`);
    }
    
    return {
      content: [{
        type: "text",
        text: `Successfully stored ${storedKeys.length} memories to S3.\nKeys: ${storedKeys.join(', ')}`
      }]
    };
  }

  private async searchS3Memories(args: any) {
    const { query, limit = 10, prefix: searchPrefix } = args;
    
    try {
      const listCommand = new ListObjectsV2Command({
        Bucket: this.bucketName,
        Prefix: searchPrefix || this.prefix,
        MaxKeys: limit * 2 // Get more to filter
      });

      const response = await this.s3Client.send(listCommand);
      
      if (!response.Contents || response.Contents.length === 0) {
        return {
          content: [{
            type: "text",
            text: JSON.stringify({
              results: [],
              message: "No memories found in S3"
            }, null, 2)
          }]
        };
      }

      // If there's a search query, we need to fetch and search content
      let filteredResults = response.Contents;
      
      if (query) {
        const searchResults = [];
        const queryLower = query.toLowerCase();
        
        for (const object of response.Contents.slice(0, limit * 2)) {
          if (!object.Key) continue;
          
          try {
            const getCommand = new GetObjectCommand({
              Bucket: this.bucketName,
              Key: object.Key
            });
            
            const getResponse = await this.s3Client.send(getCommand);
            if (getResponse.Body) {
              const content = await getResponse.Body.transformToString();
              const memory = JSON.parse(content) as MemoryEntry;
              
              if (memory.content.toLowerCase().includes(queryLower) ||
                  memory.tags.some(tag => tag.toLowerCase().includes(queryLower))) {
                searchResults.push({
                  key: object.Key,
                  memory,
                  lastModified: object.LastModified,
                  size: object.Size
                });
              }
            }
          } catch (error) {
            console.error(`Error reading S3 object ${object.Key}:`, error);
          }
          
          if (searchResults.length >= limit) break;
        }
        
        return {
          content: [{
            type: "text",
            text: JSON.stringify({
              results: searchResults,
              query,
              totalObjectsScanned: Math.min(response.Contents.length, limit * 2)
            }, null, 2)
          }]
        };
      }
      
      // No search query, just return object list
      const results = filteredResults.slice(0, limit).map(obj => ({
        key: obj.Key,
        lastModified: obj.LastModified,
        size: obj.Size
      }));
      
      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            results,
            totalObjects: response.Contents.length,
            hasMore: response.IsTruncated
          }, null, 2)
        }]
      };
      
    } catch (error) {
      throw new Error(`S3 search failed: ${error}`);
    }
  }

  private async getFromS3(args: any) {
    const { key } = args;
    
    try {
      const command = new GetObjectCommand({
        Bucket: this.bucketName,
        Key: key
      });

      const response = await this.s3Client.send(command);
      
      if (!response.Body) {
        throw new Error(`Object not found: ${key}`);
      }

      const content = await response.Body.transformToString();
      const memory = JSON.parse(content) as MemoryEntry;
      
      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            key,
            memory,
            metadata: {
              lastModified: response.LastModified,
              contentLength: response.ContentLength,
              contentType: response.ContentType
            }
          }, null, 2)
        }]
      };
      
    } catch (error) {
      throw new Error(`Failed to get from S3: ${error}`);
    }
  }

  private async deleteFromS3(args: any) {
    const { key } = args;
    
    try {
      const command = new DeleteObjectCommand({
        Bucket: this.bucketName,
        Key: key
      });

      await this.s3Client.send(command);
      
      console.log(`🗑️ Deleted from S3: ${key}`);
      
      return {
        content: [{
          type: "text",
          text: `Successfully deleted from S3: ${key}`
        }]
      };
      
    } catch (error) {
      throw new Error(`Failed to delete from S3: ${error}`);
    }
  }

  private async backupToS3(args: any) {
    const { memories, backupName = 'auto-backup' } = args;
    
    try {
      const timestamp = new Date().toISOString();
      const backupKey = `backups/${backupName}-${timestamp}.json`;
      
      const backupData = {
        backupName,
        timestamp,
        memoryCount: memories.length,
        memories,
        metadata: {
          createdBy: 's3-storage-server',
          version: '1.0.0'
        }
      };
      
      const command = new PutObjectCommand({
        Bucket: this.bucketName,
        Key: backupKey,
        Body: JSON.stringify(backupData, null, 2),
        ContentType: 'application/json',
        Metadata: {
          'backup-name': backupName,
          'memory-count': memories.length.toString(),
          'backup-timestamp': timestamp
        }
      });
      
      await this.s3Client.send(command);
      
      console.log(`💾 Created backup: ${backupKey}`);
      
      return {
        content: [{
          type: "text",
          text: `Successfully created backup: ${backupKey}\nMemories backed up: ${memories.length}`
        }]
      };
      
    } catch (error) {
      throw new Error(`Backup failed: ${error}`);
    }
  }

  private async listS3Backups() {
    try {
      const command = new ListObjectsV2Command({
        Bucket: this.bucketName,
        Prefix: 'backups/',
        MaxKeys: 50
      });

      const response = await this.s3Client.send(command);
      
      const backups = response.Contents?.map(obj => ({
        key: obj.Key,
        lastModified: obj.LastModified,
        size: obj.Size
      })) || [];
      
      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            backups,
            totalBackups: backups.length
          }, null, 2)
        }]
      };
      
    } catch (error) {
      throw new Error(`Failed to list backups: ${error}`);
    }
  }

  private async listRecentObjects() {
    try {
      const command = new ListObjectsV2Command({
        Bucket: this.bucketName,
        Prefix: this.prefix,
        MaxKeys: 10
      });

      const response = await this.s3Client.send(command);
      
      return response.Contents?.map(obj => ({
        key: obj.Key,
        lastModified: obj.LastModified,
        size: obj.Size
      })) || [];
      
    } catch (error) {
      console.error('Error listing recent objects:', error);
      return [];
    }
  }

  async start() {
    // Validate S3 configuration
    if (!this.bucketName) {
      throw new Error('S3_BUCKET_NAME environment variable is required');
    }
    
    console.log(`🪣 S3 Configuration:`);
    console.log(`   Bucket: ${this.bucketName}`);
    console.log(`   Prefix: ${this.prefix}`);
    console.log(`   Region: ${process.env.AWS_REGION || 'us-east-1'}`);
    
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.log('🚀 S3 Storage MCP Server started (stdio transport)');
  }
}

// Start the server
if (require.main === module) {
  const server = new S3StorageServer();
  server.start().catch(console.error);
}

export default S3StorageServer;
