/* Minimal ESM resolve hook so the local fixtures can use the `@/` alias that
   the Next.js tsconfig provides. Node only needs this for the test run. */
import { register } from "node:module";
import { pathToFileURL } from "node:url";

register("./alias-hooks.mjs", pathToFileURL("./tests/"));
