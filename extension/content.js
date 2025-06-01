/*
 * MCP Memory System - Ultra-Strict Content Scanner (FIXED)
 * ========================================================
 * 
 * FIXED: Now correctly extracts only MCP content, ignoring markdown backticks
 * 
 * MCP BLOCK FORMAT RULES (STRICTLY ENFORCED):
 * ===========================================
 * 
 * ✅ CORRECT FORMAT (MCP tags must be on their own lines):
 * ```
 * [MCP-START]
 * Your actual memory content here
 * Can be multiple lines
 * [MCP-END]
 * ```
 * 
 * The backticks (```) are just markdown formatting - they're NOT part of the MCP content
 * Only the text between [MCP-START] and [MCP-END] is captured and hashed
 * 
 * ❌ INCORRECT FORMATS (WILL BE IGNORED):
 * [MCP-START]content[MCP-END]                    // Same line - NOT ALLOWED
 * text before [MCP-START]                        // Not on own line - NOT ALLOWED  
 * [MCP-END] text after                           // Not on own line - NOT ALLOWED
 * [mcp-start] or [MCP-start]                     // Wrong case - NOT ALLOWED
 */

// Configuration - declared once at the top
const MCP_CLIENT_URL = 'http://localhost:3001';
const AUTO_SEND_ENABLED = true;
const DEBUG_MODE = true; // Set to false for production

// Initialize storage
window.mcpBuffers = window.mcpBuffers || [];
window.mcpSentBlocks = window.mcpSentBlocks || new Set();

// Generate consistent content hash (matches server implementation)
function generateContentHash(content) {
    let hash = 0;
    const str = content.trim(); // Normalize whitespace
    if (DEBUG_MODE) {
        console.log(`🔢 Generating hash for content (${str.length} chars):`, str.substring(0, 50) + (str.length > 50 ? '...' : ''));
    }
    for (let i = 0; i < str.length; i++) {
        const char = str.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash; // Convert to 32-bit integer
    }
    const finalHash = Math.abs(hash).toString(36);
    if (DEBUG_MODE) {
        console.log(`🔢 Generated hash: ${finalHash}`);
    }
    return finalHash;
}

// Check hashes with server
async function checkHashesWithServer(hashes) {
    if (hashes.length === 0) {
        return { success: true, hashStatus: {}, summary: { total: 0, existing: 0, new: 0 } };
    }
    
    try {
        if (DEBUG_MODE) console.log(`🔍 Checking ${hashes.length} hashes with server...`);
        
        const response = await fetch(`${MCP_CLIENT_URL}/mcp/check-hashes`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'User-Agent': 'MCP-Browser-Extension-Strict/2.0'
            },
            body: JSON.stringify({ hashes })
        });
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        const result = await response.json();
        
        if (DEBUG_MODE) {
            console.log(`✅ Hash check results:`, result.summary);
            console.log(`   • Total hashes: ${result.summary.total}`);
            console.log(`   • Already exist: ${result.summary.existing}`);
            console.log(`   • New content: ${result.summary.new}`);
        }
        
        return result;
        
    } catch (error) {
        console.error('❌ Failed to check hashes with server:', error);
        return { success: false, error: error.message };
    }
}

// Fallback: process blocks locally (when server unavailable)
function processBlocksLocally(blocks) {
    const newBlocks = [];
    let duplicatesSkipped = 0;
    
    blocks.forEach(block => {
        if (!window.mcpSentBlocks.has(block.hash)) {
            window.mcpBuffers.push({
                ...block,
                sent: false,
                serverChecked: false
            });
            newBlocks.push(block);
            window.mcpSentBlocks.add(block.hash);
        } else {
            duplicatesSkipped++;
        }
    });
    
    console.log(`🔍 Local processing: ${newBlocks.length} new, ${duplicatesSkipped} duplicates`);
    
    if (AUTO_SEND_ENABLED && newBlocks.length > 0) {
        sendToMCPClient(newBlocks);
    }
    
    return newBlocks.length;
}

