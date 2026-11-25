import assert from "node:assert/strict";
import fs from "node:fs";
import { syncBuiltinESMExports } from "node:module";
import test from "node:test";
import { HttpError } from "../server/http.mjs";

test("the server domain API runs without reading browser bundles", async () => {
  const readFileSync = fs.readFileSync;
  fs.readFileSync = function (path, ...args) {
    const value = String(path);
    if (/dist[\\/]((app|workspace)\.js)$/.test(value)) {
      throw new Error(`browser bundle access is forbidden in this test: ${value}`);
    }
    return readFileSync.call(this, path, ...args);
  };
  syncBuiltinESMExports();

  try {
    const { createDomain } = await import("../server/domain.mjs?without-browser-bundles");
    const domain = createDomain(null, "actor_a");
    assert.equal(domain.state.currentUserId, "actor_a");
    assert.throws(
      () => domain.call("notACommand"),
      (error) => error instanceof HttpError && error.status === 422 && error.code === "UNKNOWN_COMMAND",
    );
    const analysis = domain.call("scheduleAnalysis", []);
    assert.deepEqual(analysis, {
      valid: true,
      reliable: false,
      startDate: analysis.startDate,
      finishDate: "",
      durationDays: 0,
      rows: [],
      message: "Não há atividades ativas para calcular a previsão.",
    });
  } finally {
    fs.readFileSync = readFileSync;
    syncBuiltinESMExports();
  }
});
