# MCP (Memory Collection Protocol) Chrome Extension (which we will actually use to connect to MCP Anthropic client)

A Chrome extension that enables **persistent memory across LLM instances** by detecting and collecting memory blocks from Claude conversations for cross-session persistence.

## What is MCP?

MCP solves the problem of LLM memory loss between conversations. When you're working on a project across multiple Claude sessions, you lose context each time. MCP allows you to:

- **Capture important information** from Claude conversations
- **Store it persistently** in your browser
- **Retrieve it later** in new conversations  
- **Share context** across different LLM instances

## How It Works

The extension scans web pages for specially formatted memory blocks:

```
[MCP-START]
Your important content here
(code, notes, project status, etc.)
[MCP-END]
```

When detected, these blocks are automatically captured and stored in your browser's memory buffer system.

## Installation

1. Clone this repository
2. Open Chrome and go to `chrome://extensions/`
3. Enable "Developer mode" 
4. Click "Load unpacked" and select the extension folder
5. The extension will add a blue "🧠 SCAN" button to web pages

## Usage

### Basic Scanning

1. **Create memory blocks** in your content using the MCP format:
   ```
   [MCP-START]
   Important information to remember
   [MCP-END]
   ```

2. **Click the blue "🧠 SCAN" button** on any webpage to detect MCP blocks

3. **Use console commands** to manage your memory buffers

### Console Commands

Open your browser's Developer Console (F12 → Console tab) and use these commands:

```javascript
// Scan for MCP blocks manually
scanMCP()

// View all captured buffers
viewBuffers()

// Clear all buffers
clearBuffers()

// Check buffer count
window.mcpBuffers.length
```

## Examples

### Example 1: Basic Text
```
[MCP-START]
Project: AI Assistant Enhancement
Status: Testing MCP buffer system
Next Steps: Add S3 persistence, improve UI
[MCP-END]
```

### Example 2: Code Snippets
```
[MCP-START]
```python
def fibonacci(n):
    if n <= 0:
        return []
    fib = [0, 1]
    for i in range(2, n):
        fib.append(fib[i-1] + fib[i-2])
    return fib
```
[MCP-END]
```

### Example 3: JSON Configuration
```
[MCP-START]
{
  "project": "MCP Extension",
  "version": "1.0",
  "features": ["memory_capture", "buffer_storage", "console_api"],
  "status": "active"
}
[MCP-END]
```

## Testing the Extension

### Quick Test:
1. Copy this test block somewhere on a webpage:
   ```
   [MCP-START]
   Test memory block - Hello World!
   [MCP-END]
   ```

2. Click the "🧠 SCAN" button

3. Open console and run `viewBuffers()`

4. You should see:
   ```
   === MCP BUFFERS ===
   Buffer 1:
   Test memory block - Hello World!
   ---
   ```

### Validation Steps:
- **Buffer Count**: `window.mcpBuffers.length` should show correct number
- **Content Integrity**: `viewBuffers()` should display exact content
- **Timestamps**: Each buffer includes capture time
- **Deduplication**: Scanning same content twice shouldn't create duplicates

## File Structure

```
mcp-extension/
├── manifest.json          # Extension configuration
├── content.js            # Main MCP scanning logic  
├── background.js         # Service worker (for future S3 integration)
├── popup.html           # Extension popup interface
├── popup.js             # Popup functionality
└── README.md            # This file
```

## Current Features

✅ **Memory Block Detection** - Finds `[MCP-START]...[MCP-END]` blocks  
✅ **Buffer Storage** - Stores content in `window.mcpBuffers` array  
✅ **Manual Scanning** - Blue scan button for on-demand detection  
✅ **Console API** - Commands for buffer management  
✅ **Basic Deduplication** - Prevents duplicate storage  
✅ **Content Preservation** - Maintains text formatting  

## Roadmap

🔄 **In Progress:**
- S3 cloud storage integration
- Enhanced popup interface
- Cross-session persistence

🎯 **Planned:**
- Buffer search and filtering
- Metadata extraction (content types, tags)
- Export/import functionality
- Advanced deduplication
- Automatic scanning options

## Development

The extension uses a simple architecture:

1. **Content Script** (`content.js`) - Runs on web pages, handles MCP detection
2. **Background Script** (`background.js`) - Manages extension lifecycle and API calls
3. **Popup Interface** (`popup.html/js`) - Provides user controls and buffer viewing

### Key Functions:

- `scanMCP()` - Scans page for MCP blocks using regex
- `viewBuffers()` - Displays all captured buffers in console
- `clearBuffers()` - Resets the buffer array

## Troubleshooting

**Button not appearing?**
- Check if extension is enabled in chrome://extensions/
- Refresh the webpage after installing

**Scanning not working?**
- Ensure MCP blocks use exact format: `[MCP-START]content[MCP-END]`
- Check browser console for error messages
- Try manual scan with `scanMCP()` in console

**Buffers not persisting?**
- Current version only stores during active session
- Close/reopen browser will clear buffers (persistence coming soon)

## Contributing

This is an experimental project for enabling LLM memory persistence. Contributions welcome!

## License

MIT License - Feel free to use and modify for your own LLM memory needs.
