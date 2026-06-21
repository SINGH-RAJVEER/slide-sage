import { config } from "dotenv";
import { resolve } from "node:path";
config({ path: resolve(import.meta.dir, "../../../../.env") });

import { db, sessions, users } from "@slide-sage/db";

console.log("=== Checking DB Connection ===");
const existingUsers = await db.select({ id: users.id, email: users.email }).from(users).limit(3);

if (existingUsers.length === 0) {
    console.log("No users found. Creating test user...");
    const created = await db
        .insert(users)
        .values({
            id: crypto.randomUUID(),
            name: "Test User",
            email: "test@test.com",
            emailVerified: true,
            slideTokens: 50.0,
        })
        .returning({ id: users.id, email: users.email });
    existingUsers.push(created[0]);
}

const user = existingUsers[0];
console.log("User:", user.email, "(id:", user.id + ")");

const testToken = "test-billing-" + Date.now();
await db.insert(sessions).values({
    id: crypto.randomUUID(),
    token: testToken,
    userId: user.id,
    expiresAt: new Date(Date.now() + 3600 * 1000),
});

console.log("Session token:", testToken);
