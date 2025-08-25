import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
    process.env.OD_SUPABASE_URL,
    process.env.OD_SUPABASE_SERVICE_ROLE
);

async function updateJobStatus() {
    try {
        const { data, error } = await supabase
            .from('job_queue')
            .update({
                status: 'completed',
                completed_at: new Date().toISOString()
            })
            .eq('payload->>dealer_id', '5eb88852-0caa-5656-8a7b-aab53e5b1847')
            .eq('job_type', 'homenet_feed')
            .eq('status', 'pending');

        if (error) {
            console.error('Error updating job status:', error);
        } else {
            console.log('✅ Successfully updated HomeNet job status to completed');
            console.log('Updated jobs:', data);
        }
    } catch (error) {
        console.error('Error:', error);
    }
}

updateJobStatus();
