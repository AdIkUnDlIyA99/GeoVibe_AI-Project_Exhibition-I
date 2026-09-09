const DAY_MS = 86400000;

function clamp(value, min = -1, max = 1) {
  return Math.max(min, Math.min(max, value));
}

function solve(matrix, values) {
  const rows = matrix.map((row, index) => [...row, values[index]]);
  for (let column = 0; column < rows.length; column += 1) {
    let pivot = column;
    for (let row = column + 1; row < rows.length; row += 1) {
      if (Math.abs(rows[row][column]) > Math.abs(rows[pivot][column])) pivot = row;
    }
    [rows[column], rows[pivot]] = [rows[pivot], rows[column]];
    if (Math.abs(rows[column][column]) < 1e-10) return Array(rows.length).fill(0);
    const divisor = rows[column][column];
    rows[column] = rows[column].map((value) => value / divisor);
    for (let row = 0; row < rows.length; row += 1) {
      if (row === column) continue;
      const factor = rows[row][column];
      rows[row] = rows[row].map((value, index) => value - factor * rows[column][index]);
    }
  }
  return rows.map((row) => row.at(-1));
}

function inverse(matrix) {
  const columns = matrix.map((_, column) => solve(matrix, matrix.map((__, row) => row === column ? 1 : 0)));
  return matrix.map((_, row) => columns.map((column) => column[row]));
}

function tCritical95(degreesOfFreedom) {
  const table = [12.706, 4.303, 3.182, 2.776, 2.571, 2.447, 2.365, 2.306, 2.262, 2.228, 2.201, 2.179, 2.16, 2.145, 2.131, 2.12, 2.11, 2.101, 2.093, 2.086, 2.08, 2.074, 2.069, 2.064, 2.06, 2.056, 2.052, 2.048, 2.045, 2.042];
  return degreesOfFreedom <= 0 ? 12.706 : table[Math.min(table.length, degreesOfFreedom) - 1] || 1.96;
}

function design(date, origin, includeSeasonality) {
  const months = (date - origin) / (DAY_MS * 30.4375);
  if (!includeSeasonality) return [1, months];
  const angle = 2 * Math.PI * months / 12;
  return [1, months, Math.sin(angle), Math.cos(angle)];
}

function fitTemporalModel(dates, values) {
  const parsed = dates.map((date) => new Date(date));
  const origin = parsed[0];
  const spanDays = (parsed.at(-1) - origin) / DAY_MS;
  const includeSeasonality = values.length >= 12 && spanDays >= 540;
  const rows = parsed.map((date) => design(date, origin, includeSeasonality));
  const size = rows[0].length;
  const normal = Array.from({ length: size }, () => Array(size).fill(0));
  const target = Array(size).fill(0);
  rows.forEach((row, rowIndex) => {
    row.forEach((left, i) => {
      target[i] += left * values[rowIndex];
      row.forEach((right, j) => { normal[i][j] += left * right; });
    });
  });
  // Small ridge penalty stabilizes sparse and irregular satellite histories.
  for (let i = 1; i < size; i += 1) normal[i][i] += 0.05;
  const coefficients = solve(normal, target);
  const covarianceBasis = inverse(normal);
  const predict = (date) => design(new Date(date), origin, includeSeasonality).reduce((sum, value, index) => sum + value * coefficients[index], 0);
  const leverage = (date) => {
    const row = design(new Date(date), origin, includeSeasonality);
    return row.reduce((sum, left, i) => sum + left * row.reduce((inner, right, j) => inner + covarianceBasis[i][j] * right, 0), 0);
  };
  const residuals = parsed.map((date, index) => values[index] - predict(date));
  const degreesOfFreedom = Math.max(1, values.length - size);
  const rmse = Math.sqrt(residuals.reduce((sum, value) => sum + value ** 2, 0) / degreesOfFreedom);
  return { predict, leverage, rmse, degreesOfFreedom, includeSeasonality };
}

function forecastSeries(dates, values, months = 6) {
  const model = fitTemporalModel(dates, values);
  const lastDate = new Date(dates.at(-1));
  const futureDates = Array.from({ length: months }, (_, index) => {
    const date = new Date(lastDate);
    date.setUTCMonth(date.getUTCMonth() + index + 1);
    return date.toISOString();
  });
  const future = futureDates.map((date, index) => {
    const value = clamp(model.predict(date));
    const spread = tCritical95(model.degreesOfFreedom) * model.rmse * Math.sqrt(1 + Math.max(0, model.leverage(date)));
    return {
      value: +value.toFixed(3),
      lower: +clamp(value - spread).toFixed(3),
      upper: +clamp(value + spread).toFixed(3)
    };
  });
  return { future, futureDates, method: model.includeSeasonality ? "timestamp-aware seasonal ridge regression" : "timestamp-aware ridge trend", uncertainty: "95% prediction interval including fitted-parameter uncertainty" };
}

module.exports = { fitTemporalModel, forecastSeries };
