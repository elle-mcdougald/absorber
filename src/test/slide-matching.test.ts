import { describe, it, expect } from "vitest";
import { pickSlide } from "@/lib/absorber";

const slides = [
  { id: "a", embedding: [1, 0, 0] },
  { id: "b", embedding: [0, 1, 0] },
  { id: "c", embedding: [0, 0, 1] },
];

describe("pickSlide", () => {
  it("switches when another slide clearly matches better", () => {
    expect(pickSlide([0, 0, 1], slides, 0)).toBe(2);
  });
  it("stays on the current slide when the difference is tiny", () => {
    expect(pickSlide([1, 1.02, 0], slides, 0)).toBe(0);
  });
});
