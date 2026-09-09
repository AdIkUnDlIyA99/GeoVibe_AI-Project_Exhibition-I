const fs = require("node:fs");
const path = require("node:path");
const { generateProxyDataset, trainRiskModels } = require("../src/risk");

const started = Date.now();
const models = trainRiskModels(generateProxyDataset(6000, 2026));
const artifact = {
  ...models,
  metadata: {
    algorithm: "Calibrated binary logistic risk models",
    calibration: "Platt scaling on a separate holdout partition",
    labelSource: "Reproducible proxy-labelled environmental scenarios",
    operationallyValidated: false,
    trainedAt: new Date().toISOString(),
    trainingMs: Date.now() - started
  }
};
const output = path.join(__dirname, "..", "model", "risk-models.json");
fs.writeFileSync(output, JSON.stringify(artifact));
console.log(`Risk models trained: flood Brier ${artifact.flood.metrics.brierScore.toFixed(3)}, drought Brier ${artifact.drought.metrics.brierScore.toFixed(3)}`);
