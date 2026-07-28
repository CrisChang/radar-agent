import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";

const require = createRequire(import.meta.url);

test("loads the Circle Wallets adapter through its compatible CJS export", () => {
  const adapter = require("@circle-fin/adapter-circle-wallets") as typeof import(
    "@circle-fin/adapter-circle-wallets"
  );

  assert.equal(typeof adapter.createCircleWalletsAdapter, "function");
});
