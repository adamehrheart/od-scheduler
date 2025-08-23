import { z } from 'zod'

export const EnvSchema = z.object({
  NODE_ENV: z.enum(['development','test','production']).default('development'),

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
  OD_UPDATED_SINCE: z.string().optional(),
})

export type AppEnv = z.infer<typeof EnvSchema>
export const env: AppEnv = EnvSchema.parse(process.env)


