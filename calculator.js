/**
 * Sampling Rate Calculator Module
 * Handles simulation of sampling rates on span data
 */

/**
 * Check if a span item matches a rule
 * @param {Object} item - Span data object with all attributes
 * @param {Object} rule - Rule object: { attribute: string, operator: string, value: string, rate: number }
 * @returns {boolean} - True if the span matches the rule
 */
function matchesRule(item, rule) {
  if (!rule.attribute || !rule.value) {
    return false;
  }

  const spanValue = item[rule.attribute] || '';
  const ruleValue = rule.value.trim();
  const operator = rule.operator || 'contains';

  if (!spanValue) {
    return false;
  }

  switch (operator) {
    case 'equals':
      return String(spanValue).toLowerCase() === ruleValue.toLowerCase();
    case 'contains':
      return String(spanValue).toLowerCase().includes(ruleValue.toLowerCase());
    case 'starts_with':
      return String(spanValue).toLowerCase().startsWith(ruleValue.toLowerCase());
    case 'ends_with':
      return String(spanValue).toLowerCase().endsWith(ruleValue.toLowerCase());
    case 'regex':
      try {
        const regex = new RegExp(ruleValue, 'i');
        return regex.test(String(spanValue));
      } catch (e) {
        return false;
      }
    default:
      return String(spanValue).toLowerCase().includes(ruleValue.toLowerCase());
  }
}

/**
 * Simulate sampling rates on raw span data
 * @param {Array} rawData - Array of span objects with all attributes
 * @param {Array} rules - Array of rule objects: [{ attribute: string, operator: string, value: string, rate: number }, ...]
 * @param {number} expansionFactor - Multiplier for projected usage (default: 1.0)
 * @param {number} globalRate - Global default sampling rate (default: 1.0)
 * @param {number} days - Number of days in the query period (for monthly projection)
 * @returns {Object} - Result object with totals, breakdown, and monthly projections
 */
function simulateSampling(rawData, rules, expansionFactor = 1.0, globalRate = 1.0, days = 30) {
  if (!Array.isArray(rawData) || rawData.length === 0) {
    return {
      totalRawCount: 0,
      totalSimulatedCount: 0,
      breakdown: [],
      costReduction: 0,
      monthlyRawCount: 0,
      monthlySimulatedCount: 0,
    };
  }

  // Calculate total raw count
  // If the data array has a _totalCountFromMeta property, use that (more accurate)
  // Otherwise sum the individual group counts
  let totalRawCount;
  const sumOfGroups = rawData.reduce((sum, item) => sum + (item.count || 0), 0);
  
  if (rawData._totalCountFromMeta !== undefined) {
    totalRawCount = rawData._totalCountFromMeta;
    console.log(`Using total from API meta: ${totalRawCount.toLocaleString()} (vs sum of groups: ${sumOfGroups.toLocaleString()})`);
  } else {
    totalRawCount = sumOfGroups;
  }

  // Calculate the difference between total and sum of groups (missing spans)
  const missingSpans = totalRawCount - sumOfGroups;
  const hasMissingSpans = missingSpans > 0;

  // Process each span group
  const breakdown = [];
  let totalSimulatedCount = 0;

  // Sort rules by specificity (more specific rules first)
  // Rules with more specific attributes or operators should be checked first
  const sortedRules = [...rules].sort((a, b) => {
    // Prefer exact matches over contains
    if (a.operator === 'equals' && b.operator !== 'equals') return -1;
    if (b.operator === 'equals' && a.operator !== 'equals') return 1;
    return 0;
  });

  rawData.forEach(item => {
    const count = item.count || 0;
    
    // Find the first matching rule (most specific)
    let matchedRule = null;
    let samplingRate = globalRate;

    for (const rule of sortedRules) {
      if (matchesRule(item, rule)) {
        matchedRule = rule;
        samplingRate = rule.rate / 100; // Convert percentage to decimal
        break; // Use first matching rule
      }
    }

    // Calculate simulated count (assuming current rate is 1.0, so we apply the new rate)
    const simulatedCount = count * samplingRate * expansionFactor;
    totalSimulatedCount += simulatedCount;

    // Store breakdown with all relevant attributes
    breakdown.push({
      ...item,
      rawCount: count,
      simulatedCount: simulatedCount,
      samplingRate: samplingRate,
      matchedRule: matchedRule ? `${matchedRule.attribute}:${matchedRule.value}` : 'global',
    });
  });

  // If we have missing spans (difference between total and sum of groups),
  // we need to account for them in the simulated count
  // Apply the global rate and expansion factor to the missing spans
  if (hasMissingSpans) {
    const missingSimulatedCount = missingSpans * globalRate * expansionFactor;
    totalSimulatedCount += missingSimulatedCount;
    
    console.log(`Accounting for ${missingSpans.toLocaleString()} missing spans (not in top 100 groups)`);
    
    // Optionally add a breakdown entry for missing spans
    breakdown.push({
      'span.op': '(other)',
      'span.description': `Other spans (${missingSpans.toLocaleString()} spans not in top 100 groups)`,
      rawCount: missingSpans,
      simulatedCount: missingSimulatedCount,
      samplingRate: globalRate,
      matchedRule: 'global',
    });
  }

  // Calculate cost reduction percentage
  const costReduction = totalRawCount > 0
    ? ((totalRawCount - totalSimulatedCount) / totalRawCount) * 100
    : 0;

  // Calculate monthly projections (extrapolate from the query period)
  const daysInMonth = 30;
  const periodMultiplier = daysInMonth / days;
  const monthlyRawCount = totalRawCount * periodMultiplier;
  const monthlySimulatedCount = totalSimulatedCount * periodMultiplier;

  return {
    totalRawCount: totalRawCount,
    totalSimulatedCount: totalSimulatedCount,
    breakdown: breakdown,
    costReduction: Math.max(0, costReduction),
    monthlyRawCount: monthlyRawCount,
    monthlySimulatedCount: monthlySimulatedCount,
  };
}

/**
 * Format large numbers for display
 * @param {number} num - Number to format
 * @returns {string} - Formatted string (e.g., "1.2M", "500K")
 */
function formatNumber(num) {
  if (num >= 1000000000) {
    return (num / 1000000000).toFixed(2) + 'B';
  } else if (num >= 1000000) {
    return (num / 1000000).toFixed(2) + 'M';
  } else if (num >= 1000) {
    return (num / 1000).toFixed(2) + 'K';
  }
  return num.toLocaleString();
}

