/**
 * Background Service Worker
 * Handles extension lifecycle and background tasks
 */

const SENTRY_API_BASE = 'https://sentry.io/api/0';

// Extension installation/update handler
chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    console.log('Sentry Span Optimizer installed');
  } else if (details.reason === 'update') {
    console.log('Sentry Span Optimizer updated');
  }
});

// Ensure the service worker stays alive
chrome.runtime.onStartup.addListener(() => {
  console.log('Sentry Span Optimizer background script started');
});

// Handle extension icon click - open app in new tab
chrome.action.onClicked.addListener((tab) => {
  chrome.tabs.create({
    url: chrome.runtime.getURL('app.html')
  });
});

/**
 * Get Sentry session cookies from browser
 * @returns {Promise<string>} - Cookie header string
 */
async function getSentryCookies() {
  return new Promise((resolve, reject) => {
    chrome.cookies.getAll({ domain: '.sentry.io' }, (cookies) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      
      // Build cookie header string
      const cookieString = cookies
        .map(cookie => `${cookie.name}=${cookie.value}`)
        .join('; ');
      
      if (!cookieString) {
        reject(new Error('No Sentry session cookies found. Please ensure you are logged into Sentry in this browser.'));
        return;
      }
      
      resolve(cookieString);
    });
  });
}

/**
 * Fetch projects for an organization
 * @param {string} orgSlug - Organization slug
 * @returns {Promise<Array>} - Array of project objects
 */
async function fetchProjects(orgSlug) {
  if (!orgSlug) {
    throw new Error('Organization slug is required');
  }

  const endpoint = `${SENTRY_API_BASE}/organizations/${orgSlug}/projects/`;
  
  // Get session cookies for authentication
  const cookieString = await getSentryCookies();
  
  const headers = {
    'Content-Type': 'application/json',
    'Cookie': cookieString,
  };

  try {
    const response = await fetch(endpoint, {
      method: 'GET',
      headers: headers,
      credentials: 'include',
    });

    if (!response.ok) {
      if (response.status === 401) {
        throw new Error('Authentication failed. Please ensure you are logged into Sentry in this browser.');
      } else if (response.status === 403) {
        throw new Error('Access forbidden. Please ensure you have access to this organization.');
      } else {
        const errorText = await response.text();
        throw new Error(`API error (${response.status}): ${errorText || 'Unknown error'}`);
      }
    }

    const data = await response.json();
    return data || [];
  } catch (error) {
    if (error instanceof TypeError && error.message.includes('fetch')) {
      throw new Error('Network error. Please check your internet connection.');
    }
    throw error;
  }
}

/**
 * Fetch span usage data from Sentry Discover API
 * Uses browser session cookies for authentication
 * @param {string} orgSlug - Organization slug
 * @param {number} days - Number of days to query
 * @param {string} projectSlug - Optional project slug to filter by
 * @param {string} projectId - Optional project ID to filter by
 * @returns {Promise<Array>} - Array of span data objects
 */
