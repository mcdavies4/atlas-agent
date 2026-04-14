const { supabase } = require('../utils/supabase');

async function createJob({ senderPhone, pickup, dropoff, itemDescription, itemSize, estimatedPrice, riderId }) {
  const { data, error } = await supabase
    .from('deliveries')
    .insert({
      sender_phone:    senderPhone,
      pickup_address:  pickup,
      dropoff_address: dropoff,
      item_description: itemDescription,
      item_size:        itemSize || 'small',
      estimated_price:  estimatedPrice || 0,
      rider_id:         riderId,
      status:           'pending',
    })
    .select()
    .single();

  if (error) {
    console.error('Job creation error:', error);
    throw error;
  }

  return data;
}

async function updateJobStatus(jobId, status) {
  const { error } = await supabase
    .from('deliveries')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', jobId);

  if (error) throw error;
}

async function getJob(jobId) {
  const { data, error } = await supabase
    .from('deliveries')
    .select('*, riders(*)')
    .eq('id', jobId)
    .single();

  if (error) throw error;
  return data;
}

module.exports = { createJob, updateJobStatus, getJob };
