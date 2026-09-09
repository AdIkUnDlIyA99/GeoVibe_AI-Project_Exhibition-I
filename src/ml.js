const CLASSES = ["Dense Vegetation", "Surface Water", "Moderate Vegetation", "Sparse Vegetation"];

function mulberry32(seed) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function generateDataset(count = 2500, seed = 42) {
  const random = mulberry32(seed);
  const centers = [
    [0.72, -0.16],
    [-0.12, 0.68],
    [0.46, -0.08],
    [0.08, -0.28]
  ];
  const rows = [];
  for (let i = 0; i < count; i += 1) {
    const label = i % CLASSES.length;
    const features = centers[label].map((center, j) => {
      const noise = (random() + random() + random() - 1.5) * 0.15;
      return Math.max(-1, Math.min(1, center + noise));
    });
    rows.push({ features, label });
  }
  return rows;
}

function gini(groups, classCount) {
  const total = groups.reduce((sum, group) => sum + group.length, 0);
  return groups.reduce((score, group) => {
    if (!group.length) return score;
    const counts = Array(classCount).fill(0);
    group.forEach((row) => { counts[row.label] += 1; });
    const purity = counts.reduce((sum, n) => sum + (n / group.length) ** 2, 0);
    return score + (1 - purity) * (group.length / total);
  }, 0);
}

function leaf(rows) {
  const counts = Array(CLASSES.length).fill(0);
  rows.forEach((row) => { counts[row.label] += 1; });
  return counts.indexOf(Math.max(...counts));
}

function buildTree(rows, depth, maxDepth, minSize, random) {
  if (depth >= maxDepth || rows.length <= minSize || rows.every((r) => r.label === rows[0].label)) {
    return { label: leaf(rows) };
  }
  let best = { score: Infinity };
  const featurePool = [0, 1].sort(() => random() - 0.5);
  featurePool.forEach((feature) => {
    for (let attempt = 0; attempt < 12; attempt += 1) {
      const threshold = rows[Math.floor(random() * rows.length)].features[feature];
      const left = rows.filter((r) => r.features[feature] < threshold);
      const right = rows.filter((r) => r.features[feature] >= threshold);
      if (!left.length || !right.length) continue;
      const score = gini([left, right], CLASSES.length);
      if (score < best.score) best = { feature, threshold, left, right, score };
    }
  });
  if (!best.left) return { label: leaf(rows) };
  return {
    feature: best.feature,
    threshold: best.threshold,
    left: buildTree(best.left, depth + 1, maxDepth, minSize, random),
    right: buildTree(best.right, depth + 1, maxDepth, minSize, random)
  };
}

function predictTree(tree, features) {
  if (tree.label !== undefined) return tree.label;
  return predictTree(features[tree.feature] < tree.threshold ? tree.left : tree.right, features);
}

function trainForest(rows, options = {}) {
  const treeCount = options.treeCount || 31;
  const random = mulberry32(options.seed || 731);
  const trees = [];
  for (let i = 0; i < treeCount; i += 1) {
    const sample = Array.from({ length: rows.length }, () => rows[Math.floor(random() * rows.length)]);
    trees.push(buildTree(sample, 0, options.maxDepth || 7, options.minSize || 8, random));
  }
  return { classes: CLASSES, features: ["NDVI", "NDWI"], trees };
}

function confidenceBin(probability) {
  return Math.min(9, Math.floor(Math.max(0, Math.min(0.999, probability)) * 10));
}

function fitConfidenceCalibration(model, rows) {
  const totals = Array(10).fill(0);
  const correct = Array(10).fill(0);
  rows.forEach((row) => {
    const probabilities = predictProba(model, row.features);
    const guess = probabilities.indexOf(Math.max(...probabilities));
    const bin = confidenceBin(probabilities[guess]);
    totals[bin] += 1;
    if (guess === row.label) correct[bin] += 1;
  });
  return totals.map((total, index) => ({
    lower: index / 10,
    upper: (index + 1) / 10,
    samples: total,
    accuracy: total ? correct[index] / total : null
  }));
}

function calibratedConfidence(model, raw) {
  const bins = model.confidenceCalibration || [];
  const exact = bins[confidenceBin(raw)];
  if (exact?.samples >= 10 && Number.isFinite(exact.accuracy)) return exact.accuracy;
  const nearest = bins
    .filter((bin) => bin.samples >= 10 && Number.isFinite(bin.accuracy))
    .sort((a, b) => Math.abs((a.lower + a.upper) / 2 - raw) - Math.abs((b.lower + b.upper) / 2 - raw))[0];
  return nearest ? nearest.accuracy : raw;
}

function predictProba(model, features) {
  const votes = Array(model.classes.length).fill(0);
  model.trees.forEach((tree) => { votes[predictTree(tree, features)] += 1; });
  return votes.map((vote) => vote / model.trees.length);
}

function predict(model, features) {
  const probabilities = predictProba(model, features);
  const index = probabilities.indexOf(Math.max(...probabilities));
  const rawConfidence = probabilities[index];
  return { label: model.classes[index], confidence: calibratedConfidence(model, rawConfidence), rawConfidence, probabilities };
}

function evaluate(model, rows) {
  const matrix = CLASSES.map(() => Array(CLASSES.length).fill(0));
  let correct = 0;
  rows.forEach((row) => {
    const guess = predict(model, row.features);
    const index = CLASSES.indexOf(guess.label);
    matrix[row.label][index] += 1;
    if (index === row.label) correct += 1;
  });
  return { accuracy: correct / rows.length, samples: rows.length, confusionMatrix: matrix };
}

module.exports = { CLASSES, evaluate, fitConfidenceCalibration, generateDataset, predict, predictProba, trainForest };
