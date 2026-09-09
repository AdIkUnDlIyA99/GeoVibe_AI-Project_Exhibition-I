const test = require("node:test");
const assert = require("node:assert/strict");
const { once } = require("node:events");
const { selectCapture, server } = require("../server");

test("capture selection chooses the acquisition nearest the requested date", () => {
  const observations = [
    { id: "late", date: "2025-03-25T00:00:00Z" },
    { id: "near", date: "2025-03-17T00:00:00Z" },
    { id: "early", date: "2025-02-01T00:00:00Z" }
  ];
  const selected = selectCapture(observations, new Date("2025-03-15T12:00:00Z"), "baseline");
  assert.equal(selected.id, "near");
  assert.equal(selected.offsetDays, 2);
});

test("capture selection rejects acquisitions outside the tolerance", () => {
  assert.throws(() => selectCapture([{ date: "2024-01-01T00:00:00Z" }], new Date("2025-03-15T00:00:00Z"), "baseline"), /within 40 days/);
});

test("API rejects future comparison dates and browser retraining", async (context) => {
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  context.after(() => server.close());
  const { port } = server.address();
  const origin = `http://127.0.0.1:${port}`;
  const future = await fetch(`${origin}/api/analyze`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ beforeDate: "2025-01-01", afterDate: "2099-01-01", coordinates: { lat: 28.6, lon: 77.2 } })
  });
  assert.equal(future.status, 422);
  assert.match((await future.json()).error, /cannot be in the future/);
  assert.equal((await fetch(`${origin}/api/train`, { method: "POST" })).status, 404);
});
