#![deny(clippy::all)]

use std::path::Path;
use napi_derive::napi;
use napi::bindgen_prelude::{BigInt};

/// Node.js wrapper around the core `execute_test` function
#[napi(catch_unwind)]
pub fn execute_test(test_artifact_path: String, test_name: String) -> napi::Result<BigInt> {
    let test_artifact_path = Path::new(&test_artifact_path);

    napi_rs_revm_core::execute_test(test_artifact_path, &test_name)
        .map(|result| BigInt::from(result))
        .map_err(|err| napi::Error::from_reason(err.to_string()))
}
