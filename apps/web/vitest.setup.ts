import "@testing-library/jest-dom/vitest";
import { vi } from "vitest";

// next/font loaders are compiled by Next, not run. Under Vitest any loader
// returns inert class names, so components may scope their own fonts.
vi.mock("next/font/google", () => {
  const loader = () => ({ className: "", variable: "", style: { fontFamily: "" } });
  const isLoader = (key: string | symbol) => typeof key === "string" && key !== "then" && key !== "__esModule";
  return new Proxy({}, {
    get: (_target, key) => (isLoader(key) ? loader : undefined),
    has: (_target, key) => isLoader(key),
  });
});
