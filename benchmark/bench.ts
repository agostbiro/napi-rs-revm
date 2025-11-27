import { ArgumentParser } from "argparse";
import child_process from "child_process";
import { executeTestSync, executeTestAsync, TestResult } from '../index.js'

const runs = 27;
const artifactPath = "contracts/Avg_Unit_Test.json";
const testName = "test_Avg_OneOperandEvenTheOtherOdd()";

async function runExecuteTestAsync(cacheHitRatio: boolean) {
  const result = await executeTestAsync(artifactPath, testName, cacheHitRatio);
  console.log(JSON.stringify(result));
}

function runExecuteTestSync(cacheHitRatio: boolean) {
  const result = executeTestSync(artifactPath, testName, cacheHitRatio);
  console.log(JSON.stringify(result));
}

function runInSubprocess(command: string, args: string[]): TestResult {
  const processResult = child_process.spawnSync(command, args, {
    shell: true,
    timeout: 60 * 60 * 1000, // 1 hour timeout
    stdio: [process.stdin, "pipe", process.stderr],
    encoding: "utf-8",
    maxBuffer: 100 * 1024 * 1024,
  });

  if (processResult.error !== undefined) {
    throw new Error(`Failed to run execute-test: ${processResult.error.message}`);
  }

  if (processResult.status !== 0) {
    throw new Error(`execute-test failed with exit code ${processResult.status}`);
  }

  let result = processResult.stdout.trim();

  return JSON.parse(result);
}

interface TestOptions {
  cacheHitRatio: boolean;
  async: boolean
}

function runNodeTest(options: TestOptions) {
  const args = [
    "--noconcurrent_sweeping",
    "--noconcurrent_recompilation",
    "--max-old-space-size=28000",
    "--import",
    "tsx",
    "benchmark/bench.ts",
  ];

  if (options.async) {
    args.push("execute-test-async");
  } else {
    args.push("execute-test-sync");
  }

  if (options.cacheHitRatio) {
    args.push("--cache-hit-ratio")
  }

  return runInSubprocess(process.argv[0], args);
}

function runCargoInSubProcess(options: TestOptions) {
  const args = [
    "run", "--quiet", "--bin", "execute_test", "--release", "--"
  ];

  if (options.cacheHitRatio) {
    args.push("--cache-hit-ratio")
  }

  if (options.async) {
    args.push("execute-test-async");
  } else {
    args.push("execute-test-sync");
  }

  return runInSubprocess("cargo", args);
}

function calculateStatistics(values: number[]) {
  // Calculate statistics
  const sum = values.reduce((a, b) => a + b, 0);
  const mean = sum / runs;
  const sorted = values.sort((a, b) => a - b);
  const median = runs % 2 === 0
    ? (sorted[runs / 2 - 1] + sorted[runs / 2]) / 2
    : sorted[Math.floor(runs / 2)];
  const min = sorted[0];
  const max = sorted[sorted.length - 1];

  // Calculate standard deviation
  const variance = values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / runs;
  const stdDev = Math.sqrt(variance);

  return {
    runs,
    mean,
    median,
    min,
    max,
    stdDev
  }
}

function reportExecutionTimeStatistics(stats: { runs: number; mean: number; median: number; min: number; max: number; stdDev: number }) {
  const { runs, mean, median, min, max, stdDev } = stats

  console.log(`Runs:      ${runs}`)
  console.log(`Mean:      ${(mean / 1_000_000).toFixed(3)} ms (${mean.toFixed(0)} ns)`)
  console.log(`Median:    ${(median / 1_000_000).toFixed(3)} ms (${median.toFixed(0)} ns)`)
  console.log(`Min:       ${(min / 1_000_000).toFixed(3)} ms (${min.toFixed(0)} ns)`)
  console.log(`Max:       ${(max / 1_000_000).toFixed(3)} ms (${max.toFixed(0)} ns)`)
  console.log(`Std Dev:   ${(stdDev / 1_000_000).toFixed(3)} ms (${stdDev.toFixed(0)} ns)`)
}

function reportCacheHitRatioStatistics(stats: { runs: number; mean: number; median: number; min: number; max: number; stdDev: number }) {
  const { runs, mean, median, min, max, stdDev } = stats

  console.log(`Runs:      ${runs}`)
  console.log(`Mean:      ${(mean).toFixed(4)}`)
  console.log(`Median:    ${(median).toFixed(4)}`)
  console.log(`Min:       ${(min).toFixed(4)}`)
  console.log(`Max:       ${(max).toFixed(4)}`)
  console.log(`Std Dev:   ${(stdDev).toFixed(4)}`)
}

function executeTimes(count: number, options: TestOptions, func: (options: TestOptions) => TestResult): number[] {
  const values = [];
  for (let i = 0; i < count; i++) {
    const testResult = func(options);
    if (options.cacheHitRatio) {
      values.push(testResult.cacheHitRatio);
    } else {
      values.push(testResult.durationNs);
    }
  }
  return values
}

