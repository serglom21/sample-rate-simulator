/**
 * Sentry API Integration Module
 * Handles authentication, API calls, and organization detection
 */

const SENTRY_API_BASE = 'https://sentry.io/api/0';

/**
 * Extract organization slug from Sentry URL
 * @param {string} url - The current tab URL
 * @returns {string|null} - Organization slug or null if not found
 */
function extractOrgSlug(url) {
  try {
    console.log('Extracting org slug from URL:', url);
    const urlObj = new URL(url);
    const pathParts = urlObj.pathname.split('/').filter(Boolean);
    
    console.log('URL path parts:', pathParts);
    
    // Sentry URLs typically follow: /organizations/{org-slug}/...
    const orgIndex = pathParts.indexOf('organizations');
    if (orgIndex !== -1 && pathParts[orgIndex + 1]) {
      const orgSlug = pathParts[orgIndex + 1];
      console.log('Found org slug from path:', orgSlug);
      return orgSlug;
    }
    
    // Alternative format: {org-slug}.sentry.io
    const hostname = urlObj.hostname;
    console.log('Hostname:', hostname);
    const subdomainMatch = hostname.match(/^([^.]+)\.sentry\.io$/);
    if (subdomainMatch) {
      const orgSlug = subdomainMatch[1];
      console.log('Found org slug from subdomain:', orgSlug);
      return orgSlug;
    }
    
    // Try to find org slug in query params or hash
    // Some Sentry URLs might have org info in different places
    const searchParams = urlObj.searchParams;
    const orgParam = searchParams.get('org') || searchParams.get('organization');
    if (orgParam) {
      console.log('Found org slug from query param:', orgParam);
      return orgParam;
    }
    
    console.log('Could not extract org slug from URL');
    return null;
  } catch (error) {
    console.error('Error extracting org slug:', error, url);
    return null;
  }
}

/**
 * Fetch projects for an organization
 * @param {string} orgSlug - Organization slug
 * @returns {Promise<Array>} - Array of project objects
 */
async function fetchProjects(orgSlug) {
  return new Promise((resolve, reject) => {
    try {
      chrome.runtime.sendMessage(
        {
          action: 'fetchProjects',
          orgSlug: orgSlug,
        },
        (response) => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
            return;
          }
          
          if (!response) {
            reject(new Error('No response from background script. Please reload the extension and try again.'));
            return;
          }
          
          if (response.success) {
            resolve(response.data);
          } else {
            reject(new Error(response.error || 'Unknown error occurred'));
          }
        }
      );
    } catch (error) {
      reject(new Error(`Failed to send message to background script: ${error.message}`));
    }
  });
}

/**
 * Fetch span usage data from Sentry Discover API
 * This function sends a message to the background script which handles the actual API call
 * Uses browser session cookies for authentication
 * @param {string} orgSlug - Organization slug
 * @param {number} days - Number of days to query
 * @param {string} projectSlug - Optional project slug to filter by
 * @param {string} projectId - Optional project ID to filter by
 * @returns {Promise<Array>} - Array of span data objects
 */
async function fetchSpanUsage(orgSlug, days, projectSlug = null, projectId = null) {
  return new Promise((resolve, reject) => {
    try {
      chrome.runtime.sendMessage(
        {
          action: 'fetchSpanUsage',
          orgSlug: orgSlug,
          days: days,
          projectSlug: projectSlug,
          projectId: projectId,
        },
        (response) => {
          // Check for runtime errors first
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
            return;
          }
          
          // Check if response exists
          if (!response) {
            reject(new Error('No response from background script. Please reload the extension and try again.'));
            return;
          }
          
          if (response.success) {
            const spans = response.data;
            // Attach totalCount from response to the spans array
            // This ensures it survives even if the array property was lost during serialization
            if (response.totalCount !== null && response.totalCount !== undefined) {
              spans._totalCountFromMeta = response.totalCount;
              console.log('Attached totalCount to spans array:', response.totalCount.toLocaleString());
            }
            resolve(spans);
          } else {
            reject(new Error(response.error || 'Unknown error occurred'));
          }
        }
      );
    } catch (error) {
      reject(new Error(`Failed to send message to background script: ${error.message}`));
    }
  });
}

/**
 * Find a Sentry tab in all open tabs
 * @returns {Promise<string>} - The URL of a Sentry tab
 */
async function findSentryTab() {
  return new Promise((resolve, reject) => {
    chrome.tabs.query({}, (tabs) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      
      // Look for any tab with sentry.io in the URL (more flexible matching)
      const sentryTab = tabs.find(tab => {
        if (!tab.url) return false;
        const url = tab.url.toLowerCase();
        return url.includes('sentry.io');
      });
      
      if (sentryTab && sentryTab.url) {
        console.log('Found Sentry tab:', sentryTab.url);
        resolve(sentryTab.url);
        return;
      }
      
      console.log('No Sentry tab found. Available tabs:', tabs.map(t => t.url).slice(0, 5));
      reject(new Error('No Sentry tab found. Please open a Sentry page in any tab.'));
    });
  });
}

/**
 * Get organization slug from any Sentry tab
 * @returns {Promise<string>} - Organization slug
 */
async function getOrgSlugFromCurrentTab() {
  try {
    const url = await findSentryTab();
    const orgSlug = extractOrgSlug(url);
    
    if (!orgSlug) {
      throw new Error('Could not detect organization from Sentry tab. Please ensure you are on a Sentry organization page.');
    }
    
    return orgSlug;
  } catch (error) {
    throw new Error(`Failed to get organization: ${error.message}`);
  }
}

