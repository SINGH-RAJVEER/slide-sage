import { db } from "@slide-sage/db";
import { accounts, users, verifications } from "@slide-sage/db";
import { hashPassword as hashBetterAuthPassword } from "better-auth/crypto";
import { eq } from "drizzle-orm";
import {
    generateVerificationCode,
    getCodeExpirationTime,
    hashVerificationCode,
    isCodeExpired,
    verifyCode,
} from "../utils/verification-code";
import { sendVerificationEmail } from "./email.service";

// Sign up a new user to create an unverified user account and send verification code
export async function signUpWithEmail(
    email: string,
    password: string,
    name: string
): Promise<{
    success: boolean;
    error?: string;
    userId?: string;
}> {
    try {
        const existingUser = await db.query.users.findFirst({
            where: eq(users.email, email),
        });

        if (existingUser) {
            return { success: false, error: "Email already registered" };
        }

        const userId = crypto.randomUUID();
        const hashedPassword = await hashBetterAuthPassword(password);

        await db.insert(users).values({
            id: userId,
            email,
            name,
            emailVerified: false,
        });

        const accountId = crypto.randomUUID();
        await db.insert(accounts).values({
            id: accountId,
            userId,
            accountId: userId,
            providerId: "credential",
            password: hashedPassword,
        });

        // Generate verification code
        const code = generateVerificationCode();
        const hashedCode = hashVerificationCode(code);
        const expiresAt = getCodeExpirationTime();

        // Store verification code
        await db.insert(verifications).values({
            identifier: email,
            value: hashedCode,
            expiresAt,
        });

        // Send verification email
        const emailResult = await sendVerificationEmail(email, code, name);
        if (!emailResult.success)
            console.error("Failed to send verification email:", emailResult.error);

        return {
            success: true,
            userId,
        };
    } catch (error) {
        console.error("Sign up error:", error);
        return {
            success: false,
            error: error instanceof Error ? error.message : "Sign up failed",
        };
    }
}

// Verify email
export async function verifyEmailCode(
    email: string,
    code: string
): Promise<{
    success: boolean;
    error?: string;
    user?: typeof users.$inferSelect;
}> {
    try {
        const verification = await db.query.verifications.findFirst({
            where: eq(verifications.identifier, email),
        });

        if (!verification) {
            return { success: false, error: "No verification code found" };
        }

        // Check if expired
        if (isCodeExpired(verification.expiresAt)) {
            await db.delete(verifications).where(eq(verifications.id, verification.id));
            return { success: false, error: "Verification code expired" };
        }

        // Verify code
        if (!verifyCode(code, verification.value)) {
            return { success: false, error: "Invalid verification code" };
        }

        // Mark user as verified
        const result = await db
            .update(users)
            .set({ emailVerified: true })
            .where(eq(users.email, email))
            .returning();

        if (!result || result.length === 0) {
            return { success: false, error: "User not found" };
        }

        // Delete verification code
        await db.delete(verifications).where(eq(verifications.id, verification.id));

        return {
            success: true,
            user: result[0],
        };
    } catch (error) {
        console.error("Email verification error:", error);
        return {
            success: false,
            error: error instanceof Error ? error.message : "Verification failed",
        };
    }
}

// Resend verification code
export async function resendVerificationCode(email: string): Promise<{
    success: boolean;
    error?: string;
}> {
    try {
        const user = await db.query.users.findFirst({
            where: eq(users.email, email),
        });

        if (!user) {
            return { success: false, error: "User not found" };
        }

        // Delete existing code if any
        await db.delete(verifications).where(eq(verifications.identifier, email));

        // Generate new code
        const code = generateVerificationCode();
        const hashedCode = hashVerificationCode(code);
        const expiresAt = getCodeExpirationTime();

        // Store verification code
        await db.insert(verifications).values({
            identifier: email,
            value: hashedCode,
            expiresAt,
        });

        // Send email
        const emailResult = await sendVerificationEmail(email, code, user.name || "");
        if (!emailResult.success) {
            return {
                success: false,
                error: emailResult.error || "Failed to send verification email",
            };
        }

        return { success: true };
    } catch (error) {
        console.error("Resend code error:", error);
        return {
            success: false,
            error: error instanceof Error ? error.message : "Failed to resend code",
        };
    }
}
