/**
 * Test Slashtag Generation
 * 
 * Test the slashtag generation function to see what's being created
 */

function generateVersionedSlashtag(
    dealerId,
    vin,
    version = 'v1',
    service = 'llm'
) {
    // Normalize inputs
    const normalizedDealerId = dealerId.toLowerCase().replace(/[^a-z0-9-]/g, '-');
    const normalizedVin = vin.toLowerCase().replace(/[^a-z0-9]/g, '');

    // Calculate available space for dealer ID and VIN
    // Format: v1/service/dealer/vin (with 3 slashes = 3 characters)
    const prefixLength = version.length + 1 + service.length + 1; // "v1/service/"
    const suffixLength = 1; // "/vin"
    const availableSpace = 50 - prefixLength - suffixLength;

    // If dealer ID is too long, truncate it
    let truncatedDealerId = normalizedDealerId;
    if (normalizedDealerId.length > availableSpace - 8) { // Leave at least 8 chars for VIN
        truncatedDealerId = normalizedDealerId.substring(0, availableSpace - 8);
    }

    // If VIN is too long, truncate it
    let truncatedVin = normalizedVin;
    const remainingSpace = availableSpace - truncatedDealerId.length;
    if (normalizedVin.length > remainingSpace) {
        truncatedVin = normalizedVin.substring(0, remainingSpace);
    }

    // Generate deterministic slashtag
    return `${version}/${service}/${truncatedDealerId}/${truncatedVin}`;
}

// Test with the actual values from the failing job
const dealerId = '5eb88852-0caa-5656-8a7b-aab53e5b1847';
const vin = '2HKRS3H74SH336969';

console.log('Testing slashtag generation:');
console.log('Dealer ID:', dealerId);
console.log('VIN:', vin);

const slashtag = generateVersionedSlashtag(dealerId, vin);
console.log('Generated slashtag:', slashtag);
console.log('Slashtag length:', slashtag.length);

// Check if it's too long
if (slashtag.length > 50) {
    console.log('❌ Slashtag is too long! Max is 50 characters');
} else {
    console.log('✅ Slashtag length is acceptable');
}

// Test with a shorter dealer ID
console.log('\nTesting with shorter dealer ID:');
const shortDealerId = 'rsm-honda';
const slashtag2 = generateVersionedSlashtag(shortDealerId, vin);
console.log('Generated slashtag:', slashtag2);
console.log('Slashtag length:', slashtag2.length);
