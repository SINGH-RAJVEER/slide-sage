import { createHash } from "node:crypto";

// Generate a random 6-digit verification code
export function generateVerificationCode(): string {
    return Math.floor(100000 + Math.random() * 900000).toString();
}

// Hash a verification code using SHA-256
export function hashVerificationCode(code: string): string {
    return createHash("sha256").update(code).digest("hex");
}

// Verify that a code matches its hash
export function verifyCode(code: string, hash: string): boolean {
    return hashVerificationCode(code) === hash;
}

// Check if a verification record is expired
export function isCodeExpired(expiresAt: Date): boolean {
    return new Date() > expiresAt;
}

// Get expiration time (15 mins from generation)
export function getCodeExpirationTime(): Date {
    const expirationTime = new Date();
    expirationTime.setMinutes(expirationTime.getMinutes() + 15);
    return expirationTime;
}
