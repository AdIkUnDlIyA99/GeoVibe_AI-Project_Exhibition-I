const test = require("node:test");
const assert = require("node:assert/strict");
const { generateProxyDataset, predictRiskModels, seriesFeatures, trainRiskModels } = require("../src/risk");

const models = trainRiskModels(generateProxyDataset(2200, 91));

test("calibrated risk models return bounded differentiated probabilities", () => {
  const flood = predictRiskModels(models, [0.18, 0.55, -0.12, 0.3, -0.03, 0.06, 0.12, 0.18]);
  const drought = predictRiskModels(models, [0.08, -0.32, -0.28, -0.2, -0.06, -0.04, 0.16, 0.09]);
  assert.ok(flood.flood > flood.drought);
  assert.ok(drought.drought > drought.flood);
  assert.ok([flood.flood, flood.drought, drought.flood, drought.drought].every((value) => value >= 0 && value <= 1));
});

test("temporal feature extraction captures level, change, slope, and volatility", () => {
  const observations = [
    { date: "2025-01-01T00:00:00Z", indices: { ndvi: 0.6, ndwi: -0.2 } },
    { date: "2025-02-01T00:00:00Z", indices: { ndvi: 0.5, ndwi: -0.1 } },
    { date: "2025-04-01T00:00:00Z", indices: { ndvi: 0.35, ndwi: 0.2 } }
  ];
  const features = seriesFeatures(observations);
  assert.equal(features.length, 8);
  assert.ok(features[2] < 0);
  assert.ok(features[3] > 0);
  assert.ok(features[4] < 0);
  assert.ok(features[5] > 0);
});

test("temporal slopes account for irregular capture intervals", () => {
  const fast = seriesFeatures([
    { date: "2025-01-01T00:00:00Z", indices: { ndvi: 0.6, ndwi: 0 } },
    { date: "2025-02-01T00:00:00Z", indices: { ndvi: 0.4, ndwi: 0 } }
  ]);
  const slow = seriesFeatures([
    { date: "2025-01-01T00:00:00Z", indices: { ndvi: 0.6, ndwi: 0 } },
    { date: "2025-07-01T00:00:00Z", indices: { ndvi: 0.4, ndwi: 0 } }
  ]);
  assert.ok(Math.abs(fast[4]) > Math.abs(slow[4]) * 4);
});
