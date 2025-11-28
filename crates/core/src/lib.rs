#![deny(clippy::all)]

// Using core::intrinsics (nightly only)
// #![feature(core_intrinsics)]
// use core::intrinsics::prefetch_read_instruction;

use eyre::{eyre, Result};
use num_traits::FromPrimitive;
use perf_event::events as perf_events;
use revm::{bytecode::Bytecode, context::{BlockEnv, CfgEnv, Context, TxEnv}, database::InMemoryDB, handler::{ExecuteEvm, MainBuilder, MainContext}, primitives::{address, keccak256, Address, Bytes, TxKind, U256}, state::AccountInfo, Journal, MainnetEvm};
use serde::{Deserialize, Serialize};
use std::{fs, path::Path, time::Instant};
use revm::context::result::ExecutionResult;
use revm::context_interface::result::ExecResultAndState;

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TestResult {
    /// Execution time of the REVM transaction
    pub duration_ns: f64,
    /// Optional report generated from perf events.
    pub perf_report: Option<PerfReport>,
}

type TestContext = Context<BlockEnv, TxEnv, CfgEnv, InMemoryDB, Journal<InMemoryDB>, ()>;

/// Execute a Solidity test with REVM and return the execution time as nanoseconds.
pub fn execute_test(
    test_artifact_path: &Path,
    test_name: &str,
    collect_cache_hit_ratio: bool,
) -> Result<TestResult> {
    let caller = address!("0100000000000000000000000000000000000000");
    let deployed_code = load_test_contract_deployed_code(test_artifact_path)?;
    let contract_address = address!("4200000000000000000000000000000000000000");

    let selector = compute_selector(test_name);

    let db = create_db(contract_address, deployed_code)?;

    // Create Context and build EVM
    let ctx: TestContext = Context::mainnet().with_db(db);
    let mut evm = ctx.build_mainnet();

    let test_tx = build_tx(contract_address, selector, caller)?;

    // Prefetch REVM transact code (which is heavily inlined) with max locality.
    // unsafe { prefetch_read_instruction::<_, 3>(MainnetEvm::<TestContext>::transact as *const u8); }

    let mut perf_event_collector: Option<PerfEventCollector> = collect_cache_hit_ratio
        .then(|| {
            let mut pec = PerfEventCollector::new()?;
            pec.enable()?;
            Ok::<_, eyre::Error>(pec)
        })
        .transpose()?;

    let start = Instant::now();
    let test_result = execute_test_transact(&mut evm, test_tx)?;
    let elapsed = start.elapsed();

    let perf_report = perf_event_collector
        .as_mut()
        .map(PerfEventCollector::report)
        .transpose()?;

    if !test_result.result.is_success() {
        eyre::bail!("Test function reverted");
    }

    Ok(TestResult {
        // Duration is expected to be <1m nanos so this is safe
        duration_ns: elapsed.as_nanos() as f64,
        perf_report,
    })
}

