#!/usr/bin/env node
/**
 * CLI wrapper for session compression tool
 * Reads JSON from stdin, executes compression, outputs JSON to stdout
 * Logs go to stderr to avoid polluting stdout
 */

const { compressSession } = require('./dist/index');

// Redirect console.log/warn/error to stderr to keep stdout clean for JSON
const originalLog = console.log;
const originalWarn = console.warn;
const originalError = console.error;

console.log = (...args) => originalError(...args);
console.warn = (...args) => originalError(...args);

// Read stdin
let inputData = '';

process.stdin.on('data', (chunk) => {
  inputData += chunk;
});

process.stdin.on('end', async () => {
  try {
    const input = JSON.parse(inputData);
    const result = await compressSession(input);
    // Use originalLog to write JSON to stdout
    originalLog(JSON.stringify(result));
    process.exit(0);
  } catch (error) {
    originalError(JSON.stringify({
      success: false,
      error: error.message,
      stack: error.stack
    }));
    process.exit(1);
  }
});
