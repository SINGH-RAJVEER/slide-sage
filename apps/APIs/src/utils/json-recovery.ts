// JSON Recovery Utilities

import { writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

export class JSONRecoveryError extends Error {
    constructor(message: string) {
        super(message);
        this.name = "JSONRecoveryError";
    }
}

export interface RecoveryResult {
    content: unknown;
    recovered: boolean;
    strategy?: string;
}

/*
@param content - The malformed JSON string
@param error - The JSONError that was raised
@returns Recovered JSON as an object
@throws JSONRecoveryError if recovery fails
*/

export function recoverJson(content: string, error: Error): RecoveryResult {
    console.error("JSON parsing error:", error.message);
    console.error(`Content length: ${content.length}`, content);

    // Strategy 1: Extract the first JSON value (handles model adding trailing text).
    try {
        const extracted = extractFirstJsonValue(content);
        if (extracted) {
            const sanitized = removeTrailingCommas(extracted);
            const parsedContent = JSON.parse(sanitized);

            console.info(
                `Successfully parsed extracted JSON with ${parsedContent.slides?.length || 0} slides`
            );

            return {
                content: parsedContent,
                recovered: true,
                strategy: "extract",
            };
        }
    } catch (_extractError) {
        console.warn("Extraction strategy failed, trying structural closure");
    }

    // Strategy 2: Try to close any unclosed structures (handles truncated streaming).
    try {
        const candidate = extractFromFirstJsonStart(content) ?? content;
        const closed = closeOpenStructures(candidate);
        const sanitized = removeTrailingCommas(closed);
        const parsedContent = JSON.parse(sanitized);

        console.info(
            `Successfully parsed structurally-closed JSON with ${parsedContent.slides?.length || 0} slides`
        );

        return {
            content: parsedContent,
            recovered: true,
            strategy: "close",
        };
    } catch (closeError) {
        console.error("Could not recover from JSON error:", closeError);
        saveMalformedJson(content);
        throw new JSONRecoveryError(`Unable to recover JSON: ${closeError}`);
    }
}

function findFirstJsonStart(input: string): number {
    const idxObj = input.indexOf("{");
    const idxArr = input.indexOf("[");

    if (idxObj === -1) return idxArr;
    if (idxArr === -1) return idxObj;
    return Math.min(idxObj, idxArr);
}

function extractFromFirstJsonStart(input: string): string | null {
    const start = findFirstJsonStart(input);
    if (start < 0) return null;
    return input.slice(start).trim();
}

// Extract the first complete JSON value from a string.

function extractFirstJsonValue(input: string): string | null {
    const start = findFirstJsonStart(input);
    if (start < 0) return null;

    const s = input.slice(start).trimStart();

    const stack: Array<"{" | "["> = [];
    let inString = false;
    let escapeNext = false;

    for (let i = 0; i < s.length; i++) {
        const ch = s[i];

        if (escapeNext) {
            escapeNext = false;
            continue;
        }

        if (ch === "\\") {
            if (inString) {
                escapeNext = true;
            }
            continue;
        }

        if (ch === '"') {
            inString = !inString;
            continue;
        }

        if (inString) {
            continue;
        }

        if (ch === "{" || ch === "[") {
            stack.push(ch);
            continue;
        }
        if (ch === "}" || ch === "]") {
            const expected = ch === "}" ? "{" : "[";

            if (stack.length === 0) return s.slice(0, i).trim();

            const last = stack[stack.length - 1];

            if (last === expected) stack.pop();

            if (stack.length === 0) return s.slice(0, i + 1).trim();
        }
    }

    return s.trim();
}

/*
 * Close any remaining open objects/arrays using a stack-based scan.
 * Ignores braces/brackets inside strings.
 */

function closeOpenStructures(input: string): string {
    const s = extractFromFirstJsonStart(input) ?? input.trim();
    const stack: Array<"{" | "["> = [];
    let inString = false;
    let escapeNext = false;

    for (let i = 0; i < s.length; i++) {
        const ch = s[i];

        if (escapeNext) {
            escapeNext = false;
            continue;
        }
        if (ch === "\\") {
            if (inString) escapeNext = true;
            continue;
        }
        if (ch === '"') {
            inString = !inString;
            continue;
        }
        if (inString) {
            continue;
        }

        if (ch === "{" || ch === "[") {
            stack.push(ch);
        } else if (ch === "}" || ch === "]") {
            const expected = ch === "}" ? "{" : "[";

            if (stack.length > 0 && stack[stack.length - 1] === expected) stack.pop();
        }
    }

    if (stack.length === 0) return s;

    let out = s;
    for (let i = stack.length - 1; i >= 0; i--) out += stack[i] === "{" ? "}" : "]";

    return out;
}

/*
 * Remove trailing commas before `}` or `]`.
 */

function removeTrailingCommas(input: string): string {
    let out = "";
    let inString = false;
    let escapeNext = false;

    for (let i = 0; i < input.length; i++) {
        const ch = input[i];

        if (escapeNext) {
            out += ch;
            escapeNext = false;
            continue;
        }

        if (ch === "\\") {
            out += ch;
            if (inString) escapeNext = true;
            continue;
        }

        if (ch === '"') {
            out += ch;
            inString = !inString;
            continue;
        }

        if (!inString && ch === ",") {
            let j = i + 1;
            while (j < input.length && /\s/.test(input[j])) j++;

            const next = input[j];
            if (next === "}" || next === "]") continue;
        }

        out += ch;
    }

    return out;
}

// Save malformed JSON to a temp file for debugging

function saveMalformedJson(content: string): void {
    try {
        const tempFile = join(tmpdir(), `litellm_error_${Date.now()}.json`);
        writeFileSync(tempFile, content);
        console.error(`Saved malformed JSON to: ${tempFile}`);
    } catch (e) {
        console.warn("Could not save malformed JSON:", e);
    }
}
