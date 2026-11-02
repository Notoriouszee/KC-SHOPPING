/**
 * ESM resolve hook that lets Node run the TypeScript modules in `lib/` directly.
 *
 * Node 24 strips types natively, but ESM requires explicit file extensions and
 * the app code uses extensionless imports (the convention Next.js understands).
 * This hook adds `.ts` / `/index.ts` fallbacks so `node --test` can import the
 * real repository code instead of a duplicated test harness.
 */
export async function resolve(specifier, context, nextResolve) {
  const isRelative = specifier.startsWith("./") || specifier.startsWith("../") || specifier.startsWith("/");
  if (!isRelative) return nextResolve(specifier, context);

  try {
    return await nextResolve(specifier, context);
  } catch (error) {
    for (const candidate of [`${specifier}.ts`, `${specifier}/index.ts`, `${specifier}.tsx`]) {
      try {
        return await nextResolve(candidate, context);
      } catch {
        // try the next candidate
      }
    }
    throw error;
  }
}
