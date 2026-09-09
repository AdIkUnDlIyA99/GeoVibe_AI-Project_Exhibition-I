const test = require("node:test");
const assert = require("node:assert/strict");
const { forecastSeries } = require("../src/timeseries");

test("forecast uses calendar months and emits bounded uncertainty intervals", () => {
  const dates = ["2024-01-05", "2024-03-20", "2024-06-12", "2024-10-02", "2025-01-11", "2025-05-22"];
  const values = [0.2, 0.25, 0.31, 0.38, 0.43, 0.49];
  const result = forecastSeries(dates, values);
  assert.equal(result.future.length, 6);
  assert.equal(result.futureDates.length, 6);
  result.future.forEach((point) => {
    assert.ok(point.lower <= point.value);
    assert.ok(point.value <= point.upper);
    assert.ok(point.lower >= -1 && point.upper <= 1);
  });
  assert.equal(new Date(result.futureDates[0]).getUTCMonth(), 5);
});

test("seasonal model activates only when history spans enough time", () => {
  const dates = Array.from({ length: 24 }, (_, index) => new Date(Date.UTC(2024, index, 1)).toISOString());
  const values = dates.map((_, index) => 0.4 + Math.sin(2 * Math.PI * index / 12) * 0.2);
  assert.match(forecastSeries(dates, values).method, /seasonal/);
});

test("short histories do not overfit annual seasonality", () => {
  const dates = Array.from({ length: 10 }, (_, index) => new Date(Date.UTC(2025, index, 1)).toISOString());
  const values = dates.map((_, index) => 0.3 + index * 0.01);
  assert.doesNotMatch(forecastSeries(dates, values).method, /seasonal/);
});
