/**
 * Shared UI Utilities
 * Common UI functions used by both app.js and popup.js
 */

/**
 * Show error message
 * @param {HTMLElement} errorElement - The error message element
 * @param {string} message - Error message to display
 */
function showError(errorElement, message) {
  errorElement.textContent = message;
  errorElement.classList.remove('hidden');
  errorElement.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

/**
 * Hide error message
 * @param {HTMLElement} errorElement - The error message element
 */
function hideError(errorElement) {
  errorElement.classList.add('hidden');
}

/**
 * Sync rule values from DOM inputs
 * @param {Array} rules - Array of rule objects
 * @param {string} valueSelector - Selector for value input
 * @param {string} attributeSelector - Selector for attribute select (optional)
 * @param {string} operatorSelector - Selector for operator select (optional)
 * @param {string} rateSelector - Selector for rate slider
 */
function syncRuleValuesFromDOM(rules, valueSelector, attributeSelector, operatorSelector, rateSelector) {
  rules.forEach(rule => {
    const valueInput = document.querySelector(`${valueSelector}[data-rule-id="${rule.id}"]`);
    const rateSlider = document.querySelector(`${rateSelector}[data-rule-id="${rule.id}"]`);
    
    if (valueInput) rule.value = valueInput.value.trim();
    if (rateSlider) rule.rate = parseFloat(rateSlider.value);
    
    if (attributeSelector) {
      const attributeSelect = document.querySelector(`${attributeSelector}[data-rule-id="${rule.id}"]`);
      if (attributeSelect) rule.attribute = attributeSelect.value;
    }
    
    if (operatorSelector) {
      const operatorSelect = document.querySelector(`${operatorSelector}[data-rule-id="${rule.id}"]`);
      if (operatorSelect) rule.operator = operatorSelect.value;
    }
  });
}

/**
 * Filter active rules (rules with values)
 * @param {Array} rules - Array of rule objects
 * @returns {Array} - Filtered array of active rules
 */
function getActiveRules(rules) {
  return rules.filter(rule => rule.value && rule.value.trim() !== '' && rule.attribute);
}

/**
 * Update results display with calculation results
 * @param {Object} result - Calculation result object
 * @param {Object} elements - Object containing DOM elements for results
 * @param {number} currentDays - Current query period in days
 */
function updateResultsDisplay(result, elements, currentDays) {
  const {
    baselineCountEl,
    optimizedCountEl,
    costReductionEl,
    monthlyBaselineEl,
    monthlyOptimizedEl,
    monthlyBaselineCard,
    monthlyOptimizedCard,
    baselinePeriodDesc,
    optimizedPeriodDesc,
    monthlyBaselineDesc,
    monthlyOptimizedDesc
  } = elements;

  // Update period descriptions with clear labels
  if (baselinePeriodDesc && optimizedPeriodDesc) {
    const periodText = currentDays === 7 ? 'Last 7 days' : currentDays === 30 ? 'Last 30 days' : 'Last 90 days';
    baselinePeriodDesc.textContent = `${periodText} (actual)`;
    optimizedPeriodDesc.textContent = `${periodText} (with rules)`;
  }

  // Handle monthly projections
  if (monthlyBaselineCard && monthlyOptimizedCard) {
    if (currentDays === 30) {
      // Hide monthly projections when period is already 30 days
      monthlyBaselineCard.style.display = 'none';
      monthlyOptimizedCard.style.display = 'none';
    } else {
      // Show monthly projections with multiplier explanation
      const multiplier = (30 / currentDays).toFixed(2);
      const periodText = currentDays === 7 ? 'Last 7 days' : 'Last 90 days';
      monthlyBaselineCard.style.display = 'block';
      monthlyOptimizedCard.style.display = 'block';
      if (monthlyBaselineDesc && monthlyOptimizedDesc) {
        monthlyBaselineDesc.textContent = `Projected monthly (${multiplier}x ${periodText})`;
        monthlyOptimizedDesc.textContent = `Projected monthly (${multiplier}x ${periodText})`;
      }
    }
  }

  // Update main results
  baselineCountEl.textContent = formatNumber(result.totalRawCount);
  optimizedCountEl.textContent = formatNumber(result.totalSimulatedCount);
  costReductionEl.textContent = `${result.costReduction.toFixed(1)}%`;

  // Update monthly results if elements exist
  if (monthlyBaselineEl) {
    monthlyBaselineEl.textContent = formatNumber(result.monthlyRawCount);
  }
  if (monthlyOptimizedEl) {
    monthlyOptimizedEl.textContent = formatNumber(result.monthlySimulatedCount);
  }
}

/**
 * Show loading state for fetch button
 * @param {HTMLElement} button - The fetch button element
 * @param {HTMLElement} spinner - The spinner element
 * @param {boolean} isLoading - Whether to show loading state
 */
function setFetchLoadingState(button, spinner, isLoading) {
  button.disabled = isLoading;
  if (spinner) {
    if (isLoading) {
      spinner.classList.remove('hidden');
    } else {
      spinner.classList.add('hidden');
    }
  }
  const buttonText = button.querySelector('span');
  if (buttonText) {
    buttonText.textContent = isLoading ? 'Fetching...' : 'Fetch Data';
  }
}

/**
 * Show rules section and enable calculate button
 * @param {HTMLElement} rulesSection - The rules section element
 * @param {HTMLElement} calculateBtn - The calculate button element
 */
function showRulesSection(rulesSection, calculateBtn) {
  rulesSection.style.display = 'block';
  calculateBtn.disabled = false;
  rulesSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

/**
 * Show results section
 * @param {HTMLElement} resultsSection - The results section element
 */
function showResultsSection(resultsSection) {
  resultsSection.style.display = 'block';
  resultsSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

