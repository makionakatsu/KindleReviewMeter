/**
 * KRMImage.DataLoader - Multi-source data loading for image generator
 * Exposes: window.KRMImage.DataLoader.loadData()
 *
 * Behavior: Loads from URL query param `data` (JSON-encoded),
 *           otherwise from chrome.storage.local key `pendingImageData`.
 * Contracts: Does not throw; returns null when no data.
 */
(function(){
  'use strict';
  const ns = (window.KRMImage = window.KRMImage || {});
  ns.DataLoader = ns.DataLoader || {};

  /**
   * Load data for image generation from query or storage.
   * @returns {Promise<object|null>} Parsed data object or null when absent.
   */
  ns.DataLoader.loadData = async function loadData() {
    const qs = new URLSearchParams(location.search);
    let data = null;
    try {
      if (qs.has('data')) {
        data = JSON.parse(decodeURIComponent(qs.get('data')));
      }
    } catch (e) {
      console.warn('Failed to parse data from query:', e);
    }

    if (!data && window.chrome?.storage?.local) {
      const res = await chrome.storage.local.get(['pendingImageData']);
      data = res.pendingImageData || null;
    }
    return data;
  };
})();
