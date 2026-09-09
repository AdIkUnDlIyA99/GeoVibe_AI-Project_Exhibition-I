const test = require("node:test");
const assert = require("node:assert/strict");
const { evaluate, fitConfidenceCalibration, generateDataset, predict, trainForest } = require("../src/ml");

test("trained forest achieves useful holdout accuracy", () => {
  const rows = generateDataset(1000, 17);
  const train = rows.filter((_, i) => i % 7 !== 0);
  const testRows = rows.filter((_, i) => i % 7 === 0);
  const model = trainForest(train, { treeCount: 21, seed: 4 });
  assert.ok(evaluate(model, testRows).accuracy > 0.9);
});

test("spectral signatures map to expected cover classes", () => {
  const model = trainForest(generateDataset(1200, 9), { treeCount: 25, seed: 5 });
  assert.equal(predict(model, [0.75, -0.15]).label, "Dense Vegetation");
  assert.equal(predict(model, [-0.1, 0.7]).label, "Surface Water");
  assert.equal(predict(model, [0.04, -0.25]).label, "Sparse Vegetation");
});

test("classifier confidence is mapped through an empirical calibration table", () => {
  const rows = generateDataset(1000, 23);
  const model = trainForest(rows.slice(0, 700), { treeCount: 21, seed: 7 });
  model.confidenceCalibration = fitConfidenceCalibration(model, rows.slice(700));
  const result = predict(model, [0.75, -0.15]);
  assert.ok(result.confidence >= 0 && result.confidence <= 1);
  assert.ok(result.rawConfidence >= 0 && result.rawConfidence <= 1);
  assert.equal(model.confidenceCalibration.length, 10);
});
