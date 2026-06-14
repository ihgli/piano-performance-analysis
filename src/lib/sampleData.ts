import { analyzePerformanceSet, type PerformanceTake, type PerformedNote, type ReferenceNote } from "./performanceMetrics";

export const performerLabReferenceNotes: ReferenceNote[] = [
  { id: "n01", pitch: "C4", expectedOnset: 0, expectedDuration: 0.48, expectedVelocity: 58, phraseId: "p1" },
  { id: "n02", pitch: "D4", expectedOnset: 0.5, expectedDuration: 0.48, expectedVelocity: 63, phraseId: "p1" },
  { id: "n03", pitch: "E4", expectedOnset: 1, expectedDuration: 0.48, expectedVelocity: 69, phraseId: "p1" },
  { id: "n04", pitch: "G4", expectedOnset: 1.5, expectedDuration: 0.62, expectedVelocity: 74, phraseId: "p1" },
  { id: "n05", pitch: "A4", expectedOnset: 2.25, expectedDuration: 0.36, expectedVelocity: 78, phraseId: "p2" },
  { id: "n06", pitch: "G4", expectedOnset: 2.65, expectedDuration: 0.36, expectedVelocity: 76, phraseId: "p2" },
  { id: "n07", pitch: "E4", expectedOnset: 3.05, expectedDuration: 0.36, expectedVelocity: 70, phraseId: "p2" },
  { id: "n08", pitch: "D4", expectedOnset: 3.45, expectedDuration: 0.68, expectedVelocity: 64, phraseId: "p2" },
  { id: "n09", pitch: "C4", expectedOnset: 4.35, expectedDuration: 0.48, expectedVelocity: 55, phraseId: "p3" },
  { id: "n10", pitch: "E4", expectedOnset: 4.85, expectedDuration: 0.48, expectedVelocity: 62, phraseId: "p3" },
  { id: "n11", pitch: "G4", expectedOnset: 5.35, expectedDuration: 0.48, expectedVelocity: 72, phraseId: "p3" },
  { id: "n12", pitch: "B4", expectedOnset: 5.85, expectedDuration: 0.7, expectedVelocity: 82, phraseId: "p3" },
  { id: "n13", pitch: "A4", expectedOnset: 6.75, expectedDuration: 0.42, expectedVelocity: 78, phraseId: "p4" },
  { id: "n14", pitch: "G4", expectedOnset: 7.2, expectedDuration: 0.42, expectedVelocity: 72, phraseId: "p4" },
  { id: "n15", pitch: "E4", expectedOnset: 7.65, expectedDuration: 0.42, expectedVelocity: 63, phraseId: "p4" },
  { id: "n16", pitch: "C4", expectedOnset: 8.1, expectedDuration: 0.9, expectedVelocity: 54, phraseId: "p4" },
];

export const expertReferencePerformedNotes: PerformedNote[] = [
  { referenceId: "n01", performedOnset: 0.01, performedDuration: 0.5, performedVelocity: 56 },
  { referenceId: "n02", performedOnset: 0.49, performedDuration: 0.47, performedVelocity: 62 },
  { referenceId: "n03", performedOnset: 0.98, performedDuration: 0.49, performedVelocity: 70 },
  { referenceId: "n04", performedOnset: 1.49, performedDuration: 0.68, performedVelocity: 77 },
  { referenceId: "n05", performedOnset: 2.3, performedDuration: 0.34, performedVelocity: 79 },
  { referenceId: "n06", performedOnset: 2.68, performedDuration: 0.35, performedVelocity: 75 },
  { referenceId: "n07", performedOnset: 3.06, performedDuration: 0.35, performedVelocity: 68 },
  { referenceId: "n08", performedOnset: 3.48, performedDuration: 0.76, performedVelocity: 61 },
  { referenceId: "n09", performedOnset: 4.4, performedDuration: 0.49, performedVelocity: 54 },
  { referenceId: "n10", performedOnset: 4.88, performedDuration: 0.48, performedVelocity: 63 },
  { referenceId: "n11", performedOnset: 5.37, performedDuration: 0.51, performedVelocity: 74 },
  { referenceId: "n12", performedOnset: 5.89, performedDuration: 0.78, performedVelocity: 84 },
  { referenceId: "n13", performedOnset: 6.81, performedDuration: 0.42, performedVelocity: 77 },
  { referenceId: "n14", performedOnset: 7.25, performedDuration: 0.44, performedVelocity: 71 },
  { referenceId: "n15", performedOnset: 7.72, performedDuration: 0.45, performedVelocity: 62 },
  { referenceId: "n16", performedOnset: 8.21, performedDuration: 1.02, performedVelocity: 51 },
];

