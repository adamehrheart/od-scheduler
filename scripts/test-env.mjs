#!/usr/bin/env node

// Test environment variables
import dotenv from 'dotenv';

dotenv.config();

console.log('🔍 Testing environment variables...');

const envVars = {
    OD_SUPABASE_URL: process.env.OD_SUPABASE_URL,
    OD_SUPABASE_SERVICE_ROLE: process.env.OD_SUPABASE_SERVICE_ROLE ? 'SET' : 'NOT SET',
    OD_REBRANDLY_API_KEY: process.env.OD_REBRANDLY_API_KEY ? 'SET' : 'NOT SET',
    NODE_ENV: process.env.NODE_ENV
};

console.log('Environment variables:', envVars);

// Test if we can access the Rebrandly API
if (process.env.OD_REBRANDLY_API_KEY) {
    console.log('✅ Rebrandly API key is configured');
} else {
    console.log('❌ Rebrandly API key is NOT configured');
}
