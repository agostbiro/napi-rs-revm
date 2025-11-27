import { ArgumentParser } from "argparse";
import child_process from "child_process";
import { executeTestSync, executeTestAsync } from '../index.js'

const runs = 27;
const artifactPath = "contracts/Avg_Unit_Test.json";
const testName = "test_Avg_OneOperandEvenTheOtherOdd()";

interface ParsedArguments {
  command:
    | "execute-test-sync"
    | "execute-test-async"
    | "benchmark";
  count: number;
}

async function runExecuteTestAsync() {
  const elapsed = await executeTestAsync(artifactPath, testName);
  console.log(elapsed);
}

function runExecuteTestSync() {
  const elapsed = executeTestSync(artifactPath, testName);
  console.log(elapsed);
}

function runInSubprocess(command: string, args: string[]) {
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

  if (result.endsWith("n")) {
    result = result.slice(0, result.length - 1);
  }

  return Number(result);
}

function runExecuteTestSyncInSubprocess() {
  const args = [
    "--noconcurrent_sweeping",
    "--noconcurrent_recompilation",
    "--max-old-space-size=28000",
    "--import",
    "tsx",
    "benchmark/bench.ts",
    "execute-test-sync",
  ];

  return runInSubprocess(process.argv[0], args);
}

function runExecuteTestAsyncInSubprocess() {
  const args = [
    "--noconcurrent_sweeping",
    "--noconcurrent_recompilation",
    "--max-old-space-size=28000",
    "--import",
    "tsx",
    "benchmark/bench.ts",
    "execute-test-async",
  ];

  return runInSubprocess(process.argv[0], args);
}

function runCargoInSubProcess() {
  const args = [
    "run", "--quiet", "--bin", "execute_test", "--release"
  ];

  return runInSubprocess("cargo", args);
}

function calculateStatistics(times: number[]) {
  // Calculate statistics
  const sum = times.reduce((a, b) => a + b, 0);
  const mean = sum / runs;
  const sorted = times.sort((a, b) => a - b);
  const median = runs % 2 === 0
    ? (sorted[runs / 2 - 1] + sorted[runs / 2]) / 2
    : sorted[Math.floor(runs / 2)];
  const min = sorted[0];
  const max = sorted[sorted.length - 1];

  // Calculate standard deviation
  const variance = times.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / runs;
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

function reportStatistics(stats: { runs: number; mean: number; median: number; min: number; max: number; stdDev: number }) {
  const { runs, mean, median, min, max, stdDev } = stats

  console.log(`Runs:      ${runs}`)
  console.log(`Mean:      ${(mean / 1_000_000).toFixed(3)} ms (${mean.toFixed(0)} ns)`)
  console.log(`Median:    ${(median / 1_000_000).toFixed(3)} ms (${median.toFixed(0)} ns)`)
  console.log(`Min:       ${(min / 1_000_000).toFixed(3)} ms (${min.toFixed(0)} ns)`)
  console.log(`Max:       ${(max / 1_000_000).toFixed(3)} ms (${max.toFixed(0)} ns)`)
  console.log(`Std Dev:   ${(stdDev / 1_000_000).toFixed(3)} ms (${stdDev.toFixed(0)} ns)`)
}

function runBenchmark(runs: number) {
  const nodeSyncTimes = [];
  for (let i = 0; i < runs; i++) {
    const elapsed = runExecuteTestSyncInSubprocess();
    nodeSyncTimes.push(elapsed);
  }

  console.log("=== Node Sync Stats ===")
  const nodeSyncStats = calculateStatistics(nodeSyncTimes);
  reportStatistics(nodeSyncStats);

  const nodeAsyncTimes = [];
  for (let i = 0; i < runs; i++) {
    const elapsed = runExecuteTestAsyncInSubprocess();
    nodeAsyncTimes.push(elapsed);
  }

  console.log("=== Node Async Stats ===")
  const nodeAsyncStats = calculateStatistics(nodeAsyncTimes);
  reportStatistics(nodeAsyncStats);

  const rustTimes = []
  for (let i = 0; i < runs; i++) {
    const elapsed = runCargoInSubProcess();
    rustTimes.push(elapsed);
  }

  console.log("=== Rust Stats ===")
  const rustStats = calculateStatistics(rustTimes);
  reportStatistics(rustStats);

  console.log("=== Comparison ===")
  console.log("Node Sync/Rust median:", Math.round(10000 * nodeSyncStats.median / rustStats.median) / 100, "%")
  console.log("Node Async/Rust median:", Math.round(10000 * nodeAsyncStats.median / rustStats.median) / 100, "%")
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

  const args: ParsedArguments = parser.parse_args();

  if (args.command === "execute-test-sync") {
    runExecuteTestSync()
  } else if (args.command === "execute-test-async") {
      await runExecuteTestAsync()
  } else if (args.command === "benchmark") {
    runBenchmark(args.count)
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
