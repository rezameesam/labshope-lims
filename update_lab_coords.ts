// Script to update IRM Clinical Laboratory coordinates
// Run with: npx tsx update_lab_coords.ts

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://pxsutovdzppoyyfrbeaw.supabase.co';
// You'll need to set this as an environment variable or use service role key
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

if (!SUPABASE_SERVICE_ROLE_KEY) {
  console.error('❌ Error: SUPABASE_SERVICE_ROLE_KEY environment variable not set');
  console.log('\nTo get your service role key:');
  console.log('1. Go to Supabase Dashboard → Settings → API');
  console.log('2. Copy the "service_role" key (keep it secret!)');
  console.log('3. Run: SUPABASE_SERVICE_ROLE_KEY=your_key npx tsx update_lab_coords.ts');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

async function updateLabCoordinates() {
  console.log('📍 Updating IRM Clinical Laboratory coordinates...');
  console.log('   Latitude: 34.0166941');
  console.log('   Longitude: 74.7182231');
  console.log('');

  const { data, error } = await supabase
    .from('labs')
    .update({
      latitude: 34.0166941,
      longitude: 74.7182231,
    })
    .eq('type', 'main')
    .eq('is_active', true)
    .select()
    .limit(1);

  if (error) {
    console.error('❌ Error updating coordinates:', error.message);
    process.exit(1);
  }

  if (data && data.length > 0) {
    console.log('✅ Successfully updated lab coordinates!');
    console.log('');
    console.log('Updated lab:');
    console.log(`   Name: ${data[0].name}`);
    console.log(`   Address: ${data[0].address || 'N/A'}`);
    console.log(`   City: ${data[0].city || 'N/A'}`);
    console.log(`   Latitude: ${data[0].latitude}`);
    console.log(`   Longitude: ${data[0].longitude}`);
  } else {
    console.log('⚠️  No lab found to update. Make sure you have a lab with type="main" and is_active=true');
  }
}

updateLabCoordinates();

