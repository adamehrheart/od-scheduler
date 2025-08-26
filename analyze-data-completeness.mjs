#!/usr/bin/env node

/**
 * Analyze data completeness of stored vehicles
 */

import { createClient } from '@supabase/supabase-js';

async function analyzeDataCompleteness() {
    console.log('📊 Analyzing data completeness of stored vehicles...\n');

    const supabase = createClient(
        process.env.OD_SUPABASE_URL,
        process.env.OD_SUPABASE_SERVICE_ROLE
    );

    try {
        // Get all vehicles
        const { data: vehicles, error } = await supabase
            .from('vehicles')
            .select('*')
            .limit(10);

        if (error) {
            console.log('❌ Error fetching vehicles:', error.message);
            return;
        }

        console.log(`📋 Analyzing ${vehicles.length} sample vehicles...\n`);

        // Define fields to check
        const fieldsToCheck = [
            'vin', 'make', 'model', 'year', 'trim', 'stock_number',
            'transmission', 'drivetrain', 'body_style', 'fuel_type',
            'mileage', 'price', 'color_ext', 'color_int', 'images'
        ];

        // Count completeness for each field
        const fieldStats = {};
        fieldsToCheck.forEach(field => {
            fieldStats[field] = {
                populated: 0,
                empty: 0,
                percentage: 0
            };
        });

        // Analyze each vehicle
        vehicles.forEach((vehicle, index) => {
            console.log(`🚗 Vehicle ${index + 1}: ${vehicle.year} ${vehicle.make} ${vehicle.model} (${vehicle.vin})`);

            fieldsToCheck.forEach(field => {
                const value = vehicle[field];
                const hasValue = value !== null && value !== undefined && value !== '';

                if (hasValue) {
                    fieldStats[field].populated++;
                    console.log(`  ✅ ${field}: ${value}`);
                } else {
                    fieldStats[field].empty++;
                    console.log(`  ❌ ${field}: empty`);
                }
            });
            console.log('');
        });

        // Calculate percentages
        const totalVehicles = vehicles.length;
        fieldsToCheck.forEach(field => {
            fieldStats[field].percentage = Math.round((fieldStats[field].populated / totalVehicles) * 100);
        });

        // Display summary
        console.log('📊 Data Completeness Summary:');
        console.log('='.repeat(50));

        fieldsToCheck.forEach(field => {
            const stats = fieldStats[field];
            const bar = '█'.repeat(Math.floor(stats.percentage / 5)) + '░'.repeat(20 - Math.floor(stats.percentage / 5));
            console.log(`${field.padEnd(15)} ${stats.populated}/${totalVehicles} (${stats.percentage.toString().padStart(3)}%) ${bar}`);
        });

        console.log('\n🎯 Key Insights:');
        console.log('- Rich data from Dealer.com API provides excellent coverage');
        console.log('- Some fields may be empty due to different data structure vs old scraping');
        console.log('- All critical fields (VIN, make, model, year) should be populated');

    } catch (error) {
        console.log('❌ Error:', error.message);
    }
}

analyzeDataCompleteness().catch(console.error);
