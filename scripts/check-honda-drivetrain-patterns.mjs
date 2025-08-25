import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const supabase = createClient(
  process.env.OD_SUPABASE_URL,
  process.env.OD_SUPABASE_SERVICE_ROLE
);

async function checkHondaDrivetrainPatterns() {
  try {
    console.log('🔍 Analyzing Honda drivetrain patterns...\n');

    // Get all Honda vehicles
    const { data: vehicles, error } = await supabase
      .from('vehicles')
      .select('vin, make, model, drivetrain, body_style')
      .eq('dealer_id', '5eb88852-0caa-5656-8a7b-aab53e5b1847') // RSM Honda
      .eq('make', 'Honda');

    if (error) {
      console.error('❌ Error fetching vehicles:', error);
      return;
    }

    console.log(`📊 Found ${vehicles.length} Honda vehicles\n`);

    // Group by model
    const modelGroups = {};
    vehicles.forEach(vehicle => {
      if (!modelGroups[vehicle.model]) {
        modelGroups[vehicle.model] = [];
      }
      modelGroups[vehicle.model].push(vehicle);
    });

    console.log('📈 Model Analysis:');
    console.log('==================\n');

    Object.entries(modelGroups).forEach(([model, modelVehicles]) => {
      console.log(`🚗 ${model} (${modelVehicles.length} vehicles):`);
      
      const drivetrainCounts = {};
      const bodyStyleCounts = {};
      
      modelVehicles.forEach(v => {
        drivetrainCounts[v.drivetrain] = (drivetrainCounts[v.drivetrain] || 0) + 1;
        bodyStyleCounts[v.body_style] = (bodyStyleCounts[v.body_style] || 0) + 1;
      });

      console.log(`   Drivetrain: ${Object.entries(drivetrainCounts).map(([d, c]) => `${d}: ${c}`).join(', ')}`);
      console.log(`   Body Style: ${Object.entries(bodyStyleCounts).map(([b, c]) => `${b}: ${c}`).join(', ')}`);
      console.log('');
    });

    // Research-based recommendations
    console.log('🔬 Research-Based Drivetrain Recommendations:');
    console.log('=============================================\n');
    
    console.log('Based on Honda\'s current lineup:');
    console.log('- Honda Accord: FWD (correct)');
    console.log('- Honda Civic: FWD (correct)');
    console.log('- Honda CR-V: Available in both FWD and AWD, AWD is popular');
    console.log('- Honda Pilot: Available in both FWD and AWD, AWD is common');
    console.log('- Honda Passport: Available in both FWD and AWD, AWD is common');
    console.log('- Honda HR-V: FWD (correct)');
    console.log('- Honda Ridgeline: AWD (correct)');
    console.log('');

    // Suggest improved logic
    console.log('💡 Suggested Improved Logic:');
    console.log('============================\n');
    
    console.log('For better accuracy, we should:');
    console.log('1. Keep FWD for sedans (Accord, Civic)');
    console.log('2. Use AWD for SUVs (CR-V, Pilot, Passport)');
    console.log('3. Use AWD for trucks (Ridgeline)');
    console.log('4. Keep FWD for smaller crossovers (HR-V)');
    console.log('');

  } catch (error) {
    console.error('❌ Script failed:', error);
  }
}

checkHondaDrivetrainPatterns();