async function fetchSpanUsage(orgSlug, days, projectSlug = null, projectId = null) {
  if (!orgSlug) {
    throw new Error('Organization slug is required');
  }

  const statsPeriod = `${days}d`;
  // Use region-specific endpoint (us.sentry.io) - matches what Sentry UI uses
  const endpoint = `https://us.sentry.io/api/0/organizations/${orgSlug}/events/`;
  
  // Helper function to get total count - uses Sentry's aggregate query format
  const getTotalCount = async (projectIdParam = null) => {
    const params = new URLSearchParams();
    
    // Use the exact format that Sentry uses for total count
    params.append('dataset', 'spans');
    params.append('field', 'count(span.duration)'); // This is the key - count(span.duration) not count()
    params.append('disableAggregateExtrapolation', '1');
    params.append('per_page', '50');
    params.append('statsPeriod', statsPeriod);
    params.append('sampling', 'HIGHEST_ACCURACY'); // Use HIGHEST_ACCURACY for accurate totals
    params.append('referrer', 'api.explore.spans-aggregates-table'); // Match Sentry UI referrer
    params.append('sort', '-count_span_duration');
    params.append('query', ''); // Empty query string for total count
    
    // Project filter as a separate parameter
    if (projectIdParam) {
      params.append('project', projectIdParam);
    }
    
    const url = `${endpoint}?${params.toString()}`;
    console.log('Getting total count from:', url);
    
    const cookieString = await getSentryCookies();
    const headers = { 'Cookie': cookieString };
    
    const response = await fetch(url, {
      method: 'GET',
      headers: headers,
      credentials: 'include',
    });
    
    if (!response.ok) {
      console.warn('Failed to get total count, will use sum of groups');
      return null;
    }
    
    const data = await response.json();
    
    // Log the full response structure for debugging
    console.log('Aggregate query response structure:', {
      hasData: !!data.data,
      dataLength: data.data?.length || 0,
      dataType: Array.isArray(data.data) ? 'array' : typeof data.data,
      firstItem: data.data?.[0],
      meta: data.meta,
      allKeys: Object.keys(data),
    });
    
    // Log raw response for deep debugging (truncated)
    const responseStr = JSON.stringify(data, null, 2);
    console.log('Raw response (first 2000 chars):', responseStr.substring(0, 2000));
    
    // Try multiple ways to extract the total count
    let total = null;
    
    // Method 1: Check first item in data array for count(span.duration)
    if (data.data && data.data.length > 0) {
      const firstItem = data.data[0];
      // Try different possible field names
      const possibleFields = [
        'count(span.duration)',
        'count_span_duration',
        'count()',
        'count',
      ];
      
      for (const field of possibleFields) {
        if (firstItem[field] !== undefined && firstItem[field] !== null) {
          const value = firstItem[field];
          total = typeof value === 'number' ? value : parseInt(String(value), 10);
          if (!isNaN(total) && total > 0) {
            console.log(`Found total count in data[0].${field}:`, total.toLocaleString());
            return total;
          }
        }
      }
    }
    
    // Method 2: Check meta fields for totals
    if (data.meta) {
      // Check meta.fields['count(span.duration)']
      if (data.meta.fields) {
        const countField = data.meta.fields['count(span.duration)'] || 
                          data.meta.fields['count_span_duration'] ||
                          data.meta.fields['count()'];
        if (countField && countField.total !== undefined) {
          total = typeof countField.total === 'number' ? countField.total : parseInt(String(countField.total), 10);
          if (!isNaN(total) && total > 0) {
            console.log('Found total count in meta.fields:', total.toLocaleString());
            return total;
          }
        }
      }
      
      // Check meta.units
      if (data.meta.units) {
        const unitValue = data.meta.units['count(span.duration)'] || 
                         data.meta.units['count_span_duration'] ||
                         data.meta.units['count()'];
        if (unitValue !== undefined && typeof unitValue === 'number' && unitValue > 0) {
          console.log('Found total count in meta.units:', unitValue.toLocaleString());
          return unitValue;
        }
      }
    }
    
    // Method 3: Sum all items if they have counts
    if (data.data && Array.isArray(data.data) && data.data.length > 0) {
      const sum = data.data.reduce((acc, item) => {
        const count = item['count(span.duration)'] || 
                     item['count_span_duration'] || 
                     item['count()'] || 
                     item.count || 
                     0;
        return acc + (typeof count === 'number' ? count : parseInt(String(count), 10) || 0);
      }, 0);
      
      if (sum > 0) {
        console.log('Using sum of all items in data array:', sum.toLocaleString());
        return sum;
      }
    }
    
    console.warn('Could not extract total count from aggregate query response');
    return null;
  };
  
  // Helper function to build and execute a grouped query (for breakdown)
  const executeGroupedQuery = async (description, projectIdParam = null) => {
    const params = new URLSearchParams();
    
    // Use the fields that Sentry actually uses for span queries
    params.append('field', 'span.op');
    params.append('field', 'span.description');
    params.append('field', 'span.status');
    params.append('field', 'span.status_code');
    params.append('field', 'span.domain');
    params.append('field', 'span.action');
    params.append('field', 'span.module');
    params.append('field', 'span.system');
    params.append('field', 'transaction');
    params.append('field', 'transaction.op');
    params.append('field', 'transaction.method');
    params.append('field', 'environment');
    params.append('field', 'release');
    params.append('field', 'count()');
    
    // Match Sentry's actual parameters
    params.append('allowAggregateConditions', '0');
    params.append('dataset', 'spans'); // Required for spans!
    params.append('orderby', '-count()');
    params.append('per_page', '100');
    params.append('statsPeriod', statsPeriod);
    params.append('sampling', 'NORMAL');
    params.append('referrer', 'api.span-optimizer');
    
    // Project filter as a separate parameter (not in query string)
    if (projectIdParam) {
      params.append('project', projectIdParam);
    }
    
    // Query string - use has:span.op to get span data
    params.append('query', 'has:span.op');
    
    const url = `${endpoint}?${params.toString()}`;
    
    console.log(`Trying grouped query (${description}):`, {
      projectId: projectIdParam || 'none',
      url: url
    });

    // Get cookies and include them in the request
    const cookieString = await getSentryCookies();
    console.log('Cookies retrieved:', cookieString ? `${cookieString.substring(0, 50)}...` : 'none');
    
    // Match fetchProjects exactly - same headers, same approach
    const headers = {
      'Cookie': cookieString,
    };

    const response = await fetch(url, {
      method: 'GET',
      headers: headers,
      credentials: 'include',
    });
    
    console.log('Response status:', response.status, response.statusText);

    if (!response.ok) {
      let errorText = '';
      try {
        const errorData = await response.text();
        errorText = errorData;
        // Try to parse as JSON for more details
        try {
          const errorJson = JSON.parse(errorData);
          if (errorJson.detail) {
            errorText = errorJson.detail;
          } else if (errorJson.message) {
            errorText = errorJson.message;
          }
        } catch (e) {
          // Not JSON, use text as-is
        }
      } catch (e) {
        errorText = 'Unable to read error response';
      }
      
      if (response.status === 401) {
        throw new Error(`Authentication failed: ${errorText || 'Please ensure you are logged into Sentry in this browser.'}`);
      } else if (response.status === 403) {
        // Provide more helpful error message for 403
        const errorMsg = errorText || 'Access forbidden';
        throw new Error(`Access forbidden (403): ${errorMsg}. The Discover API may require additional permissions. Try querying without a project filter, or ensure you have access to view span data for this organization.`);
      } else if (response.status === 404) {
        throw new Error(`Organization not found (404): ${errorText || 'Please ensure you are on a valid Sentry page.'}`);
      } else if (response.status === 429) {
        throw new Error(`Rate limit exceeded (429): ${errorText || 'Please try again later.'}`);
      } else {
        throw new Error(`API error (${response.status}): ${errorText || 'Unknown error'}`);
      }
    }

    const responseData = await response.json();
    
    // Log response summary
    console.log(`Query "${description}" response summary:`, {
      hasData: !!responseData.data,
      dataLength: responseData.data?.length || 0,
      dataType: Array.isArray(responseData.data) ? 'array' : typeof responseData.data,
      responseKeys: Object.keys(responseData),
      meta: responseData.meta,
      // Check for total count in meta
      metaKeys: responseData.meta ? Object.keys(responseData.meta) : []
    });
    
    return responseData;
  };

  // Helper function to process span data from API response
  const processSpanData = (data) => {
    // Transform API response to our format
    const spans = [];
    
    // Check different possible response structures
    let dataArray = null;
    if (data.data && Array.isArray(data.data)) {
      dataArray = data.data;
      console.log('Using data.data array, length:', dataArray.length);
    } else if (Array.isArray(data)) {
      dataArray = data;
      console.log('Using root array, length:', dataArray.length);
    } else {
      console.warn('Unexpected response structure:', {
        type: typeof data,
        keys: Object.keys(data),
        sample: JSON.stringify(data).substring(0, 500)
      });
      return { spans: [], totalCountFromMeta: null };
    }
    
    // Check if meta has total count information - Sentry provides this for aggregated queries
    let totalCountFromMeta = null;
    if (data.meta) {
      // Check various places where Sentry might store the total
      console.log('Meta structure:', {
        units: data.meta.units,
        fields: data.meta.fields,
        allKeys: Object.keys(data.meta)
      });
      
      // Try meta.units['count()'] - this is where Sentry often stores totals
      if (data.meta.units && typeof data.meta.units['count()'] === 'number') {
        totalCountFromMeta = data.meta.units['count()'];
        console.log('Found total count in meta.units["count()"]:', totalCountFromMeta);
      }
      // Try meta.fields['count()'].total
      if (!totalCountFromMeta && data.meta.fields && data.meta.fields['count()']) {
        const countField = data.meta.fields['count()'];
        if (countField.total !== undefined) {
          totalCountFromMeta = countField.total;
          console.log('Found total count in meta.fields["count()"].total:', totalCountFromMeta);
        }
      }
      // Try summing all values in meta.units if it's an object with numeric values
      if (!totalCountFromMeta && data.meta.units && typeof data.meta.units === 'object') {
        const units = data.meta.units;
        const unitValues = Object.values(units).filter(v => typeof v === 'number');
        if (unitValues.length > 0) {
          console.log('Meta units values:', unitValues);
        }
      }
    }
    
    if (dataArray && dataArray.length > 0) {
      let totalCount = 0;
      let itemsWithZeroCount = 0;
      
      dataArray.forEach((item, index) => {
        // Extract all span attributes
        const spanData = {
          'span.op': item['span.op'] || '',
          'span.description': item['span.description'] || '',
          'span.status': item['span.status'] || '',
          'span.status_code': item['span.status_code'] || '',
          'span.domain': item['span.domain'] || '',
          'span.action': item['span.action'] || '',
          'span.module': item['span.module'] || '',
          'span.system': item['span.system'] || '',
          'transaction': item['transaction'] || '',
          'transaction.op': item['transaction.op'] || '',
          'transaction.method': item['transaction.method'] || '',
          'environment': item['environment'] || '',
          'release': item['release'] || '',
        };
        
        // Try multiple ways to get the count
        const count = parseInt(
          item['count()'] || 
          item['count'] || 
          item.count || 
          0, 
          10
        );
        
        if (isNaN(count)) {
          console.warn(`Item ${index} has invalid count:`, item);
        }
        
        totalCount += count || 0;
        
        if (count > 0) {
          spans.push({
            ...spanData,
            count: count,
          });
        } else {
          itemsWithZeroCount++;
        }
      });
      
      const totalGroups = dataArray.length;
      const isLimited = totalGroups >= 100; // per_page limit
      
      // Use total from meta if available (more accurate), otherwise use sum of groups
      const finalTotalCount = totalCountFromMeta !== null ? totalCountFromMeta : totalCount;
      
      console.log(`API Results: ${finalTotalCount.toLocaleString()} total spans (sum of ${totalGroups} groups: ${totalCount.toLocaleString()})${isLimited ? ' (limited to top 100 groups)' : ''}`);
      
      if (totalCountFromMeta && totalCountFromMeta !== totalCount) {
        console.log(`⚠️ Using meta total (${totalCountFromMeta.toLocaleString()}) instead of sum (${totalCount.toLocaleString()}) - meta is more accurate`);
        // Add a special "total" item to represent the difference, or adjust the counts proportionally
        // For now, we'll note this but use the grouped data for breakdown
      }
      
      if (itemsWithZeroCount > 0) {
        console.warn(`⚠️ ${itemsWithZeroCount} groups had zero count and were filtered out`);
      }
      
      if (isLimited) {
        console.warn(`⚠️ Only showing top 100 span groups. Total from meta: ${totalCountFromMeta ? totalCountFromMeta.toLocaleString() : 'N/A'}, Sum of groups: ${totalCount.toLocaleString()}`);
      }
    }

    // Return both spans and total count from meta (if available)
    return { spans, totalCountFromMeta };
  };

  // Get project ID if we have a slug
  let projectIdToUse = projectId;
  if (!projectIdToUse && projectSlug) {
    try {
      const projects = await fetchProjects(orgSlug);
      const project = projects.find(p => p.slug === projectSlug);
      if (project && project.id) {
        projectIdToUse = String(project.id);
        console.log(`Found project ID ${projectIdToUse} for slug ${projectSlug}`);
      }
    } catch (error) {
      console.warn('Could not fetch projects to get ID:', error);
    }
  }
  
  // First, get the total count using Sentry's aggregate query format (matches their UI)
  console.log('Fetching total count using aggregate query...');
  const totalCount = await getTotalCount(projectIdToUse);
  
  // Then, get the grouped data for breakdown
  console.log('Fetching grouped span data for breakdown...');
  let groupedData;
  if (projectIdToUse) {
    groupedData = await executeGroupedQuery(`project ID ${projectIdToUse}`, projectIdToUse);
  } else {
    groupedData = await executeGroupedQuery('all spans', null);
  }
  
  // Process and return the data
  const result = processSpanData(groupedData);
  const spans = result.spans;
  
  if (spans.length === 0) {
    throw new Error(`No span data found${projectSlug ? ` for project "${projectSlug}"` : projectId ? ` for project ID "${projectId}"` : ''} for the selected time period. The organization may not have span data, or you may need to select a different date range.`);
  }

  // Store the total count separately (can't reliably attach to array due to JSON serialization)
  let finalTotalCount = null;
  
  // Use the total count from the aggregate query if available (most accurate)
  if (totalCount !== null) {
    finalTotalCount = totalCount;
    const sumOfGroups = spans.reduce((sum, s) => sum + (s.count || 0), 0);
    console.log(`✓ Using total count from aggregate query: ${totalCount.toLocaleString()} (sum of ${spans.length} groups: ${sumOfGroups.toLocaleString()})`);
  } else if (result.totalCountFromMeta !== null) {
    // Fallback to meta total if aggregate query didn't work
    finalTotalCount = result.totalCountFromMeta;
    console.log(`Using total count from API meta: ${result.totalCountFromMeta.toLocaleString()}`);
  } else {
    console.warn('⚠️ Could not get total count from aggregate query or meta, using sum of groups');
  }

  // Return both the spans array and the total count as separate properties
  // This ensures the total count survives JSON serialization
  return {
    spans: spans,
    totalCount: finalTotalCount
  };
}

