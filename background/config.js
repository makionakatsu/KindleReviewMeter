/**
 * Global configuration for Kindle Review Meter (non-logic, optional overrides)
 *
 * Notes:
 * - This file centralizes flags and lists used by background services.
 * - Values mirror current defaults; changing them alters behavior intentionally.
 */

// Toggle verbose debug logs across services
export const DEBUG_MODE = false;

// Optional proxy list override (keeps current default order)
export const PROXIES = [
  'https://corsproxy.io/?',
  'https://api.allorigins.win/raw?url=',
  'https://api.allorigins.win/get?url=',
  'https://api.codetabs.com/v1/proxy?quest=',
  'https://thingproxy.freeboard.io/fetch/',
  'https://cors.isomorphic-git.org/',
  'https://cors-anywhere.herokuapp.com/'
];

