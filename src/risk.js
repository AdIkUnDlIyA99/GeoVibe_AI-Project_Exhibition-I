const FEATURE_NAMES = [
  "NDVI", "NDWI", "NDVI change", "NDWI change",
  "NDVI slope", "NDWI slope", "NDVI volatility", "NDWI volatility"
];

function mulberry32(seed) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function sigmoid(value) {
  return 1 / (1 + Math.exp(-Math.max(-30, Math.min(30, value))));
}

function generateProxyDataset(count = 6000, seed = 2026) {
  const random = mulberry32(seed);
  return Array.from({ length: count }, () => {
    const ndvi = -0.15 + random() * 0.95;
    const ndwi = -0.5 + random() * 1.05;
    const ndviChange = -0.32 + random() * 0.58;
    const ndwiChange = -0.34 + random() * 0.68;
    const ndviSlope = -0.08 + random() * 0.16;
    const ndwiSlope = -0.08 + random() * 0.16;
    const ndviVolatility = 0.01 + random() * 0.2;
    const ndwiVolatility = 0.01 + random() * 0.2;
    const features = [ndvi, ndwi, ndviChange, ndwiChange, ndviSlope, ndwiSlope, ndviVolatility, ndwiVolatility];
    const floodLikelihood = sigmoid(-2.5 + Math.max(0, ndwi) * 4.6 + Math.max(0, ndwiChange) * 7.2 + ndwiSlope * 5 + Math.max(0, -ndviChange) * 1.4 + ndwiVolatility * 1.2);
    const droughtLikelihood = sigmoid(-1.9 + Math.max(0, 0.3 - ndvi) * 4.2 + Math.max(0, -ndviChange) * 6.2 + Math.max(0, -ndwiChange) * 4.5 - ndviSlope * 4 - ndwiSlope * 2.5 + ndviVolatility);
    return { features, flood: random() < floodLikelihood ? 1 : 0, drought: random() < droughtLikelihood ? 1 : 0 };
  });
}

function scaler(rows) {
  const mean = FEATURE_NAMES.map((_, index) => rows.reduce((sum, row) => sum + row.features[index], 0) / rows.length);
  const scale = FEATURE_NAMES.map((_, index) => {
    const variance = rows.reduce((sum, row) => sum + (row.features[index] - mean[index]) ** 2, 0) / rows.length;
    return Math.sqrt(variance) || 1;
  });
  return { mean, scale };
}

function normalize(features, stats) {
  return features.map((value, index) => (value - stats.mean[index]) / stats.scale[index]);
}

function fitLogistic(rows, label, stats, epochs = 900) {
  const weights = Array(FEATURE_NAMES.length + 1).fill(0);
  for (let epoch = 0; epoch < epochs; epoch += 1) {
    const gradient = Array(weights.length).fill(0);
    rows.forEach((row) => {
      const values = [1, ...normalize(row.features, stats)];
      const error = sigmoid(values.reduce((sum, value, index) => sum + value * weights[index], 0)) - row[label];
      values.forEach((value, index) => { gradient[index] += error * value; });
    });
    const rate = 0.12 / Math.sqrt(1 + epoch / 80);
    weights.forEach((weight, index) => {
      const penalty = index === 0 ? 0 : 0.0015 * weight;
      weights[index] -= rate * (gradient[index] / rows.length + penalty);
    });
  }
  return weights;
}

function rawScore(weights, features, stats) {
  return [1, ...normalize(features, stats)].reduce((sum, value, index) => sum + value * weights[index], 0);
}

function fitPlatt(rows, label, weights, stats) {
  let a = 1;
  let b = 0;
  for (let epoch = 0; epoch < 700; epoch += 1) {
    let gradientA = 0;
    let gradientB = 0;
    rows.forEach((row) => {
      const score = rawScore(weights, row.features, stats);
      const error = sigmoid(a * score + b) - row[label];
      gradientA += error * score;
      gradientB += error;
    });
    const rate = 0.08 / Math.sqrt(1 + epoch / 100);
    a -= rate * gradientA / rows.length;
    b -= rate * gradientB / rows.length;
  }
  return { a, b };
}

function probability(model, features) {
  const score = rawScore(model.weights, features, model.scaler);
  return sigmoid(model.calibration.a * score + model.calibration.b);
}

function metrics(model, rows, label) {
  const probabilities = rows.map((row) => probability(model, row.features));
  const brierScore = probabilities.reduce((sum, value, index) => sum + (value - rows[index][label]) ** 2, 0) / rows.length;
  const accuracy = probabilities.reduce((sum, value, index) => sum + ((value >= 0.5) === Boolean(rows[index][label]) ? 1 : 0), 0) / rows.length;
  return { samples: rows.length, brierScore, accuracy };
}

function trainRiskModels(rows) {
  const train = rows.filter((_, index) => index % 10 >= 4);
  const calibration = rows.filter((_, index) => index % 10 === 2 || index % 10 === 3);
  const test = rows.filter((_, index) => index % 10 < 2);
  const stats = scaler(train);
  const build = (label) => {
    const weights = fitLogistic(train, label, stats);
    const model = { weights, scaler: stats, calibration: fitPlatt(calibration, label, weights, stats) };
    return { ...model, metrics: metrics(model, test, label) };
  };
  return { featureNames: FEATURE_NAMES, flood: build("flood"), drought: build("drought") };
}

function seriesFeatures(observations) {
  const values = (key) => observations.map((observation) => observation.indices[key]);
  const slope = (items) => {
    const sampleSize = Math.min(6, items.length);
    const sample = items.slice(-sampleSize);
    const dates = observations.slice(-sampleSize).map((item, index) => {
      const parsed = new Date(item.date);
      return Number.isNaN(parsed.getTime()) ? new Date(Date.UTC(2020, index, 1)) : parsed;
    });
    const start = dates[0];
    const xValues = dates.map((date) => (date - start) / (86400000 * 30.4375));
    const meanX = xValues.reduce((sum, value) => sum + value, 0) / xValues.length;
    const meanY = sample.reduce((sum, value) => sum + value, 0) / sample.length;
    const denominator = xValues.reduce((sum, value) => sum + (value - meanX) ** 2, 0) || 1;
    return sample.reduce((sum, value, index) => sum + (xValues[index] - meanX) * (value - meanY), 0) / denominator;
  };
  const volatility = (items) => {
    const mean = items.reduce((sum, value) => sum + value, 0) / items.length;
    return Math.sqrt(items.reduce((sum, value) => sum + (value - mean) ** 2, 0) / items.length);
  };
  const ndvi = values("ndvi");
  const ndwi = values("ndwi");
  return [ndvi.at(-1), ndwi.at(-1), ndvi.at(-1) - ndvi[0], ndwi.at(-1) - ndwi[0], slope(ndvi), slope(ndwi), volatility(ndvi), volatility(ndwi)];
}

function predictRiskModels(models, features) {
  return { flood: probability(models.flood, features), drought: probability(models.drought, features) };
}

module.exports = { FEATURE_NAMES, generateProxyDataset, predictRiskModels, seriesFeatures, trainRiskModels };
