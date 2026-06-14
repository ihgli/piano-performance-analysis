import { describe, expect, it } from "vitest";

import { compareAudioAnalyses, type AudioAnalysisResult } from "./audioAnalysis";

describe("compareAudioAnalyses", () => {
  it("scores matching performer and expert audio features as close", () => {
    const expert = makeAudioAnalysis({
      rms: [0.1, 0.25, 0.5, 0.35, 0.2],
      onset: [0, 0.8, 0.1, 0.6, 0.05],
      onsetRatePerSecond: 2.2,
    });
    const student = makeAudioAnalysis({
      rms: [0.11, 0.24, 0.48, 0.36, 0.21],
      onset: [0, 0.78, 0.12, 0.58, 0.05],
      onsetRatePerSecond: 2.25,
    });

    const comparison = compareAudioAnalyses(student, expert);

    expect(comparison.overallSimilarity).toBeGreaterThan(85);
    expect(comparison.dynamicSimilarity).toBeGreaterThan(95);
    expect(comparison.onsetSimilarity).toBeGreaterThan(95);
  });

  it("penalizes weak dynamic and pacing similarity", () => {
    const expert = makeAudioAnalysis({
      rms: [0.1, 0.25, 0.5, 0.35, 0.2],
      onset: [0, 0.8, 0.1, 0.6, 0.05],
      onsetRatePerSecond: 2.2,
    });
    const student = makeAudioAnalysis({
      rms: [0.55, 0.16, 0.12, 0.18, 0.5],
      onset: [0.5, 0.05, 0.65, 0.02, 0.7],
      onsetRatePerSecond: 4.2,
    });

    const comparison = compareAudioAnalyses(student, expert);

    expect(comparison.overallSimilarity).toBeLessThan(75);
    expect(comparison.dynamicSimilarity).toBeLessThan(75);
    expect(comparison.pacingSimilarity).toBeLessThan(35);
  });
});

function makeAudioAnalysis({
  rms,
  onset,
  onsetRatePerSecond,
}: {
  rms: number[];
  onset: number[];
  onsetRatePerSecond: number;
}): AudioAnalysisResult {
  return {
    fileName: "test.wav",
    durationSeconds: 12,
    sampleRate: 44_100,
    channelCount: 1,
    integratedRms: 0.09,
    peakAmplitude: 0.7,
    dynamicRangeDb: 18,
    crestFactorDb: 8,
    estimatedOnsets: Math.round(onsetRatePerSecond * 12),
    onsetRatePerSecond,
    silenceRatio: 0.05,
    rmsCurve: rms.map((value, index) => ({ label: String(index + 1), value })),
    onsetCurve: onset.map((value, index) => ({ label: String(index + 1), value })),
    warnings: [],
  };
}
