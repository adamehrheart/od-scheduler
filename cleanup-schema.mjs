--Migration to clean up schema for Dealer.com - only approach
--This removes unused columns and updates constraints

--1. Remove unused financial columns that Dealer.com doesn't provide
ALTER TABLE vehicles DROP COLUMN IF EXISTS monthly_payment;
ALTER TABLE vehicles DROP COLUMN IF EXISTS down_payment;
ALTER TABLE vehicles DROP COLUMN IF EXISTS financing_available;

--1.5.Remove redundant dealerslug column(replaced by dealer_id foreign key)
ALTER TABLE vehicles DROP COLUMN IF EXISTS dealerslug;

--2. Update url_source check constraint to allow 'api-indirect'
--First drop the existing constraint
ALTER TABLE vehicles DROP CONSTRAINT IF EXISTS vehicles_url_source_check;

--Then add the new constraint with 'api-indirect' option
ALTER TABLE vehicles ADD CONSTRAINT vehicles_url_source_check
CHECK(url_source IN('api', 'api-indirect', 'scrape', 'homenet', 'manual'));

--3. Add comment explaining the change
COMMENT ON COLUMN vehicles.url_source IS
'Source of the vehicle data: api (direct API), api-indirect (Dealer.com), scrape, homenet, manual';

--4. Update existing records to use 'api-indirect' for Dealer.com data
UPDATE vehicles 
SET url_source = 'api-indirect' 
WHERE url_source = 'scrape' AND source_priority = 1;
