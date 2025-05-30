/*
 * MCP Memory System - Ultra-Strict Content Scanner
 * ===============================================
 * 
 * MCP BLOCK FORMAT RULES (STRICTLY ENFORCED):
 * ===========================================
 * 
 * ✅ CORRECT FORMAT (Always use code blocks):
 * ```
 * [MCP-START]
 * Your content here
 * Can be multiple lines
 * [MCP-END]
 * ```
 * 
 * ❌ INCORRECT FORMATS (WILL BE IGNORED):
 * [MCP-START]content[MCP-END]                    // Same line - NOT ALLOWED
 * text before [MCP-START]                        // Not on own line - NOT ALLOWED  
 * [MCP-END] text after                           // Not on own line - NOT ALLOWED
 * [mcp-start] or [MCP-start]                     // Wrong case - NOT ALLOWED
 * 
 * WHY THESE RULES:
 * - Code blocks prevent browser rendering issues
 * - Prevents false matches from documentation text mentioning MCP tags
 * - Eliminates nested marker confusion 
 * - Ensures 100% parsing accuracy
 * - Provides clear, unambiguous block boundaries
 * 
 * TECHNICAL DETAILS:
 * - Uses ultra-strict regex: /^\s*\[MCP-START\]\s*$([\s\S]*?)^\s*\[MCP-END\]\s*$/gm
 * - Requires MCP tags to be on their own lines (with optional whitespace)
 * - Case sensitive: exactly [MCP-START] and [MCP-END]
 * - Content between tags can be anything (multiline, code, JSON, etc.)
 */

// Configuration
const MCP_CLIENT_URL = 'http://localhost:3001';
const AUTO_SEND_ENABLED = true;
const DEBUG_MODE = true; // Set to false for production

// Initialize storage
window.mcpBuffers = window.mcpBuffers || [];
window.mcpSentBlocks = window.mcpSentBlocks || new Set();

// Ultra-strict MCP block detection with format validation
function scanMCP() {
    if (DEBUG_MODE) console.log('🔍 Starting ultra-strict MCP scan...');
    
    const text = document.body.innerText;
    
    // First, validate format and provide helpful feedback
    validateMCPFormat(text);
    
    // Ultra-strict regex: MCP tags MUST be on their own lines
    const blocks = text.match(/^\s*\[MCP-START\]\s*$([\s\S]*?)^\s*\[MCP-END\]\s*$/gm);
    
    if (!blocks) {
        console.log('🔍 MCP Scan: No properly formatted blocks found');
        if (DEBUG_MODE) {
            // Check if there are any MCP markers that don't follow the rules
            const anyMarkers = text.match(/\[MCP-START\]|\[MCP-END\]/g);
            if (anyMarkers) {
                console.warn('⚠️ Found MCP markers but they don\'t follow the strict formatting rules');
                console.warn('📖 See content.js comments for proper format requirements');
            }
        }
        return 0;
    }

    const newBlocks = [];
    let duplicatesSkipped = 0;
    
    blocks.forEach((block, index) => {
        // Extract content between the tags (remove the markers and surrounding whitespace)
        const content = block
            .replace(/^\s*\[MCP-START\]\s*$/m, '') // Remove opening tag and its line
            .replace(/^\s*\[MCP-END\]\s*$/m, '')   // Remove closing tag and its line
            .trim(); // Clean up any extra whitespace
        
        // Skip empty blocks
        if (!content) {
            console.warn(`⚠️ Skipping empty MCP block ${index + 1}`);
            return;
        }
        
        // Create content hash for duplicate detection
        const contentHash = btoa(unescape(encodeURIComponent(content))).substring(0, 20);
        
        if (!window.mcpSentBlocks.has(contentHash)) {
            const mcpBlock = {
                content: content,
                hash: contentHash,
                timestamp: new Date().toISOString(),
                capturedAt: new Date().toLocaleTimeString(),
                source: {
                    url: window.location.href,
                    title: document.title,
                    domain: window.location.hostname
                },
                wordCount: content.split(/\s+/).length,
                blockNumber: index + 1,
                formatVersion: 'strict-v2'
            };
            
            window.mcpBuffers.push(mcpBlock);
            newBlocks.push(mcpBlock);
            window.mcpSentBlocks.add(contentHash);
            
            if (DEBUG_MODE) {
                console.log(`📦 Captured MCP block ${index + 1}:`, {
                    words: mcpBlock.wordCount,
                    hash: mcpBlock.hash,
                    preview: content.substring(0, 50) + (content.length > 50 ? '...' : '')
                });
            }
        } else {
            duplicatesSkipped++;
            if (DEBUG_MODE) console.log(`🔄 Skipped duplicate block ${index + 1}`);
        }
    });
    
    // Report results
    console.log(`🔍 MCP Scan Results (Strict Mode):`);
    console.log(`  • Found: ${blocks.length} properly formatted blocks`);
    console.log(`  • New: ${newBlocks.length} blocks`);
    console.log(`  • Skipped: ${duplicatesSkipped} duplicates`);
    console.log(`  • Buffer total: ${window.mcpBuffers.length}`);
    
    // Auto-send to MCP client if enabled and we have new blocks
    if (AUTO_SEND_ENABLED && newBlocks.length > 0) {
        sendToMCPClient(newBlocks);
    }
    
    return newBlocks.length;
}

