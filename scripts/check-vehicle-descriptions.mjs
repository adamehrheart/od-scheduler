import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const supabase = createClient(
  process.env.OD_SUPABASE_URL,
  process.env.OD_SUPABASE_SERVICE_ROLE
);

async function checkVehicleDescriptions() {
  try {
    console.log('🔍 Checking vehicle descriptions for transmission data...\n');

    // Get RSM Honda vehicles with descriptions
    const { data: vehicles, error } = await supabase
      .from('vehicles')
      .select('vin, make, model, description, transmission, drivetrain, body_style')
      .eq('dealer_id', '5eb88852-0caa-5656-8a7b-aab53e5b1847') // RSM Honda
      .limit(10);

    if (error) {
      console.error('❌ Error fetching vehicles:', error);
      return;
    }

    console.log(`📊 Found ${vehicles.length} vehicles to analyze:\n`);

    vehicles.forEach((vehicle, index) => {
      console.log(`${index + 1}. ${vehicle.vin}: ${vehicle.make} ${vehicle.model}`);
      console.log(`   Current: transmission=${vehicle.transmission}, drivetrain=${vehicle.drivetrain}, body_style=${vehicle.body_style}`);
      
      if (vehicle.description) {
        console.log(`   Description: "${vehicle.description.substring(0, 200)}${vehicle.description.length > 200 ? '...' : ''}"`);
        
        // Check for transmission keywords
        const descLower = vehicle.description.toLowerCase();
        const transmissionKeywords = ['automatic', 'auto', 'manual', 'stick', 'cvt', 'transmission'];
        const foundKeywords = transmissionKeywords.filter(keyword => descLower.includes(keyword));
        
        if (foundKeywords.length > 0) {
          console.log(`   ✅ Found transmission keywords: ${foundKeywords.join(', ')}`);
        } else {
          console.log(`   ❌ No transmission keywords found`);
        }
        
        // Check for drivetrain keywords
        const drivetrainKeywords = ['awd', 'all-wheel drive', 'fwd', 'front-wheel drive', 'rwd', 'rear-wheel drive', '4wd', 'four-wheel drive'];
        const foundDrivetrainKeywords = drivetrainKeywords.filter(keyword => descLower.includes(keyword));
        
        if (foundDrivetrainKeywords.length > 0) {
          console.log(`   ✅ Found drivetrain keywords: ${foundDrivetrainKeywords.join(', ')}`);
        } else {
          console.log(`   ❌ No drivetrain keywords found`);
        }
      } else {
        console.log(`   ❌ No description available`);
      }
      console.log('');
    });

    // Summary
    const withDescriptions = vehicles.filter(v => v.description);
    const withTransmissionKeywords = vehicles.filter(v => 
      v.description && ['automatic', 'auto', 'manual', 'stick', 'cvt', 'transmission'].some(keyword => 
        v.description.toLowerCase().includes(keyword)
      )
    );
    const withDrivetrainKeywords = vehicles.filter(v => 
      v.description && ['awd', 'all-wheel drive', 'fwd', 'front-wheel drive', 'rwd', 'rear-wheel drive', '4wd', 'four-wheel drive'].some(keyword => 
        v.description.toLowerCase().includes(keyword)
      )
    );

    console.log('📈 Summary:');
    console.log(`   Vehicles with descriptions: ${withDescriptions.length}/${vehicles.length}`);
    console.log(`   Vehicles with transmission keywords: ${withTransmissionKeywords.length}/${vehicles.length}`);
    console.log(`   Vehicles with drivetrain keywords: ${withDrivetrainKeywords.length}/${vehicles.length}`);

  } catch (error) {
    console.error('❌ Script failed:', error);
  }
}

checkVehicleDescriptions();
