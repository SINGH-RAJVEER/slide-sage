import { AsyncLocalStorage } from "node:async_hooks";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

const DEFAULT_CONNECTION_STRING = "postgresql://slidesage:slidesage@localhost:5432/slidesage";

export interface DatabaseOptions {
	connectTimeout?: number;
	idleTimeout?: number;
	max?: number;
}

function resolveSSL(connectionString: string): true | false {
	const lowerConnectionString = connectionString.toLowerCase();
	if (
		lowerConnectionString.includes("sslmode=disable") ||
		lowerConnectionString.includes("ssl=false")
	) {
		return false;
	}
	if (
		lowerConnectionString.includes("sslmode=require") ||
		lowerConnectionString.includes("ssl=require") ||
		lowerConnectionString.includes("ssl=true")
	) {
		return true;
	}

	try {
		const host = new URL(connectionString).hostname;
		if (host === "localhost" || host === "127.0.0.1" || host === "::1") {
			return false;
		}
		return true;
	} catch {
		return false;
	}
}

function positiveInteger(value: string | undefined, fallback: number): number {
	const parsed = Number.parseInt(value ?? "", 10);
	return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function createDatabase(connectionString: string, options: DatabaseOptions = {}) {
	const client = postgres(connectionString, {
		ssl: resolveSSL(connectionString),
		connect_timeout:
			options.connectTimeout ?? positiveInteger(process.env["DATABASE_CONNECT_TIMEOUT"], 10),
		idle_timeout: options.idleTimeout ?? positiveInteger(process.env["DATABASE_IDLE_TIMEOUT"], 20),
		max: options.max ?? positiveInteger(process.env["DATABASE_POOL_MAX"], 5),
		connection: {
			application_name: "slidesage-backend",
		},
	});

	return {
		client,
		db: drizzle(client, { schema }),
	};
}

type DatabaseInstance = ReturnType<typeof createDatabase>;
export type Database = DatabaseInstance["db"];

const requestDatabase = new AsyncLocalStorage<Database>();
const processDatabases = new Map<string, DatabaseInstance>();

export function getProcessDatabase(connectionString = DEFAULT_CONNECTION_STRING): DatabaseInstance {
	let database = processDatabases.get(connectionString);
	if (!database) {
		database = createDatabase(connectionString);
		processDatabases.set(connectionString, database);
	}
	return database;
}

export const db = new Proxy({} as Database, {
	get(_target, property) {
		const activeDatabase =
			requestDatabase.getStore() ??
			getProcessDatabase(process.env["DATABASE_URL"] || DEFAULT_CONNECTION_STRING).db;
		const value = Reflect.get(activeDatabase, property, activeDatabase);
		return typeof value === "function" ? value.bind(activeDatabase) : value;
	},
}) as Database;

export function runWithDatabase<T>(database: Database, callback: () => T): T {
	return requestDatabase.run(database, callback);
}

export async function closeProcessDatabases(): Promise<void> {
	const databases = Array.from(processDatabases.values());
	processDatabases.clear();
	await Promise.all(databases.map(({ client }) => client.end({ timeout: 5 })));
}

export async function closeClientAfterResponse(
	response: Response,
	close: () => Promise<unknown>,
	completion?: Promise<void>
): Promise<Response> {
	let closePromise: Promise<void> | undefined;
	const closeOnce = () => {
		if (!closePromise) {
			closePromise = Promise.resolve(close())
				.then(() => undefined)
				.catch(() => undefined);
		}
		return closePromise;
	};
	const awaitCompletion = async () => {
		if (!completion) return;
		let timeout: ReturnType<typeof setTimeout> | undefined;
		await Promise.race([
			completion,
			new Promise<void>((resolve) => {
				timeout = setTimeout(resolve, 15_000);
			}),
		]).finally(() => {
			if (timeout) clearTimeout(timeout);
		});
	};

	if (!response.body) {
		await closeOnce();
		return response;
	}

	const reader = response.body.getReader();
	const body = new ReadableStream<Uint8Array>({
		async pull(controller) {
			try {
				const result = await reader.read();
				if (result.done) {
					controller.close();
					await awaitCompletion();
					await closeOnce();
					return;
				}
				controller.enqueue(result.value);
			} catch (error) {
				controller.error(error);
				await awaitCompletion();
				await closeOnce();
			}
		},
		async cancel(reason) {
			try {
				await reader.cancel(reason);
			} finally {
				await awaitCompletion();
				await closeOnce();
			}
		},
	});

	return new Response(body, {
		status: response.status,
		statusText: response.statusText,
		headers: response.headers,
	});
}

export function isBunRuntime(): boolean {
	return "Bun" in globalThis;
}

export * from "./schema";