export const studentTakeAPerformedNotes: PerformedNote[] = [
  { referenceId: "n01", performedOnset: 0.06, performedDuration: 0.43, performedVelocity: 62 },
  { referenceId: "n02", performedOnset: 0.45, performedDuration: 0.57, performedVelocity: 58 },
  { referenceId: "n03", performedOnset: 1.08, performedDuration: 0.4, performedVelocity: 76 },
  { referenceId: "n04", performedOnset: 1.58, performedDuration: 0.52, performedVelocity: 69 },
  { referenceId: "n05", performedOnset: 2.18, performedDuration: 0.29, performedVelocity: 87 },
  { referenceId: "n06", performedOnset: 2.74, performedDuration: 0.47, performedVelocity: 68 },
  { referenceId: "n07", performedOnset: 2.98, performedDuration: 0.31, performedVelocity: 75 },
  { referenceId: "n08", performedOnset: 3.6, performedDuration: 0.54, performedVelocity: 66 },
  { referenceId: "n09", performedOnset: 4.26, performedDuration: 0.59, performedVelocity: 61 },
  { referenceId: "n10", performedOnset: 4.95, performedDuration: 0.39, performedVelocity: 56 },
  { referenceId: "n11", performedOnset: 5.31, performedDuration: 0.61, performedVelocity: 81 },
  { referenceId: "n12", performedOnset: 5.99, performedDuration: 0.55, performedVelocity: 78 },
  { referenceId: "n13", performedOnset: 6.62, performedDuration: 0.36, performedVelocity: 84 },
  { referenceId: "n14", performedOnset: 7.31, performedDuration: 0.53, performedVelocity: 66 },
  { referenceId: "n15", performedOnset: 7.54, performedDuration: 0.38, performedVelocity: 70 },
  { referenceId: "n16", performedOnset: 8.29, performedDuration: 0.77, performedVelocity: 57 },
];

export const studentTakeBPerformedNotes: PerformedNote[] = [
  { referenceId: "n01", performedOnset: 0.02, performedDuration: 0.48, performedVelocity: 60 },
  { referenceId: "n02", performedOnset: 0.52, performedDuration: 0.49, performedVelocity: 62 },
  { referenceId: "n03", performedOnset: 1.02, performedDuration: 0.5, performedVelocity: 64 },
  { referenceId: "n04", performedOnset: 1.53, performedDuration: 0.61, performedVelocity: 66 },
  { referenceId: "n05", performedOnset: 2.28, performedDuration: 0.38, performedVelocity: 68 },
  { referenceId: "n06", performedOnset: 2.68, performedDuration: 0.37, performedVelocity: 67 },
  { referenceId: "n07", performedOnset: 3.08, performedDuration: 0.36, performedVelocity: 65 },
  { referenceId: "n08", performedOnset: 3.5, performedDuration: 0.69, performedVelocity: 63 },
  { referenceId: "n09", performedOnset: 4.37, performedDuration: 0.49, performedVelocity: 59 },
  { referenceId: "n10", performedOnset: 4.87, performedDuration: 0.47, performedVelocity: 62 },
  { referenceId: "n11", performedOnset: 5.36, performedDuration: 0.48, performedVelocity: 66 },
  { referenceId: "n12", performedOnset: 5.86, performedDuration: 0.7, performedVelocity: 70 },
  { referenceId: "n13", performedOnset: 6.76, performedDuration: 0.43, performedVelocity: 68 },
  { referenceId: "n14", performedOnset: 7.21, performedDuration: 0.41, performedVelocity: 66 },
  { referenceId: "n15", performedOnset: 7.67, performedDuration: 0.42, performedVelocity: 63 },
  { referenceId: "n16", performedOnset: 8.13, performedDuration: 0.91, performedVelocity: 60 },
];

export const performerLabSampleTakes: PerformanceTake[] = [
  {
    id: "student-take-a",
    label: "学生演奏 A",
    instrument: "piano",
    performerKind: "student",
    referenceNotes: performerLabReferenceNotes,
    performedNotes: studentTakeAPerformedNotes,
  },
  {
    id: "student-take-b",
    label: "学生演奏 B",
    instrument: "piano",
    performerKind: "student",
    referenceNotes: performerLabReferenceNotes,
    performedNotes: studentTakeBPerformedNotes,
  },
  {
    id: "expert-reference",
    label: "专家参考版本",
    instrument: "piano",
    performerKind: "expert",
    referenceNotes: performerLabReferenceNotes,
    performedNotes: expertReferencePerformedNotes,
  },
];

export const performerLabSampleAnalyses = analyzePerformanceSet(
  performerLabSampleTakes,
  "expert-reference",
);
