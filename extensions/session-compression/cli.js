#!/usr/bin/env node
/**
 * CLI wrapper for session compression tool
 * Reads JSON from stdin, executes compression, outputs JSON to stdout
 */

const { compressSession } = require('./dist/index');

// Read stdin
let inputData = '';

process.stdin.on('data', (chunk) => {
  inputData += chunk;
});

process.stdin.on('end', async () => {
  try {
    const input = JSON.parse(inputData);
    const result = await compressSession(input);
    console.log(JSON.stringify(result));
    process.exit(0);
  } catch (error) {
    console.error(JSON.stringify({
      success: false,
      error: error.message,
      stack: error.stack
    }));
    process.exit(1);
  }
});
