import { ArgumentParser } from "argparse";
import child_process from "child_process";
import { executeTestSync, executeTestAsync, TestResult, PerfReportConfig } from '../index.js'
import { stringify } from 'csv-stringify/sync'
import fs from 'fs'

const artifactPath = "contracts/Avg_Unit_Test.json";
const testName = "test_Avg_OneOperandEvenTheOtherOdd()";

async function runExecuteTestAsync(perfReportConfig?: PerfReportConfig) {
  const result = await executeTestAsync(artifactPath, testName, perfReportConfig);
  console.log(JSON.stringify(result));
}

function runExecuteTestSync(perfReportConfig?: PerfReportConfig) {
  const result = executeTestSync(artifactPath, testName, perfReportConfig);
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
  perfReportConfig?: PerfReportConfig;
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

  if (options.perfReportConfig) {
    if (options.perfReportConfig.instructions) args.push("--instructions");
    if (options.perfReportConfig.instructionsPerCycle) args.push("--instructions-per-cycle");
    if (options.perfReportConfig.lastLevelCacheHitRate) args.push("--last-level-cache-hit-rate");
    if (options.perfReportConfig.l1DataCacheHitRate) args.push("--l1-data-cache-hit-rate");
    if (options.perfReportConfig.l1InstructionCacheMisses) args.push("--l1-instruction-cache-misses");
    if (options.perfReportConfig.branchMissRatio) args.push("--branch-miss-ratio");
    if (options.perfReportConfig.cpuMigrations) args.push("--cpu-migrations");
  }

  return runInSubprocess(process.argv[0], args);
}

function runCargoInSubProcess(options: TestOptions) {
  const args = [
    "run", "--quiet", "--bin", "execute_test", "--release", "--"
  ];

  if (options.perfReportConfig) {
    if (options.perfReportConfig.instructions) args.push("--instructions");
    if (options.perfReportConfig.instructionsPerCycle) args.push("--instructions-per-cycle");
    if (options.perfReportConfig.lastLevelCacheHitRate) args.push("--last-level-cache-hit-rate");
    if (options.perfReportConfig.l1DataCacheHitRate) args.push("--l1-data-cache-hit-rate");
    if (options.perfReportConfig.l1InstructionCacheMisses) args.push("--l1-instruction-cache-misses");
    if (options.perfReportConfig.branchMissRatio) args.push("--branch-miss-ratio");
    if (options.perfReportConfig.cpuMigrations) args.push("--cpu-migrations");
  }

  if (options.async) {
    args.push("execute-test-async");
  } else {
    args.push("execute-test-sync");
  }

  return runInSubprocess("cargo", args);
}

interface BenchmarkStats {
  runs: number;
  mean: number;
  median: number;
  min: number;
  max: number;
  stdDev: number;
}

interface BenchmarkResult {
  name: string;
  async: boolean;
  executor: string;
  stats: BenchmarkStats;
}

function calculateStatistics(values: number[]): BenchmarkStats {
  // Calculate statistics
  const count = values.length;
  const sum = values.reduce((a, b) => a + b, 0);
  const mean = sum / count;
  const sorted = values.sort((a, b) => a - b);
  const median = count % 2 === 0
    ? (sorted[count / 2 - 1] + sorted[count / 2]) / 2
    : sorted[Math.floor(count / 2)];
  const min = sorted[0];
  const max = sorted[sorted.length - 1];

  // Calculate standard deviation
  const variance = values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / count;
  const stdDev = Math.sqrt(variance);

  return {
    runs: count,
    mean,
    median,
    min,
    max,
    stdDev
  }
}

function executeTimes(count: number, options: TestOptions, func: (options: TestOptions) => TestResult): number[] {
  const values = [];
  for (let i = 0; i < count; i++) {
    const testResult = func(options);
    if (testResult.perfReport) {
      // Push the first non-undefined perf metric we find
      const perfReport = testResult.perfReport;
      if (perfReport.instructionsPerCycle !== undefined) {
        values.push(perfReport.instructionsPerCycle)
      } else if (perfReport.instructions !== undefined) {
        values.push(perfReport.instructions);
      } else if (perfReport.lastLevelCacheHitRate !== undefined) {
        values.push(perfReport.lastLevelCacheHitRate);
      } else if (perfReport.l1DataCacheHitRate !== undefined) {
        values.push(perfReport.l1DataCacheHitRate);
      } else if (perfReport.l1InstructionCacheMisses !== undefined) {
        values.push(perfReport.l1InstructionCacheMisses);
      } else if (perfReport.branchMissRatio !== undefined) {
        values.push(perfReport.branchMissRatio);
      } else if (perfReport.cpuMigrations !== undefined) {
        values.push(perfReport.cpuMigrations);
      } else {
        values.push(testResult.durationNs);
      }
    } else {
      values.push(testResult.durationNs);
    }
  }
  return values
}

