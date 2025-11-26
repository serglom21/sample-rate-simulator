/**
 * Popup UI Logic
 * Handles user interactions, state management, and UI updates
 */

// State
let currentSpanData = null;
let rules = [];
let currentDays = 30; // Track current query period for monthly calculations

// DOM Elements
const dateRangeSelect = document.getElementById('date-range');
const fetchDataBtn = document.getElementById('fetch-data-btn');
const fetchSpinner = document.getElementById('fetch-spinner');
const rulesSection = document.getElementById('rules-section');
const addRuleBtn = document.getElementById('add-rule-btn');
const rulesContainer = document.getElementById('rules-container');
const globalRateSlider = document.getElementById('global-rate');
const globalRateValue = document.getElementById('global-rate-value');
const expansionFactorInput = document.getElementById('expansion-factor');
const calculateBtn = document.getElementById('calculate-btn');
const resultsSection = document.getElementById('results-section');
const baselineCountEl = document.getElementById('baseline-count');
const optimizedCountEl = document.getElementById('optimized-count');
const costReductionEl = document.getElementById('cost-reduction');
const breakdownContainer = document.getElementById('breakdown-container');
const errorMessage = document.getElementById('error-message');

/**
 * Initialize the popup
 */
async function init() {
  // Set up event listeners
  fetchDataBtn.addEventListener('click', handleFetchData);
  addRuleBtn.addEventListener('click', handleAddRule);
  globalRateSlider.addEventListener('input', handleGlobalRateChange);
  calculateBtn.addEventListener('click', handleCalculate);

  // Update global rate display
  handleGlobalRateChange();
}

/**
 * Handle fetch data button click
 */
async function handleFetchData() {
  const days = parseInt(dateRangeSelect.value, 10);
  currentDays = days; // Store for monthly calculations
  
  // Show loading state
  setFetchLoadingState(fetchDataBtn, fetchSpinner, true);
  hideError(errorMessage);

  try {
    // Get organization slug from current tab
    const orgSlug = await getOrgSlugFromCurrentTab();
    
    // Fetch span data using browser session cookies
    const spanData = await fetchSpanUsage(orgSlug, days);
    
    if (!spanData || spanData.length === 0) {
      showError(errorMessage, 'No span data found for the selected time period');
      return;
    }

    currentSpanData = spanData;
    
    // Show rules section
    showRulesSection(rulesSection, calculateBtn);
    
    // Reset rules
    rules = [];
    renderRules();
    
  } catch (error) {
    showError(errorMessage, error.message);
  } finally {
    setFetchLoadingState(fetchDataBtn, fetchSpinner, false);
  }
}

/**
 * Handle add rule button click
 */
function handleAddRule() {
  const ruleId = Date.now();
  rules.push({
    id: ruleId,
    type: 'op',
    value: '',
    rate: 100,
  });
  renderRules();
}

/**
 * Handle delete rule
 */
function handleDeleteRule(ruleId) {
  rules = rules.filter(rule => rule.id !== ruleId);
  renderRules();
}

/**
 * Handle rule field change
 */
function handleRuleChange(ruleId, field, value) {
  const rule = rules.find(r => r.id === ruleId);
  if (rule) {
    if (field === 'rate') {
      rule[field] = parseFloat(value);
    } else {
      rule[field] = value;
    }
  }
}

/**
 * Render rules list
 */
function renderRules() {
  rulesContainer.innerHTML = '';
  
  if (rules.length === 0) {
    const emptyState = document.createElement('div');
    emptyState.className = 'help-text';
    emptyState.textContent = 'No rules defined. Add a rule to customize sampling rates.';
    rulesContainer.appendChild(emptyState);
    return;
  }

  rules.forEach(rule => {
    const ruleItem = document.createElement('div');
    ruleItem.className = 'rule-item';
    
    ruleItem.innerHTML = `
      <div class="rule-header">
        <span class="rule-title">Rule ${rules.indexOf(rule) + 1}</span>
        <button class="rule-delete" data-rule-id="${rule.id}">×</button>
      </div>
      <div class="rule-fields">
        <select class="rule-select" data-rule-id="${rule.id}" data-field="type">
          <option value="op" ${rule.type === 'op' ? 'selected' : ''}>Operation</option>
          <option value="description" ${rule.type === 'description' ? 'selected' : ''}>Description</option>
        </select>
        <input 
          type="text" 
          class="input" 
          placeholder="${rule.type === 'op' ? 'e.g., default, db, http.server' : 'e.g., /api/health'}"
          value="${rule.value}"
          data-rule-id="${rule.id}"
          data-field="value"
        />
        <div class="slider-group">
          <input 
            type="range" 
            class="slider" 
            min="0" 
            max="100" 
            value="${rule.rate}"
            data-rule-id="${rule.id}"
            data-field="rate"
          />
          <span class="slider-value">${rule.rate}%</span>
        </div>
      </div>
    `;
    
    rulesContainer.appendChild(ruleItem);
    
    // Attach event listeners
    const deleteBtn = ruleItem.querySelector('.rule-delete');
    deleteBtn.addEventListener('click', () => handleDeleteRule(rule.id));
    
    const typeSelect = ruleItem.querySelector('[data-field="type"]');
    typeSelect.addEventListener('change', (e) => {
      handleRuleChange(rule.id, 'type', e.target.value);
      renderRules(); // Re-render to update placeholder
    });
    
    const valueInput = ruleItem.querySelector('[data-field="value"]');
    valueInput.addEventListener('input', (e) => {
      handleRuleChange(rule.id, 'value', e.target.value);
    });
    
    const rateSlider = ruleItem.querySelector('[data-field="rate"]');
    const rateValue = ruleItem.querySelector('.slider-value');
    rateSlider.addEventListener('input', (e) => {
      const rate = parseFloat(e.target.value);
      rateValue.textContent = `${rate}%`;
      handleRuleChange(rule.id, 'rate', rate);
    });
  });
}

