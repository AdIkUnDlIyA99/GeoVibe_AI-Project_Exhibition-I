const fs = require("node:fs");
const path = require("node:path");
const { evaluate, fitConfidenceCalibration, generateDataset, trainForest } = require("../src/ml");

const allRows = generateDataset(3000, 2026);
// Use a class-independent holdout stride; labels cycle every four generated rows.
const trainRows = allRows.filter((_, index) => index % 5 >= 2);
const calibrationRows = allRows.filter((_, index) => index % 5 === 1);
const testRows = allRows.filter((_, index) => index % 5 === 0);
const started = Date.now();
const model = trainForest(trainRows, { treeCount: 35, maxDepth: 7, seed: 91 });
model.confidenceCalibration = fitConfidenceCalibration(model, calibrationRows);
const metrics = evaluate(model, testRows);
const artifact = {
  ...model,
  metadata: {
    algorithm: "Random Forest spectral classifier",
    trainedAt: new Date().toISOString(),
    trainingSamples: trainRows.length,
    calibrationSamples: calibrationRows.length,
    testSamples: testRows.length,
    accuracy: metrics.accuracy,
    trainingMs: Date.now() - started,
    confusionMatrix: metrics.confusionMatrix,
    labelSource: "Reproducible proxy spectral signatures",
    operationallyValidated: false,
    confidenceMeaning: "Empirical accuracy on a separate proxy calibration partition"
  }
};
const output = path.join(__dirname, "..", "model", "land-cover-forest.json");
fs.mkdirSync(path.dirname(output), { recursive: true });
fs.writeFileSync(output, JSON.stringify(artifact));
console.log(`Model trained: ${(metrics.accuracy * 100).toFixed(2)}% accuracy on ${metrics.samples} holdout samples`);
