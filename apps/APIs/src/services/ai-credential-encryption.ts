import type { AIProvider } from "@slide-sage/types";

export interface EncryptedCredential {
    encryptedApiKey: string;
    encryptionIv: string;
    encryptionKeyVersion: number;
    keyLastFour: string;
}

function base64Encode(bytes: Uint8Array): string {
    return Buffer.from(bytes).toString("base64");
}

function base64Decode(value: string): Uint8Array {
    return Uint8Array.from(Buffer.from(value, "base64"));
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
    return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

function currentVersion(): number {
    const version = Number.parseInt(process.env["BYOK_ENCRYPTION_KEY_CURRENT_VERSION"] || "1", 10);
    if (!Number.isInteger(version) || version < 1)
        throw new Error("Invalid BYOK encryption version");
    return version;
}

async function encryptionKey(version: number): Promise<CryptoKey> {
    const encoded = process.env[`BYOK_ENCRYPTION_KEY_V${version}`];
    if (!encoded) throw new Error(`BYOK encryption key version ${version} is not configured`);
    const raw = base64Decode(encoded);
    if (raw.byteLength !== 32)
        throw new Error("BYOK encryption keys must contain exactly 32 bytes");
    return crypto.subtle.importKey("raw", toArrayBuffer(raw), "AES-GCM", false, [
        "encrypt",
        "decrypt",
    ]);
}

function additionalData(userId: string, provider: AIProvider, version: number): Uint8Array {
    return new TextEncoder().encode(`slidesage-byok:${userId}:${provider}:v${version}`);
}

export async function encryptApiKey(
    userId: string,
    provider: AIProvider,
    apiKey: string
): Promise<EncryptedCredential> {
    const version = currentVersion();
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ciphertext = await crypto.subtle.encrypt(
        {
            name: "AES-GCM",
            iv: toArrayBuffer(iv),
            additionalData: toArrayBuffer(additionalData(userId, provider, version)),
        },
        await encryptionKey(version),
        new TextEncoder().encode(apiKey)
    );
    return {
        encryptedApiKey: base64Encode(new Uint8Array(ciphertext)),
        encryptionIv: base64Encode(iv),
        encryptionKeyVersion: version,
        keyLastFour: apiKey.slice(-4),
    };
}

export async function decryptApiKey(
    userId: string,
    provider: AIProvider,
    credential: {
        encryptedApiKey: string;
        encryptionIv: string;
        encryptionKeyVersion: number;
    }
): Promise<string> {
    const plaintext = await crypto.subtle.decrypt(
        {
            name: "AES-GCM",
            iv: toArrayBuffer(base64Decode(credential.encryptionIv)),
            additionalData: toArrayBuffer(
                additionalData(userId, provider, credential.encryptionKeyVersion)
            ),
        },
        await encryptionKey(credential.encryptionKeyVersion),
        toArrayBuffer(base64Decode(credential.encryptedApiKey))
    );
    return new TextDecoder().decode(plaintext);
}
