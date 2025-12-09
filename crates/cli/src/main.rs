use clap::{Parser, Subcommand};
use eyre::Result;
use napi_rs_revm_core::{execute_test, PerfReportConfig, TestResult};
use std::path::PathBuf;

/// Execute a Solidity test with REVM
#[derive(Parser, Debug)]
#[command(version, about, long_about = None)]
struct Args {
    #[command(subcommand)]
    command: Command,

    /// Path to the test artifact JSON file
    #[arg(short, long, default_value = "contracts/Avg_Unit_Test.json")]
    test_artifact_path: PathBuf,

    /// Name of the test function to execute
    #[arg(
        short = 'n',
        long,
        default_value = "test_Avg_OneOperandEvenTheOtherOdd()"
    )]
    test_name: String,

    /// Collect instructions
    #[arg(long, default_value = "false")]
    instructions: bool,

    /// Collect instructions per cycle
    #[arg(long, default_value = "false")]
    instructions_per_cycle: bool,

    /// Collect last level cache hit rate
    #[arg(long, default_value = "false")]
    last_level_cache_hit_rate: bool,

    /// Collect L1 data cache hit rate
    #[arg(long, default_value = "false")]
    l1_data_cache_hit_rate: bool,

    /// Collect L1 instruction cache misses
    #[arg(long, default_value = "false")]
    l1_instruction_cache_misses: bool,

    /// Collect branch miss ratio
    #[arg(long, default_value = "false")]
    branch_miss_ratio: bool,

    /// Collect CPU migrations
    #[arg(long, default_value = "false")]
    cpu_migrations: bool,
}

#[derive(Clone, Debug, Subcommand)]
enum Command {
    ExecuteTestSync,
    ExecuteTestAsync,
}

fn execute_test_async(
    test_artifact_path: PathBuf,
    test_name: String,
    perf_report_config: Option<PerfReportConfig>,
) -> Result<TestResult> {
    let runtime = tokio::runtime::Builder::new_multi_thread()
        .enable_all()
        .build()?;
    runtime.block_on(runtime.spawn_blocking(move || {
        execute_test(
            test_artifact_path.as_path(),
            &test_name,
            perf_report_config,
        )
    }))?
}

fn main() -> Result<()> {
    let args = Args::parse();

    let perf_report_config = PerfReportConfig {
        instructions: args.instructions,
        instructions_per_cycle: args.instructions_per_cycle,
        last_level_cache_hit_rate: args.last_level_cache_hit_rate,
        l1_data_cache_hit_rate: args.l1_data_cache_hit_rate,
        l1_instruction_cache_misses: args.l1_instruction_cache_misses,
        branch_miss_ratio: args.branch_miss_ratio,
        cpu_migrations: args.cpu_migrations,
    };

    let perf_report_config_opt = if perf_report_config.instructions
        || perf_report_config.instructions_per_cycle
        || perf_report_config.last_level_cache_hit_rate
        || perf_report_config.l1_data_cache_hit_rate
        || perf_report_config.l1_instruction_cache_misses
        || perf_report_config.branch_miss_ratio
        || perf_report_config.cpu_migrations
    {
        Some(perf_report_config)
    } else {
        None
    };

    let test_result = match args.command {
        Command::ExecuteTestSync => execute_test(
            args.test_artifact_path.as_path(),
            &args.test_name,
            perf_report_config_opt,
        )?,
        Command::ExecuteTestAsync => execute_test_async(
            args.test_artifact_path,
            args.test_name,
            perf_report_config_opt,
        )?,
    };

    println!("{}", serde_json::to_string(&test_result)?);

    Ok(())
}
