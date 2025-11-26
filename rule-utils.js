/**
 * Rule Management Utilities
 * Shared functions for managing sampling rules
 */

/**
 * Create a new rule with default values
 * @param {Object} defaults - Default values for the rule
 * @returns {Object} - New rule object
 */
function createRule(defaults = {}) {
  return {
    id: Date.now(),
    attribute: defaults.attribute || 'span.op',
    operator: defaults.operator || 'contains',
    value: defaults.value || '',
    rate: defaults.rate || 100,
  };
}

/**
 * Get available span attributes for rule selection
 * @returns {Array<Object>} - Array of attribute objects with value and label
 */
function getSpanAttributes() {
  return [
    { value: 'span.op', label: 'span.op' },
    { value: 'span.description', label: 'span.description' },
    { value: 'span.status', label: 'span.status' },
    { value: 'span.status_code', label: 'span.status_code' },
    { value: 'span.domain', label: 'span.domain' },
    { value: 'span.action', label: 'span.action' },
    { value: 'span.module', label: 'span.module' },
    { value: 'span.system', label: 'span.system' },
    { value: 'transaction', label: 'transaction' },
    { value: 'transaction.op', label: 'transaction.op' },
    { value: 'transaction.method', label: 'transaction.method' },
    { value: 'environment', label: 'environment' },
    { value: 'release', label: 'release' },
  ];
}

/**
 * Get unique values for a given span attribute from the fetched data
 * @param {Array} spanData - Array of span data objects
 * @param {string} attribute - The span attribute to get values for
 * @param {number} maxResults - Maximum number of results to return (default: 200)
 * @returns {Array<string>} - Array of unique values
 */
function getUniqueValuesForAttribute(spanData, attribute, maxResults = 200) {
  if (!spanData || spanData.length === 0) {
    console.log('No span data available for autocomplete');
    return [];
  }

  const values = new Set();
  let count = 0;
  
  spanData.forEach(item => {
    const value = item[attribute];
    if (value !== undefined && value !== null && String(value).trim() !== '') {
      values.add(String(value));
      count++;
    }
  });

  const uniqueValues = Array.from(values).sort().slice(0, maxResults);
  console.log(`Found ${uniqueValues.length} unique values for ${attribute} (from ${count} total items)`);
  
  return uniqueValues;
}

/**
 * Create autocomplete datalist for a given attribute
 * @param {Array} spanData - Array of span data objects
 * @param {string} attribute - The span attribute
 * @param {string} ruleId - The rule ID
 * @returns {HTMLElement} - The datalist element
 */
function createAutocompleteDatalist(spanData, attribute, ruleId) {
  const datalist = document.createElement('datalist');
  datalist.id = `datalist-${ruleId}-${attribute}`;
  
  const uniqueValues = getUniqueValuesForAttribute(spanData, attribute);
  
  if (uniqueValues.length === 0) {
    console.warn(`No unique values found for attribute: ${attribute}`);
  } else {
    console.log(`Creating datalist with ${uniqueValues.length} options for ${attribute}`);
  }
  
  uniqueValues.forEach(value => {
    const option = document.createElement('option');
    option.value = value;
    datalist.appendChild(option);
  });
  
  return datalist;
}


