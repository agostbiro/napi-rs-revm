import test from 'ava'

import { executeTest } from '../index'

test('sync function from native code', (t) => {
  const artifactPath = "contracts/Avg_Unit_Test.json";
  const testName = "test_Avg_OneOperandEvenTheOtherOdd()";
  t.true(executeTest(artifactPath, testName) > 0)
})
