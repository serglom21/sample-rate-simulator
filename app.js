/**
 * App UI Logic (Full Page)
 * Handles user interactions, state management, and UI updates
 */

// State
let currentSpanData = null;
let rules = [];
let currentDays = 30; // Track current query period for monthly calculations

// DOM Elements
const dateRangeSelect = document.getElementById('date-range');
const orgSlugInput = document.getElementById('org-slug');
const detectOrgBtn = document.getElementById('detect-org-btn');
const projectInput = document.getElementById('project-input');
const projectDatalist = document.getElementById('project-datalist');
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
const breakdownSearch = document.getElementById('breakdown-search');
const breakdownPagination = document.getElementById('breakdown-pagination');
const prevPageBtn = document.getElementById('prev-page-btn');
const nextPageBtn = document.getElementById('next-page-btn');
const pageInfo = document.getElementById('page-info');
const errorMessage = document.getElementById('error-message');
const sampleRatesSection = document.getElementById('sample-rates-section');
const sampleRatesContainer = document.getElementById('sample-rates-container');
const sampleRatesLabel = document.getElementById('sample-rates-label');

// Breakdown pagination state
let breakdownData = [];
let filteredBreakdownData = [];
let currentPage = 1;
const itemsPerPage = 50;

/**
 * Load projects for an organization
 */
async function loadProjects(orgSlug) {
  if (!orgSlug) {
    projectDatalist.innerHTML = '<option value="">All Projects</option>';
    projectInput.value = '';
    projectInput.disabled = false;
    return;
  }

  try {
    projectInput.disabled = true;
    projectInput.placeholder = 'Loading projects...';
    const projects = await fetchProjects(orgSlug);
    
    // Clear existing options except "All Projects"
    projectDatalist.innerHTML = '<option value="">All Projects</option>';
    
    // Add projects to datalist - single option per project, searchable by both name and slug
    projects.forEach(project => {
      const option = document.createElement('option');
      // Use slug as the value (what gets submitted)
      option.value = project.slug;
      // Display both name and slug for clarity
      option.textContent = `${project.name} (${project.slug})`;
      option.setAttribute('data-slug', project.slug);
      option.setAttribute('data-name', project.name);
      option.setAttribute('data-id', project.id); // Store project ID for API calls
      // Add a label attribute for better search matching (browsers can match on label)
      option.setAttribute('label', `${project.name} ${project.slug}`);
      projectDatalist.appendChild(option);
    });
    
    projectInput.disabled = false;
    projectInput.placeholder = 'Type to search projects or leave empty for all projects';
    
    console.log(`Loaded ${projects.length} projects`);
  } catch (error) {
    console.error('Failed to load projects:', error);
    projectDatalist.innerHTML = '<option value="">All Projects (Error loading projects)</option>';
    projectInput.disabled = false;
    projectInput.placeholder = 'Type to search projects or leave empty for all projects';
  }
}

/**
 * Initialize the app
 */
