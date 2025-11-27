#![deny(clippy::all)]

use napi::bindgen_prelude::*;
use napi_derive::napi;
use std::path::Path;

/// Async Node.js wrapper around the core `execute_test` function
#[napi]
pub async fn execute_test_async(test_artifact_path: String, test_name: String) -> Result<BigInt> {
    let runtime = tokio::runtime::Handle::current();
    runtime
        .spawn_blocking(move || {
            let test_artifact_path = Path::new(&test_artifact_path);
            napi_rs_revm_core::execute_test(test_artifact_path, &test_name)
                .map(|result| BigInt::from(result))
                .map_err(|err| Error::from_reason(err.to_string()))
        })
        .await
        .map_err(|err| Error::from_reason(err.to_string()))?
}

/// Synchronous Node.js wrapper around the core `execute_test` function
#[napi]
pub fn execute_test_sync(test_artifact_path: String, test_name: String) -> Result<BigInt> {
    let test_artifact_path = Path::new(&test_artifact_path);
    napi_rs_revm_core::execute_test(test_artifact_path, &test_name)
        .map(|result| BigInt::from(result))
        .map_err(|err| Error::from_reason(err.to_string()))
}
