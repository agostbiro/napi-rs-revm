#![deny(clippy::all)]

use revm::{
    bytecode::Bytecode,
    context::{Context, TxEnv},
    database::InMemoryDB,
    handler::{ExecuteEvm, MainBuilder, MainContext},
    primitives::{address, keccak256, Address, Bytes, TxKind, U256},
    state::AccountInfo,
};
use std::fs;
use std::path::Path;
use std::time::Instant;
use eyre::{eyre, Result};
use serde::Deserialize;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Artifact {
    deployed_bytecode: ArtifactCode
}

#[derive(Debug, Deserialize)]
struct ArtifactCode {
    object: String
}

fn load_test_contract_deployed_code(test_artifact_path: &Path) -> Result<Vec<u8>> {
    let artifact_file = fs::File::open(test_artifact_path)?;
    let artifact: Artifact = serde_json::from_reader(artifact_file)?;
    let hex_str = artifact.deployed_bytecode.object.strip_prefix("0x").unwrap_or(&artifact.deployed_bytecode.object);
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
        .build().map_err(|err| eyre!("{:?}", err))?;

    Ok(test_tx)
}

/// Execute a Solidity test with REVM and return the execution time as nanoseconds.
pub fn execute_test(test_artifact_path: &Path, test_name: &str) -> Result<u128> {
    let caller = address!("0100000000000000000000000000000000000000");
    let deployed_code = load_test_contract_deployed_code(test_artifact_path)?;
    let contract_address = address!("4200000000000000000000000000000000000000");

    let selector = compute_selector(test_name);

    let db = create_db(contract_address, deployed_code)?;

    // Create Context and build EVM
    let ctx: Context<_, _, _, _, _, ()> = Context::mainnet().with_db(db);
    let mut evm = ctx.build_mainnet();

    let test_tx = build_tx(contract_address, selector, caller)?;

    let start = Instant::now();
    let test_result = evm.transact(test_tx)?;
    let elapsed = start.elapsed();

    if !test_result.result.is_success() {
        eyre::bail!("Test function reverted");
    }

    Ok(elapsed.as_nanos())
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

        let elapsed_ns = execute_test(artifact_path.as_path(), TEST_NAME)?;

        assert!(elapsed_ns > 0);
        Ok(())
    }
}
