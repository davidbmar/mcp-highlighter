// Barebones MCP Buffer System - Super Simple Version
// Just the absolute essentials

// Initialize storage
window.mcpBuffers = [];

// Simple scan function
function scanMCP() {
    const text = document.body.innerText;
    const blocks = text.match(/\[MCP-START\]([\s\S]*?)\[MCP-END\]/g);
    
    if (blocks) {
        blocks.forEach(block => {
            const content = block.replace('[MCP-START]', '').replace('[MCP-END]', '').trim();
            window.mcpBuffers.push({
                content: content,
                time: new Date().toLocaleTimeString()
            });
        });
    }
    
    console.log(`Found ${blocks ? blocks.length : 0} blocks. Total buffers: ${window.mcpBuffers.length}`);
    return blocks ? blocks.length : 0;
}

// View buffers
function viewBuffers() {
    console.log('=== MCP BUFFERS ===');
    window.mcpBuffers.forEach((buffer, i) => {
        console.log(`Buffer ${i + 1}:`);
        console.log(buffer.content);
        console.log('---');
    });
    return window.mcpBuffers;
}

// Clear buffers
function clearBuffers() {
    window.mcpBuffers = [];
    console.log('Buffers cleared');
}

// Create scan button
const button = document.createElement('button');
button.innerHTML = '🧠 SCAN';
button.style.cssText = `
    position: fixed; top: 20px; right: 20px; z-index: 10000;
    background: blue; color: white; border: none; padding: 10px;
    border-radius: 5px; cursor: pointer;
`;
button.onclick = scanMCP;
document.body.appendChild(button);

console.log('MCP Ready! Commands: scanMCP(), viewBuffers(), clearBuffers()');
