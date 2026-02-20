/**
 * API Configuration
 * Handles API URL construction for backend endpoints
 */

/**
 * Get the full API URL for a given endpoint
 * @param endpoint - The API endpoint path (e.g., '/predict', '/predict_ecg')
 * @returns The full URL including the base API URL
 */
export function getApiUrl(endpoint: string): string {
    // Get API URL from environment variable, fallback to localhost
    const baseUrl = process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8000';
    
    // Remove leading slash from endpoint if present (we'll add it)
    const cleanEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
    
    // If endpoint already contains http:// or https://, return as-is (full URL)
    if (endpoint.startsWith('http://') || endpoint.startsWith('https://')) {
        return endpoint;
    }
    
    // Construct full URL
    return `${baseUrl}${cleanEndpoint}`;
}




