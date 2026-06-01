/**
 * Management script for SlideSage admin operations.
 * Run with: bun src/manage.ts <command>
 *
 * Security: This script requires the ADMIN_SECRET_HASH environment variable to be set
 * for sensitive operations. This prevents accidental or unauthorized modifications.
 */
import { createHash } from "node:crypto";
import { db, users } from "@slide-sage/db";
import { eq } from "drizzle-orm";

// Secret key required for admin operations
// Generate a secure secret:
// node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
const ADMIN_SECRET_HASH = process.env.ADMIN_SECRET_HASH;

const ALLOWED_DEV_EMAILS = ["user@mail.com"];

function verifyAdminSecret(providedSecret: string): boolean {
    /**Verify the admin secret matches the stored hash*/
    if (!ADMIN_SECRET_HASH) {
        console.error("ERROR: ADMIN_SECRET_HASH environment variable not set.");
        console.error(
            "Set it with: export ADMIN_SECRET_HASH=$(echo -n 'your-secret' | sha256sum | cut -d' ' -f1)"
        );
        return false;
    }

    const providedHash = createHash("sha256").update(providedSecret).digest("hex");
    return providedHash === ADMIN_SECRET_HASH;
}

async function grantUnlimitedTokens(email: string, secret: string): Promise<boolean> {
    /**Grant unlimited tokens to a user (requires admin secret)*/
    if (!verifyAdminSecret(secret)) {
        console.error("ERROR: Invalid admin secret");
        return false;
    }

    if (!ALLOWED_DEV_EMAILS.includes(email)) {
        console.error(`ERROR: Email '${email}' is not in the allowed dev emails list`);
        console.error(`Allowed emails: ${ALLOWED_DEV_EMAILS.join(", ")}`);
        return false;
    }

    const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);

    if (!user) {
        console.error(`ERROR: User with email '${email}' not found`);
        return false;
    }

    await db.update(users).set({ isUnlimited: true }).where(eq(users.id, user.id));

    console.log(`SUCCESS: Granted unlimited tokens to user '${email}'`);
    return true;
}

async function revokeUnlimitedTokens(email: string, secret: string): Promise<boolean> {
    /**Revoke unlimited tokens from a user (requires admin secret)*/
    if (!verifyAdminSecret(secret)) {
        console.error("ERROR: Invalid admin secret");
        return false;
    }

    const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);

    if (!user) {
        console.error(`ERROR: User with email '${email}' not found`);
        return false;
    }

    await db.update(users).set({ isUnlimited: false }).where(eq(users.id, user.id));

    console.log(`SUCCESS: Revoked unlimited tokens from user '${email}'`);
    return true;
}

async function listUnlimitedUsers(): Promise<void> {
    /**List all users with unlimited tokens*/
    const unlimitedUsers = await db.select().from(users).where(eq(users.isUnlimited, true));

    if (unlimitedUsers.length === 0) {
        console.log("No users with unlimited tokens found");
        return;
    }

    console.log("Users with unlimited tokens:");
    for (const user of unlimitedUsers) {
        console.log(`  - ${user.email} (ID: ${user.id}, Name: ${user.name})`);
    }
}

async function initDevUser(secret: string): Promise<boolean> {
    /**Initialize the dev user with unlimited tokens (run once during setup)*/
    if (!verifyAdminSecret(secret)) {
        console.error("ERROR: Invalid admin secret");
        return false;
    }

    const devEmail = "user@mail.com";
    const [existingUser] = await db.select().from(users).where(eq(users.email, devEmail)).limit(1);

    if (!existingUser) {
        console.log("Dev user not found. Creating...");

        // Create user
        const userId = crypto.randomUUID();
        await db
            .insert(users)
            .values({
                id: userId,
                email: devEmail,
                name: "Dev User",
                isUnlimited: true,
                slideTokens: 50.0,
            })
            .execute();

        console.log("SUCCESS: Created dev user with unlimited tokens");
    } else {
        await db.update(users).set({ isUnlimited: true }).where(eq(users.id, existingUser.id));
        console.log(`SUCCESS: Granted unlimited tokens to existing user '${existingUser.email}'`);
    }

    return true;
}

async function migrateAddUnlimitedColumn(): Promise<void> {
    /**Add the is_unlimited column if it doesn't exist*/
    // Note: In Drizzle, schema changes should be done through migrations
    // This function is kept for compatibility but should use migrations instead
    console.log(
        "Note: Schema changes should be done through Drizzle migrations (cd packages/DB and run bun run db:migrate)"
    );
    console.log("The is_unlimited column should already exist in the schema.");
}

function printUsage(): void {
    /**Print usage information*/
    console.log(`
SlideSage Management Script
===========================

Usage: bun src/manage.ts <command> [args]

Commands:
  grant <email> <secret>    Grant unlimited tokens to a user
  revoke <email> <secret>    Revoke unlimited tokens from a user
  list                      List all users with unlimited tokens
  init-dev <secret>         Initialize dev user with unlimited tokens
  migrate                   Info about schema migrations
  help                      Show this help message

Security Setup:
  1. Generate a secret: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
  2. Create hash: echo -n 'your-secret' | sha256sum | cut -d' ' -f1
  3. Set environment: export ADMIN_SECRET_HASH='the-hash-from-step-2'

Example:
  bun src/manage.ts grant user@mail.com your-secret
`);
}

async function main() {
    const args = process.argv.slice(2);

    if (args.length === 0) {
        printUsage();
        process.exit(1);
    }

    const command = args[0].toLowerCase();

    try {
        switch (command) {
            case "help":
                printUsage();
                break;

            case "grant":
                if (args.length !== 3) {
                    console.error("Usage: bun src/manage.ts grant <email> <secret>");
                    process.exit(1);
                }
                await grantUnlimitedTokens(args[1], args[2]);
                break;

            case "revoke":
                if (args.length !== 3) {
                    console.error("Usage: bun src/manage.ts revoke <email> <secret>");
                    process.exit(1);
                }
                await revokeUnlimitedTokens(args[1], args[2]);
                break;

            case "list":
                await listUnlimitedUsers();
                break;

            case "init-dev":
                if (args.length !== 2) {
                    console.error("Usage: bun src/manage.ts init-dev <secret>");
                    process.exit(1);
                }
                await initDevUser(args[1]);
                break;

            case "migrate":
                await migrateAddUnlimitedColumn();
                break;

            default:
                console.error(`Unknown command: ${command}`);
                printUsage();
                process.exit(1);
        }
    } catch (error) {
        console.error("ERROR:", error instanceof Error ? error.message : String(error));
        process.exit(1);
    } finally {
        // Close database connection
        process.exit(0);
    }
}

main();
