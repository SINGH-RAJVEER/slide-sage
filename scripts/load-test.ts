const DEFAULT_URL = "https://slidesage-api-94621805506.europe-west1.run.app/api/health";
const MAX_LATENCY_SAMPLES = 100_000;

export {};

type Config = {
	url: URL;
	concurrency: number;
	durationSeconds: number;
	requestsPerSecond: number;
	timeoutSeconds: number;
	expectedStatus: number;
	maxErrorRate: number;
	maxP95Milliseconds: number | null;
	confirmProduction: boolean;
	dryRun: boolean;
};

const usage = `
SlideSage API load test

Usage:
    bun run load-test --confirm-production [options]

Options:
    --url <url>                 Target URL (default: production /health)
    --concurrency <number>      Maximum in-flight requests (default: 100)
    --duration <seconds>        Test duration, 1-3600 (default: 30)
    --rps <number>              Target requests/second; 0 means unlimited (default: 500)
    --timeout <seconds>         Per-request timeout, 1-120 (default: 10)
    --expected-status <number>  Successful HTTP status (default: 200)
    --max-error-rate <decimal>  Exit non-zero above this rate (default: 0.01)
    --p95-ms <milliseconds>     Optional p95 latency failure threshold
    --confirm-production        Required for every non-loopback target
    --dry-run                   Validate and print configuration without sending requests
    --help                      Show this help

Examples:
    bun run load-test --confirm-production
    bun run load-test --confirm-production --concurrency 250 --rps 2000 --duration 120
    bun run load-test --url http://localhost:8000/health --rps 100 --duration 10
`;

function readNumber(
	name: string,
	value: string | undefined,
	minimum: number,
	maximum: number,
): number {
	if (value === undefined) throw new Error(`${name} requires a value`);

	const parsed = Number(value);
	if (!Number.isFinite(parsed) || parsed < minimum || parsed > maximum) {
		throw new Error(`${name} must be between ${minimum} and ${maximum}`);
	}
	return parsed;
}

function parseArguments(args: string[]): Config {
	const config: Config = {
		url: new URL(DEFAULT_URL),
		concurrency: 100,
		durationSeconds: 30,
		requestsPerSecond: 500,
		timeoutSeconds: 10,
		expectedStatus: 200,
		maxErrorRate: 0.01,
		maxP95Milliseconds: null,
		confirmProduction: false,
		dryRun: false,
	};

	for (let index = 0; index < args.length; index += 1) {
		const argument = args[index];
		const value = args[index + 1];

		switch (argument) {
			case "--url":
				if (value === undefined) throw new Error("--url requires a value");
				config.url = new URL(value);
				index += 1;
				break;
			case "--concurrency":
				config.concurrency = readNumber(argument, value, 1, 1_000);
				index += 1;
				break;
			case "--duration":
				config.durationSeconds = readNumber(argument, value, 1, 3_600);
				index += 1;
				break;
			case "--rps":
				config.requestsPerSecond = readNumber(argument, value, 0, 100_000);
				index += 1;
				break;
			case "--timeout":
				config.timeoutSeconds = readNumber(argument, value, 1, 120);
				index += 1;
				break;
			case "--expected-status":
				config.expectedStatus = readNumber(argument, value, 100, 599);
				index += 1;
				break;
			case "--max-error-rate":
				config.maxErrorRate = readNumber(argument, value, 0, 1);
				index += 1;
				break;
			case "--p95-ms":
				config.maxP95Milliseconds = readNumber(argument, value, 1, 600_000);
				index += 1;
				break;
			case "--confirm-production":
				config.confirmProduction = true;
				break;
			case "--dry-run":
				config.dryRun = true;
				break;
			case "--help":
				console.log(usage.trim());
				process.exit(0);
				break;
			default:
				throw new Error(`Unknown option: ${argument}`);
		}
	}

	if (config.url.protocol !== "http:" && config.url.protocol !== "https:") {
		throw new Error("--url must use HTTP or HTTPS");
	}
	if (config.url.username || config.url.password) {
		throw new Error("Credentials must not be embedded in --url");
	}
	if (!Number.isInteger(config.concurrency) || !Number.isInteger(config.expectedStatus)) {
		throw new Error("--concurrency and --expected-status must be integers");
	}

	const loopbackHosts = new Set(["localhost", "127.0.0.1", "0.0.0.0", "[::1]"]);
	if (!loopbackHosts.has(config.url.hostname) && !config.confirmProduction) {
		throw new Error("Remote load tests require --confirm-production");
	}

	return config;
}

function percentile(sortedValues: number[], percentileValue: number): number {
	if (sortedValues.length === 0) return 0;
	const index = Math.max(0, Math.ceil(percentileValue * sortedValues.length) - 1);
	return sortedValues[index] ?? 0;
}

function formatRate(value: number): string {
	return `${(value * 100).toFixed(2)}%`;
}

