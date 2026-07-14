import { z } from "zod";

const clientEnvSchema = z
  .object({
    VITE_SUPABASE_URL: z.string().optional(),
    VITE_SUPABASE_ANON_KEY: z.string().optional()
  })
  .superRefine((env, context) => {
    if (!env.VITE_SUPABASE_URL) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["VITE_SUPABASE_URL"],
        message: "VITE_SUPABASE_URL is required"
      });
    } else if (!URL.canParse(env.VITE_SUPABASE_URL)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["VITE_SUPABASE_URL"],
        message: "VITE_SUPABASE_URL must be a valid URL"
      });
    }

    if (!env.VITE_SUPABASE_ANON_KEY) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["VITE_SUPABASE_ANON_KEY"],
        message: "VITE_SUPABASE_ANON_KEY is required"
      });
    }
  })
  .transform((env) => ({
    VITE_SUPABASE_URL: env.VITE_SUPABASE_URL ?? "",
    VITE_SUPABASE_ANON_KEY: env.VITE_SUPABASE_ANON_KEY ?? ""
  }));

export type ClientEnv =
  | {
      ok: true;
      values: z.infer<typeof clientEnvSchema>;
    }
  | {
      ok: false;
      errors: string[];
    };

export function getClientEnv(): ClientEnv {
  const parsed = clientEnvSchema.safeParse({
    VITE_SUPABASE_URL: import.meta.env.VITE_SUPABASE_URL,
    VITE_SUPABASE_ANON_KEY: import.meta.env.VITE_SUPABASE_ANON_KEY
  });

  if (parsed.success) {
    return {
      ok: true,
      values: parsed.data
    };
  }

  return {
    ok: false,
    errors: parsed.error.issues.map((issue) => issue.message)
  };
}
