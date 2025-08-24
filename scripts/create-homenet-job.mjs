#!/usr/bin/env node

import { createClient } from '@supabase/supabase-js';
import { env } from '../dist/src/env.js';

const supabase = createClient(env.OD_SUPABASE_URL, env.OD_SUPABASE_SERVICE_ROLE);

console.log('🚀 Creating HomeNet SOAP job...\n');

async function createHomeNetJob() {
    try {
        // Create HomeNet SOAP job for RSM Honda
        const homenetJob = {
            job_type: 'homenet_feed',
            payload: {
                dealer_id: '5eb88852-0caa-5656-8a7b-aab53e5b1847', // RSM Honda
                rooftop_id: 'RSM_HONDA',
                environment: 'production'
            },
            max_attempts: 3,
            priority: 1
        };
        
        const { data: homenetResult, error: homenetError } = await supabase
            .from('job_queue')
            .insert(homenetJob)
            .select()
            .single();
            
        if (homenetError) {
            console.error('❌ Error creating HomeNet job:', homenetError);
            process.exit(1);
        } else {
            console.log('✅ Created HomeNet SOAP job for RSM Honda');
            console.log('   Job ID:', homenetResult.id);
            console.log('   Status: pending');
            console.log('   Priority: 1');
        }
        
        console.log('\n🎯 HomeNet job created successfully!');
        console.log('\n📋 Next Steps:');
        console.log('==============');
        console.log('1. Run HomeNet SOAP job:');
        console.log('   npm run queue:run-homenet');
        console.log('');
        console.log('2. Monitor job queue:');
        console.log('   npm run queue:status');
        console.log('');
        console.log('3. Check data quality:');
        console.log('   npm run queue:health:detailed');
        
    } catch (error) {
        console.error('❌ Error creating HomeNet job:', error);
        process.exit(1);
    }
}

createHomeNetJob();