/**
 * Handle global rate slider change
 */
function handleGlobalRateChange() {
  const rate = parseFloat(globalRateSlider.value);
  globalRateValue.textContent = `${rate}%`;
}

/**
 * Handle calculate button click
 */
function handleCalculate() {
  if (!currentSpanData || currentSpanData.length === 0) {
    showError(errorMessage, 'No span data available. Please fetch data first.');
    return;
  }

  // Sync all rule values from inputs before calculation
  rules.forEach(rule => {
    const valueInput = document.querySelector(`[data-rule-id="${rule.id}"][data-field="value"]`);
    const typeSelect = document.querySelector(`[data-rule-id="${rule.id}"][data-field="type"]`);
    const rateSlider = document.querySelector(`[data-rule-id="${rule.id}"][data-field="rate"]`);
    
    if (valueInput) rule.value = valueInput.value.trim();
    if (typeSelect) rule.type = typeSelect.value;
    if (rateSlider) rule.rate = parseFloat(rateSlider.value);
  });

  // Filter out rules without values and convert to calculator format
  const activeRules = rules
    .filter(rule => rule.value && rule.value.trim() !== '' && rule.type)
    .map(rule => ({
      id: rule.id,
      attribute: rule.type === 'op' ? 'span.op' : 'span.description',
      operator: 'contains', // popup uses simple contains matching
      value: rule.value,
      rate: rule.rate
    }));

  const expansionFactor = parseFloat(expansionFactorInput.value) || 1.0;
  const globalRate = parseFloat(globalRateSlider.value) / 100;

  try {
    const result = simulateSampling(
      currentSpanData,
      activeRules,
      expansionFactor,
      globalRate,
      currentDays
    );

    // Update results display
    updateResultsDisplay(result, {
      baselineCountEl,
      optimizedCountEl,
      costReductionEl,
      monthlyBaselineEl: null,
      monthlyOptimizedEl: null,
      monthlyBaselineCard: null,
      monthlyOptimizedCard: null,
      baselinePeriodDesc: null,
      optimizedPeriodDesc: null,
      monthlyBaselineDesc: null,
      monthlyOptimizedDesc: null,
    }, currentDays);

    // Render breakdown
    renderBreakdown(result.breakdown);

    // Show results section
    showResultsSection(resultsSection);
    
    hideError(errorMessage);
  } catch (error) {
    showError(errorMessage, `Calculation error: ${error.message}`);
  }
}

/**
 * Render breakdown table
 */
function renderBreakdown(breakdown) {
  breakdownContainer.innerHTML = '';
  
  if (breakdown.length === 0) {
    return;
  }

  // Sort by raw count descending
  const sorted = [...breakdown].sort((a, b) => b.rawCount - a.rawCount);
  
  // Show top 20 items
  const topItems = sorted.slice(0, 20);
  
  topItems.forEach(item => {
    const breakdownItem = document.createElement('div');
    breakdownItem.className = 'breakdown-item';
    
    const label = item.description !== '(no description)'
      ? `${item.op}: ${item.description.substring(0, 50)}${item.description.length > 50 ? '...' : ''}`
      : item.op;
    
    breakdownItem.innerHTML = `
      <span class="breakdown-label">${label}</span>
      <span class="breakdown-value">${formatNumber(item.simulatedCount)} / ${formatNumber(item.rawCount)}</span>
    `;
    
    breakdownContainer.appendChild(breakdownItem);
  });
  
  if (sorted.length > 20) {
    const moreItem = document.createElement('div');
    moreItem.className = 'breakdown-item';
    moreItem.innerHTML = `
      <span class="breakdown-label" style="color: var(--gray-500);">... and ${sorted.length - 20} more</span>
    `;
    breakdownContainer.appendChild(moreItem);
  }
}

// Error handling functions are now in ui-utils.js

// Initialize on load
document.addEventListener('DOMContentLoaded', init);