async function init() {
  // Try to auto-detect organization slug
  console.log('Initializing app, attempting to auto-detect org slug...');
  try {
    const orgSlug = await getOrgSlugFromCurrentTab();
    if (orgSlug) {
      console.log('Auto-detected org slug:', orgSlug);
      orgSlugInput.value = orgSlug;
      orgSlugInput.placeholder = orgSlug;
      // Load projects for detected org
      await loadProjects(orgSlug);
    } else {
      console.warn('Org slug was null or empty');
    }
  } catch (error) {
    // Log error but don't show to user - they can enter manually
    console.log('Could not auto-detect org slug:', error.message);
    console.log('User can enter org slug manually');
  }

  // Set up breakdown search and pagination listeners
  breakdownSearch.addEventListener('input', (e) => {
    filterAndPaginateBreakdown(e.target.value.trim());
  });
  
  prevPageBtn.addEventListener('click', () => {
    if (currentPage > 1) {
      currentPage--;
      renderBreakdownPage();
    }
  });
  
  nextPageBtn.addEventListener('click', () => {
    const totalPages = Math.ceil(filteredBreakdownData.length / itemsPerPage);
    if (currentPage < totalPages) {
      currentPage++;
      renderBreakdownPage();
    }
  });

  // Set up event listeners
  detectOrgBtn.addEventListener('click', async () => {
    detectOrgBtn.disabled = true;
    detectOrgBtn.textContent = 'Detecting...';
    
    try {
      const orgSlug = await getOrgSlugFromCurrentTab();
      if (orgSlug) {
        orgSlugInput.value = orgSlug;
        orgSlugInput.placeholder = orgSlug;
        await loadProjects(orgSlug);
      } else {
        showError(errorMessage, 'Could not detect organization. Please enter it manually.');
      }
    } catch (error) {
      showError(errorMessage, `Could not detect organization: ${error.message}`);
    } finally {
      detectOrgBtn.disabled = false;
      detectOrgBtn.textContent = 'Detect';
    }
  });
  
  orgSlugInput.addEventListener('blur', async () => {
    const orgSlug = orgSlugInput.value.trim();
    if (orgSlug) {
      await loadProjects(orgSlug);
    }
  });
  
  // Handle project input change to show selected project name
  projectInput.addEventListener('input', () => {
    const value = projectInput.value.trim();
    if (value) {
      const option = Array.from(projectDatalist.options).find(
        opt => opt.value === value || opt.getAttribute('data-slug') === value
      );
      if (option && option.getAttribute('data-name')) {
        // Optionally update display to show full name
        // But keep the slug as the actual value
      }
    }
  });
  
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
    // Get organization slug - use manual input if provided, otherwise auto-detect
    let orgSlug = orgSlugInput.value.trim();
    
    if (!orgSlug) {
      // Try to auto-detect from any Sentry tab
      try {
        orgSlug = await getOrgSlugFromCurrentTab();
        orgSlugInput.value = orgSlug; // Update input with detected value
        // Load projects for detected org
        await loadProjects(orgSlug);
      } catch (error) {
        showError(errorMessage, 'Please enter an organization slug or open a Sentry page in any tab.');
        return;
      }
    }
    
    // Get selected project - extract slug from input value
    let projectSlug = projectInput.value.trim() || null;
    
    if (projectSlug && projectSlug !== '') {
      // Try to find matching option in datalist
      const option = Array.from(projectDatalist.options).find(
        opt => {
          const optSlug = opt.getAttribute('data-slug');
          const optValue = opt.value;
          return optSlug === projectSlug || 
                 optValue === projectSlug ||
                 optValue === projectInput.value.trim();
        }
      );
      
      if (option) {
        // Use the slug from the matched option
        projectSlug = option.getAttribute('data-slug') || option.value;
        // Also get project ID if available
        const projectId = option.getAttribute('data-id');
        if (projectId) {
          // Pass both slug and ID - API can try both
          const spanData = await fetchSpanUsage(orgSlug, days, projectSlug, projectId);
          handleSpanDataSuccess(spanData, projectSlug);
          return;
        }
      } else if (projectSlug.includes('(') && projectSlug.includes(')')) {
        // If user typed "Name (slug)" format, extract slug
        const match = projectSlug.match(/\(([^)]+)\)/);
        if (match) {
          projectSlug = match[1];
        }
      }
      // If no match found, use the value as-is (might be a valid slug)
    } else {
      projectSlug = null; // Empty means all projects
    }
    
    // Fetch span data using browser session cookies
    const spanData = await fetchSpanUsage(orgSlug, days, projectSlug);
    // Pass null explicitly if no project selected
    handleSpanDataSuccess(spanData, projectSlug || null);
  } catch (error) {
    showError(errorMessage, error.message);
  } finally {
    setFetchLoadingState(fetchDataBtn, fetchSpinner, false);
  }
}

/**
 * Fetch and display current sample rates
 */
