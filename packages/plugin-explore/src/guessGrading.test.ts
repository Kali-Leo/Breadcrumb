/**
 * Purpose: tests for concept guess grading thresholds and feedback lines — boundary values
 * at each cosine cutoff and the exact plain-statement wording per grade.
 */
import { describe, expect, it } from "vitest";
import {
  CLOSE_COSINE_THRESHOLD,
  CORRECT_COSINE_THRESHOLD,
  gradeConceptGuess,
  guessFeedbackLine,
} from "./guessGrading";

describe("gradeConceptGuess", () => {
  it("grades correct at and above the correct threshold", () => {
    expect(gradeConceptGuess(CORRECT_COSINE_THRESHOLD)).toBe("correct");
    expect(gradeConceptGuess(1)).toBe("correct");
  });

  it("grades close between the two thresholds", () => {
    expect(gradeConceptGuess(CLOSE_COSINE_THRESHOLD)).toBe("close");
    expect(gradeConceptGuess(CORRECT_COSINE_THRESHOLD - 0.001)).toBe("close");
  });

  it("grades wrong below the close threshold", () => {
    expect(gradeConceptGuess(CLOSE_COSINE_THRESHOLD - 0.001)).toBe("wrong");
    expect(gradeConceptGuess(0)).toBe("wrong");
  });
});

describe("guessFeedbackLine", () => {
  const summary = "光合作用把光能转化为化学能。";

  it("states correctness plainly then gives the summary", () => {
    expect(guessFeedbackLine("correct", summary)).toBe(`对。${summary}`);
  });

  it("names it as close without judgment before the summary", () => {
    expect(guessFeedbackLine("close", summary)).toBe(`接近。它是指：${summary}`);
  });

  it("gives the summary directly with no penalty language when wrong", () => {
    expect(guessFeedbackLine("wrong", summary)).toBe(`它是指：${summary}`);
  });
});
