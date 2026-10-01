import { zValidator } from "@hono/zod-validator";
import type { ValidationTargets } from "hono";
import { z, type ZodSchema } from "zod";
import { clean } from "./security.js";

// zValidator with a consistent 400 body: { error: { code: "invalid_input", message, fields } }.
export const validate = <T extends ZodSchema, K extends keyof ValidationTargets>(target: K, schema: T) =>
  zValidator(target, schema, (result, c) => {
    if (!result.success) {
      const fields = Object.fromEntries(result.error.issues.map((i) => [i.path.join(".") || "_", i.message]));
      return c.json({ error: { code: "invalid_input", message: "Some fields need another look.", fields } }, 400);
    }
  });

export const text = (min: number, max: number) => z.string().transform(clean).pipe(z.string().min(min).max(max));
export const optionalText = (max: number) => z.string().transform(clean).pipe(z.string().max(max)).optional().transform((v) => v || null);
// Nullable, and left undefined when omitted (so PATCH can tell "unchanged" from "cleared").
export const detailText = (max: number) => z.union([z.string().transform(clean).pipe(z.string().max(max)), z.null()]).optional();
// Letters (any script), spaces, dots, apostrophes and hyphens; at least two characters.
export const fullName = z.string().transform((v) => clean(v).replace(/\s+/g, " ")).pipe(z.string().min(2, "Please enter your full name").max(80).regex(/^[\p{L}\p{M}][\p{L}\p{M} .'-]*$/u, "Use letters only, as on your ID"));
export const publicId = z.string().regex(/^\d{15}$/, "Invalid id");
