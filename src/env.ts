import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().min(0).max(65535).default(8080),
    APP_BASE_URL: z.string().url({ message: 'APP_BASE_URL must be a valid URL' }),

    GOOGLE_PROJECT_ID: z.string().min(1),
    GOOGLE_CLIENT_EMAIL: z.string().email().optional(),
    GOOGLE_PRIVATE_KEY: z.string().min(1).optional(),
    GOOGLE_DRIVE_FOLDER_ID: z.string().min(1),
    GOOGLE_DRIVE_ARCHIVE_FOLDER_ID: z.string().min(1),
    GOOGLE_SHEET_ID: z.string().min(1),

    SHOPIFY_STORE_DOMAIN: z.string().min(1),
    SHOPIFY_ADMIN_TOKEN: z.string().min(1),
    SHOPIFY_API_VERSION: z.string().min(1).default('2025-07'),
    SHOPIFY_LOCATION_ID: z.string().min(1),

    OPENAI_API_KEY: z.string().min(1)
  })
  .superRefine((data, ctx) => {
    const hasEmail = Boolean(data.GOOGLE_CLIENT_EMAIL);
    const hasKey = Boolean(data.GOOGLE_PRIVATE_KEY);
    if (hasEmail !== hasKey) {
      const message = 'GOOGLE_CLIENT_EMAIL and GOOGLE_PRIVATE_KEY must both be set or both omitted';
      if (!hasEmail) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['GOOGLE_CLIENT_EMAIL'],
          message
        });
      }
      if (!hasKey) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['GOOGLE_PRIVATE_KEY'],
          message
        });
      }
    }
  })
  .transform((data) => ({
    ...data,
    GOOGLE_PRIVATE_KEY: data.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n')
  }));

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  const missing = parsed.error.issues
    .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
    .join('\n');
  throw new Error(`Invalid environment configuration:\n${missing}`);
}

export const config = {
  nodeEnv: parsed.data.NODE_ENV,
  port: parsed.data.PORT,
  appBaseUrl: parsed.data.APP_BASE_URL.replace(/\/$/, ''),
  google: {
    projectId: parsed.data.GOOGLE_PROJECT_ID,
    clientEmail: parsed.data.GOOGLE_CLIENT_EMAIL,
    privateKey: parsed.data.GOOGLE_PRIVATE_KEY,
    sheetId: parsed.data.GOOGLE_SHEET_ID,
    driveFolderId: parsed.data.GOOGLE_DRIVE_FOLDER_ID,
    driveArchiveFolderId: parsed.data.GOOGLE_DRIVE_ARCHIVE_FOLDER_ID
  },
  shopify: {
    storeDomain: parsed.data.SHOPIFY_STORE_DOMAIN,
    adminToken: parsed.data.SHOPIFY_ADMIN_TOKEN,
    apiVersion: parsed.data.SHOPIFY_API_VERSION,
    locationId: parsed.data.SHOPIFY_LOCATION_ID
  },
  openai: {
    apiKey: parsed.data.OPENAI_API_KEY
  }
} as const;

export type AppConfig = typeof config;
