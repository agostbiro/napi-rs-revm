import { ArgumentParser } from "argparse";
import child_process from "child_process";
import { executeTest } from '../index.js'

const runs = 27;
const artifactPath = "contracts/Avg_Unit_Test.json";
const testName = "test_Avg_OneOperandEvenTheOtherOdd()";

interface ParsedArguments {
  command:
    | "execute-test"
    | "benchmark";
  count: number;
}

function runExecuteTest() {
  const elapsed = executeTest(artifactPath, testName);
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

function runExecuteTestInSubprocess() {
  const args = [
    "--noconcurrent_sweeping",
    "--noconcurrent_recompilation",
    "--max-old-space-size=28000",
    "--import",
    "tsx",
    "benchmark/bench.ts",
    "execute-test",
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
  const nodeTimes = [];
  for (let i = 0; i < runs; i++) {
    const elapsed = runExecuteTestInSubprocess();
    nodeTimes.push(elapsed);
  }

  console.log("=== Node Stats ===")
  const nodeStats = calculateStatistics(nodeTimes);
  reportStatistics(nodeStats);

  const rustTimes = []
  for (let i = 0; i < runs; i++) {
    const elapsed = runCargoInSubProcess();
    rustTimes.push(elapsed);
  }

  console.log("=== Rust Stats ===")
  const rustStats = calculateStatistics(rustTimes);
  reportStatistics(rustStats);

  console.log("=== Comparison ===")
  console.log("Node/Rust median:", Math.round(10000 * nodeStats.median / rustStats.median) / 100, "%")
}

const parser = new ArgumentParser({
  description: "Benchmark runner",
});
parser.add_argument("command", {
  choices: [
    "execute-test",
    "benchmark"
  ],
});
parser.add_argument("-c", "--count", {
  type: "int",
  default: 27,
  help: "Number of samples",
});

const args: ParsedArguments = parser.parse_args();

if (args.command === "execute-test") {
  runExecuteTest()
} else if (args.command === "benchmark") {
  runBenchmark(args.count)
} else {
  throw new Error(`Unknown command: ${args.command}`)
}
