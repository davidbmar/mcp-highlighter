// nested-mcp-tests.js
// Comprehensive test suite for MCP block edge cases and nested scenarios

class MCPEdgeCaseTester {
    constructor() {
        this.testCases = [];
        this.setupTestCases();
    }

    setupTestCases() {
        // Test Case 1: Basic valid blocks
        this.addTest("Basic Valid Blocks", `
            Regular text here.
            [MCP-START]
            This is a simple valid block.
            [MCP-END]
            More text.
            [MCP-START]
            Another valid block.
            [MCP-END]
        `, { expected: 2, description: "Should find 2 clean blocks" });

        // Test Case 2: Nested MCP markers in content (your actual issue)
        this.addTest("Nested MCP Markers in Documentation", `
            [MCP-START]
            # MCP System Documentation
            
            The scanner uses regex to find [MCP-START] and [MCP-END] markers.
            Format: [MCP-START]content[MCP-END]
            
            ## Usage:
            1. Write [MCP-START] to begin
            2. Add your content
            3. Write [MCP-END] to finish
            [MCP-END]
            
            [MCP-START]
            Another block after the problematic one.
            [MCP-END]
        `, { expected: 2, description: "Should handle nested markers in content" });

        // Test Case 3: Multiple nested levels
        this.addTest("Deep Nested Markers", `
            [MCP-START]
            Code example showing MCP usage:
            
            function scanMCP() {
                const blocks = text.match(/\\[MCP-START\\]([\\s\\S]*?)\\[MCP-END\\]/g);
                // This finds [MCP-START]...[MCP-END] patterns
            }
            
            Example block:
            [MCP-START]
            Nested example content
            [MCP-END]
            [MCP-END]
        `, { expected: 1, description: "Should handle deeply nested markers" });

        // Test Case 4: Broken/Malformed blocks
        this.addTest("Malformed Blocks", `
            [MCP-START]
            This block has no end tag
            
            [MCP-START]
            This is a complete block
            [MCP-END]
            
            [MCP-END]
            This end tag has no start
        `, { expected: 1, description: "Should only find complete blocks" });

        // Test Case 5: Adjacent blocks
        this.addTest("Adjacent Blocks", `
            [MCP-START]First block[MCP-END][MCP-START]Second block[MCP-END]
            
            [MCP-START]
            Third block
            [MCP-END]
        `, { expected: 3, description: "Should handle adjacent blocks" });

        // Test Case 6: Empty blocks
        this.addTest("Empty and Whitespace Blocks", `
            [MCP-START][MCP-END]
            
            [MCP-START]
            
            [MCP-END]
            
            [MCP-START]
            Only whitespace and newlines
            
            [MCP-END]
        `, { expected: 3, description: "Should handle empty/whitespace blocks" });

        // Test Case 7: Case sensitivity
        this.addTest("Case Sensitivity", `
            [MCP-START]Correct case[MCP-END]
            [mcp-start]Wrong case[mcp-end]
            [MCP-Start]Mixed case[MCP-End]
            [MCP-START]Another correct[MCP-END]
        `, { expected: 2, description: "Should be case sensitive" });

        // Test Case 8: Special characters and code
        this.addTest("Special Characters in Content", `
            [MCP-START]
            Content with special chars: !@#$%^&*()
            Unicode: 🚀 🎯 ✅ ❌
            Regex chars: []{}()*+?.|^$\\
            HTML: <div>test</div>
            JSON: {"key": "value"}
            [MCP-END]
        `, { expected: 1, description: "Should handle special characters" });

        // Test Case 9: Real-world Claude conversation simulation
        this.addTest("Real Claude Conversation", `
            Here's how to use the MCP system:

            [MCP-START]
            # MCP Implementation Guide
            
            ## Step 1: Detection
            The extension scans for [MCP-START] and [MCP-END] markers.
            
            ## Step 2: Processing  
            Use regex: /\\[MCP-START\\]([\\s\\S]*?)\\[MCP-END\\]/g
            
            ## Example:
            [MCP-START]
            Your memory content here
            [MCP-END]
            [MCP-END]
            
            [MCP-START]
            {
              "config": {
                "scanner": "enabled",
                "format": "[MCP-START]...[MCP-END]"
              }
            }
            [MCP-END]
            
            That's how you implement MCP blocks properly!
        `, { expected: 2, description: "Real conversation with nested examples" });

        // Test Case 10: Stress test with many nested patterns
        this.addTest("Stress Test - Many Nested Patterns", `
            [MCP-START]
            This is a complex documentation block about MCP.
            
            Format: [MCP-START]content[MCP-END]
            
            Examples:
            1. [MCP-START]Simple example[MCP-END]
            2. [MCP-START]Another example[MCP-END]
            
            Regex pattern: /\\[MCP-START\\]([\\s\\S]*?)\\[MCP-END\\]/g
            
            Common issues:
            - Missing [MCP-END] tag
            - Incorrect [MCP-start] casing
            - Nested [MCP-START] within [MCP-START]...[MCP-END] blocks
            
            Best practices:
            - Always use [MCP-START] and [MCP-END]
            - Avoid mentioning [MCP-START] and [MCP-END] in content
            - Test with various [MCP-START]...[MCP-END] scenarios
            [MCP-END]
        `, { expected: 1, description: "Stress test with many false markers" });
    }

