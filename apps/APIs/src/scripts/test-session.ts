import { config } from "dotenv";
import { resolve } from "node:path";
config({ path: resolve(import.meta.dir, "../../../../.env") });

import { db, sessions, users } from "@slide-sage/db";

const existingUsers = await db.select({ id: users.id, email: users.email }).from(users).limit(1);
console.log("Users found:", existingUsers);

if (existingUsers.length === 0) {
  const newUser = await db.insert(users).values({
    id: crypto.randomUUID(),
    name: "Test User",
    email: "test-billing@test.com",
    emailVerified: true,
    slideTokens: 50.0,
    isUnlimited: false,
  }).returning();
  console.log("Created user:", newUser[0]);
  existingUsers.push({ id: newUser[0].id, email: newUser[0].email });
}

const user = existingUsers[0];

const testToken = "test-billing-token-" + Date.now();
const expiresAt = new Date(Date.now() + 86400 * 1000);

await db.insert(sessions).values({
  id: crypto.randomUUID(),
  token: testToken,
  userId: user.id,
  expiresAt,
});

console.log("\n=== Test Session ===");
console.log("User:", user.email);
console.log("Token:", testToken);
