import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.OD_SUPABASE_URL;
const supabaseKey = process.env.OD_SUPABASE_SERVICE_ROLE;

if (!supabaseUrl || !supabaseKey) {
    console.error('❌ Missing Supabase environment variables');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function debugPaginationIssue() {
    try {
        console.log('🔍 Debugging pagination issue...');

        // Get total count
        const { count, error } = await supabase
            .from('vehicles')
            .select('*', { count: 'exact', head: true });

        if (error) {
            console.error('❌ Error counting vehicles:', error.message);
            return;
        }

        console.log(`📊 Total vehicles in database: ${count}`);
        console.log(`📊 Expected vehicles: 119`);
        console.log(`📊 Missing vehicles: ${119 - count}`);

        // Get all VINs to see what we have
        const { data: allVehicles, error: allError } = await supabase
            .from('vehicles')
            .select('vin, make, model, year, price')
            .order('vin');

        if (allError) {
            console.error('❌ Error fetching vehicles:', allError.message);
            return;
        }

        console.log(`\n📋 First 10 vehicles:`);
        allVehicles.slice(0, 10).forEach((vehicle, index) => {
            console.log(`  ${index + 1}. ${vehicle.year} ${vehicle.make} ${vehicle.model} - $${vehicle.price} (${vehicle.vin})`);
        });

        console.log(`\n📋 Last 10 vehicles:`);
        allVehicles.slice(-10).forEach((vehicle, index) => {
            console.log(`  ${allVehicles.length - 10 + index + 1}. ${vehicle.year} ${vehicle.make} ${vehicle.model} - $${vehicle.price} (${vehicle.vin})`);
        });

        // Check if we have any vehicles with specific patterns that might be missing
        console.log(`\n🔍 Checking for specific vehicle types:`);

        const hondaAccords = allVehicles.filter(v => v.make === 'Honda' && v.model === 'Accord');
        const hondaCRVs = allVehicles.filter(v => v.make === 'Honda' && v.model === 'CR-V');
        const hondaPassports = allVehicles.filter(v => v.make === 'Honda' && v.model === 'Passport');
        const hondaOdysseys = allVehicles.filter(v => v.make === 'Honda' && v.model === 'Odyssey');
        const otherMakes = allVehicles.filter(v => v.make !== 'Honda');

        console.log(`  Honda Accords: ${hondaAccords.length}`);
        console.log(`  Honda CR-Vs: ${hondaCRVs.length}`);
        console.log(`  Honda Passports: ${hondaPassports.length}`);
        console.log(`  Honda Odysseys: ${hondaOdysseys.length}`);
        console.log(`  Other makes: ${otherMakes.length}`);

        // Check for any vehicles with null or zero prices
        const zeroPriceVehicles = allVehicles.filter(v => !v.price || v.price === 0);
        if (zeroPriceVehicles.length > 0) {
            console.log(`\n⚠️  Found ${zeroPriceVehicles.length} vehicles with zero/null prices:`);
            zeroPriceVehicles.forEach(v => {
                console.log(`  - ${v.year} ${v.make} ${v.model} (${v.vin})`);
            });
        } else {
            console.log(`\n✅ All vehicles have proper pricing`);
        }

    } catch (error) {
        console.error('❌ Error:', error.message);
    }
}

debugPaginationIssue();