#[inline(never)]
fn execute_test_transact(evm: &mut MainnetEvm<TestContext>, test_tx: TxEnv) -> Result<ExecResultAndState<ExecutionResult>> {
    Ok(evm.transact(test_tx)?)
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Artifact {
    deployed_bytecode: ArtifactCode,
}

#[derive(Debug, Deserialize)]
struct ArtifactCode {
    object: String,
}

fn load_test_contract_deployed_code(test_artifact_path: &Path) -> Result<Vec<u8>> {
    let artifact_file = fs::File::open(test_artifact_path)?;
    let artifact: Artifact = serde_json::from_reader(artifact_file)?;
    let hex_str = artifact
        .deployed_bytecode
        .object
        .strip_prefix("0x")
        .unwrap_or(&artifact.deployed_bytecode.object);
    let bytecode_bytes = hex::decode(hex_str)?;
    Ok(bytecode_bytes)
}

fn create_db(contract_address: Address, contract_deployed_code: Vec<u8>) -> Result<InMemoryDB> {
    let mut db = InMemoryDB::default();

    // Insert the contract bytecode into the database
    let bytecode = Bytecode::new_raw_checked(contract_deployed_code.into())?;
    let account_info = AccountInfo {
        balance: U256::ZERO,
        nonce: 0,
        code_hash: bytecode.hash_slow(),
        code: Some(bytecode),
    };
    db.insert_account_info(contract_address, account_info);

    Ok(db)
}

fn compute_selector(signature: &str) -> Bytes {
    let hash = keccak256(signature.as_bytes());
    Bytes::copy_from_slice(&hash[..4])
}

fn build_tx(contract_address: Address, selector: Bytes, caller: Address) -> Result<TxEnv> {
    let test_tx = TxEnv::builder()
        .caller(caller)
        .kind(TxKind::Call(contract_address))
        .data(selector)
        .gas_limit(30_000_000)
        .build()
        .map_err(|err| eyre!("{:?}", err))?;

    Ok(test_tx)
}

struct PerfEventCollector {
    group: perf_event::Group,
    cycles: perf_event::Counter,
    instructions: perf_event::Counter,
    // last_level_cache_references: perf_event::Counter,
    // last_level_cache_misses: perf_event::Counter,
    // l1_data_cache_reads: perf_event::Counter,
    // l1_data_cache_misses: perf_event::Counter,
    // l1 instruction cache reads are not exposed on Intel
    l1_instruction_cache_misses: perf_event::Counter,
    // branch_instructions: perf_event::Counter,
    // branch_misses: perf_event::Counter,
    cpu_migrations: perf_event::Counter,
}

impl PerfEventCollector {
    fn new() -> Result<Self> {
        let mut group = perf_event::Group::new()?;

        // let current_cpu = unsafe {
        //     libc::sched_getcpu()
        // }.to_usize().ok_or_else(|| eyre::eyre!("Failed to convert c_int to usize"))?;

        macro_rules! perf_event {
            ($kind:expr) => {
                perf_event::Builder::new()
                    // .one_cpu(current_cpu)
                    .group(&mut group)
                    .kind($kind)
                    .build()?
            };
        }

        let cycles = perf_event!(perf_events::Hardware::CPU_CYCLES);
        let instructions = perf_event!(perf_events::Hardware::INSTRUCTIONS);
        // let last_level_cache_references = perf_event!(perf_events::Hardware::CACHE_REFERENCES);
        // let last_level_cache_misses = perf_event!(perf_events::Hardware::CACHE_MISSES);
        // let l1_data_cache_reads = perf_event!(perf_events::Cache {
        //     which: perf_events::WhichCache::L1D,
        //     operation: perf_events::CacheOp::READ,
        //     result: perf_events::CacheResult::ACCESS,
        // });
        // let l1_data_cache_misses = perf_event!(perf_events::Cache {
        //         which: perf_events::WhichCache::L1D,
        //         operation: perf_events::CacheOp::READ,
        //         result: perf_events::CacheResult::MISS,
        //     });
        let l1_instruction_cache_misses = perf_event!(perf_events::Cache {
            which: perf_events::WhichCache::L1I,
            operation: perf_events::CacheOp::READ,
            result: perf_events::CacheResult::MISS,
        });
        // let branch_instructions = perf_event!(perf_events::Hardware::BRANCH_INSTRUCTIONS);
        // let branch_misses = perf_event!(perf_events::Hardware::BRANCH_MISSES);
        let cpu_migrations = perf_event!(perf_events::Software::CPU_MIGRATIONS);

        Ok(Self {
            group,
            cycles,
            instructions,
            // last_level_cache_references,
            // last_level_cache_misses,
            // l1_data_cache_reads,
            // l1_data_cache_misses,
            l1_instruction_cache_misses,
            // branch_instructions,
            // branch_misses,
            cpu_migrations,
        })
    }

    fn enable(&mut self) -> Result<()> {
        self.group.enable()?;
        Ok(())
    }

    fn report(&mut self) -> Result<PerfReport> {
        self.group.disable()?;
        let counts = self.group.read()?;

        macro_rules! count_to_f64 {
            ($counter:expr) => {
                f64::from_u64(counts[$counter])
                    .ok_or_else(|| eyre!("Failed to convert u64 to f64"))?
            };
        }

        macro_rules! ratio {
            ($nominator:expr, $denominator:expr) => {{
                let nominator = count_to_f64!($nominator);
                let denominator = count_to_f64!($denominator);
                nominator / denominator
            }};
        }

        Ok(PerfReport {
            instructions: count_to_f64!(&self.instructions),
            instructions_per_cycle: ratio!(&self.instructions, &self.cycles),
            // instructions: -1.,
            // instructions_per_cycle: -1.,
            // last_level_cache_hit_rate: 1.0 - ratio!(&self.last_level_cache_misses, &self.last_level_cache_references),
            // l1_data_cache_hit_rate: 1.0 - ratio!(&self.l1_data_cache_misses, &self.l1_data_cache_reads),
            last_level_cache_hit_rate: -1.,
            l1_data_cache_hit_rate: -1.,
            l1_instruction_cache_misses: count_to_f64!(&self.l1_instruction_cache_misses),
            // branch_miss_ratio: ratio!(&self.branch_misses, &self.branch_instructions),
            branch_miss_ratio: -1.,
            cpu_migrations: count_to_f64!(&self.cpu_migrations),
        })
    }
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PerfReport {
    pub instructions: f64,
    pub instructions_per_cycle: f64,
    pub last_level_cache_hit_rate: f64,
    pub l1_data_cache_hit_rate: f64,
    pub l1_instruction_cache_misses: f64,
    pub branch_miss_ratio: f64,
    pub cpu_migrations: f64,
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    const TEST_ARTIFACT: &str = "../../contracts/Avg_Unit_Test.json";
    const TEST_NAME: &str = "test_Avg_OneOperandEvenTheOtherOdd()";

    #[test]
    fn test_execute_test() -> Result<()> {
        let manifest_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
        let artifact_path = manifest_dir.join(TEST_ARTIFACT);

        let test_result = execute_test(artifact_path.as_path(), TEST_NAME, false)?;

        assert!(test_result.duration_ns > 0.0);
        assert!(test_result.perf_report.is_none());
        Ok(())
    }
}