async function fetchAndDisplaySampleRates(projectSlug) {
  // Normalize projectSlug - convert empty string to null
  const projectSlugToUse = projectSlug && projectSlug.trim() ? projectSlug.trim() : null;
  
  // Sample rates are only available for individual projects, not all projects
  if (!projectSlugToUse) {
    showSampleRatesMessage('Please select a specific project to view current sample rates. Sample rates breakdown is not available when viewing all projects.');
    return;
  }
  
  // Hide section initially
  sampleRatesSection.style.display = 'none';
  
  try {
    const days = parseInt(dateRangeSelect.value, 10);
    let orgSlug = orgSlugInput.value.trim();
    
    if (!orgSlug) {
      try {
        orgSlug = await getOrgSlugFromCurrentTab();
      } catch (error) {
        console.warn('Could not get org slug for sample rates:', error);
        return;
      }
    }
    
    // Get project ID if we have a slug
    let projectId = null;
    if (projectSlugToUse) {
      const option = Array.from(projectDatalist.options).find(
        opt => opt.getAttribute('data-slug') === projectSlugToUse
      );
      if (option) {
        projectId = option.getAttribute('data-id');
      }
    }
    
    console.log('Fetching sample rates with:', { orgSlug, days, projectSlug: projectSlugToUse, projectId });
    
    // Add timeout to prevent hanging (30 seconds)
    const timeoutPromise = new Promise((_, reject) => 
      setTimeout(() => reject(new Error('Sample rates fetch timeout after 30s')), 30000)
    );
    
    const result = await Promise.race([
      fetchSampleRates(orgSlug, days, projectSlugToUse, projectId),
      timeoutPromise
    ]);
    
    console.log('Sample rates result:', result);
    renderSampleRates(result, projectSlugToUse);
  } catch (error) {
    // Silently fail - sample rates are supplementary information
    // The 500 error from Sentry API is likely due to query complexity/timeout
    // Don't show error to user, just keep section hidden
    console.warn('Sample rates fetch failed (non-critical):', error.message);
    sampleRatesSection.style.display = 'none';
  }
}

/**
 * Show a message in the sample rates section instead of data
 */
function showSampleRatesMessage(message) {
  sampleRatesContainer.innerHTML = '';
  
  const messageItem = document.createElement('div');
  messageItem.className = 'breakdown-item';
  messageItem.style.textAlign = 'center';
  messageItem.style.padding = 'var(--spacing-xl)';
  messageItem.style.color = 'var(--gray-500)';
  messageItem.innerHTML = `
    <div class="breakdown-col-label" style="grid-column: 1 / -1;">
      ${message}
    </div>
  `;
  
  sampleRatesContainer.appendChild(messageItem);
  sampleRatesSection.style.display = 'block';
}

/**
 * Render sample rates breakdown
 */
function renderSampleRates(result, projectSlug) {
  console.log('Rendering sample rates:', result, 'projectSlug:', projectSlug);
  
  if (!result || !result.sampleRates || result.sampleRates.length === 0) {
    console.warn('No sample rates to display');
    sampleRatesSection.style.display = 'none';
    return;
  }
  
  // Update label based on whether we have a project or not
  if (projectSlug) {
    sampleRatesLabel.textContent = 'Span Operation';
  } else {
    sampleRatesLabel.textContent = 'Project';
  }
  
  console.log(`Rendering ${result.sampleRates.length} sample rate groups`);
  
  sampleRatesContainer.innerHTML = '';
  
  result.sampleRates.forEach(item => {
    const breakdownItem = document.createElement('div');
    breakdownItem.className = 'breakdown-item';
    
    const sampleRateDisplay = item.sampleRate === 'N/A' || item.sampleRate === null || item.sampleRate === undefined
      ? 'N/A'
      : `${(parseFloat(item.sampleRate) * 100).toFixed(1)}%`;
    
    breakdownItem.innerHTML = `
      <div class="breakdown-col-label" title="${item.group}">${item.group}</div>
      <div class="breakdown-col-value">${sampleRateDisplay}</div>
      <div class="breakdown-col-value">${formatNumber(item.count)}</div>
      <div class="breakdown-col-value">${item.percentage}%</div>
    `;
    
    sampleRatesContainer.appendChild(breakdownItem);
  });
  
  // Show the section
  sampleRatesSection.style.display = 'block';
}

/**
 * Handle successful span data fetch
 */
function handleSpanDataSuccess(spanData, projectSlug) {
  if (!spanData || spanData.length === 0) {
    const projectText = projectSlug ? ` for project "${projectSlug}"` : '';
    showError(errorMessage, `No span data found${projectText} for the selected time period`);
    return;
  }

  // Log summary of fetched data
  const totalSpans = spanData.reduce((sum, item) => sum + (item.count || 0), 0);
  console.log(`Fetched ${spanData.length} span groups with total ${totalSpans.toLocaleString()} spans`);
  
  if (spanData.length >= 100) {
    console.warn('⚠️ Only showing top 100 span groups. The total count may not match Sentry UI if there are more groups.');
  }

  currentSpanData = spanData;
  
  // Show rules section
  showRulesSection(rulesSection, calculateBtn);
  
  // Reset rules
  rules = [];
  renderRules();
  
  // Fetch and display current sample rates (pass null if no project selected)
  fetchAndDisplaySampleRates(projectSlug || null);
}