function runBenchmark(runs: number) {
  const defaultConfig: PerfReportConfig = {
    instructions: false,
    instructionsPerCycle: false,
    lastLevelCacheHitRate: false,
    l1DataCacheHitRate: false,
    l1InstructionCacheMisses: false,
    branchMissRatio: false,
    cpuMigrations: false,
  };

  const configs: Array<{ name: string, config?: PerfReportConfig }> = [
    { name: "Duration", config: undefined },
    { name: "Instructions", config: { ...defaultConfig, instructions: true } },
    { name: "InstructionsPerCycle", config: { ...defaultConfig, instructionsPerCycle: true } },
    { name: "LastLevelCacheHitRate", config: { ...defaultConfig, lastLevelCacheHitRate: true } },
    { name: "L1DataCacheHitRate", config: { ...defaultConfig, l1DataCacheHitRate: true } },
    { name: "L1InstructionCacheMisses", config: { ...defaultConfig, l1InstructionCacheMisses: true } },
    { name: "BranchMissRatio", config: { ...defaultConfig, branchMissRatio: true } },
    { name: "CpuMigrations", config: { ...defaultConfig, cpuMigrations: true } },
  ];

  const results = [];

  for (const { name, config } of configs) {
    for (let async of [true, false]) {
      const nodeStats = calculateStatistics(executeTimes(runs, { perfReportConfig: config, async }, runNodeTest));
      results.push({
        name,
        async,
        executor: "node",
        stats: nodeStats
      })

      const rustStats = calculateStatistics(executeTimes(runs, { perfReportConfig: config, async }, runCargoInSubProcess));
      results.push({
        name,
        async,
        executor: "rust",
        stats: rustStats
      })
    }
  }

  return results
}

function saveBenchmarkResultsToCsv(results: BenchmarkResult[], outputPath: string) {
  const csvData = results.map(r => ({
    name: r.name,
    async: r.async ? 'true' : 'false',
    executor: r.executor,
    runs: r.stats.runs,
    mean: r.stats.mean,
    median: r.stats.median,
    min: r.stats.min,
    max: r.stats.max,
    stdDev: r.stats.stdDev,
  }))

  const csv = stringify(csvData, {
    header: true,
    columns: ['name', 'async', 'executor', 'runs', 'mean', 'median', 'min', 'max', 'stdDev']
  })

  fs.writeFileSync(outputPath, csv)
  console.log(`Benchmark results saved to ${outputPath}`)
}

interface ParsedArguments {
  command:
    | "execute-test-sync"
    | "execute-test-async"
    | "benchmark";
  count: number;
  instructions: boolean;
  instructions_per_cycle: boolean;
  last_level_cache_hit_rate: boolean;
  l1_data_cache_hit_rate: boolean;
  l1_instruction_cache_misses: boolean;
  branch_miss_ratio: boolean;
  cpu_migrations: boolean;
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
  parser.add_argument("--instructions", {
    action: "store_true",
    help: "Collect instructions",
  });
  parser.add_argument("--instructions-per-cycle", {
    action: "store_true",
    help: "Collect instructions per cycle",
  });
  parser.add_argument("--last-level-cache-hit-rate", {
    action: "store_true",
    help: "Collect last level cache hit rate",
  });
  parser.add_argument("--l1-data-cache-hit-rate", {
    action: "store_true",
    help: "Collect L1 data cache hit rate",
  });
  parser.add_argument("--l1-instruction-cache-misses", {
    action: "store_true",
    help: "Collect L1 instruction cache misses",
  });
  parser.add_argument("--branch-miss-ratio", {
    action: "store_true",
    help: "Collect branch miss ratio",
  });
  parser.add_argument("--cpu-migrations", {
    action: "store_true",
    help: "Collect CPU migrations",
  });

  const args: ParsedArguments = parser.parse_args();

  const perfReportConfig: PerfReportConfig | undefined = (
    args.instructions ||
    args.instructions_per_cycle ||
    args.last_level_cache_hit_rate ||
    args.l1_data_cache_hit_rate ||
    args.l1_instruction_cache_misses ||
    args.branch_miss_ratio ||
    args.cpu_migrations
  ) ? {
    instructions: args.instructions,
    instructionsPerCycle: args.instructions_per_cycle,
    lastLevelCacheHitRate: args.last_level_cache_hit_rate,
    l1DataCacheHitRate: args.l1_data_cache_hit_rate,
    l1InstructionCacheMisses: args.l1_instruction_cache_misses,
    branchMissRatio: args.branch_miss_ratio,
    cpuMigrations: args.cpu_migrations,
  } : undefined;

  if (args.command === "execute-test-sync") {
    runExecuteTestSync(perfReportConfig)
  } else if (args.command === "execute-test-async") {
    await runExecuteTestAsync(perfReportConfig)
  } else if (args.command === "benchmark") {
    const results = runBenchmark(args.count)
    saveBenchmarkResultsToCsv(results, 'benchmark_results.csv')
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
