const { supabase } = require('../utils/supabase');
const { detectZone } = require('../pricing/engine');

async function findAvailableRiders(deliveryContext) {
  const { pickup, dropoff } = deliveryContext;

  const pickupZone  = detectZone(pickup)  || 'inner';
  const dropoffZone = detectZone(dropoff) || 'inner';

  // Find riders available in pickup zone (they travel to dropoff)
  // A rider covers a job if their zone matches pickup zone OR they cover all zones
  const { data: riders, error } = await supabase
    .from('riders')
    .select('id, name, phone, company, rating, zone, coverage_zones, is_available, verified')
    .eq('is_available', true)
    .eq('verified', true);

  if (error) {
    console.error('Rider fetch error:', error);
    return [];
  }

  if (!riders || riders.length === 0) return [];

  // Filter riders who cover the pickup zone
  const eligible = riders.filter(rider => {
    const zones = rider.coverage_zones || [rider.zone];
    return zones.includes(pickupZone) || zones.includes('all');
  });

  // Sort by rating descending, limit to 5
  return eligible
    .sort((a, b) => (b.rating || 0) - (a.rating || 0))
    .slice(0, 5);
}

module.exports = { findAvailableRiders };
