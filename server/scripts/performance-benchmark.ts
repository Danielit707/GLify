import { readFile, writeFile } from "node:fs/promises";
import { performance } from "node:perf_hooks";
import {
  rankPersonalizedWorks,
  type CommunityInteraction,
  type RecommendationWork,
  type ShipInteraction,
  type WorkInteraction,
} from "../src/recommendations/scoring.js";

type Mode = "engine" | "api" | "both";

interface Options {
  mode: Mode;
  baseUrl: string;
  requests: number;
  concurrency: number;
  engineRuns: number;
  maxSyntheticUsers: number;
  tokensFile?: string;
  allowRemote: boolean;
  allowProduction: boolean;
  output?: string;
  compare?: string;
}

interface ApiToken {
  token: string;
  subject?: string;
}

const MAX_LOCAL_REQUESTS = 500;
const MAX_REMOTE_REQUESTS = 100;
const MAX_REMOTE_CONCURRENCY = 5;
const MAX_PRODUCTION_REQUESTS = 30;
const MAX_PRODUCTION_CONCURRENCY = 2;
const PRODUCTION_HOSTS = new Set(["glify.onrender.com"]);

function parseInteger(name: string, value: string | undefined, fallback: number): number {
  if (value === undefined) return fallback;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1) {
    throw new Error(`${name} must be a positive integer.`);
  }
  return parsed;
}

function parseOptions(args: string[]): Options {
  const values = new Map<string, string>();
  const flags = new Set<string>();
  for (let index = 0; index < args.length; index++) {
    const arg = args[index];
    if (!arg?.startsWith("--")) throw new Error(`Unexpected argument: ${arg ?? ""}`);
    if (["--allow-remote", "--allow-production"].includes(arg)) {
      flags.add(arg);
      continue;
    }
    const value = args[index + 1];
    if (!value || value.startsWith("--")) throw new Error(`${arg} requires a value.`);
    values.set(arg, value);
    index++;
  }

  const modeValue = values.get("--mode") ?? "engine";
  if (modeValue !== "engine" && modeValue !== "api" && modeValue !== "both") {
    throw new Error("--mode must be engine, api, or both.");
  }
  const options: Options = {
    mode: modeValue,
    baseUrl: values.get("--base-url") ?? "http://127.0.0.1:3001",
    requests: parseInteger("--requests", values.get("--requests"), 40),
    concurrency: parseInteger("--concurrency", values.get("--concurrency"), 4),
    engineRuns: parseInteger("--engine-runs", values.get("--engine-runs"), 10),
    maxSyntheticUsers: parseInteger("--users", values.get("--users"), 5000),
    allowRemote: flags.has("--allow-remote"),
    allowProduction: flags.has("--allow-production"),
    tokensFile: values.get("--tokens-file"),
    output: values.get("--output"),
    compare: values.get("--compare"),
  };
  validateTarget(options);
  if ((options.mode === "api" || options.mode === "both") && !options.tokensFile) {
    throw new Error("API benchmarking requires --tokens-file with valid Clerk bearer tokens.");
  }
  return options;
}

function validateTarget(options: Options): void {
  const target = new URL(options.baseUrl);
  if (target.protocol !== "http:" && target.protocol !== "https:") {
    throw new Error("--base-url must use http or https.");
  }
  const isLoopback = ["localhost", "127.0.0.1", "::1"].includes(target.hostname);
  const isProduction = PRODUCTION_HOSTS.has(target.hostname);

  if (!isLoopback && !options.allowRemote) {
    throw new Error("Remote targets are disabled by default; pass --allow-remote for a staging server.");
  }
  if (isProduction && !options.allowProduction) {
    throw new Error("Production load tests are disabled by default; use staging instead.");
  }
  if (options.allowProduction && !isProduction) {
    throw new Error("--allow-production is only valid for the configured production API host.");
  }

  const requestLimit = isProduction
    ? MAX_PRODUCTION_REQUESTS
    : isLoopback ? MAX_LOCAL_REQUESTS : MAX_REMOTE_REQUESTS;
  const concurrencyLimit = isProduction
    ? MAX_PRODUCTION_CONCURRENCY
    : isLoopback ? MAX_LOCAL_REQUESTS : MAX_REMOTE_CONCURRENCY;
  if (options.requests > requestLimit || options.concurrency > concurrencyLimit) {
    throw new Error(
      `Target limits are ${requestLimit} requests and concurrency ${concurrencyLimit}.`,
    );
  }
}

