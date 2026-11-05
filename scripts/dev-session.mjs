/**
 * Prints a session cookie for a seeded account so you can exercise authenticated
 * pages with curl/PowerShell without driving the login form.
 *
 * Usage: node --import ./scripts/register.mjs scripts/dev-session.mjs ada@mystore.ng
 */
import { createSession, findUserByEmail } from "../lib/auth/users.ts";

const email = process.argv[2] ?? "ada@mystore.ng";
const user = await findUserByEmail(email);

if (!user) {
  console.error(`No account found for ${email}. Run: npm run db:seed`);
  process.exit(1);
}

console.log(await createSession(user.id));
