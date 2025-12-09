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
pub struct PerfReportConfig {
    pub instructions: bool,
    pub instructions_per_cycle: bool,
    pub last_level_cache_hit_rate: bool,
    pub l1_data_cache_hit_rate: bool,
    pub l1_instruction_cache_misses: bool,
    pub branch_miss_ratio: bool,
    pub cpu_migrations: bool,
}

impl From<PerfReportConfig> for napi_rs_revm_core::PerfReportConfig {
    fn from(value: PerfReportConfig) -> Self {
        let PerfReportConfig {
            instructions,
            instructions_per_cycle,
            last_level_cache_hit_rate,
            l1_data_cache_hit_rate,
            l1_instruction_cache_misses,
            branch_miss_ratio,
            cpu_migrations,
        } = value;
        Self {
            instructions,
            instructions_per_cycle,
            last_level_cache_hit_rate,
            l1_data_cache_hit_rate,
            l1_instruction_cache_misses,
            branch_miss_ratio,
            cpu_migrations,
        }
    }
}

#[napi(object)]
pub struct PerfReport {
    pub instructions: Option<f64>,
    pub instructions_per_cycle: Option<f64>,
    pub last_level_cache_hit_rate: Option<f64>,
    pub l1_data_cache_hit_rate: Option<f64>,
    pub l1_instruction_cache_misses: Option<f64>,
    pub branch_miss_ratio: Option<f64>,
    pub cpu_migrations: Option<f64>,
}

impl From<napi_rs_revm_core::PerfReport> for PerfReport {
    fn from(value: napi_rs_revm_core::PerfReport) -> Self {
        let napi_rs_revm_core::PerfReport {
            instructions,
            instructions_per_cycle,
            last_level_cache_hit_rate,
            l1_data_cache_hit_rate,
            l1_instruction_cache_misses,
            branch_miss_ratio,
            cpu_migrations,
        } = value;
        Self {
            instructions,
            instructions_per_cycle,
            last_level_cache_hit_rate,
            l1_data_cache_hit_rate,
            l1_instruction_cache_misses,
            branch_miss_ratio,
            cpu_migrations,
        }
    }
}

/// Async Node.js wrapper around the core `execute_test` function
#[napi]
pub async fn execute_test_async(
    test_artifact_path: String,
    test_name: String,
    perf_report_config: Option<PerfReportConfig>,
) -> Result<TestResult> {
    let runtime = tokio::runtime::Handle::current();
    runtime
        .spawn_blocking(move || {
            let test_artifact_path = Path::new(&test_artifact_path);
            let perf_report_config = perf_report_config.map(Into::into);
            napi_rs_revm_core::execute_test(test_artifact_path, &test_name, perf_report_config)
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
    perf_report_config: Option<PerfReportConfig>,
) -> Result<TestResult> {
    let test_artifact_path = Path::new(&test_artifact_path);
    let perf_report_config = perf_report_config.map(Into::into);
    napi_rs_revm_core::execute_test(test_artifact_path, &test_name, perf_report_config)
        .map(TestResult::from)
        .map_err(|err| Error::from_reason(err.to_string()))
}