function randomGenerator(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function createSyntheticData(userCount: number) {
  const random = randomGenerator(20261106);
  const tagPool = [
    "Yuri", "Shoujo Ai", "Romance", "School Life", "Drama",
    "Comedy", "Fantasy", "Slow Burn", "Music", "Slice of Life",
  ];
  const works: RecommendationWork[] = Array.from({ length: 200 }, (_, index) => ({
    id: `synthetic-work-${index}`,
    title: `Synthetic work ${index}`,
    format: ["Manga", "Anime", "Webtoon", "Light novel"][index % 4] ?? "Manga",
    tags: [
      "Yuri",
      tagPool[Math.floor(random() * tagPool.length)] ?? "Romance",
      tagPool[Math.floor(random() * tagPool.length)] ?? "Drama",
      tagPool[Math.floor(random() * tagPool.length)] ?? "Comedy",
    ],
  }));
  const interactions: WorkInteraction[] = [];
  const communities: CommunityInteraction[] = [];
  const ships: ShipInteraction[] = [];

  for (let userIndex = 0; userIndex < userCount; userIndex++) {
    const userId = `synthetic-user-${userIndex}`;
    const selected = new Set<number>();
    while (selected.size < 12) selected.add(Math.floor(random() * works.length));
    for (const workIndex of selected) {
      interactions.push({
        userId,
        workId: works[workIndex]?.id ?? "",
        kind: random() < 0.35 ? "favorite" : "watched",
      });
    }
    for (let index = 0; index < 3; index++) {
      communities.push({
        userId,
        communityId: `community-${Math.floor(random() * 40)}`,
      });
    }
    for (let index = 0; index < 2; index++) {
      ships.push({
        userId,
        shipId: `ship-${Math.floor(random() * 60)}`,
      });
    }
  }
  return { works, interactions, communities, ships };
}

function percentile(sortedValues: number[], value: number): number {
  const index = Math.max(0, Math.ceil((value / 100) * sortedValues.length) - 1);
  return sortedValues[index] ?? 0;
}

function summarizeTimings(samples: number[]) {
  const sorted = [...samples].sort((a, b) => a - b);
  const total = samples.reduce((sum, sample) => sum + sample, 0);
  return {
    samples: samples.length,
    meanMs: Number((total / samples.length).toFixed(2)),
    p50Ms: Number(percentile(sorted, 50).toFixed(2)),
    p95Ms: Number(percentile(sorted, 95).toFixed(2)),
    maxMs: Number(Math.max(...samples).toFixed(2)),
  };
}

function runEngineBenchmark(options: Options) {
  const sizes = [...new Set([100, 500, 1000, options.maxSyntheticUsers])].sort((a, b) => a - b);
  const results = [];

  for (const userCount of sizes) {
    const data = createSyntheticData(userCount);
    const runTimes: number[] = [];
    const requestCount = options.engineRuns;
    const started = performance.now();
    let recommendationCount = 0;

    for (let run = 0; run < requestCount; run++) {
      const userId = `synthetic-user-${run % userCount}`;
      const requestStart = performance.now();
      const result = rankPersonalizedWorks(
        userId,
        data.works,
        data.interactions,
        10,
        data.communities,
        data.ships,
      );
      runTimes.push(performance.now() - requestStart);
      recommendationCount += result.recommendations.length;
    }

    const elapsedMs = performance.now() - started;
    const heapUsedBytes = process.memoryUsage().heapUsed;
    results.push({
      users: userCount,
      works: data.works.length,
      workInteractions: data.interactions.length,
      communityInteractions: data.communities.length,
      shipInteractions: data.ships.length,
      elapsedMs: Number(elapsedMs.toFixed(2)),
      requestsPerSecond: Number((requestCount / (elapsedMs / 1000)).toFixed(2)),
      requestLatency: summarizeTimings(runTimes),
      heapUsedMB: Number((heapUsedBytes / 1024 / 1024).toFixed(2)),
      recommendationsProduced: recommendationCount,
    });
  }
  return { type: "synthetic-matching-engine", note: "CPU-only; excludes Postgres, Neo4j, Redis and network time.", results };
}

function decodeSubject(token: string): string | undefined {
  try {
    const payload = token.split(".")[1];
    if (!payload) return undefined;
    const claims: unknown = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    if (typeof claims !== "object" || claims === null || !("sub" in claims)) return undefined;
    return typeof claims.sub === "string" ? claims.sub : undefined;
  } catch {
    return undefined;
  }
}

async function loadTokens(path: string): Promise<ApiToken[]> {
  const content = await readFile(path, "utf8");
  const data: unknown = JSON.parse(content);
  if (!Array.isArray(data) || data.length === 0 || !data.every((token) => typeof token === "string")) {
    throw new Error("Token file must be a JSON array of Clerk bearer-token strings.");
  }
  return data.map((token) => ({ token, subject: decodeSubject(token) }));
}

async function runApiBenchmark(options: Options) {
  const tokens = await loadTokens(options.tokensFile ?? "");
  const distinctUsers = new Set(tokens.map((token) => token.subject).filter(Boolean)).size;
  const samples: Array<{ durationMs: number; status: number; responseBytes: number }> = [];
  const errors: Array<{ status?: number; message: string }> = [];
  let nextRequest = 0;
  const started = performance.now();
  const workers = Array.from({ length: Math.min(options.concurrency, options.requests) }, async (_, workerIndex) => {
    while (true) {
      const requestIndex = nextRequest++;
      if (requestIndex >= options.requests) return;
      const token = tokens[requestIndex % tokens.length];
      const requestStart = performance.now();
      try {
        const response = await fetch(
          `${options.baseUrl.replace(/\/$/, "")}/api/recommendations?limit=8`,
          {
            headers: { Authorization: `Bearer ${token?.token ?? ""}` },
            signal: AbortSignal.timeout(15_000),
          },
        );
        const responseBody = await response.arrayBuffer();
        const sample = {
          durationMs: performance.now() - requestStart,
          status: response.status,
          responseBytes: responseBody.byteLength,
        };
        samples.push(sample);
        if (!response.ok) {
          errors.push({
            status: response.status,
            message: `Worker ${workerIndex} received HTTP ${response.status}.`,
          });
        }
      } catch (error) {
        errors.push({
          message: error instanceof Error ? error.message : "Request failed.",
        });
      }
    }
  });
  await Promise.all(workers);
  const elapsedMs = performance.now() - started;
  const successful = samples.filter((sample) => sample.status >= 200 && sample.status < 300);
  const report = {
    type: "authenticated-api-load",
    target: new URL(options.baseUrl).origin,
    endpoint: "GET /api/recommendations?limit=8",
    requested: options.requests,
    concurrency: options.concurrency,
    tokenCount: tokens.length,
    distinctTokenSubjects: distinctUsers,
    elapsedMs: Number(elapsedMs.toFixed(2)),
    requestsPerSecond: Number((options.requests / (elapsedMs / 1000)).toFixed(2)),
    successful: successful.length,
    failed: options.requests - successful.length,
    responseBytesMean: successful.length
      ? Math.round(successful.reduce((total, sample) => total + sample.responseBytes, 0) / successful.length)
      : 0,
    latency: samples.length ? summarizeTimings(samples.map((sample) => sample.durationMs)) : null,
    statusCounts: Object.fromEntries(
      [...new Set(samples.map((sample) => sample.status))]
        .map((status) => [status, samples.filter((sample) => sample.status === status).length]),
    ),
    errors: errors.slice(0, 10),
    note: distinctUsers > 1
      ? "Requests used tokens for multiple distinct accounts."
      : "Only one distinct account was detected; increase tokens to simulate multiple users.",
  };
  return report;
}

function change(before: number | undefined, after: number | undefined) {
  if (before === undefined || after === undefined) return undefined;
  return {
    before,
    after,
    changePercent: before === 0
      ? null
      : Number((((after - before) / before) * 100).toFixed(1)),
  };
}

function compareReports(before: unknown, after: Record<string, unknown>) {
  if (typeof before !== "object" || before === null || Array.isArray(before)) {
    throw new Error("Baseline JSON must contain a benchmark report object.");
  }
  const beforeReport = before as Record<string, unknown>;
  const comparison: Record<string, unknown> = {};

  const getEngineResults = (report: Record<string, unknown>) => {
    const engine = report["engine"];
    if (typeof engine !== "object" || engine === null || !("results" in engine) || !Array.isArray(engine.results)) {
      return [];
    }
    return engine.results.filter(
      (row): row is Record<string, unknown> => typeof row === "object" && row !== null,
    );
  };
  const oldEngineResults = getEngineResults(beforeReport);
  const newEngineResults = getEngineResults(after);
  if (oldEngineResults.length > 0 && newEngineResults.length > 0) {
    comparison["engine"] = newEngineResults.flatMap((current) => {
      const old = oldEngineResults.find((row) => row["users"] === current["users"]);
      if (!old) return [];
      const oldLatency = old["requestLatency"];
      const newLatency = current["requestLatency"];
      const oldRps = old["requestsPerSecond"];
      const newRps = current["requestsPerSecond"];
      if (
        typeof oldLatency !== "object" || oldLatency === null ||
        typeof newLatency !== "object" || newLatency === null
      ) return [];
      const oldMetrics = oldLatency as Record<string, unknown>;
      const newMetrics = newLatency as Record<string, unknown>;
      return [{
        users: current["users"],
        p50Ms: change(
          typeof oldMetrics["p50Ms"] === "number" ? oldMetrics["p50Ms"] : undefined,
          typeof newMetrics["p50Ms"] === "number" ? newMetrics["p50Ms"] : undefined,
        ),
        p95Ms: change(
          typeof oldMetrics["p95Ms"] === "number" ? oldMetrics["p95Ms"] : undefined,
          typeof newMetrics["p95Ms"] === "number" ? newMetrics["p95Ms"] : undefined,
        ),
        requestsPerSecond: change(
          typeof oldRps === "number" ? oldRps : undefined,
          typeof newRps === "number" ? newRps : undefined,
        ),
      }];
    });
  }

  const oldApi = beforeReport["api"];
  const newApi = after["api"];
  if (
    typeof oldApi === "object" && oldApi !== null &&
    typeof newApi === "object" && newApi !== null
  ) {
    const oldApiRecord = oldApi as Record<string, unknown>;
    const newApiRecord = newApi as Record<string, unknown>;
    const oldLatency = oldApiRecord["latency"];
    const newLatency = newApiRecord["latency"];
    if (
      typeof oldLatency === "object" && oldLatency !== null &&
      typeof newLatency === "object" && newLatency !== null
    ) {
      const oldMetrics = oldLatency as Record<string, unknown>;
      const newMetrics = newLatency as Record<string, unknown>;
      comparison["api"] = {
        p50Ms: change(
          typeof oldMetrics["p50Ms"] === "number" ? oldMetrics["p50Ms"] : undefined,
          typeof newMetrics["p50Ms"] === "number" ? newMetrics["p50Ms"] : undefined,
        ),
        p95Ms: change(
          typeof oldMetrics["p95Ms"] === "number" ? oldMetrics["p95Ms"] : undefined,
          typeof newMetrics["p95Ms"] === "number" ? newMetrics["p95Ms"] : undefined,
        ),
        requestsPerSecond: change(
          typeof oldApiRecord["requestsPerSecond"] === "number"
            ? oldApiRecord["requestsPerSecond"] : undefined,
          typeof newApiRecord["requestsPerSecond"] === "number"
            ? newApiRecord["requestsPerSecond"] : undefined,
        ),
      };
    }
  }
  if (Object.keys(comparison).length === 0) {
    throw new Error("Baseline report has no benchmark mode in common with this run.");
  }
  return comparison;
}

async function main(): Promise<void> {
  const options = parseOptions(process.argv.slice(2));
  const report = {
    generatedAt: new Date().toISOString(),
    mode: options.mode,
    ...(options.mode === "engine" || options.mode === "both"
      ? { engine: runEngineBenchmark(options) }
      : {}),
    ...(options.mode === "api" || options.mode === "both"
      ? { api: await runApiBenchmark(options) }
      : {}),
  };
  if (options.compare) {
    const baseline = JSON.parse(await readFile(options.compare, "utf8")) as unknown;
    Object.assign(report, { comparison: compareReports(baseline, report) });
  }
  const output = JSON.stringify(report, null, 2);
  console.log(output);
  if (options.output) await writeFile(options.output, `${output}\n`, "utf8");
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Benchmark failed.");
  process.exitCode = 1;
});
