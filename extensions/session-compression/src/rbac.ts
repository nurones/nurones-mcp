/**
 * RBAC (Role-Based Access Control) integration with ContextFrame
 */

import { ContextFrame } from './types';
import { CompressionTier } from './llm-compressor';

export interface RBACPolicy {
  maxCharLimit: number;
  allowedTiers: CompressionTier[];
  maxCostPerRequest: number;
  requireQualityCheck: boolean;
  allowNotionSources: boolean;
}

const RISK_LEVEL_POLICIES: Record<number, RBACPolicy> = {
  // Risk Level 0: Full access (dev/testing)
  0: {
    maxCharLimit: 100000,
    allowedTiers: ['T0', 'T1', 'T2', 'T3'],
    maxCostPerRequest: 1.0,
    requireQualityCheck: false,
    allowNotionSources: true
  },
  // Risk Level 1: Standard production (most use cases)
  1: {
    maxCharLimit: 10000,
    allowedTiers: ['T0', 'T1', 'T2'],
    maxCostPerRequest: 0.1,
    requireQualityCheck: true,
    allowNotionSources: true
  },
  // Risk Level 2: High-risk/restricted (sensitive data)
  2: {
    maxCharLimit: 5000,
    allowedTiers: ['T0', 'T1'],
    maxCostPerRequest: 0.05,
    requireQualityCheck: true,
    allowNotionSources: false
  }
};

export class RBACEnforcer {
  /**
   * Get policy for given context frame
   */
  getPolicy(context: ContextFrame): RBACPolicy {
    const riskLevel = context.risk_level || 0;
    return RISK_LEVEL_POLICIES[riskLevel] || RISK_LEVEL_POLICIES[2]; // Default to most restrictive
  }

  /**
   * Validate compression tier is allowed
   */
  validateTier(tier: CompressionTier, context: ContextFrame): void {
    const policy = this.getPolicy(context);

    if (!policy.allowedTiers.includes(tier)) {
      throw new Error(
        `Tier ${tier} not allowed for risk level ${context.risk_level}. ` +
        `Allowed tiers: ${policy.allowedTiers.join(', ')}`
      );
    }
  }

  /**
   * Validate character limit is within bounds
   */
  validateCharLimit(charLimit: number, context: ContextFrame): void {
    const policy = this.getPolicy(context);

    if (charLimit > policy.maxCharLimit) {
      throw new Error(
        `Character limit ${charLimit} exceeds maximum ${policy.maxCharLimit} ` +
        `for risk level ${context.risk_level}`
      );
    }
  }

  /**
   * Validate cost is within budget
   */
  validateCost(estimatedCost: number, context: ContextFrame): void {
    const policy = this.getPolicy(context);

    if (estimatedCost > policy.maxCostPerRequest) {
      throw new Error(
        `Estimated cost $${estimatedCost.toFixed(4)} exceeds maximum ` +
        `$${policy.maxCostPerRequest.toFixed(4)} for risk level ${context.risk_level}`
      );
    }
  }

  /**
   * Check if quality check is required
   */
  requiresQualityCheck(context: ContextFrame): boolean {
    const policy = this.getPolicy(context);
    return policy.requireQualityCheck;
  }

  /**
   * Validate Notion source is allowed
   */
  validateNotionSource(context: ContextFrame): void {
    const policy = this.getPolicy(context);

    if (!policy.allowNotionSources) {
      throw new Error(
        `Notion sources not allowed for risk level ${context.risk_level}`
      );
    }
  }

  /**
   * Auto-tune tier based on risk level
   */
  autoTuneTier(requestedTier: CompressionTier, context: ContextFrame): CompressionTier {
    const policy = this.getPolicy(context);

    // If requested tier is not allowed, downgrade to highest allowed
    if (!policy.allowedTiers.includes(requestedTier)) {
      const allowedTiers = policy.allowedTiers;
      const tierOrder: CompressionTier[] = ['T3', 'T2', 'T1', 'T0'];

      for (const tier of tierOrder) {
        if (allowedTiers.includes(tier)) {
          return tier;
        }
      }

      return 'T0'; // Fallback to safest
    }

    return requestedTier;
  }
}

// Global RBAC enforcer
export const rbac = new RBACEnforcer();