/**
 * Fetch current sample rates breakdown from Sentry
 * @param {string} orgSlug - Organization slug
 * @param {number} days - Number of days to query
 * @param {string} projectSlug - Optional project slug to filter by
 * @param {string} projectId - Optional project ID to filter by
 * @returns {Promise<Array>} - Array of sample rate breakdown objects
 */
async function fetchSampleRates(orgSlug, days, projectSlug = null, projectId = null) {
  if (!orgSlug) {
    throw new Error('Organization slug is required');
  }

  const statsPeriod = `${days}d`;
  const endpoint = `https://us.sentry.io/api/0/organizations/${orgSlug}/events/`;
  
  // Get project ID if we have a slug
  let projectIdToUse = projectId;
  if (!projectIdToUse && projectSlug) {
    try {
      const projects = await fetchProjects(orgSlug);
      const project = projects.find(p => p.slug === projectSlug);
      if (project && project.id) {
        projectIdToUse = String(project.id);
      }
    } catch (error) {
      console.warn('Could not fetch projects to get ID:', error);
    }
  }

  const params = new URLSearchParams();
  
  // Match Sentry UI's EXACT parameter order
  // Order matters for some APIs, so we'll match it exactly
  
  // 1. cursor (first)
  params.append('cursor', '');
  
  // 2. dataset
  params.append('dataset', 'spans');
  
  // 3. disableAggregateExtrapolation
  params.append('disableAggregateExtrapolation', '1');
  
  // 4. fields (order matters)
  if (projectIdToUse) {
    // Single project: group by span.op and client_sample_rate
    console.log(`Fetching sample rates for single project: ${projectIdToUse}`);
    params.append('field', 'span.op');
    params.append('field', 'client_sample_rate');
    params.append('field', 'count(span.duration)');
  } else {
    // All projects: group by project and client_sample_rate
    // Match Sentry UI's exact field order
    console.log('Fetching sample rates for all projects');
    params.append('field', 'project');
    params.append('field', 'client_sample_rate');
    params.append('field', 'count(span.duration)');
  }
  
  // 5. per_page
  params.append('per_page', '50');
  
  // 6. project (after fields, before query)
  if (projectIdToUse) {
    params.append('project', projectIdToUse);
  } else {
    params.append('project', '-1'); // -1 means all projects
  }
  
  // 7. query (empty)
  params.append('query', '');
  
  // 8. referrer
  params.append('referrer', 'api.explore.spans-aggregates-table');
  
  // 9. sampling
  params.append('sampling', 'HIGHEST_ACCURACY');
  
  // 10. sort
  params.append('sort', '-count_span_duration');
  
  // 11. statsPeriod (last)
  params.append('statsPeriod', statsPeriod);
  
  const url = `${endpoint}?${params.toString()}`;
  console.log('Fetching sample rates from:', url);
  console.log('URL parameters:', Object.fromEntries(params));
  
  const cookieString = await getSentryCookies();
  const headers = { 'Cookie': cookieString };
  
  const response = await fetch(url, {
    method: 'GET',
    headers: headers,
    credentials: 'include',
  });
  
  if (!response.ok) {
    let errorText = '';
    try {
      errorText = await response.text();
      console.error('Sample rates API error response:', errorText);
    } catch (e) {
      errorText = 'Unable to read error response';
    }
    
    // For 500 errors, provide more helpful message
    if (response.status === 500) {
      console.error('500 Internal Server Error - This might be a Sentry API issue. URL:', url);
      throw new Error(`Sentry API returned an internal error (500). This might be due to:\n- Large data volume\n- API rate limiting\n- Temporary Sentry service issue\n\nTry:\n- Selecting a shorter date range\n- Selecting a specific project instead of all projects\n- Waiting a few minutes and trying again`);
    }
    
    throw new Error(`Failed to fetch sample rates: ${response.status} - ${errorText}`);
  }
  
  const data = await response.json();
  
  if (!data.data || !Array.isArray(data.data)) {
    console.warn('No sample rates data returned from API');
    return {
      sampleRates: [],
      totalCount: 0
    };
  }
  
  // Process the data into a more usable format
  const sampleRates = [];
  let totalCount = 0;
  
  data.data.forEach(item => {
    const count = parseInt(item['count(span.duration)'] || item['count()'] || 0, 10);
    const sampleRate = item['client_sample_rate'];
    
    if (count > 0) {
      let groupLabel;
      if (projectIdToUse) {
        // Single project: show span.op
        const spanOp = item['span.op'] || '(unknown)';
        groupLabel = spanOp;
      } else {
        // All projects: show project name
        const projectName = item['project'] || '(unknown)';
        groupLabel = projectName;
      }
      
      sampleRates.push({
        group: groupLabel,
        sampleRate: sampleRate !== null && sampleRate !== undefined ? sampleRate : 'N/A',
        count: count,
      });
      
      totalCount += count;
    }
  });
  
  // Calculate percentages
  sampleRates.forEach(item => {
    item.percentage = totalCount > 0 ? ((item.count / totalCount) * 100).toFixed(2) : '0.00';
  });
  
  // Sort by count descending
  sampleRates.sort((a, b) => b.count - a.count);
  
  return {
    sampleRates: sampleRates,
    totalCount: totalCount
  };
}