    addTest(name, content, config) {
        this.testCases.push({
            name,
            content,
            expected: config.expected,
            description: config.description
        });
    }

    // Test different regex strategies
    testRegexStrategies() {
        const strategies = {
            // Original regex (problematic)
            original: /\[MCP-START\]([\s\S]*?)\[MCP-END\]/g,
            
            // Stricter - requires newlines
            strict: /\[MCP-START\]\s*\n([\s\S]*?)\n\s*\[MCP-END\]/g,
            
            // Line-based - markers must be on own lines
            lineBased: /^\s*\[MCP-START\]\s*$([\s\S]*?)^\s*\[MCP-END\]\s*$/gm,
            
            // Non-greedy with lookahead to avoid nested content
            lookahead: /\[MCP-START\]((?:(?!\[MCP-START\])[\s\S])*?)\[MCP-END\]/g,
            
            // Balanced approach - allows some flexibility but avoids nesting
            balanced: /\[MCP-START\]\s*([\s\S]*?)\s*\[MCP-END\](?!\s*\[MCP-END\])/g,
            
            // Ultra-strict - requires exact line format
            ultraStrict: /^[ \t]*\[MCP-START\][ \t]*$\n([\s\S]*?)\n^[ \t]*\[MCP-END\][ \t]*$/gm
        };

        console.log('🧪 REGEX STRATEGY COMPARISON');
        console.log('============================\n');

        this.testCases.forEach((testCase, i) => {
            console.log(`📋 Test ${i + 1}: ${testCase.name}`);
            console.log(`Expected: ${testCase.expected} blocks`);
            console.log(`Description: ${testCase.description}`);
            console.log('-'.repeat(50));

            Object.entries(strategies).forEach(([name, regex]) => {
                const matches = testCase.content.match(regex) || [];
                const success = matches.length === testCase.expected;
                const status = success ? '✅' : '❌';
                
                console.log(`${status} ${name.padEnd(12)}: ${matches.length} blocks found`);
            });

            console.log('\n');
        });

        // Summary
        console.log('📊 STRATEGY PERFORMANCE SUMMARY');
        console.log('================================');
        
        const results = {};
        Object.keys(strategies).forEach(name => {
            results[name] = { passed: 0, total: this.testCases.length };
        });

        this.testCases.forEach(testCase => {
            Object.entries(strategies).forEach(([name, regex]) => {
                const matches = testCase.content.match(regex) || [];
                if (matches.length === testCase.expected) {
                    results[name].passed++;
                }
            });
        });

        Object.entries(results).forEach(([name, result]) => {
            const percentage = Math.round((result.passed / result.total) * 100);
            const status = percentage === 100 ? '🏆' : percentage >= 80 ? '🥈' : percentage >= 60 ? '🥉' : '❌';
            console.log(`${status} ${name.padEnd(12)}: ${result.passed}/${result.total} (${percentage}%)`);
        });

        return results;
    }

    // Recommend best strategy based on results
    recommendStrategy() {
        const results = this.testRegexStrategies();
        
        console.log('\n🎯 RECOMMENDATION');
        console.log('=================');
        
        const bestStrategy = Object.entries(results).reduce((best, [name, result]) => {
            const percentage = result.passed / result.total;
            if (percentage > best.percentage) {
                return { name, percentage, ...result };
            }
            return best;
        }, { percentage: 0 });

        if (bestStrategy.percentage === 1) {
            console.log(`🏆 Perfect strategy: ${bestStrategy.name}`);
            console.log(`✅ Passes all ${bestStrategy.total} tests`);
        } else {
            console.log(`🥇 Best strategy: ${bestStrategy.name}`);
            console.log(`📊 Passes ${bestStrategy.passed}/${bestStrategy.total} tests (${Math.round(bestStrategy.percentage * 100)}%)`);
            console.log(`⚠️  Consider edge case handling for remaining ${bestStrategy.total - bestStrategy.passed} cases`);
        }

        return bestStrategy;
    }

    // Export problematic test cases for manual review
    exportProblematicCases(strategy = 'original') {
        const regex = /\[MCP-START\]([\s\S]*?)\[MCP-END\]/g; // Original strategy
        
        const problematic = this.testCases.filter(testCase => {
            const matches = testCase.content.match(regex) || [];
            return matches.length !== testCase.expected;
        });

        console.log('\n🚨 PROBLEMATIC TEST CASES');
        console.log('=========================');
        
        problematic.forEach((testCase, i) => {
            const matches = testCase.content.match(regex) || [];
            console.log(`\n${i + 1}. ${testCase.name}`);
            console.log(`   Expected: ${testCase.expected}, Found: ${matches.length}`);
            console.log(`   Issue: ${testCase.description}`);
            console.log(`   Content preview: ${testCase.content.substring(0, 100)}...`);
        });

        return problematic;
    }
}

// Run the comprehensive test suite
if (require.main === module) {
    console.log('🚀 MCP Edge Case Test Suite');
    console.log('============================\n');
    
    const tester = new MCPEdgeCaseTester();
    
    // Test all regex strategies
    const recommendation = tester.recommendStrategy();
    
    // Show problematic cases
    tester.exportProblematicCases();
    
    console.log('\n✅ Edge case analysis complete!');
    console.log(`💡 Recommended regex strategy: ${recommendation.name}`);
}

module.exports = MCPEdgeCaseTester;
