/**
 * The demand board is advice a driver acts on by spending fuel, so a label that
 * is wrong costs him money. The rule being pinned here is that BUSY means
 * "riders here are not being served", never "lots of riders here".
 */

import { describe, expect, it } from "vitest";
import { demandLevel } from "../src/modules/demand-math";

describe("labelling a zone", () => {
  it("calls an empty zone quiet however many bikes are sitting in it", () => {
    expect(demandLevel(0, 0)).toBe("QUIET");
    expect(demandLevel(0, 30)).toBe("QUIET");
  });

  it("does not call a crowd busy when it is already served", () => {
    // Twelve waiting at Checkpoint with thirty bikes parked there is not a
    // reason to ride over. This is the case a raw count gets wrong.
    expect(demandLevel(12, 30)).toBe("QUIET");
  });

  it("calls a crowd busy when there are not enough bikes for it", () => {
    expect(demandLevel(12, 3)).toBe("BUSY");
  });

  it("calls two riders and no bike busy, however small the number", () => {
    // Bokwaongo with two riders and nothing in sight is the best fare on the
    // mountain, and the board has to say so.
    expect(demandLevel(2, 0)).toBe("BUSY");
  });

  it("sits at steady in between", () => {
    expect(demandLevel(4, 5)).toBe("STEADY");
    expect(demandLevel(1, 0)).toBe("STEADY");
  });

  it("never divides by zero", () => {
    expect(() => demandLevel(5, 0)).not.toThrow();
    expect(demandLevel(5, 0)).toBe("BUSY");
  });

  it("is monotonic in riders and in bikes", () => {
    const rank = { QUIET: 0, STEADY: 1, BUSY: 2 } as const;
    for (let bikes = 0; bikes <= 20; bikes += 1) {
      for (let riders = 0; riders < 40; riders += 1) {
        // More riders never makes a zone quieter.
        expect(rank[demandLevel(riders + 1, bikes)]).toBeGreaterThanOrEqual(rank[demandLevel(riders, bikes)]);
        // More bikes never makes a zone busier.
        expect(rank[demandLevel(riders, bikes + 1)]).toBeLessThanOrEqual(rank[demandLevel(riders, bikes)]);
      }
    }
  });
});
