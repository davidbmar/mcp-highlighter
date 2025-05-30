// html-mcp-tester.js
// Test MCP block detection on saved Claude conversation HTML

const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

class HTMLMCPTester {
    constructor() {
        this.mcpBuffers = [];
        this.mcpSentBlocks = new Set();
    }

    // Load and parse HTML file
    loadHTML(filePath) {
        try {
            const html = fs.readFileSync(filePath, 'utf8');
            const dom = new JSDOM(html);
            return dom.window.document;
        } catch (error) {
            console.error('❌ Error loading HTML file:', error.message);
            return null;
        }
    }

    // Extract text using different methods (like browser does)
    extractText(document, method = 'innerText') {
        switch (method) {
            case 'innerText':
                // Simulate browser innerText behavior
                return this.getInnerText(document.body);
            case 'innerHTML':
                return document.body.innerHTML;
            case 'textContent':
                return document.body.textContent;
            default:
                return document.body.innerHTML;
        }
    }

    // Simulate browser innerText (removes hidden elements, preserves spacing)
    getInnerText(element) {
        let text = '';
        
        for (let node of element.childNodes) {
            if (node.nodeType === 3) { // Text node
                text += node.textContent;
            } else if (node.nodeType === 1) { // Element node
                const style = node.style || {};
                const display = style.display;
                const visibility = style.visibility;
                
                // Skip hidden elements (basic simulation)
                if (display === 'none' || visibility === 'hidden') {
                    continue;
                }
                
                // Add spacing for block elements
                const blockElements = ['div', 'p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'br'];
                if (blockElements.includes(node.tagName?.toLowerCase())) {
                    text += '\n';
                }
                
                text += this.getInnerText(node);
                
                if (blockElements.includes(node.tagName?.toLowerCase())) {
                    text += '\n';
                }
            }
        }
        
        return text;
    }

    // Core MCP scanning logic (same as before)
    scanMCP(text) {
        const blocks = text.match(/\[MCP-START\]([\s\S]*?)\[MCP-END\]/g);
        
        if (!blocks) {
            console.log('🔍 MCP Scan: No blocks found');
            return { found: 0, new: 0, duplicates: 0, total: this.mcpBuffers.length };
        }

        const newBlocks = [];
        let duplicatesSkipped = 0;
        
        blocks.forEach((block, index) => {
            const content = block.replace('[MCP-START]', '').replace('[MCP-END]', '').trim();
            
            // Create content hash to detect duplicates
            const contentHash = Buffer.from(content).toString('base64').substring(0, 20);
            
            if (!this.mcpSentBlocks.has(contentHash)) {
                const mcpBlock = {
                    content: content,
                    hash: contentHash,
                    timestamp: new Date().toISOString(),
                    capturedAt: new Date().toLocaleTimeString(),
                    wordCount: content.split(' ').length,
                    blockIndex: index + 1
                };
                
                this.mcpBuffers.push(mcpBlock);
                newBlocks.push(mcpBlock);
                this.mcpSentBlocks.add(contentHash);
            } else {
                duplicatesSkipped++;
            }
        });
        
        return {
            found: blocks.length,
            new: newBlocks.length,
            duplicates: duplicatesSkipped,
            total: this.mcpBuffers.length,
            blocks: newBlocks
        };
    }

    // Test all extraction methods
    testAllMethods(htmlFile) {
        console.log('🚀 HTML MCP Block Tester');
        console.log('========================\n');
        
        const document = this.loadHTML(htmlFile);
        if (!document) return;
        
        console.log(`📄 Loaded HTML file: ${htmlFile}`);
        console.log(`📏 File size: ${fs.statSync(htmlFile).size} bytes\n`);
        
        const methods = ['innerText', 'innerHTML', 'textContent'];
        const results = {};
        
        methods.forEach(method => {
            console.log(`🔍 Testing with ${method} extraction:`);
            console.log('-'.repeat(40));
            
            // Reset state for each method
            this.mcpBuffers = [];
            this.mcpSentBlocks.clear();
            
            const text = this.extractText(document, method);
            const result = this.scanMCP(text);
            
            results[method] = result;
            
            console.log(`Found: ${result.found} blocks`);
            console.log(`New: ${result.new} blocks`);
            console.log(`Duplicates: ${result.duplicates}`);
            
            if (result.blocks.length > 0) {
                console.log('\nBlock details:');
                result.blocks.forEach((block, i) => {
                    console.log(`  Block ${i + 1}:`);
                    console.log(`    Words: ${block.wordCount}`);
                    console.log(`    Hash: ${block.hash}`);
                    console.log(`    Preview: ${block.content.substring(0, 80)}...`);
                });
            }
            
            console.log('\n');
        });
        
        // Summary comparison
        console.log('📊 COMPARISON SUMMARY');
        console.log('=====================');
        methods.forEach(method => {
            const result = results[method];
            console.log(`${method.padEnd(12)}: ${result.found} found, ${result.new} new`);
        });
        
        // Find the best method
        const bestMethod = methods.reduce((best, method) => {
            return results[method].found > results[best].found ? method : best;
        });
        
        console.log(`\n🏆 Best method: ${bestMethod} (found ${results[bestMethod].found} blocks)`);
        
        return results;
    }

    // Detailed analysis of found blocks
    analyzeBlocks(htmlFile) {
        console.log('\n🔬 DETAILED BLOCK ANALYSIS');
        console.log('===========================\n');
        
        const document = this.loadHTML(htmlFile);
        if (!document) return;
        
        // Use innerHTML method for most comprehensive analysis
        const text = this.extractText(document, 'innerHTML');
        
        // Find all potential MCP markers
        const startMarkers = (text.match(/\[MCP-START\]/g) || []).length;
        const endMarkers = (text.match(/\[MCP-END\]/g) || []).length;
        
        console.log(`🔍 MCP Marker Analysis:`);
        console.log(`   [MCP-START] found: ${startMarkers}`);
        console.log(`   [MCP-END] found: ${endMarkers}`);
        console.log(`   Expected blocks: ${Math.min(startMarkers, endMarkers)}`);
        
        // Show actual matches
        const blocks = text.match(/\[MCP-START\]([\s\S]*?)\[MCP-END\]/g) || [];
        console.log(`   Regex matches: ${blocks.length}\n`);
        
        if (blocks.length > 0) {
            console.log('📋 Found MCP Blocks:');
            blocks.forEach((block, i) => {
                const content = block.replace('[MCP-START]', '').replace('[MCP-END]', '').trim();
                console.log(`\nBlock ${i + 1}:`);
                console.log(`  Length: ${content.length} chars`);
                console.log(`  Words: ${content.split(' ').length}`);
                console.log(`  First 100 chars: ${content.substring(0, 100)}${content.length > 100 ? '...' : ''}`);
                
                // Check for potential formatting issues
                if (content.includes('\n')) {
                    console.log(`  Contains newlines: Yes`);
                }
                if (content.includes('<')) {
                    console.log(`  Contains HTML: Yes`);
                }
            });
        }
        
        return blocks;
    }

    // Export blocks as JSON for MCP client
    exportBlocks(blocks, outputFile = 'extracted-mcp-blocks.json') {
        const exportData = {
            extractedAt: new Date().toISOString(),
            totalBlocks: blocks.length,
            blocks: blocks.map((block, i) => ({
                id: `html-extract-${Date.now()}-${i}`,
                content: block.replace('[MCP-START]', '').replace('[MCP-END]', '').trim(),
                extractedFrom: 'claude-conversation.html',
                blockNumber: i + 1
            }))
        };
        
        fs.writeFileSync(outputFile, JSON.stringify(exportData, null, 2));
        console.log(`\n💾 Exported ${blocks.length} blocks to ${outputFile}`);
        
        return exportData;
    }
}

// Command line interface
if (require.main === module) {
    const tester = new HTMLMCPTester();
    
    // Get HTML file from command line argument or use default
    const htmlFile = process.argv[2] || 'claude-conversation.html';
    
    if (!fs.existsSync(htmlFile)) {
        console.error(`❌ HTML file not found: ${htmlFile}`);
        console.log('Usage: node html-mcp-tester.js [path-to-html-file]');
        console.log('Or save your Claude conversation as "claude-conversation.html"');
        process.exit(1);
    }
    
    // Run all tests
    const results = tester.testAllMethods(htmlFile);
    const blocks = tester.analyzeBlocks(htmlFile);
    
    // Export blocks if found
    if (blocks && blocks.length > 0) {
        tester.exportBlocks(blocks);
    }
    
    console.log('\n✅ Analysis complete!');
}

module.exports = HTMLMCPTester;
