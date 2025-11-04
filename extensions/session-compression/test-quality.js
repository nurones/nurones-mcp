#!/usr/bin/env node
/**
 * Test Path B features
 */

const { QualityScorer } = require('./dist/quality-scorer');

// Test ROUGE-L calculation
const scorer = new QualityScorer();

const original = "The quick brown fox jumps over the lazy dog";
const summary1 = "The quick brown fox jumps"; // Good summary
const summary2 = "A fast animal moves"; // Poor summary

const score1 = scorer.calculateRougeL(original, summary1);
const score2 = scorer.calculateRougeL(original, summary2);

console.log('=== ROUGE-L Quality Scoring Test ===');
console.log(`Original: "${original}"`);
console.log(`\nSummary 1: "${summary1}"`);
console.log(`Score: ${(score1 * 100).toFixed(1)}%`);
console.log(`\nSummary 2: "${summary2}"`);
console.log(`Score: ${(score2 * 100).toFixed(1)}%`);

// Test with tiers
const scoreT1 = scorer.score(original, summary1, 'T1');
const scoreT2 = scorer.score(original, summary2, 'T2');

console.log(`\n=== Tier Threshold Testing ===`);
console.log(`T1 (threshold 85%): ${scorer.getAssessment(scoreT1)}`);
console.log(`T2 (threshold 70%): ${scorer.getAssessment(scoreT2)}`);
console.log(`\nShould rollback T1: ${scorer.shouldRollback(scoreT1)}`);
console.log(`Should rollback T2: ${scorer.shouldRollback(scoreT2)}`);
console.log(`Fallback tier: ${scorer.getFallbackTier()}`);

console.log('\n✅ Quality scoring tests complete');
