import { DealerComJobRunner } from './dist/src/jobs/dealer-com.js';

async function testEnhancedMapping() {
  try {
    console.log('🧪 Testing enhanced pricing and incentive mapping...');

    // Create a mock job
    const mockJob = {
      dealer_id: '5eb88852-0caa-5656-8a7b-aab53e5b1847', // RSM Honda UUID from database
      id: 'test-job-123'
    };

    const jobRunner = new DealerComJobRunner(mockJob);

    console.log('🚀 Running Dealer.com job with enhanced mapping...');
    const result = await jobRunner.execute();

    console.log('✅ Job completed successfully!');
    console.log('📊 Results:', JSON.stringify(result, null, 2));

  } catch (error) {
    console.error('❌ Test failed:', error.message);
    console.error('Stack:', error.stack);
  }
}

testEnhancedMapping();
