#![deny(clippy::all)]

use napi::bindgen_prelude::*;
use napi_derive::napi;
use std::path::Path;

#[napi(object)]
pub struct TestResult {
    /// Execution time of the REVM transaction
    pub duration_ns: f64,
    /// CPU cache hit ratio of the REVM transaction
    pub cache_hit_ratio: Option<f64>,
}

impl From<napi_rs_revm_core::TestResult> for TestResult {
    fn from(value: napi_rs_revm_core::TestResult) -> Self {
        Self {
            duration_ns: value.duration_ns,
            cache_hit_ratio: value.cache_hit_ratio,
        }
    }
}

/// Async Node.js wrapper around the core `execute_test` function
#[napi]
pub async fn execute_test_async(test_artifact_path: String, test_name: String, collect_cache_hit_ratio: bool) -> Result<TestResult> {
    let runtime = tokio::runtime::Handle::current();
    runtime
        .spawn_blocking(move || {
            let test_artifact_path = Path::new(&test_artifact_path);
            napi_rs_revm_core::execute_test(test_artifact_path, &test_name, collect_cache_hit_ratio)
                .map(TestResult::from)
                .map_err(|err| Error::from_reason(err.to_string()))
        })
        .await
        .map_err(|err| Error::from_reason(err.to_string()))?
}

/// Synchronous Node.js wrapper around the core `execute_test` function
#[napi]
pub fn execute_test_sync(test_artifact_path: String, test_name: String, collect_cache_hit_ratio: bool) -> Result<TestResult> {
    let test_artifact_path = Path::new(&test_artifact_path);
    napi_rs_revm_core::execute_test(test_artifact_path, &test_name, collect_cache_hit_ratio)
        .map(TestResult::from)
        .map_err(|err| Error::from_reason(err.to_string()))
}
