#!/usr/bin/env node

/**
 * Chess Database Pro - Interactive Demo
 * 
 * This script demonstrates the key features of Chess Database Pro
 * including position search, multi-piece patterns, and API usage.
 */

const axios = require('axios');

const BASE_URL = 'http://localhost:3000';

console.log('♟️  Chess Database Pro - Interactive Demo');
console.log('========================================\n');

async function checkServer() {
  try {
    await axios.get(`${BASE_URL}/api/stats`);
    console.log('✅ Server is running at http://localhost:3000\n');
    return true;
  } catch (error) {
    console.log('❌ Server is not running. Please start with: npm start\n');
    return false;
  }
}

async function showStats() {
  try {
    const response = await axios.get(`${BASE_URL}/api/stats/detailed`);
    const stats = response.data;
    
    console.log('📊 Database Statistics:');
    console.log(`   Games: ${stats.totalGames.toLocaleString()}`);
    console.log(`   Positions: ${stats.totalPositions.toLocaleString()}`);
    console.log(`   Players: ${stats.totalPlayers.toLocaleString()}`);
    console.log(`   Events: ${stats.totalEvents.toLocaleString()}\n`);
  } catch (error) {
    console.log('❌ Could not fetch database statistics\n');
  }
}

async function demoExactSearch() {
  console.log('🔍 Demo: Exact Position Search');
  console.log('Searching for starting position...');
  
  try {
    const response = await axios.post(`${BASE_URL}/api/positions/search`, {
      fen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
      searchType: "exact",
      page: 1,
      pageSize: 3
    });
    
    const results = response.data;
    console.log(`   Found ${results.pagination.totalGames} games with starting position`);
    if (results.games.length > 0) {
      console.log(`   Example: ${results.games[0].white} vs ${results.games[0].black}`);
    }
    console.log('');
  } catch (error) {
    console.log('   ❌ Search failed\n');
  }
}

async function demoPatternSearch() {
  console.log('🎯 Demo: Pattern Search (Single Piece)');
  console.log('Searching for white pawn on d4...');
  
  try {
    const response = await axios.post(`${BASE_URL}/api/positions/search`, {
      fen: "8/8/8/8/3P4/8/8/8 w - - 0 1",
      searchType: "pattern",
      page: 1,
      pageSize: 1
    });
    
    const results = response.data;
    console.log(`   Found ${results.pagination.totalGames} positions with white pawn on d4\n`);
  } catch (error) {
    console.log('   ❌ Search failed\n');
  }
}

async function demoMultiPieceSearch() {
  console.log('⚡ Demo: Multi-Piece OR Logic');
  console.log('Searching for [Pawn OR Knight] on d4...');
  
  try {
    const response = await axios.post(`${BASE_URL}/api/positions/search`, {
      fen: "8/8/8/8/3[P|N]4/8/8/8 w - - 0 1",
      searchType: "pattern",
      page: 1,
      pageSize: 1
    });
    
    const results = response.data;
    console.log(`   Found ${results.pagination.totalGames} positions with pawn OR knight on d4`);
    console.log('   This demonstrates the multi-piece search functionality.\n');
  } catch (error) {
    console.log('   ❌ Search failed\n');
  }
}

async function demoComplexPattern() {
  console.log('🧠 Demo: Complex Multi-Square Pattern');
  console.log('Searching for central squares occupied by [P|N] pieces...');
  
  try {
    const response = await axios.post(`${BASE_URL}/api/positions/search`, {
      fen: "8/8/8/8/3[P|N][P|N]3/8/8/8 w - - 0 1",
      searchType: "pattern",
      page: 1,
      pageSize: 1
    });
    
    const results = response.data;
    console.log(`   Found ${results.pagination.totalGames} positions with the complex pattern`);
    console.log('   Pattern: d4 and e4 both have [Pawn OR Knight]\n');
  } catch (error) {
    console.log('   ❌ Search failed\n');
  }
}

async function demoMaterialSearch() {
  console.log('⚖️  Demo: Material Signature Search');
  console.log('Searching for positions with same material as starting position...');
  
  try {
    const response = await axios.post(`${BASE_URL}/api/positions/search`, {
      fen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
      searchType: "material",
      page: 1,
      pageSize: 1
    });
    
    const results = response.data;
    console.log(`   Found ${results.pagination.totalGames} positions with identical material\n`);
  } catch (error) {
    console.log('   ❌ Search failed\n');
  }
}

async function showFeatureSummary() {
  console.log('🌟 Key Features Demonstrated:');
  console.log('   ✅ Exact position search');
  console.log('   ✅ Single piece pattern search');
  console.log('   ✅ Multi-piece OR logic ([P|N])');
  console.log('   ✅ Complex multi-square patterns');
  console.log('   ✅ Material signature search');
  console.log('   ✅ Real-time database statistics\n');
  
  console.log('🚀 Try the web interface at: http://localhost:3000');
  console.log('📚 Read the full documentation in README.md');
  console.log('🧪 Run tests with: npm run test:unit\n');
  
  console.log('Thank you for trying Chess Database Pro! ♟️');
}

async function runDemo() {
  const serverRunning = await checkServer();
  if (!serverRunning) {
    return;
  }
  
  await showStats();
  await demoExactSearch();
  await demoPatternSearch();
  await demoMultiPieceSearch();
  await demoComplexPattern();
  await demoMaterialSearch();
  await showFeatureSummary();
}

// Check if axios is available
try {
  require.resolve('axios');
} catch (e) {
  console.log('Installing axios for demo...');
  require('child_process').execSync('npm install axios', { stdio: 'inherit' });
}

if (require.main === module) {
  runDemo().catch(error => {
    console.error('Demo failed:', error.message);
    process.exit(1);
  });
}

module.exports = { runDemo };