/**
 * Handle add rule button click
 */
function handleAddRule() {
  rules.push(createRule({
    attribute: 'span.op',
    operator: 'contains',
    value: '',
    rate: 100,
  }));
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

// getSpanAttributes is now in rule-utils.js

// getUniqueValuesForAttribute is now in rule-utils.js

// createAutocompleteDatalist is now in rule-utils.js

/**
 * Render rules list
 */
function renderRules() {
  // Clean up old datalists
  document.querySelectorAll('datalist[id^="datalist-"]').forEach(dl => dl.remove());
  
  rulesContainer.innerHTML = '';
  
  if (rules.length === 0) {
    const emptyState = document.createElement('div');
    emptyState.className = 'help-text';
    emptyState.style.textAlign = 'center';
    emptyState.style.padding = 'var(--spacing-xl)';
    emptyState.textContent = 'No rules defined. Add a rule to customize sampling rates.';
    rulesContainer.appendChild(emptyState);
    return;
  }

  const spanAttributes = getSpanAttributes();

  rules.forEach(rule => {
    const ruleItem = document.createElement('div');
    ruleItem.className = 'rule-item';
    
    const attribute = rule.attribute || 'span.op';
    const operator = rule.operator || 'contains';
    
    // Create autocomplete datalist
    const datalist = createAutocompleteDatalist(currentSpanData, attribute, rule.id);
    
    ruleItem.innerHTML = `
      <div class="rule-header">
        <span class="rule-title">Rule ${rules.indexOf(rule) + 1}</span>
        <button class="rule-delete" data-rule-id="${rule.id}" title="Delete rule">×</button>
      </div>
      <div class="rule-fields">
        <select class="rule-select" data-rule-id="${rule.id}" data-field="attribute">
          ${spanAttributes.map(attr => 
            `<option value="${attr.value}" ${attribute === attr.value ? 'selected' : ''}>${attr.label}</option>`
          ).join('')}
        </select>
        <select class="rule-select" data-rule-id="${rule.id}" data-field="operator">
          <option value="contains" ${operator === 'contains' ? 'selected' : ''}>Contains</option>
          <option value="equals" ${operator === 'equals' ? 'selected' : ''}>Equals</option>
          <option value="starts_with" ${operator === 'starts_with' ? 'selected' : ''}>Starts With</option>
          <option value="ends_with" ${operator === 'ends_with' ? 'selected' : ''}>Ends With</option>
          <option value="regex" ${operator === 'regex' ? 'selected' : ''}>Regex</option>
        </select>
        <div style="position: relative;">
          <input 
            type="text" 
            class="input" 
            placeholder="Enter value to match..."
            value="${rule.value || ''}"
            data-rule-id="${rule.id}"
            data-field="value"
            list="datalist-${rule.id}-${attribute}"
            autocomplete="off"
          />
        </div>
        <div class="slider-container">
          <input 
            type="range" 
            class="slider" 
            min="0" 
            max="100" 
            value="${rule.rate || 100}"
            data-rule-id="${rule.id}"
            data-field="rate"
          />
          <div class="slider-labels">
            <span>0%</span>
            <span class="slider-value" data-rule-id="${rule.id}">${rule.rate || 100}%</span>
            <span>100%</span>
          </div>
        </div>
      </div>
    `;
    
    rulesContainer.appendChild(ruleItem);
    
    // Append datalist to document body so it's accessible
    document.body.appendChild(datalist);
    
    // Attach event listeners
    const deleteBtn = ruleItem.querySelector('.rule-delete');
    deleteBtn.addEventListener('click', () => handleDeleteRule(rule.id));
    
    const attributeSelect = ruleItem.querySelector('[data-field="attribute"]');
    const valueInput = ruleItem.querySelector('[data-field="value"]');
    const operatorSelect = ruleItem.querySelector('[data-field="operator"]');
    
    attributeSelect.addEventListener('change', (e) => {
      const newAttribute = e.target.value;
      handleRuleChange(rule.id, 'attribute', newAttribute);
      
      // Remove old datalist
      const oldDatalistId = valueInput.getAttribute('list');
      if (oldDatalistId) {
        const oldDatalist = document.getElementById(oldDatalistId);
        if (oldDatalist) {
          oldDatalist.remove();
        }
      }
      
      // Create new datalist for the new attribute with fresh unique values
      const newDatalist = createAutocompleteDatalist(currentSpanData, newAttribute, rule.id);
      document.body.appendChild(newDatalist);
      valueInput.setAttribute('list', newDatalist.id);
      
      // Clear the value input when attribute changes
      valueInput.value = '';
      handleRuleChange(rule.id, 'value', '');
      
      console.log(`Updated autocomplete for rule ${rule.id} to attribute: ${newAttribute}`);
    });
    
    operatorSelect.addEventListener('change', (e) => {
      handleRuleChange(rule.id, 'operator', e.target.value);
    });
    
    // Debug: Log unique values for this attribute
    const uniqueValues = getUniqueValuesForAttribute(currentSpanData, attribute);
    if (uniqueValues.length > 0) {
      console.log(`Autocomplete for ${attribute}:`, uniqueValues.slice(0, 10), `... (${uniqueValues.length} total)`);
    }
    valueInput.addEventListener('input', (e) => {
      handleRuleChange(rule.id, 'value', e.target.value);
    });
    valueInput.addEventListener('change', (e) => {
      handleRuleChange(rule.id, 'value', e.target.value);
    });
    
    const rateSlider = ruleItem.querySelector('[data-field="rate"]');
    const rateValue = ruleItem.querySelector('.slider-value[data-rule-id="' + rule.id + '"]');
    rateSlider.addEventListener('input', (e) => {
      const rate = parseFloat(e.target.value);
      rateValue.textContent = `${rate}%`;
      handleRuleChange(rule.id, 'rate', rate);
    });
  });
}

/**
 * Update autocomplete datalist for a specific rule
 * @param {string} ruleId - The rule ID
 * @param {string} attribute - The new attribute
 */
function updateAutocompleteForRule(ruleId, attribute) {
  const valueInput = document.querySelector(`[data-rule-id="${ruleId}"][data-field="value"]`);
  if (valueInput) {
    const oldDatalistId = valueInput.getAttribute('list');
    if (oldDatalistId) {
      const oldDatalist = document.getElementById(oldDatalistId);
      if (oldDatalist) {
        oldDatalist.remove();
      }
    }
    
    const newDatalist = createAutocompleteDatalist(currentSpanData, attribute, ruleId);
    const ruleItem = valueInput.closest('.rule-item');
    if (ruleItem) {
      ruleItem.appendChild(newDatalist);
      valueInput.setAttribute('list', newDatalist.id);
    }
  }
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
  syncRuleValuesFromDOM(
    rules,
    '[data-field="value"]',
    '[data-field="attribute"]',
    '[data-field="operator"]',
    '[data-field="rate"]'
  );

  // Filter out rules without values
  const activeRules = getActiveRules(rules);
  
  console.log('Calculating with rules:', activeRules);
  console.log('Span data sample:', currentSpanData.slice(0, 3));

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

    console.log('Calculation result:', result);

    // Update results display
    updateResultsDisplay(result, {
      baselineCountEl,
      optimizedCountEl,
      costReductionEl,
      monthlyBaselineEl: document.getElementById('monthly-baseline'),
      monthlyOptimizedEl: document.getElementById('monthly-optimized'),
      monthlyBaselineCard: document.getElementById('monthly-baseline-card'),
      monthlyOptimizedCard: document.getElementById('monthly-optimized-card'),
      baselinePeriodDesc: document.getElementById('baseline-period-desc'),
      optimizedPeriodDesc: document.getElementById('optimized-period-desc'),
      monthlyBaselineDesc: document.getElementById('monthly-baseline-desc'),
      monthlyOptimizedDesc: document.getElementById('monthly-optimized-desc'),
    }, currentDays);

    // Render breakdown
    renderBreakdown(result.breakdown);

    // Show results section
    showResultsSection(resultsSection);
    
    hideError(errorMessage);
  } catch (error) {
    console.error('Calculation error:', error);
    showError(errorMessage, `Calculation error: ${error.message}`);
  }
}

