# MCP Memory System - Complete Setup Guide

> **🧠 Persistent Memory for Claude Across Sessions**

This system enables Claude to maintain persistent memory across conversations using the Model Context Protocol (MCP). It consists of three main components that work together to capture, store, and retrieve memory blocks.

## 🏗️ Architecture Overview

```
┌─────────────────┐    HTTP     ┌─────────────────┐    JSON-RPC    ┌─────────────────┐
│  Chrome         │  ────────>  │  MCP Client     │  ────────────> │  MCP Server     │
│  Extension      │             │  (Bridge)       │                │  (Storage)      │
│  (Capture)      │             │  Port 3001      │                │  File/S3        │
└─────────────────┘             └─────────────────┘                └─────────────────┘
```

**Components:**
1. **Chrome Extension**: Scans web pages for MCP-formatted memory blocks
2. **MCP Client**: HTTP bridge that receives blocks from extension and forwards to MCP servers
3. **MCP Server**: Stores memories in local files or S3, accessible to Claude via MCP protocol

## 📋 Prerequisites

- **Node.js** 18+ and npm
- **Google Chrome** browser
- **TypeScript** (installed globally): `npm install -g typescript`

## 🚀 Quick Start (Recommended Path)

### Step 1: Set Up MCP Memory Server
*Objective: Create the storage backend for memories*

```bash
# Navigate to memory server directory
cd mcp-servers/memory-server

# Install dependencies
npm install

# Build the TypeScript server
npm run build

# Test the build
npm start
```

**Validation**: You should see:
```
🚀 Starting Memory Storage MCP Server...
📚 Memory server loaded 0 memories
✅ Memory Storage MCP Server started successfully (stdio transport)
```

Press `Ctrl+C` to stop for now.

### Step 2: Set Up MCP Client (Bridge)
*Objective: Create HTTP bridge between extension and MCP server*

```bash
# Navigate to MCP client directory
cd ../../mcp_client

# Install dependencies
npm install

# Build the TypeScript client
npm run build

# Start the MCP client
npm start
```

**Validation**: You should see:
```
🚀 Starting Simple MCP Memory Client...
🚀 Starting MCP Memory Server...
📚 Memory server loaded 0 memories
✅ Memory Storage MCP Server started successfully (stdio transport)
🚀 MCP Memory Client running on http://localhost:3001
🌐 Web interface: http://localhost:3001
```

**Test the client**: Open http://localhost:3001 in your browser. You should see the MCP client web interface.

### Step 3: Install Chrome Extension
*Objective: Enable memory capture from web pages*

1. **Open Chrome Extensions**:
   - Go to `chrome://extensions/`
   - Enable "Developer mode" (toggle in top-right)

2. **Load the Extension**:
   - Click "Load unpacked"
   - Select the `extension/` folder from this repository
   - The extension should appear with a green brain icon

3. **Verify Installation**:
   - Visit any web page
   - Look for a green "🧠 SCAN (FIXED)" button in top-right corner
   - Check for "🟢 MCP (0)" status indicator

**Validation**: Extension should show "🟢 MCP (0)" indicating successful connection to the MCP client.

### Step 4: Test the Complete System
*Objective: Verify end-to-end memory capture and storage*

1. **Create a test memory block** on any web page (like this README):

```
[MCP-START]
Test Memory Block
This is a test of the MCP memory system.
Created on: 2025-06-01
[MCP-END]
```

2. **Capture the memory**:
   - Click the "🧠 SCAN (FIXED)" button
   - Should show "🧠 FOUND 1!" temporarily
   - Check browser console (F12) for detailed logs

3. **Verify storage**:
   - Check the MCP client web interface at http://localhost:3001
   - Should show 1 memory in the statistics
   - Check `mcp-servers/memory-server/data/memories.json` file

**Validation**: The memory should appear in both the web interface and the JSON file.

## 📖 Understanding MCP Block Format

The system uses **ultra-strict formatting** to ensure reliable detection:

### ✅ Correct Format
```
[MCP-START]
Your memory content here
Can be multiple lines
[MCP-END]
```

### ❌ Incorrect Formats (Will Be Ignored)
```
[MCP-START]content[MCP-END]                    // Same line - NOT ALLOWED
text before [MCP-START]                        // Not on own line - NOT ALLOWED  
[MCP-END] text after                           // Not on own line - NOT ALLOWED
[mcp-start] or [MCP-start]                     // Wrong case - NOT ALLOWED
```

