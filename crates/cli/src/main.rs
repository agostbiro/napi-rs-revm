use clap::Parser;
use napi_rs_revm_core::execute_test;
use std::path::PathBuf;

/// Execute a Solidity test with REVM
#[derive(Parser, Debug)]
#[command(name = "execute_test")]
#[command(about = "Execute a Solidity test contract with REVM", long_about = None)]
struct Args {
    /// Path to the test artifact JSON file
    #[arg(short, long, default_value = "contracts/Avg_Unit_Test.json")]
    test_artifact_path: PathBuf,

    /// Name of the test function to execute
    #[arg(short = 'n', long, default_value = "test_Avg_OneOperandEvenTheOtherOdd()")]
    test_name: String,
}

fn main() -> eyre::Result<()> {
    let args = Args::parse();

    let elapsed_ns = execute_test(args.test_artifact_path.as_path(), &args.test_name)?;
    println!("{}", elapsed_ns);

    Ok(())
}
