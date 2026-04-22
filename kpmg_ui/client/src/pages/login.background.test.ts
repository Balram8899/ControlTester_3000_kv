import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const loginSource = readFileSync(resolve("client/src/pages/login.tsx"), "utf8");
const animationPath = resolve("client/public/pkg-background.lottie");

assert.match(
  loginSource,
  /DotLottieReact/,
  "Login backdrop should render the supplied Lottie animation with the DotLottie player",
);

assert.match(
  loginSource,
  /LOGIN_BACKGROUND_ANIMATION_SRC/,
  "Login backdrop should use the named background animation source",
);

assert.match(
  loginSource,
  /login-backdrop/,
  "Login page should render the supplied Lottie animation across the full background",
);

assert.match(
  loginSource,
  /login-background-canvas/,
  "Login background canvas should be positioned independently so the animation fills the viewport",
);

assert.match(
  loginSource,
  /login-centered-panel/,
  "Login form should sit in a centered panel above the animated background",
);

assert.match(
  loginSource,
  /max-w-\[420px\]/,
  "Login panel should stay compact relative to the animated background",
);

assert.equal(
  loginSource.includes("login-animation-panel"),
  false,
  "Login page should not use the split right-side animation panel layout",
);

assert.equal(
  loginSource.includes("bg-[linear-gradient(90deg,#7213EA_0%,#1E49E2_100%)]"),
  false,
  "Login panel should not show the old highlighted top accent strip",
);

assert.equal(
  loginSource.includes("KPMG TRACE"),
  false,
  "Login panel should not show the highlighted workspace label",
);

assert.equal(
  loginSource.includes("Restricted workspace"),
  false,
  "Login panel should not show the highlighted restricted workspace label",
);

assert.equal(
  loginSource.includes("Demo credentials"),
  false,
  "Login panel should not show the highlighted demo credentials box",
);

assert.equal(
  existsSync(animationPath),
  true,
  "Login background Lottie asset should be bundled from client/public",
);