// Validate MCP format and provide helpful feedback
function validateMCPFormat(text) {
    const allStartMarkers = (text.match(/\[MCP-START\]/g) || []).length;
    const allEndMarkers = (text.match(/\[MCP-END\]/g) || []).length;
    const validBlocks = (text.match(/^\s*\[MCP-START\]\s*$([\s\S]*?)^\s*\[MCP-END\]\s*$/gm) || []).length;
    
    if (DEBUG_MODE) {
        console.log(`📊 Format Validation:`);
        console.log(`  • Total [MCP-START] markers: ${allStartMarkers}`);
        console.log(`  • Total [MCP-END] markers: ${allEndMarkers}`);
        console.log(`  • Valid strict-format blocks: ${validBlocks}`);
    }
    
    // Check for common format issues
    if (allStartMarkers > validBlocks || allEndMarkers > validBlocks) {
        const issues = [];
        
        // Check for same-line blocks
        const sameLineBlocks = text.match(/\[MCP-START\][^\n]*\[MCP-END\]/g);
        if (sameLineBlocks) {
            issues.push(`${sameLineBlocks.length} same-line blocks (not allowed)`);
        }
        
        // Check for inline markers
        const inlineStarts = text.match(/[^\n\r]\[MCP-START\]|^[^\[\s]+.*\[MCP-START\]/gm);
        const inlineEnds = text.match(/\[MCP-END\][^\n\r]|^.*\[MCP-END\][^\]\s]+/gm);
        if (inlineStarts) {
            issues.push(`${inlineStarts.length} inline [MCP-START] markers`);
        }
        if (inlineEnds) {
            issues.push(`${inlineEnds.length} inline [MCP-END] markers`);
        }
        
        console.warn('⚠️ MCP Format Issues Detected:');
        issues.forEach(issue => console.warn(`   • ${issue}`));
        console.warn('📖 Reminder: MCP tags must be on their own lines');
        console.warn('📋 Correct format example:');
        console.warn('   [MCP-START]');
        console.warn('   Your content here');
        console.warn('   [MCP-END]');
    }
    
    return {
        totalMarkers: allStartMarkers + allEndMarkers,
        validBlocks: validBlocks,
        hasIssues: (allStartMarkers > validBlocks || allEndMarkers > validBlocks)
    };
}

// Send MCP blocks to local client (unchanged from previous version)
async function sendToMCPClient(blocks = null) {
    const blocksToSend = blocks || window.mcpBuffers.filter(block => !block.sent);
    
    if (blocksToSend.length === 0) {
        console.log('📡 No new blocks to send to MCP client');
        return { success: true, sent: 0 };
    }
    
    try {
        if (DEBUG_MODE) console.log(`📡 Sending ${blocksToSend.length} blocks to MCP client...`);
        
        const response = await fetch(`${MCP_CLIENT_URL}/mcp/store`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'User-Agent': 'MCP-Browser-Extension-Strict/2.0'
            },
            body: JSON.stringify({
                blocks: blocksToSend.map(block => ({
                    content: block.content,
                    timestamp: block.timestamp,
                    wordCount: block.wordCount,
                    formatVersion: block.formatVersion
                })),
                metadata: {
                    url: window.location.href,
                    title: document.title,
                    domain: window.location.hostname,
                    userAgent: navigator.userAgent,
                    capturedAt: new Date().toISOString(),
                    extensionVersion: 'strict-v2'
                }
            })
        });
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        const result = await response.json();
        
        // Mark blocks as sent
        blocksToSend.forEach(block => {
            block.sent = true;
            block.sentAt = new Date().toISOString();
        });
        
        console.log('✅ MCP Client Response:', result);
        console.log(`📊 Server now has ${result.totalMemories} total memories`);
        
        // Show user notification
        showNotification(`📡 Sent ${result.stored} strict-format blocks to MCP client`, 'success');
        
        return result;
        
    } catch (error) {
        console.error('❌ Failed to send to MCP client:', error);
        showNotification(`❌ MCP client connection failed: ${error.message}`, 'error');
        return { success: false, error: error.message };
    }
}

