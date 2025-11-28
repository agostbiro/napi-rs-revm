#![deny(clippy::all)]

use napi::bindgen_prelude::*;
use napi_derive::napi;
use std::path::Path;

#[napi(object)]
pub struct TestResult {
    /// Execution time of the REVM transaction
    pub duration_ns: f64,
    pub perf_report: Option<PerfReport>,
}

impl From<napi_rs_revm_core::TestResult> for TestResult {
    fn from(value: napi_rs_revm_core::TestResult) -> Self {
        Self {
            duration_ns: value.duration_ns,
            perf_report: value.perf_report.map(PerfReport::from),
        }
    }
}

#[napi(object)]
pub struct PerfReport {
    // pub last_level_cache_hit_rate: f64,
    // pub l1_data_cache_hit_rate: f64,
    // pub l1_instruction_cache_miss_ratio: f64,
    // pub branch_miss_ratio: f64,
    pub cpu_migrations: f64,
}

impl From<napi_rs_revm_core::PerfReport> for PerfReport {
    fn from(value: napi_rs_revm_core::PerfReport) -> Self {
        Self {
            // last_level_cache_hit_rate: value.last_level_cache_hit_rate,
            // l1_data_cache_hit_rate: value.l1_data_cache_hit_rate,
            // l1_instruction_cache_miss_ratio: value.l1_instruction_cache_miss_ratio,
            // branch_miss_ratio: value.branch_miss_ratio,
            cpu_migrations: value.cpu_migrations,
        }
    }
}

/// Async Node.js wrapper around the core `execute_test` function
#[napi]
pub async fn execute_test_async(
    test_artifact_path: String,
    test_name: String,
    collect_cache_hit_ratio: bool,
) -> Result<TestResult> {
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
pub fn execute_test_sync(
    test_artifact_path: String,
    test_name: String,
    collect_cache_hit_ratio: bool,
) -> Result<TestResult> {
    let test_artifact_path = Path::new(&test_artifact_path);
    napi_rs_revm_core::execute_test(test_artifact_path, &test_name, collect_cache_hit_ratio)
        .map(TestResult::from)
        .map_err(|err| Error::from_reason(err.to_string()))
}
