import { describe, expect, it } from "vitest";

import {
  compileFunctionExpression,
  normalizeFunctionExpression,
  parseFunctionObjectCommand,
} from "./functionExpression";

describe("functionExpression", () => {
  it("normalizes real elementary expressions with implicit multiplication", () => {
    expect(normalizeFunctionExpression("y = 2x sin(pi x) + sqrt(abs(x))")).toBe(
      "2x sin(pi x) + sqrt(abs(x))",
    );
  });

  it("evaluates composed real functions", () => {
    const evaluate = compileFunctionExpression("sin(x)+sqrt(abs(x))+exp(-x^2)");
    expect(evaluate(0)).toBeCloseTo(1);
    expect(evaluate(-4)).toBeCloseTo(Math.sin(-4) + 2 + Math.exp(-16));
  });

  it("parses Function(...) object commands", () => {
    expect(parseFunctionObjectCommand("f = Function(y = cosh(x) - 1)")).toEqual({
      id: "f",
      expression: "cosh(x) - 1",
    });
  });

  it("parses unnamed y-expressions for automatic naming", () => {
    expect(parseFunctionObjectCommand("y = x^2 + 1")).toEqual({
      expression: "x^2 + 1",
    });
  });

  it("parses bare expressions for automatic naming", () => {
    expect(parseFunctionObjectCommand("sin(x)")).toEqual({
      expression: "sin(x)",
    });
  });
});