// Get MCP client status
async function getMCPClientStatus() {
    try {
        const response = await fetch(`${MCP_CLIENT_URL}/health`);
        const status = await response.json();
        
        if (DEBUG_MODE) console.log('🔌 MCP Client Status:', status);
        return status;
        
    } catch (error) {
        console.error('❌ MCP Client not reachable:', error);
        return { status: 'offline', error: error.message };
    }
}

// Show user notification (unchanged)
function showNotification(message, type = 'info') {
    const existingNotifications = document.querySelectorAll('.mcp-notification');
    existingNotifications.forEach(n => n.remove());
    
    const notification = document.createElement('div');
    notification.className = 'mcp-notification';
    notification.style.cssText = `
        position: fixed; top: 70px; right: 20px; z-index: 10001;
        background: ${type === 'success' ? '#4CAF50' : type === 'error' ? '#f44336' : '#2196F3'};
        color: white; padding: 12px 16px; border-radius: 8px;
        font-family: -apple-system, BlinkMacSystemFont, sans-serif;
        font-size: 14px; max-width: 300px; box-shadow: 0 4px 12px rgba(0,0,0,0.3);
        animation: mcpSlideIn 0.3s ease-out;
    `;
    notification.textContent = message;
    
    document.body.appendChild(notification);
    
    setTimeout(() => {
        notification.style.animation = 'mcpSlideIn 0.3s ease-out reverse';
        setTimeout(() => notification.remove(), 300);
    }, 4000);
}

// Enhanced view buffers with format validation
function viewBuffers() {
    console.log('=== MCP BUFFERS (STRICT MODE) ===');
    console.log(`Total buffers: ${window.mcpBuffers.length}`);
    console.log(`Sent to client: ${window.mcpBuffers.filter(b => b.sent).length}`);
    console.log(`Pending: ${window.mcpBuffers.filter(b => !b.sent).length}`);
    console.log('');
    
    window.mcpBuffers.forEach((buffer, i) => {
        console.log(`Buffer ${i + 1}:`);
        console.log(`  Content: ${buffer.content.substring(0, 100)}${buffer.content.length > 100 ? '...' : ''}`);
        console.log(`  Words: ${buffer.wordCount}`);
        console.log(`  Captured: ${buffer.capturedAt}`);
        console.log(`  Sent: ${buffer.sent ? '✅ Yes (' + buffer.sentAt + ')' : '❌ No'}`);
        console.log(`  Hash: ${buffer.hash}`);
        console.log(`  Format: ${buffer.formatVersion || 'legacy'}`);
        console.log('---');
    });
    
    return window.mcpBuffers;
}

// Clear buffers with confirmation
function clearBuffers() {
    const count = window.mcpBuffers.length;
    window.mcpBuffers = [];
    window.mcpSentBlocks.clear();
    console.log(`🗑️ Cleared ${count} buffers and sent blocks cache`);
    showNotification(`Cleared ${count} local buffers`, 'info');
}

// Manual send pending buffers
async function sendPendingBuffers() {
    const pending = window.mcpBuffers.filter(b => !b.sent);
    if (pending.length === 0) {
        console.log('📡 No pending buffers to send');
        showNotification('No pending buffers to send', 'info');
        return;
    }
    
    const result = await sendToMCPClient(pending);
    return result;
}

// Test MCP format compliance
function testMCPFormat() {
    console.log('🧪 Testing MCP format compliance on current page...');
    const validation = validateMCPFormat(document.body.innerText);
    
    if (validation.hasIssues) {
        console.warn('⚠️ Page has MCP format issues - run scanMCP() for details');
    } else {
        console.log('✅ All MCP blocks follow strict format rules');
    }
    
    return validation;
}