/**
 * Filter breakdown data by search query
 */
function filterAndPaginateBreakdown(searchQuery = '') {
  if (!breakdownData || breakdownData.length === 0) {
    return;
  }

  // Filter data if search query provided
  if (searchQuery) {
    const query = searchQuery.toLowerCase();
    filteredBreakdownData = breakdownData.filter(item => {
      // Build searchable text from all attributes
      const searchableText = [
        item['span.op'] || '',
        item['span.description'] || '',
        item['span.status'] || '',
        item['span.status_code'] || '',
        item['span.domain'] || '',
        item['span.action'] || '',
        item['span.module'] || '',
        item['span.system'] || '',
        item['transaction'] || '',
        item['transaction.op'] || '',
        item['transaction.method'] || '',
        item['environment'] || '',
        item['release'] || '',
      ].join(' ').toLowerCase();
      
      return searchableText.includes(query);
    });
  } else {
    filteredBreakdownData = [...breakdownData];
  }

  // Reset to first page when filtering
  currentPage = 1;
  renderBreakdownPage();
}

/**
 * Render breakdown table with pagination
 */
function renderBreakdown(breakdown) {
  // Store full breakdown data
  breakdownData = [...breakdown].sort((a, b) => b.rawCount - a.rawCount);
  filteredBreakdownData = [...breakdownData];
  currentPage = 1;
  
  // Clear search
  breakdownSearch.value = '';
  
  // Render first page
  renderBreakdownPage();
}

