/**
 * Amazon UrlUtils - URL normalization and validation helpers
 * Behavior preserved from AmazonScrapingService.normalizeUrl
 */

export function normalizeUrl(url) {
  try {
    if (!url || typeof url !== 'string' || url.trim().length === 0) {
      return null;
    }

    const trimmed = url.trim();
    const withProtocol = (/^https?:\/\//i.test(trimmed)) ? trimmed : ('https://' + trimmed);
    const u = new URL(withProtocol);

    // Accept broad Amazon hosts (same as origin/main behavior)
    const amazonHosts = [
      'amazon.co.jp', 'amazon.com', 'amazon.ca', 'amazon.co.uk',
      'amazon.de', 'amazon.fr', 'amazon.it', 'amazon.es',
      'www.amazon.co.jp', 'www.amazon.com', 'www.amazon.ca', 'www.amazon.co.uk',
      'www.amazon.de', 'www.amazon.fr', 'www.amazon.it', 'www.amazon.es'
    ];
    const isAmazon = amazonHosts.some(host => u.hostname === host || u.hostname.endsWith('.' + host));
    if (!isAmazon) return null;

    // Extract ASIN from multiple patterns
    const patterns = [
      /\/dp\/([A-Z0-9]{10})(?:\/|$|\?|#)/i,
      /\/product\/([A-Z0-9]{10})(?:\/|$|\?|#)/i,
      /\/gp\/product\/([A-Z0-9]{10})(?:\/|$|\?|#)/i,
      /\/exec\/obidos\/ASIN\/([A-Z0-9]{10})(?:\/|$|\?|#)/i,
      /\/o\/ASIN\/([A-Z0-9]{10})(?:\/|$|\?|#)/i,
      /ASIN[=/]([A-Z0-9]{10})/i
    ];
    let asin = null;
    for (const rx of patterns) {
      const m = withProtocol.match(rx);
      if (m) { asin = m[1]; break; }
    }
    if (!asin) return null;

    return `${u.protocol}//${u.hostname}/dp/${asin}`;
  } catch (e) {
    return null;
  }
}

