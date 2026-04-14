// ─── Abuja Zone Map ──────────────────────────────────────────────────────────
// Zones grouped by proximity to Central Abuja

const ZONES = {
  central: {
    label: 'Central',
    areas: ['central area', 'area 1', 'area 2', 'area 3', 'area 7', 'area 8', 'area 10', 'area 11', 'garki', 'asokoro', 'maitama', 'wuse', 'wuse 2', 'wuse zone', 'jabi', 'utako', 'cadastral zone'],
  },
  inner: {
    label: 'Inner',
    areas: ['life camp', 'gwarinpa', 'kado', 'games village', 'nbora', 'duboyi', 'lokogoma', 'galadimawa', 'apo', 'gudu', 'karu', 'mararaba', 'nyanya'],
  },
  outer: {
    label: 'Outer',
    areas: ['kubwa', 'lugbe', 'gwagwalada', 'zuba', 'bwari', 'kuje', 'abaji', 'airport', 'pyakasa', 'masaka', 'karshi'],
  },
};

// ─── Pricing Matrix (₦) ─────────────────────────────────────────────────────

// Pricing updated based on real Bolt motorbike data (Abuja, April 2026)
// Bolt Send Motorbike rates used as market benchmark, Atlas priced slightly below
const PRICING = {
  central: {
    central: { base: 2500, label: 'Within Central Abuja' },
    inner:   { base: 4000, label: 'Central → Inner' },
    outer:   { base: 6000, label: 'Central → Outer' },
  },
  inner: {
    central: { base: 4000, label: 'Inner → Central' },
    inner:   { base: 4000, label: 'Within Inner Zone' },
    outer:   { base: 5000, label: 'Inner → Outer' },
  },
  outer: {
    central: { base: 6000, label: 'Outer → Central' },
    inner:   { base: 5000, label: 'Outer → Inner' },
    outer:   { base: 3500, label: 'Within Outer Zone' },
  },
};

// ─── Item size multipliers ───────────────────────────────────────────────────

const SIZE_MULTIPLIER = {
  small:       1.0,
  medium:      1.3,
  large:       1.8,
  'extra-large': 2.5,
};

// ─── Urgency multiplier ──────────────────────────────────────────────────────

const URGENCY_MULTIPLIER = {
  standard: 1.0,
  express:  1.5,
};

// ─── Helpers ────────────────────────────────────────────────────────────────

function detectZone(location) {
  if (!location) return null;
  const lower = location.toLowerCase().trim();
  for (const [zoneKey, zoneData] of Object.entries(ZONES)) {
    if (zoneData.areas.some(area => lower.includes(area))) {
      return zoneKey;
    }
  }
  // Default to inner if we can't place it — conservative estimate
  return 'inner';
}

// ─── Main pricing function ───────────────────────────────────────────────────

async function estimatePrice(details) {
  const { pickup, dropoff, itemSize = 'small', urgency = 'standard' } = details;

  const pickupZone = detectZone(pickup) || 'inner';
  const dropoffZone = detectZone(dropoff) || 'inner';

  const matrix = PRICING[pickupZone][dropoffZone];
  const sizeMulti = SIZE_MULTIPLIER[itemSize] || 1.0;
  const urgencyMulti = URGENCY_MULTIPLIER[urgency] || 1.0;

  const rawEstimate = matrix.base * sizeMulti * urgencyMulti;
  // Round to nearest 100
  const estimate = Math.round(rawEstimate / 100) * 100;

  return {
    estimate,
    zone: matrix.label,
    pickupZone,
    dropoffZone,
    distance: getDistanceLabel(pickupZone, dropoffZone),
    itemSize,
    urgency,
  };
}

function getDistanceLabel(from, to) {
  if (from === to) {
    if (from === 'central') return 'short distance';
    return 'same zone';
  }
  if ((from === 'central' && to === 'outer') || (from === 'outer' && to === 'central')) {
    return 'long distance';
  }
  return 'medium distance';
}

module.exports = { estimatePrice, detectZone, ZONES };