/**
 * Render current page of breakdown data
 */
function renderBreakdownPage() {
  breakdownContainer.innerHTML = '';
  
  if (filteredBreakdownData.length === 0) {
    const emptyItem = document.createElement('div');
    emptyItem.className = 'breakdown-item';
    emptyItem.style.textAlign = 'center';
    emptyItem.style.padding = 'var(--spacing-xl)';
    emptyItem.style.color = 'var(--gray-500)';
    emptyItem.innerHTML = `
      <div class="breakdown-col-label" style="grid-column: 1 / -1;">
        ${breakdownSearch.value ? 'No results found' : 'No data available'}
      </div>
    `;
    breakdownContainer.appendChild(emptyItem);
    breakdownPagination.style.display = 'none';
    return;
  }

  // Calculate pagination
  const totalPages = Math.ceil(filteredBreakdownData.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const pageItems = filteredBreakdownData.slice(startIndex, endIndex);
  
  // Render items for current page
  pageItems.forEach(item => {
    const breakdownItem = document.createElement('div');
    breakdownItem.className = 'breakdown-item';
    
    // Build label from span attributes
    const parts = [];
    if (item['span.op']) parts.push(`op:${item['span.op']}`);
    if (item['span.description']) {
      const desc = item['span.description'].substring(0, 60);
      parts.push(`desc:${desc}${item['span.description'].length > 60 ? '...' : ''}`);
    }
    if (item['span.status']) parts.push(`status:${item['span.status']}`);
    if (item['environment']) parts.push(`env:${item['environment']}`);
    
    const label = parts.length > 0 ? parts.join(' | ') : 'Unknown';
    
    const ratePercent = (item.samplingRate * 100).toFixed(1);
    
    breakdownItem.innerHTML = `
      <div class="breakdown-col-label" title="${label}">${label}</div>
      <div class="breakdown-col-value">${formatNumber(item.simulatedCount)}</div>
      <div class="breakdown-col-value">${formatNumber(item.rawCount)}</div>
      <div class="breakdown-col-value">${ratePercent}%</div>
    `;
    
    breakdownContainer.appendChild(breakdownItem);
  });
  
  // Update pagination controls
  if (totalPages > 1) {
    breakdownPagination.style.display = 'flex';
    prevPageBtn.disabled = currentPage === 1;
    nextPageBtn.disabled = currentPage === totalPages;
    pageInfo.textContent = `Page ${currentPage} of ${totalPages} (${filteredBreakdownData.length} total)`;
  } else {
    breakdownPagination.style.display = 'none';
  }
}

// Error handling functions are now in ui-utils.js

// Initialize on load
document.addEventListener('DOMContentLoaded', init);

