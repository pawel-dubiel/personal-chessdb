// Test the evaluation logic independently
class EvaluationTester {
    constructor() {
        this.testCases = [
            {
                description: "White to move - excellent move",
                isBlackToMove: false,
                bestEval: 0.5,
                playerEval: 0.5,
                expectedQuality: "excellent"
            },
            {
                description: "White to move - good move", 
                isBlackToMove: false,
                bestEval: 0.5,
                playerEval: 0.2,
                expectedQuality: "good"
            },
            {
                description: "White to move - poor move",
                isBlackToMove: false,
                bestEval: 0.5,
                playerEval: -0.8,
                expectedQuality: "poor"
            },
            {
                description: "Black to move - excellent move",
                isBlackToMove: true,
                bestEval: -0.3,  // Engine perspective: negative = good for black
                playerEval: -0.3,
                expectedQuality: "excellent"
            },
            {
                description: "Black to move - good move",
                isBlackToMove: true,
                bestEval: -0.3,  // Engine perspective
                playerEval: -0.6,  // Slightly worse for black
                expectedQuality: "good"
            },
            {
                description: "Black to move - poor move",
                isBlackToMove: true,
                bestEval: -0.3,  // Good for black
                playerEval: 0.8,   // Bad for black (good for white)
                expectedQuality: "poor"
            }
        ];
    }

    classifyMoveQuality(playerEval, bestEval, isBlackToMove) {
        console.log(`Input: playerEval=${playerEval}, bestEval=${bestEval}, isBlackToMove=${isBlackToMove}`);
        
        // Adjust evaluations to be from the current player's perspective
        let adjustedBestEval = bestEval;
        let adjustedPlayerEval = playerEval;
        
        // If it's black to move, both evaluations should be negated for comparison
        if (isBlackToMove) {
            adjustedBestEval = -adjustedBestEval;
            adjustedPlayerEval = -adjustedPlayerEval;
        }
        
        const evalDiff = Math.abs(adjustedPlayerEval - adjustedBestEval);
        
        console.log(`Adjusted: playerEval=${adjustedPlayerEval}, bestEval=${adjustedBestEval}, diff=${evalDiff}`);
        
        if (evalDiff <= 0.1) return 'excellent';
        if (evalDiff <= 0.5) return 'good';
        if (evalDiff <= 1.0) return 'ok';
        return 'poor';
    }

    runTests() {
        console.log("=== EVALUATION LOGIC TESTS ===\n");
        
        let passed = 0;
        let failed = 0;
        
        for (let i = 0; i < this.testCases.length; i++) {
            const test = this.testCases[i];
            console.log(`Test ${i + 1}: ${test.description}`);
            
            const actualQuality = this.classifyMoveQuality(
                test.playerEval,
                test.bestEval,
                test.isBlackToMove
            );
            
            if (actualQuality === test.expectedQuality) {
                console.log(`✓ PASS: Got ${actualQuality}\n`);
                passed++;
            } else {
                console.log(`✗ FAIL: Expected ${test.expectedQuality}, got ${actualQuality}\n`);
                failed++;
            }
        }
        
        console.log(`=== RESULTS ===`);
        console.log(`Passed: ${passed}`);
        console.log(`Failed: ${failed}`);
        console.log(`Total: ${passed + failed}`);
        
        return failed === 0;
    }
}

const tester = new EvaluationTester();
tester.runTests();