// Create enhanced scan button with strict mode indicator
const scanButton = document.createElement('button');
scanButton.innerHTML = '🧠 SCAN (STRICT)';
scanButton.id = 'mcp-scan-button';
scanButton.style.cssText = `
    position: fixed; top: 20px; right: 20px; z-index: 10000;
    background: #4CAF50; color: white; border: none; padding: 12px 16px;
    border-radius: 8px; cursor: pointer; font-weight: bold;
    font-family: -apple-system, BlinkMacSystemFont, sans-serif;
    box-shadow: 0 2px 8px rgba(0,0,0,0.2);
    transition: all 0.2s ease;
`;

scanButton.onmouseover = () => {
    scanButton.style.background = '#45a049';
    scanButton.style.transform = 'translateY(-1px)';
};

scanButton.onmouseout = () => {
    scanButton.style.background = '#4CAF50';
    scanButton.style.transform = 'translateY(0)';
};

scanButton.onclick = () => {
    const found = scanMCP();
    scanButton.innerHTML = found > 0 ? `🧠 FOUND ${found}!` : '🧠 SCAN (STRICT)';
    setTimeout(() => {
        scanButton.innerHTML = '🧠 SCAN (STRICT)';
    }, 3000);
};

document.body.appendChild(scanButton);

// Create MCP client status indicator
const statusIndicator = document.createElement('div');
statusIndicator.id = 'mcp-status';
statusIndicator.style.cssText = `
    position: fixed; top: 20px; right: 180px; z-index: 10000;
    background: #666; color: white; padding: 8px 12px;
    border-radius: 20px; font-size: 12px; font-weight: bold;
    font-family: -apple-system, BlinkMacSystemFont, sans-serif;
`;
statusIndicator.textContent = '🔌 Checking...';
document.body.appendChild(statusIndicator);

// Check MCP client status on load
(async function checkInitialStatus() {
    const status = await getMCPClientStatus();
    
    if (status.status === 'healthy') {
        statusIndicator.style.background = '#4CAF50';
        statusIndicator.textContent = `🟢 MCP (${status.memoryCount})`;
        console.log('✅ MCP Client connected and healthy');
    } else {
        statusIndicator.style.background = '#f44336';
        statusIndicator.textContent = '🔴 MCP Offline';
        console.log('❌ MCP Client offline - memories will be stored locally only');
    }
})();

// Console API
window.scanMCP = scanMCP;
window.viewBuffers = viewBuffers;
window.clearBuffers = clearBuffers;
window.sendToMCPClient = sendToMCPClient;
window.sendPendingBuffers = sendPendingBuffers;
window.getMCPClientStatus = getMCPClientStatus;
window.testMCPFormat = testMCPFormat;
window.validateMCPFormat = validateMCPFormat;

console.log('🧠 MCP Ultra-Strict System Ready!');
console.log('📋 Available commands:');
console.log('  • scanMCP() - Scan for strict-format MCP blocks');
console.log('  • viewBuffers() - View all captured buffers');
console.log('  • sendPendingBuffers() - Send unsent buffers to client');
console.log('  • getMCPClientStatus() - Check client connection');
console.log('  • clearBuffers() - Clear all local buffers');
console.log('  • testMCPFormat() - Test current page format compliance');
console.log('  • validateMCPFormat() - Get detailed format validation');
console.log('');
console.log('📖 FORMAT RULES: Always use code blocks around MCP blocks!');
console.log('✅ Correct: ``` [MCP-START] content [MCP-END] ```');
console.log('❌ Wrong: [MCP-START]content[MCP-END] on same line');
console.log('');
console.log(`🔧 Config: Auto-send ${AUTO_SEND_ENABLED ? 'ON' : 'OFF'}, Client: ${MCP_CLIENT_URL}, Debug: ${DEBUG_MODE ? 'ON' : 'OFF'}`);

// Add CSS animation for notifications
const style = document.createElement('style');
style.textContent = `
    @keyframes mcpSlideIn {
        from { transform: translateX(100%); opacity: 0; }
        to { transform: translateX(0); opacity: 1; }
    }
`;
document.head.appendChild(style);