function runBenchmark(runs: number, cacheHitRatio: boolean) {
  const nodeSyncTimes = executeTimes(runs, {cacheHitRatio: false, async: false}, runNodeTest)

  console.log("=== Node Sync Duration Stats ===")
  const nodeSyncStats = calculateStatistics(nodeSyncTimes);
  reportExecutionTimeStatistics(nodeSyncStats);

  const nodeAsyncTimes = executeTimes(runs, {cacheHitRatio: false, async: true}, runNodeTest)

  console.log("=== Node Async Duration Stats ===")
  const nodeAsyncStats = calculateStatistics(nodeAsyncTimes);
  reportExecutionTimeStatistics(nodeAsyncStats);

  const rustSyncTimes = executeTimes(runs, {cacheHitRatio: false, async: false}, runCargoInSubProcess)

  console.log("=== Rust Sync Duration Stats ===")
  const rustSyncStats = calculateStatistics(rustSyncTimes);
  reportExecutionTimeStatistics(rustSyncStats);

  const rustAsyncTimes = executeTimes(runs, {cacheHitRatio: false, async: true}, runCargoInSubProcess)

  console.log("=== Rust Async Duration Stats ===")
  const rustAsyncStats = calculateStatistics(rustAsyncTimes);
  reportExecutionTimeStatistics(rustAsyncStats);

  console.log("=== Duration Comparison ===")
  console.log("Node Sync/Rust Sync median:", Math.round(10000 * nodeSyncStats.median / rustSyncStats.median) / 100, "%")
  console.log("Node Async/Rust Sync median:", Math.round(10000 * nodeAsyncStats.median / rustSyncStats.median) / 100, "%")
  console.log("Rust Async/Rust Sync median:", Math.round(10000 * rustAsyncStats.median / rustSyncStats.median) / 100, "%")

  if (cacheHitRatio) {
    runCacheHitRatioBenchmark(runs)
  }
}

function runCacheHitRatioBenchmark(runs: number) {
  const nodeSyncTimes = executeTimes(runs, {cacheHitRatio: true, async: false}, runNodeTest)

  console.log("=== Node Sync Cache Hit Ratio Stats ===")
  const nodeSyncStats = calculateStatistics(nodeSyncTimes);
  reportCacheHitRatioStatistics(nodeSyncStats);

  const nodeAsyncTimes = executeTimes(runs, {cacheHitRatio: true, async: true}, runNodeTest)

  console.log("=== Node Async Cache Hit Ratio Stats ===")
  const nodeAsyncStats = calculateStatistics(nodeAsyncTimes);
  reportCacheHitRatioStatistics(nodeAsyncStats);

  const rustSyncTimes = executeTimes(runs, {cacheHitRatio: true, async: false}, runCargoInSubProcess)

  console.log("=== Rust Sync Cache Hit Ratio Stats ===")
  const rustSyncStats = calculateStatistics(rustSyncTimes);
  reportCacheHitRatioStatistics(rustSyncStats);

  const rustAsyncTimes = executeTimes(runs, {cacheHitRatio: true, async: true}, runCargoInSubProcess)

  console.log("=== Rust Async Cache Hit Ratio Stats ===")
  const rustAsyncStats = calculateStatistics(rustAsyncTimes);
  reportCacheHitRatioStatistics(rustAsyncStats);

  console.log("=== Cache Hit Ratio Comparison ===")
  console.log("Node Sync/Rust Sync median:", Math.round(10000 * nodeSyncStats.median / rustSyncStats.median) / 100, "%")
  console.log("Node Async/Rust Sync median:", Math.round(10000 * nodeAsyncStats.median / rustSyncStats.median) / 100, "%")
  console.log("Rust Async/Rust Sync median:", Math.round(10000 * rustAsyncStats.median / rustSyncStats.median) / 100, "%")
}

interface ParsedArguments {
  command:
    | "execute-test-sync"
    | "execute-test-async"
    | "benchmark";
  count: number;
  cache_hit_ratio: boolean;
}

async function main() {
  const parser = new ArgumentParser({
    description: "Benchmark runner",
  });
  parser.add_argument("command", {
    choices: [
      "execute-test-sync",
      "execute-test-async",
      "benchmark"
    ],
  });
  parser.add_argument("-c", "--count", {
    type: "int",
    default: 27,
    help: "Number of samples",
  });
  parser.add_argument("--cache-hit-ratio", {
    action: "store_true",
    help: "Whether to report cache hit ratio",
  });

  const args: ParsedArguments = parser.parse_args();

  if (args.command === "execute-test-sync") {
    runExecuteTestSync(args.cache_hit_ratio)
  } else if (args.command === "execute-test-async") {
    await runExecuteTestAsync(args.cache_hit_ratio)
  } else if (args.command === "benchmark") {
    runBenchmark(args.count, args.cache_hit_ratio)
  } else {
    throw new Error(`Unknown command: ${args.command}`)
  }

  return true
}

async function flushStdout() {
  return new Promise((resolve) => {
    process.stdout.write("", resolve);
  });
}

main()
  .then(async (success) => {
    await flushStdout();
    process.exit(success ? 0 : 1);
  })
  .catch(async (error) => {
    console.error(error);
    await flushStdout();
    process.exit(1);
  });