async function main(): Promise<void> {
	let config: Config;
	try {
		config = parseArguments(Bun.argv.slice(2));
	} catch (error) {
		console.error(error instanceof Error ? error.message : String(error));
		console.error("Run with --help for usage.");
		process.exitCode = 2;
		return;
	}

	console.log("Load test configuration");
	console.log(`  URL:             ${config.url.toString()}`);
	console.log(`  Duration:        ${config.durationSeconds}s`);
	console.log(`  Concurrency:     ${config.concurrency}`);
	console.log(
		`  Target rate:     ${config.requestsPerSecond === 0 ? "unlimited" : `${config.requestsPerSecond} req/s`}`,
	);
	console.log(`  Request timeout: ${config.timeoutSeconds}s`);
	console.log(`  Expected status: ${config.expectedStatus}`);

	if (config.dryRun) {
		console.log("Dry run complete; no requests sent.");
		return;
	}

	let stopping = false;
	let interrupted = false;
	let completed = 0;
	let inFlight = 0;
	let responseBytes = 0;
	let unexpectedStatuses = 0;
	let transportErrors = 0;
	let latencyCount = 0;
	let nextStartTime = performance.now();
	const latencySamples: number[] = [];
	const statuses = new Map<number, number>();
	const errors = new Map<string, number>();
	const startedAt = performance.now();
	const deadline = startedAt + config.durationSeconds * 1_000;

	process.on("SIGINT", () => {
		stopping = true;
		interrupted = true;
		console.log("Stopping scheduling; waiting for in-flight requests...");
	});

	function recordLatency(milliseconds: number): void {
		latencyCount += 1;
		if (latencySamples.length < MAX_LATENCY_SAMPLES) {
			latencySamples.push(milliseconds);
			return;
		}

		const replacementIndex = Math.floor(Math.random() * latencyCount);
		if (replacementIndex < MAX_LATENCY_SAMPLES) latencySamples[replacementIndex] = milliseconds;
	}

	async function waitForRequestSlot(): Promise<boolean> {
		if (stopping) return false;

		const now = performance.now();
		if (config.requestsPerSecond === 0) return now < deadline;

		const scheduledAt = Math.max(now, nextStartTime);
		nextStartTime = scheduledAt + 1_000 / config.requestsPerSecond;
		if (scheduledAt >= deadline) return false;

		while (!stopping) {
			const delay = scheduledAt - performance.now();
			if (delay <= 0) return true;
			await Bun.sleep(Math.min(delay, 250));
		}
		return false;
	}

	async function worker(): Promise<void> {
		while (await waitForRequestSlot()) {
			const requestStartedAt = performance.now();
			inFlight += 1;

			try {
				const response = await fetch(config.url, {
					method: "GET",
					headers: { "User-Agent": "SlideSage-load-test/1.0" },
					redirect: "manual",
					signal: AbortSignal.timeout(config.timeoutSeconds * 1_000),
				});
				const body = await response.arrayBuffer();
				responseBytes += body.byteLength;
				statuses.set(response.status, (statuses.get(response.status) ?? 0) + 1);
				if (response.status !== config.expectedStatus) unexpectedStatuses += 1;
			} catch (error) {
				transportErrors += 1;
				const name = error instanceof Error ? error.name : "UnknownError";
				errors.set(name, (errors.get(name) ?? 0) + 1);
			} finally {
				completed += 1;
				inFlight -= 1;
				recordLatency(performance.now() - requestStartedAt);
			}
		}
	}

	const progress = setInterval(() => {
		const elapsedSeconds = Math.max((performance.now() - startedAt) / 1_000, 0.001);
		console.log(
			`Progress: ${completed} requests, ${(completed / elapsedSeconds).toFixed(1)} req/s, ${inFlight} in flight`,
		);
	}, 5_000);

	await Promise.all(Array.from({ length: config.concurrency }, () => worker()));
	clearInterval(progress);

	const actualElapsedSeconds = Math.max((performance.now() - startedAt) / 1_000, 0.001);
	const elapsedSeconds = interrupted
		? actualElapsedSeconds
		: Math.max(actualElapsedSeconds, config.durationSeconds);
	const failed = unexpectedStatuses + transportErrors;
	const errorRate = completed === 0 ? 1 : failed / completed;
	const sortedLatencies = latencySamples.toSorted((left, right) => left - right);
	const p50 = percentile(sortedLatencies, 0.5);
	const p95 = percentile(sortedLatencies, 0.95);
	const p99 = percentile(sortedLatencies, 0.99);

	console.log("\nLoad test results");
	console.log(`  Requests:        ${completed}`);
	console.log(`  Throughput:      ${(completed / elapsedSeconds).toFixed(1)} req/s`);
	console.log(`  Failed:          ${failed} (${formatRate(errorRate)})`);
	console.log(`  Response bytes:  ${responseBytes}`);
	console.log(`  Latency p50:     ${p50.toFixed(1)}ms`);
	console.log(`  Latency p95:     ${p95.toFixed(1)}ms`);
	console.log(`  Latency p99:     ${p99.toFixed(1)}ms`);
	console.log(`  Latency samples: ${latencySamples.length}/${latencyCount}`);

	for (const [status, count] of [...statuses].sort(([left], [right]) => left - right)) {
		console.log(`  HTTP ${status}:        ${count}`);
	}
	for (const [name, count] of [...errors].sort(([left], [right]) => left.localeCompare(right))) {
		console.log(`  ${name}: ${count}`);
	}

	const failedThresholds: string[] = [];
	if (errorRate > config.maxErrorRate) {
		failedThresholds.push(
			`error rate ${formatRate(errorRate)} exceeded ${formatRate(config.maxErrorRate)}`,
		);
	}
	if (config.maxP95Milliseconds !== null && p95 > config.maxP95Milliseconds) {
		failedThresholds.push(
			`p95 ${p95.toFixed(1)}ms exceeded ${config.maxP95Milliseconds.toFixed(1)}ms`,
		);
	}

	if (failedThresholds.length > 0) {
		console.error(`Threshold failure: ${failedThresholds.join(", ")}`);
		process.exitCode = 1;
	} else {
		console.log("Thresholds passed.");
	}
}

await main();
