// utils/formatSize.js – Shared size formatting utility.
// Used by Dashboard, Browse, and Trends pages.
//
// Input:  size_kb  (number, in kilobytes)
//         unit     ("human" | "kb")
// Output: formatted string
//
// Human mode: auto-selects MB / GB / TB, rounded to 2 decimal places.
//   < 1024 MB  → "X.XX MB"
//   < 1024 GB  → "X.XX GB"
//   otherwise  → "X.XX TB"
// KB mode: raw KB with comma formatting (e.g. "1,234,567 KB")

const KB_PER_MB = 1024;
const KB_PER_GB = 1024 * 1024;
const KB_PER_TB = 1024 * 1024 * 1024;

/**
 * Format a size value given in kilobytes.
 * @param {number|null} size_kb
 * @param {"human"|"kb"} unit
 * @returns {string}
 */
export function formatSize(size_kb, unit = 'human') {
  if (size_kb === null || size_kb === undefined || isNaN(size_kb)) {
    return '—';
  }

  if (unit === 'kb') {
    return `${Number(size_kb).toLocaleString()} KB`;
  }

  // Human readable
  const n = Number(size_kb);
  if (n < KB_PER_MB) {
    return `${n.toLocaleString()} KB`;
  }
  if (n < KB_PER_GB) {
    return `${(n / KB_PER_MB).toFixed(2)} MB`;
  }
  if (n < KB_PER_TB) {
    return `${(n / KB_PER_GB).toFixed(2)} GB`;
  }
  return `${(n / KB_PER_TB).toFixed(2)} TB`;
}