### 💡 Markdown Compatibility
When using in markdown (like Claude conversations), wrap in code blocks:

````
```
[MCP-START]
Your memory content here
[MCP-END]
```
````

**Note**: The backticks (```) are just markdown formatting. Only the content between `[MCP-START]` and `[MCP-END]` is captured.

## 🔧 Advanced Configuration

### Using S3 Storage (Optional)

1. **Set up S3 server**:
```bash
cd mcp-servers/s3-server
npm install
npm run build
```

2. **Configure AWS credentials**:
```bash
export S3_BUCKET_NAME=your-mcp-memory-bucket
export AWS_REGION=us-east-1
export AWS_ACCESS_KEY_ID=your-access-key
export AWS_SECRET_ACCESS_KEY=your-secret-key
```

3. **Start S3 server**:
```bash
npm start
```

### Chrome Extension Commands

Open browser console (F12) on any page to use these commands:

- `scanMCP()` - Manually scan for MCP blocks
- `viewBuffers()` - View captured memories
- `sendPendingBuffers()` - Send unsent memories to client
- `getMCPClientStatus()` - Check client connection
- `clearBuffers()` - Clear local memory cache
- `testMCPFormat()` - Test format compliance on current page

### Environment Configuration

Create `.env` files in respective directories:

**mcp_client/.env**:
```
PORT=3001
DEBUG_MODE=true
AUTO_SEND_ENABLED=true
```

**mcp-servers/memory-server/.env**:
```
STORAGE_PATH=./data/memories.json
```

## 🔍 Troubleshooting

### Common Issues

**1. Extension shows "🔴 MCP Offline"**
- Ensure MCP client is running: `cd mcp_client && npm start`
- Check if port 3001 is accessible: http://localhost:3001
- Verify no firewall blocking localhost:3001

**2. No blocks detected**
- Verify strict formatting: MCP tags must be on separate lines
- Check browser console for format validation errors
- Use `testMCPFormat()` command for detailed analysis

**3. TypeScript compilation errors**
- Install TypeScript globally: `npm install -g typescript`
- Clean and rebuild: `npm run clean && npm run build`
- Check Node.js version (18+ required)

**4. Memory server fails to start**
- Ensure write permissions for `data/` directory
- Check if port conflicts exist
- Review server logs for specific error messages

### Debug Mode

Enable detailed logging by setting `DEBUG_MODE = true` in `extension/content.js`:

```javascript
const DEBUG_MODE = true; // Set to false for production
```

### Health Checks

**MCP Client**: http://localhost:3001/health
```json
{
  "status": "healthy",
  "memoryCount": 5,
  "timestamp": "2025-06-01T12:00:00.000Z"
}
```

**Extension Console**: Look for initialization message:
```
🧠 FIXED MCP Ultra-Strict System Ready! (Content-Only Processing)
```

## 📂 File Structure

```
mcp-memory-system/
├── extension/                  # Chrome Extension
│   ├── manifest.json
│   ├── popup.html
│   ├── content.js
│   └── styles.css
├── mcp_client/                 # HTTP Bridge
│   ├── package.json
│   ├── src/mcp-client.ts
│   └── build/
├── mcp-servers/
│   ├── memory-server/          # Local File Storage
│   │   ├── package.json
│   │   ├── src/index.ts
│   │   ├── build/
│   │   └── data/memories.json
│   └── s3-server/              # S3 Storage (Optional)
│       ├── package.json
│       └── src/index.ts
└── README.md
```

## 🎯 Next Steps

1. **Test with Claude**: Use the memory blocks in Claude conversations
2. **Configure S3**: Set up cloud storage for persistence across devices
3. **Customize Format**: Modify content.js for specific memory formats
4. **Scale Up**: Add more MCP servers for different storage backends

## 🤝 Contributing

1. Test changes with the validation steps above
2. Ensure TypeScript compilation: `npm run build`
3. Verify extension functionality with test memory blocks
4. Check that the MCP client bridge works correctly

## 📜 License

MIT License - See individual component directories for specific licenses.

---

**🧠 Ready to give Claude persistent memory across sessions!**
