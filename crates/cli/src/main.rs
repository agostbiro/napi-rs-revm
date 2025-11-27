use clap::{Parser, Subcommand};
use eyre::Result;
use napi_rs_revm_core::execute_test;
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
}

#[derive(Clone, Debug)]
#[derive(Subcommand)]
enum Command {
    ExecuteTestSync,
    ExecuteTestAsync
}

fn execute_test_async(test_artifact_path: PathBuf, test_name: String) -> Result<u128> {
    let runtime = tokio::runtime::Builder::new_multi_thread()
        .enable_all()
        .build()?;

    runtime.block_on(runtime.spawn_blocking(move || {
        execute_test(test_artifact_path.as_path(), &test_name)
    }))?
}

fn main() -> Result<()> {
    let args = Args::parse();

    let elapsed_ns = match args.command {
        Command::ExecuteTestSync => {
            execute_test(args.test_artifact_path.as_path(), &args.test_name)?
        }
        Command::ExecuteTestAsync => {
            execute_test_async(args.test_artifact_path, args.test_name)?
        }
    };

    println!("{}", elapsed_ns);

    Ok(())
}