// FIXED: Enhanced MCP scanning that only captures MCP content (not backticks)
async function scanMCP() {
    if (DEBUG_MODE) console.log('🔍 Starting FIXED ultra-strict MCP scan (MCP content only)...');
    
    const text = document.body.innerText;
    
    // First, validate format and provide helpful feedback
    validateMCPFormat(text);
    
    // FIXED: Ultra-strict regex that finds MCP blocks (tags must be on their own lines)
    const blockMatches = text.match(/^\s*\[MCP-START\]\s*$([\s\S]*?)^\s*\[MCP-END\]\s*$/gm);
    
    if (!blockMatches) {
        console.log('🔍 MCP Scan: No properly formatted MCP blocks found');
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

    if (DEBUG_MODE) {
        console.log(`🔍 Found ${blockMatches.length} properly formatted MCP blocks`);
    }

    // FIXED: Process blocks and extract ONLY the content between MCP tags
    const processedBlocks = [];
    blockMatches.forEach((blockMatch, index) => {
        if (DEBUG_MODE) {
            console.log(`📦 Processing MCP block ${index + 1}:`);
            console.log(`   Raw match:`, blockMatch.substring(0, 100) + (blockMatch.length > 100 ? '...' : ''));
        }
        
        // FIXED: Extract content between the MCP tags using regex capture group
        const contentMatch = blockMatch.match(/^\s*\[MCP-START\]\s*$([\s\S]*?)^\s*\[MCP-END\]\s*$/m);
        
        if (!contentMatch || !contentMatch[1]) {
            console.warn(`⚠️ Could not extract content from MCP block ${index + 1}`);
            return;
        }
        
        // FIXED: Get the actual content (capture group 1) and clean it
        const content = contentMatch[1].trim();
        
        if (DEBUG_MODE) {
            console.log(`   Extracted content (${content.length} chars):`, content.substring(0, 100) + (content.length > 100 ? '...' : ''));
        }
        
        // Skip empty blocks
        if (!content) {
            console.warn(`⚠️ Skipping empty MCP block ${index + 1}`);
            return;
        }
        
        // FIXED: Generate hash based ONLY on the MCP content (not including backticks or tags)
        const contentHash = generateContentHash(content);
        
        const mcpBlock = {
            content: content, // FIXED: Only the actual MCP content
            hash: contentHash, // FIXED: Hash of only the MCP content
            timestamp: new Date().toISOString(),
            capturedAt: new Date().toLocaleTimeString(),
            source: {
                url: window.location.href,
                title: document.title,
                domain: window.location.hostname
            },
            wordCount: content.split(/\s+/).length,
            blockNumber: index + 1,
            formatVersion: 'strict-v2-fixed'
        };
        
        processedBlocks.push(mcpBlock);
        
        if (DEBUG_MODE) {
            console.log(`📦 Processed MCP block ${index + 1}:`, {
                words: mcpBlock.wordCount,
                hash: mcpBlock.hash,
                preview: content.substring(0, 50) + (content.length > 50 ? '...' : ''),
                contentLength: content.length
            });
        }
    });

    if (processedBlocks.length === 0) {
        console.log('🔍 No valid MCP content found after processing');
        return 0;
    }

    // Check with server which hashes are new
    const hashes = processedBlocks.map(block => block.hash);
    const hashCheck = await checkHashesWithServer(hashes);
    
    if (!hashCheck.success) {
        console.warn('⚠️ Could not check for duplicates with server, processing locally');
        return processBlocksLocally(processedBlocks);
    }

    // Filter out blocks that already exist on server
    const newBlocks = processedBlocks.filter(block => 
        !hashCheck.hashStatus[block.hash]
    );
    
    const duplicateCount = processedBlocks.length - newBlocks.length;
    
    // Report results
    console.log(`🔍 FIXED MCP Scan Results (Content-Only Hashing):`);
    console.log(`  • Found: ${blockMatches.length} properly formatted MCP blocks`);
    console.log(`  • Valid content: ${processedBlocks.length} blocks`);
    console.log(`  • New: ${newBlocks.length} blocks`);
    console.log(`  • Server duplicates: ${duplicateCount}`);
    console.log(`  • Processing: ${newBlocks.length} blocks for storage`);
    
    // Store new blocks locally and send to server
    newBlocks.forEach(block => {
        window.mcpBuffers.push({
            ...block,
            sent: false,
            serverChecked: true
        });
    });
    
    // Auto-send new blocks to server
    if (AUTO_SEND_ENABLED && newBlocks.length > 0) {
        const sendResult = await sendToMCPClient(newBlocks);
        if (sendResult.success) {
            // Mark blocks as sent
            newBlocks.forEach(block => {
                const bufferBlock = window.mcpBuffers.find(b => b.hash === block.hash);
                if (bufferBlock) {
                    bufferBlock.sent = true;
                    bufferBlock.sentAt = new Date().toISOString();
                }
            });
        }
    }
    
    return newBlocks.length;
}

// FIXED: Validate MCP format and provide helpful feedback
function validateMCPFormat(text) {
    const allStartMarkers = (text.match(/\[MCP-START\]/g) || []).length;
    const allEndMarkers = (text.match(/\[MCP-END\]/g) || []).length;
    const validBlocks = (text.match(/^\s*\[MCP-START\]\s*$([\s\S]*?)^\s*\[MCP-END\]\s*$/gm) || []).length;
    
    if (DEBUG_MODE) {
        console.log(`📊 FIXED Format Validation (MCP Content Focus):`);
        console.log(`  • Total [MCP-START] markers: ${allStartMarkers}`);
        console.log(`  • Total [MCP-END] markers: ${allEndMarkers}`);
        console.log(`  • Valid strict-format MCP blocks: ${validBlocks}`);
        console.log(`  • Note: Only content between MCP tags is captured (backticks ignored)`);
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
        console.warn('   ```');
        console.warn('   [MCP-START]');
        console.warn('   Your memory content here');
        console.warn('   [MCP-END]');
        console.warn('   ```');
        console.warn('   (The ``` are just markdown - only the content between MCP tags is captured)');
    }
    
    return {
        totalMarkers: allStartMarkers + allEndMarkers,
        validBlocks: validBlocks,
        hasIssues: (allStartMarkers > validBlocks || allEndMarkers > validBlocks)
    };
}

// Enhanced send function for server-side hash checking
async function sendToMCPClient(blocks = null) {
    const blocksToSend = blocks || window.mcpBuffers.filter(block => !block.sent);
    
    if (blocksToSend.length === 0) {
        console.log('📡 No new blocks to send to MCP client');
        return { success: true, sent: 0 };
    }
    
    try {
        if (DEBUG_MODE) console.log(`📡 Sending ${blocksToSend.length} MCP content blocks to client...`);
        
        const response = await fetch(`${MCP_CLIENT_URL}/mcp/store`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'User-Agent': 'MCP-Browser-Extension-Strict/2.0-Fixed'
            },
            body: JSON.stringify({
                blocks: blocksToSend.map(block => ({
                    content: block.content, // FIXED: Only MCP content, no backticks
                    hash: block.hash, // FIXED: Hash of only MCP content
                    timestamp: block.timestamp,
                    wordCount: block.wordCount,
                    formatVersion: block.formatVersion || 'strict-v2-fixed'
                })),
                metadata: {
                    url: window.location.href,
                    title: document.title,
                    domain: window.location.hostname,
                    userAgent: navigator.userAgent,
                    capturedAt: new Date().toISOString(),
                    extensionVersion: 'strict-v2-fixed'
                }
            })
        });
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        const result = await response.json();
        
        console.log('✅ MCP Client Response:', result);
        console.log(`📊 Server stored ${result.stored} blocks, found ${result.duplicates} duplicates`);
        console.log(`📊 Server now has ${result.totalMemories} total memories`);
        
        // Show enhanced notification with duplicate info
        const duplicateInfo = result.duplicates > 0 ? ` (${result.duplicates} duplicates skipped)` : '';
        showNotification(`📡 Sent ${result.stored} MCP blocks to client${duplicateInfo}`, 'success');
        
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

// Show user notification
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

// Enhanced view buffers with server status
function viewBuffers() {
    console.log('=== FIXED MCP BUFFERS (MCP Content Only) ===');
    console.log(`Total buffers: ${window.mcpBuffers.length}`);
    console.log(`Sent to client: ${window.mcpBuffers.filter(b => b.sent).length}`);
    console.log(`Pending: ${window.mcpBuffers.filter(b => !b.sent).length}`);
    console.log(`Server-checked: ${window.mcpBuffers.filter(b => b.serverChecked).length}`);
    console.log('');
    
    window.mcpBuffers.forEach((buffer, i) => {
        console.log(`Buffer ${i + 1}:`);
        console.log(`  Content: ${buffer.content.substring(0, 100)}${buffer.content.length > 100 ? '...' : ''}`);
        console.log(`  Words: ${buffer.wordCount}`);
        console.log(`  Captured: ${buffer.capturedAt}`);
        console.log(`  Hash: ${buffer.hash}`);
        console.log(`  Server checked: ${buffer.serverChecked ? '✅ Yes' : '❌ No'}`);
        console.log(`  Sent: ${buffer.sent ? '✅ Yes (' + buffer.sentAt + ')' : '❌ No'}`);
        console.log(`  Format: ${buffer.formatVersion || 'legacy'}`);
        console.log(`  Content Length: ${buffer.content.length} chars`);
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

// FIXED: Test MCP format compliance (content-only focus)
function testMCPFormat() {
    console.log('🧪 Testing FIXED MCP format compliance (content-only extraction)...');
    const validation = validateMCPFormat(document.body.innerText);
    
    if (validation.hasIssues) {
        console.warn('⚠️ Page has MCP format issues - run scanMCP() for details');
    } else {
        console.log('✅ All MCP blocks follow strict format rules');
    }
    
    // FIXED: Test actual content extraction
    const text = document.body.innerText;
    const blockMatches = text.match(/^\s*\[MCP-START\]\s*$([\s\S]*?)^\s*\[MCP-END\]\s*$/gm);
    
    if (blockMatches) {
        console.log('🔍 Testing content extraction:');
        blockMatches.forEach((blockMatch, index) => {
            const contentMatch = blockMatch.match(/^\s*\[MCP-START\]\s*$([\s\S]*?)^\s*\[MCP-END\]\s*$/m);
            if (contentMatch && contentMatch[1]) {
                const content = contentMatch[1].trim();
                console.log(`  Block ${index + 1}: "${content.substring(0, 50)}${content.length > 50 ? '...' : ''}" (${content.length} chars)`);
            }
        });
    }
    
    return validation;
}

// Create enhanced scan button with fixed mode indicator
const scanButton = document.createElement('button');
scanButton.innerHTML = '🧠 SCAN (FIXED)';
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
    scanButton.innerHTML = found > 0 ? `🧠 FOUND ${found}!` : '🧠 SCAN (FIXED)';
    setTimeout(() => {
        scanButton.innerHTML = '🧠 SCAN (FIXED)';
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

// Add CSS animation for notifications
const style = document.createElement('style');
style.textContent = `
    @keyframes mcpSlideIn {
        from { transform: translateX(100%); opacity: 0; }
        to { transform: translateX(0); opacity: 1; }
    }
`;
document.head.appendChild(style);

console.log('🧠 FIXED MCP Ultra-Strict System Ready! (Content-Only Processing)');
console.log('📋 Available commands:');
console.log('  • scanMCP() - Scan and extract only MCP content (ignores backticks)');
console.log('  • viewBuffers() - View all captured MCP content with hash info');
console.log('  • sendPendingBuffers() - Send unsent buffers to client');
console.log('  • getMCPClientStatus() - Check client connection');
console.log('  • clearBuffers() - Clear all local buffers');
console.log('  • testMCPFormat() - Test content extraction on current page');
console.log('  • validateMCPFormat() - Get detailed format validation');
console.log('');
console.log('🔧 FIXED Features:');
console.log('  • Only captures content between [MCP-START] and [MCP-END]');
console.log('  • Ignores markdown backticks (they\'re just formatting)');
console.log('  • Hashes based only on actual memory content');
console.log('  • Cross-device duplicate prevention via content hashing');
console.log('');
console.log('📖 FORMAT RULES: MCP tags must be on their own lines!');
console.log('✅ Correct: ``` [MCP-START] \\n content \\n [MCP-END] ```');
console.log('❌ Wrong: [MCP-START]content[MCP-END] on same line');
console.log('💡 Note: The ``` backticks are just markdown formatting');
console.log('💡 Only the text between MCP tags is captured and stored');
console.log('');
console.log(`🔧 Config: Auto-send ${AUTO_SEND_ENABLED ? 'ON' : 'OFF'}, Client: ${MCP_CLIENT_URL}, Debug: ${DEBUG_MODE ? 'ON' : 'OFF'}`);
