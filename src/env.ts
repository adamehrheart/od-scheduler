import { z } from 'zod'

export const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),

  // Supabase
  OD_SUPABASE_URL: z.string().url(),
  OD_SUPABASE_SERVICE_ROLE: z.string().min(10),

  // External services
  OD_CMS_URL: z.string().url().optional(),
  OD_DATA_API_URL: z.string().url(),
  OD_SOAP_TRANSFORMER_URL: z.string().url(),

  // Auth
  OD_API_KEY_SECRET: z.string().min(8),
  OD_BEARER_TOKEN: z.string().min(8).optional(),

  // HomeNet
  OD_HOMENET_INTEGRATION_TOKEN: z.string().min(8).optional(),
  OD_HOMENET_ROOFTOP_COLLECTION: z.string().optional(),
  OD_UPDATED_SINCE: z.string().default('2025-01-01T00:00:00Z').refine((val) => {
    // Basic validation for date format
    if (!val) return false;
    const date = new Date(val);
    return !isNaN(date.getTime());
  }, {
    message: 'OD_UPDATED_SINCE must be a valid date string (ISO format recommended: YYYY-MM-DDTHH:mm:ssZ)'
  }),

  // Rebrandly
  OD_REBRANDLY_API_KEY: z.string().min(8).optional(),
})

export type AppEnv = z.infer<typeof EnvSchema>
export const env: AppEnv = EnvSchema.parse(process.env)


