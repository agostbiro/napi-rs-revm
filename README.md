# REVM Performance Investigation

Tooling to help diagnose why REVM execution slows down on a background thread in a NAPI-rs project.

Instructions on how to get detailed performance measurements are below.

## Prerequisites

- x86 Linux
- Rust toolchain
- Node 24 
- pnpm

## Run

```
# Assuming you're running this in an isolated environment, otherwise this is dangerous.
sudo sysctl -w kernel.perf_event_paranoid=3

pnpm i
pnpm run bench benchmark
```

Results are saved to `benchmark_results.csv`. 
See [prefetch_benchmark_results.csv](./prefetch_benchmark_results.csv) for example output.

## Test Contract

The source for [Avg_Unit_Test.json](contracts/Avg_Unit_Test.json) is [test_Avg_OneOperandEvenTheOtherOdd](https://github.com/PaulRBerg/prb-math/blob/aad73cfc6cdc2c9b660199b5b1e9db391ea48640/test/unit/sd59x18/math/avg/avg.t.sol#L139-L142) from the [prb-math](https://github.com/PaulRBerg/prb-math/tree/main) test suite with the following patch applied in order to remove the dependency on cheatcodes:

```
diff --git a/test/unit/sd59x18/math/avg/avg.t.sol b/test/unit/sd59x18/math/avg/avg.t.sol
index ae98ca3..ecd64c6 100644
--- a/test/unit/sd59x18/math/avg/avg.t.sol
+++ b/test/unit/sd59x18/math/avg/avg.t.sol
@@ -138,6 +138,7 @@ contract Avg_Unit_Test is SD59x18_Unit_Test {
 
     function test_Avg_OneOperandEvenTheOtherOdd() external parameterizedTest(oneOperandEvenTheOtherOdd_Sets()) {
         SD59x18 actual = avg(s.x, s.y);
-        assertEq(actual, s.expected, "SD59x18 avg");
+        require(actual == s.expected, "SD59x18 avg");
+        //assertEq(actual, s.expected, "SD59x18 avg");
     }
 }
```

