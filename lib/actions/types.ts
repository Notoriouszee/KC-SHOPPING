import { ValidationError } from "../domain/validation";

/** Shape returned by every form server action. */
export type ActionState = {
  ok?: boolean;
  message?: string;
  error?: string;
  fieldErrors?: Record<string, string>;
} | null;

export function failure(error: unknown, fallback = "Something went wrong. Please try again."): ActionState {
  if (error instanceof ValidationError) {
    const fieldErrors: Record<string, string> = {};
    for (const entry of error.fields) {
      if (!fieldErrors[entry.field]) fieldErrors[entry.field] = entry.message;
    }
    return { error: error.fields[0]?.message ?? fallback, fieldErrors };
  }
  console.error("[action]", error);
  return { error: fallback };
}

export function formText(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

export function formList(formData: FormData, key: string): string[] {
  return formData
    .getAll(key)
    .map((value) => (typeof value === "string" ? value.trim() : ""));
}

export function formFiles(formData: FormData, key: string): File[] {
  return formData.getAll(key).filter((value): value is File => value instanceof File && value.size > 0);
}

/**
 * Next.js signals redirects by throwing a special error. Server actions that
 * redirect inside a try/catch must rethrow it, or the redirect is swallowed and
 * the user sees a validation failure instead.
 */
export function isRedirectError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "digest" in error &&
    typeof (error as { digest?: unknown }).digest === "string" &&
    (error as { digest: string }).digest.startsWith("NEXT_REDIRECT")
  );
}