// Listen for messages from popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'fetchSpanUsage') {
    // Handle the async operation
    fetchSpanUsage(request.orgSlug, request.days, request.projectSlug, request.projectId)
      .then(result => {
        // result is now { spans: [...], totalCount: number }
        // Attach totalCount to the spans array for backward compatibility
        if (result.totalCount !== null && result.totalCount !== undefined) {
          result.spans._totalCountFromMeta = result.totalCount;
        }
        sendResponse({ success: true, data: result.spans, totalCount: result.totalCount });
      })
      .catch(error => {
        sendResponse({ success: false, error: error.message });
      });
    // Return true to indicate we will send a response asynchronously
    return true;
  }
  
  if (request.action === 'fetchProjects') {
    // Handle fetching projects
    fetchProjects(request.orgSlug)
      .then(data => {
        sendResponse({ success: true, data: data });
      })
      .catch(error => {
        sendResponse({ success: false, error: error.message });
      });
    return true;
  }
  
  if (request.action === 'fetchSampleRates') {
    // Handle fetching sample rates
    fetchSampleRates(request.orgSlug, request.days, request.projectSlug, request.projectId)
      .then(data => {
        sendResponse({ success: true, data: data });
      })
      .catch(error => {
        sendResponse({ success: false, error: error.message });
      });
    return true;
  }
  
  // Return false if we don't handle the message
  return false;
});

