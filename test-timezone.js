// Simple test for timezone-aware scheduling
import { TimezoneAwareScheduler } from './dist/src/timezone-scheduler.js';

console.log('🧪 Testing Timezone-Aware Scheduling System');
console.log('============================================');

// Test 1: Timezone Detection
console.log('\n📍 Test 1: Timezone Detection');
const testAddresses = [
  '123 Main St, Austin, TX 78701',
  '456 Oak Ave, New York, NY 10001',
  '789 Pine St, Los Angeles, CA 90210',
  '321 Elm St, Chicago, IL 60601',
  '654 Maple Dr, Denver, CO 80202'
];

testAddresses.forEach(address => {
  const timezone = TimezoneAwareScheduler.detectTimezoneFromAddress(address);
  console.log(`  ${address} → ${timezone}`);
});

// Test 2: Schedule Calculation
console.log('\n⏰ Test 2: Schedule Calculation');
const testDealers = [
  {
    dealerId: 'dealer-001',
    dealerName: 'Austin Motors',
    timezone: 'America/Chicago',
    preferredTime: '01:00',
    priority: 'premium',
    frequency: 'daily'
  },
  {
    dealerId: 'dealer-002',
    dealerName: 'NYC Auto',
    timezone: 'America/New_York',
    preferredTime: '01:30',
    priority: 'standard',
    frequency: 'daily'
  },
  {
    dealerId: 'dealer-003',
    dealerName: 'LA Cars',
    timezone: 'America/Los_Angeles',
    preferredTime: '02:00',
    priority: 'economy',
    frequency: 'daily'
  }
];

testDealers.forEach(dealer => {
  const schedule = TimezoneAwareScheduler.calculateOptimalRunTime(dealer);
  console.log(`  ${dealer.dealerName}:`);
  console.log(`    Local: ${schedule.localRunTime}`);
  console.log(`    UTC: ${schedule.optimalRunTime.toISOString()}`);
  console.log(`    Priority: ${schedule.priority}`);
});

// Test 3: Distribution Analysis
console.log('\n🌍 Test 3: Timezone Distribution');
const distribution = TimezoneAwareScheduler.calculateTimezoneDistribution(testDealers);
distribution.forEach(tz => {
  console.log(`  ${tz.timezone}: ${tz.dealerCount} dealers, UTC window ${tz.scheduleWindow.start}-${tz.scheduleWindow.end}`);
});

// Test 4: Full Schedule Generation
console.log('\n📅 Test 4: Full Schedule Generation');
const fullSchedule = TimezoneAwareScheduler.generateOptimalSchedule(testDealers);
console.log(`Generated ${fullSchedule.length} optimal schedules:`);
fullSchedule.forEach((schedule, index) => {
  console.log(`  ${index + 1}. ${testDealers.find(d => d.dealerId === schedule.dealerId)?.dealerName} at ${schedule.optimalRunTime.toISOString()} (${schedule.localRunTime})`);
});

console.log('\n✅ Timezone scheduling tests completed!');
