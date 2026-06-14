export type NoteId = string;
export type PhraseId = string;
export type InstrumentScope = "piano";

export interface ReferenceNote {
  id: NoteId;
  pitch: string;
  expectedOnset: number;
  expectedDuration: number;
  expectedVelocity: number;
  phraseId: PhraseId;
}

export interface PerformedNote {
  referenceId: NoteId;
  performedOnset: number;
  performedDuration: number;
  performedVelocity: number;
}

export interface PerformanceTake {
  id: string;
  label: string;
  instrument: InstrumentScope;
  performerKind: "student" | "expert" | "reference";
  referenceNotes: ReferenceNote[];
  performedNotes: PerformedNote[];
}

export interface AlignedPerformanceNote {
  reference: ReferenceNote;
  performed: PerformedNote;
  index: number;
}

export interface TempoCurvePoint {
  index: number;
  noteId: NoteId;
  expectedOnset: number;
  performedOnset: number;
  localTempoRatio: number;
}

export interface DynamicCurvePoint {
  index: number;
  noteId: NoteId;
  expectedOnset: number;
  expectedVelocity: number;
  performedVelocity: number;
}

export interface OnsetDeviationPoint {
  index: number;
  noteId: NoteId;
  expectedOnset: number;
  performedOnset: number;
  deviation: number;
  absoluteDeviation: number;
}

export interface ArticulationRatioPoint {
  index: number;
  noteId: NoteId;
  expectedDuration: number;
  performedDuration: number;
  ratio: number;
}

export interface PhraseSummary {
  phraseId: PhraseId;
  noteCount: number;
  expectedStart: number;
  expectedEnd: number;
  performedStart: number;
  performedEnd: number;
  meanOnsetDeviation: number;
  onsetDeviationRms: number;
  meanTempoRatio: number;
  tempoVariation: number;
  dynamicRange: number;
  dynamicSlope: number;
  meanArticulationRatio: number;
  articulationVariation: number;
  stabilityScore: number;
}

export interface PerformanceEvidence {
  tempoCurve: TempoCurvePoint[];
  dynamicCurve: DynamicCurvePoint[];
  onsetDeviations: OnsetDeviationPoint[];
  articulationRatios: ArticulationRatioPoint[];
  phraseSummaries: PhraseSummary[];
}

export interface PerformanceScores {
  timingExpressivity: number;
  dynamicShaping: number;
  articulationControl: number;
  phraseCoherence: number;
  performanceStability: number;
  styleDistance: number;
}

export interface PerformanceAnalysisOptions {
  styleReference?: PerformedNote[];
}

export interface PerformanceAnalysisResult {
  alignedNotes: AlignedPerformanceNote[];
  scores: PerformanceScores;
  evidence: PerformanceEvidence;
}

export function analyzePerformance(
  take: PerformanceTake,
  options: PerformanceAnalysisOptions = {},
): PerformanceAnalysisResult {
  const alignedNotes = alignPerformanceNotes(take.referenceNotes, take.performedNotes);
  const evidence = buildPerformanceEvidence(alignedNotes);
  const scores = computePerformanceScores(
    alignedNotes,
    evidence,
    options.styleReference
      ? buildPerformanceEvidence(alignPerformanceNotes(take.referenceNotes, options.styleReference))
      : undefined,
  );

  return {
    alignedNotes,
    scores,
    evidence,
  };
}

export function analyzePerformanceSet(
  takes: PerformanceTake[],
  styleReferenceTakeId?: string,
): Record<string, PerformanceAnalysisResult> {
  const styleReference =
    styleReferenceTakeId === undefined
      ? undefined
      : takes.find((take) => take.id === styleReferenceTakeId)?.performedNotes;

  return Object.fromEntries(
    takes.map((take) => [
      take.id,
      analyzePerformance(take, {
        styleReference,
      }),
    ]),
  );
}

export function alignPerformanceNotes(
  referenceNotes: ReferenceNote[],
  performedNotes: PerformedNote[],
): AlignedPerformanceNote[] {
  const performedByReferenceId = new Map(
    performedNotes.map((note) => [note.referenceId, note] as const),
  );

  return referenceNotes.flatMap((reference, index) => {
    const performed = performedByReferenceId.get(reference.id);
    return performed === undefined ? [] : [{ reference, performed, index }];
  });
}

export function buildPerformanceEvidence(
  alignedNotes: AlignedPerformanceNote[],
): PerformanceEvidence {
  return {
    tempoCurve: buildTempoCurve(alignedNotes),
    dynamicCurve: alignedNotes.map(({ reference, performed, index }) => ({
      index,
      noteId: reference.id,
      expectedOnset: reference.expectedOnset,
      expectedVelocity: reference.expectedVelocity,
      performedVelocity: performed.performedVelocity,
    })),
    onsetDeviations: alignedNotes.map(({ reference, performed, index }) => {
      const deviation = performed.performedOnset - reference.expectedOnset;
      return {
        index,
        noteId: reference.id,
        expectedOnset: reference.expectedOnset,
        performedOnset: performed.performedOnset,
        deviation,
        absoluteDeviation: Math.abs(deviation),
      };
    }),
    articulationRatios: alignedNotes.map(({ reference, performed, index }) => ({
      index,
      noteId: reference.id,
      expectedDuration: reference.expectedDuration,
      performedDuration: performed.performedDuration,
      ratio: safeDivide(performed.performedDuration, reference.expectedDuration, 1),
    })),
    phraseSummaries: buildPhraseSummaries(alignedNotes),
  };
}

function computePerformanceScores(
  alignedNotes: AlignedPerformanceNote[],
  evidence: PerformanceEvidence,
  styleReferenceEvidence?: PerformanceEvidence,
): PerformanceScores {
  const onsetDeviations = evidence.onsetDeviations.map((point) => point.deviation);
  const absoluteOnsetDeviations = evidence.onsetDeviations.map((point) => point.absoluteDeviation);
  const tempoRatios = evidence.tempoCurve.map((point) => point.localTempoRatio);
  const articulationRatios = evidence.articulationRatios.map((point) => point.ratio);
  const expectedVelocities = evidence.dynamicCurve.map((point) => point.expectedVelocity);
  const performedVelocities = evidence.dynamicCurve.map((point) => point.performedVelocity);
  const velocityErrors = evidence.dynamicCurve.map(
    (point) => point.performedVelocity - point.expectedVelocity,
  );

  const tempoVariation = standardDeviation(tempoRatios);
  const tempoSmoothness = scoreFromError(successiveDifferenceRms(tempoRatios), 0.09);
  const expressiveVariation = peakScore(tempoVariation, 0.055, 0.07);
  const timingRecovery = scoreFromError(mean(absoluteOnsetDeviations), 0.095);
  const timingExpressivity = weightedAverage([
    [expressiveVariation, 0.42],
    [tempoSmoothness, 0.34],
    [timingRecovery, 0.24],
  ]);

  const velocityCorrelation = normalizedCorrelation(expectedVelocities, performedVelocities);
  const expectedRange = range(expectedVelocities);
  const performedRange = range(performedVelocities);
  const dynamicRangeScore =
    expectedRange < 1
      ? scoreFromError(performedRange, 16)
      : scoreFromError(Math.abs(performedRange - expectedRange), 18);
  const dynamicSmoothness = scoreFromError(successiveDifferenceRms(performedVelocities), 14);
  const dynamicShaping = weightedAverage([
    [velocityCorrelation, 0.5],
    [dynamicRangeScore, 0.28],
    [dynamicSmoothness, 0.22],
  ]);

  const articulationInRange =
    ratioOf(articulationRatios, (ratio) => ratio >= 0.55 && ratio <= 1.35) * 100;
  const articulationStability = scoreFromError(standardDeviation(articulationRatios), 0.18);
  const articulationSmoothness = scoreFromError(successiveDifferenceRms(articulationRatios), 0.16);
  const articulationControl = weightedAverage([
    [articulationInRange, 0.36],
    [articulationStability, 0.38],
    [articulationSmoothness, 0.26],
  ]);

  const phraseStability = mean(evidence.phraseSummaries.map((phrase) => phrase.stabilityScore));
  const phraseShape = mean(
    evidence.phraseSummaries.map((phrase) =>
      weightedAverage([
        [peakScore(Math.abs(phrase.dynamicSlope), 5.5, 8), 0.45],
        [scoreFromError(phrase.tempoVariation, 0.075), 0.35],
        [scoreFromError(Math.abs(phrase.meanArticulationRatio - 1), 0.15), 0.2],
      ]),
    ),
  );
  const phraseBoundaryControl = scoreFromError(
    standardDeviation(evidence.phraseSummaries.map((phrase) => phrase.meanOnsetDeviation)),
    0.07,
  );
  const phraseCoherence = weightedAverage([
    [phraseStability, 0.48],
    [phraseShape, 0.34],
    [phraseBoundaryControl, 0.18],
  ]);

  const timingAccuracy = scoreFromError(rms(onsetDeviations), 0.08);
  const durationAccuracy = scoreFromError(
    rms(articulationRatios.map((ratio) => ratio - 1)),
    0.14,
  );
  const velocityAccuracy = scoreFromError(rms(velocityErrors), 13);
  const performanceStability = weightedAverage([
    [timingAccuracy, 0.45],
    [durationAccuracy, 0.3],
    [velocityAccuracy, 0.25],
  ]);

  return {
    timingExpressivity: roundScore(timingExpressivity),
    dynamicShaping: roundScore(dynamicShaping),
    articulationControl: roundScore(articulationControl),
    phraseCoherence: roundScore(phraseCoherence),
    performanceStability: roundScore(performanceStability),
    // Distance is intentionally inverted from the other metrics: 0 means close to the style reference.
    styleDistance: roundScore(computeStyleDistance(evidence, styleReferenceEvidence, alignedNotes)),
  };
}

function buildTempoCurve(alignedNotes: AlignedPerformanceNote[]): TempoCurvePoint[] {
  return alignedNotes.map(({ reference, performed, index }, arrayIndex) => {
    const previous = alignedNotes[arrayIndex - 1];
    const expectedDelta =
      previous === undefined
        ? reference.expectedDuration
        : reference.expectedOnset - previous.reference.expectedOnset;
    const performedDelta =
      previous === undefined
        ? performed.performedDuration
        : performed.performedOnset - previous.performed.performedOnset;

    return {
      index,
      noteId: reference.id,
      expectedOnset: reference.expectedOnset,
      performedOnset: performed.performedOnset,
      localTempoRatio: clamp(safeDivide(expectedDelta, performedDelta, 1), 0.45, 1.8),
    };
  });
}

function buildPhraseSummaries(alignedNotes: AlignedPerformanceNote[]): PhraseSummary[] {
  const byPhrase = new Map<PhraseId, AlignedPerformanceNote[]>();

  for (const note of alignedNotes) {
    const phraseNotes = byPhrase.get(note.reference.phraseId) ?? [];
    phraseNotes.push(note);
    byPhrase.set(note.reference.phraseId, phraseNotes);
  }

  return Array.from(byPhrase.entries()).map(([phraseId, phraseNotes]) => {
    const first = phraseNotes[0];
    const last = phraseNotes[phraseNotes.length - 1];
    const onsetDeviations = phraseNotes.map(
      (note) => note.performed.performedOnset - note.reference.expectedOnset,
    );
    const tempoRatios = buildTempoCurve(phraseNotes).map((point) => point.localTempoRatio);
    const velocities = phraseNotes.map((note) => note.performed.performedVelocity);
    const articulationRatios = phraseNotes.map((note) =>
      safeDivide(note.performed.performedDuration, note.reference.expectedDuration, 1),
    );
    const expectedOffsets = phraseNotes.map(
      (note) => note.reference.expectedOnset - first.reference.expectedOnset,
    );
    const dynamicSlope = linearSlope(expectedOffsets, velocities);
    const tempoVariation = standardDeviation(tempoRatios);
    const articulationVariation = standardDeviation(articulationRatios);
    const onsetDeviationRms = rms(onsetDeviations);
    const stabilityScore = weightedAverage([
      [scoreFromError(onsetDeviationRms, 0.08), 0.42],
      [scoreFromError(tempoVariation, 0.08), 0.32],
      [scoreFromError(articulationVariation, 0.16), 0.26],
    ]);

    return {
      phraseId,
      noteCount: phraseNotes.length,
      expectedStart: first.reference.expectedOnset,
      expectedEnd: last.reference.expectedOnset + last.reference.expectedDuration,
      performedStart: first.performed.performedOnset,
      performedEnd: last.performed.performedOnset + last.performed.performedDuration,
      meanOnsetDeviation: mean(onsetDeviations),
      onsetDeviationRms,
      meanTempoRatio: mean(tempoRatios),
      tempoVariation,
      dynamicRange: range(velocities),
      dynamicSlope,
      meanArticulationRatio: mean(articulationRatios),
      articulationVariation,
      stabilityScore,
    };
  });
}

function computeStyleDistance(
  evidence: PerformanceEvidence,
  styleReferenceEvidence: PerformanceEvidence | undefined,
  alignedNotes: AlignedPerformanceNote[],
): number {
  const baselineEvidence =
    styleReferenceEvidence ?? buildPerformanceEvidence(asNeutralPerformedNotes(alignedNotes));
  const current = extractStyleFeatures(evidence);
  const baseline = extractStyleFeatures(baselineEvidence);
  const weightedSquaredDistance = Object.keys(current).reduce((sum, key) => {
    const featureKey = key as keyof StyleFeatures;
    const delta = current[featureKey] - baseline[featureKey];
    const weight = styleFeatureWeights[featureKey];
    return sum + delta * delta * weight;
  }, 0);

  return clamp(Math.sqrt(weightedSquaredDistance) * 100, 0, 100);
}

interface StyleFeatures {
  meanTempoRatio: number;
  tempoVariation: number;
  meanArticulationRatio: number;
  articulationVariation: number;
  meanVelocity: number;
  velocityRange: number;
  phraseDynamicSlope: number;
}

const styleFeatureWeights: Record<keyof StyleFeatures, number> = {
  meanTempoRatio: 1.25,
  tempoVariation: 1.2,
  meanArticulationRatio: 1.05,
  articulationVariation: 0.85,
  meanVelocity: 0.85,
  velocityRange: 0.7,
  phraseDynamicSlope: 0.95,
};

function extractStyleFeatures(evidence: PerformanceEvidence): StyleFeatures {
  const tempoRatios = evidence.tempoCurve.map((point) => point.localTempoRatio);
  const articulationRatios = evidence.articulationRatios.map((point) => point.ratio);
  const velocities = evidence.dynamicCurve.map((point) => point.performedVelocity);
  const slopes = evidence.phraseSummaries.map((phrase) => phrase.dynamicSlope);

  return {
    meanTempoRatio: normalizedFeature(mean(tempoRatios), 1, 0.16),
    tempoVariation: normalizedFeature(standardDeviation(tempoRatios), 0.06, 0.12),
    meanArticulationRatio: normalizedFeature(mean(articulationRatios), 1, 0.18),
    articulationVariation: normalizedFeature(standardDeviation(articulationRatios), 0.12, 0.16),
    meanVelocity: normalizedFeature(mean(velocities), 72, 28),
    velocityRange: normalizedFeature(range(velocities), 28, 24),
    phraseDynamicSlope: normalizedFeature(mean(slopes), 0, 14),
  };
}

function asNeutralPerformedNotes(alignedNotes: AlignedPerformanceNote[]): AlignedPerformanceNote[] {
  return alignedNotes.map(({ reference, index }) => ({
    reference,
    index,
    performed: {
      referenceId: reference.id,
      performedOnset: reference.expectedOnset,
      performedDuration: reference.expectedDuration,
      performedVelocity: reference.expectedVelocity,
    },
  }));
}

function normalizedFeature(value: number, center: number, scale: number): number {
  return safeDivide(value - center, scale, 0);
}

function normalizedCorrelation(xs: number[], ys: number[]): number {
  const value = correlation(xs, ys);
  if (!Number.isFinite(value)) {
    return 50;
  }

  return clamp((value + 1) * 50, 0, 100);
}

function weightedAverage(values: Array<[value: number, weight: number]>): number {
  const usableValues = values.filter(([value, weight]) => Number.isFinite(value) && weight > 0);
  const totalWeight = sum(usableValues.map(([, weight]) => weight));
  if (totalWeight === 0) {
    return 0;
  }

  return sum(usableValues.map(([value, weight]) => value * weight)) / totalWeight;
}

function scoreFromError(error: number, tolerance: number): number {
  if (!Number.isFinite(error) || tolerance <= 0) {
    return 0;
  }

  const normalizedError = error / tolerance;
  return clamp(100 / (1 + normalizedError * normalizedError), 0, 100);
}

function peakScore(value: number, target: number, width: number): number {
  if (!Number.isFinite(value) || width <= 0) {
    return 0;
  }

  const normalizedDistance = (value - target) / width;
  return clamp(100 * Math.exp(-normalizedDistance * normalizedDistance), 0, 100);
}

function linearSlope(xs: number[], ys: number[]): number {
  if (xs.length !== ys.length || xs.length < 2) {
    return 0;
  }

  const xMean = mean(xs);
  const yMean = mean(ys);
  const denominator = sum(xs.map((x) => (x - xMean) ** 2));
  if (denominator === 0) {
    return 0;
  }

  return sum(xs.map((x, index) => (x - xMean) * (ys[index] - yMean))) / denominator;
}

function correlation(xs: number[], ys: number[]): number {
  if (xs.length !== ys.length || xs.length < 2) {
    return Number.NaN;
  }

  const xStd = standardDeviation(xs);
  const yStd = standardDeviation(ys);
  if (xStd === 0 || yStd === 0) {
    return Number.NaN;
  }

  const xMean = mean(xs);
  const yMean = mean(ys);
  return (
    sum(xs.map((x, index) => (x - xMean) * (ys[index] - yMean))) /
    (xs.length * xStd * yStd)
  );
}

function successiveDifferenceRms(values: number[]): number {
  if (values.length < 2) {
    return 0;
  }

  return rms(values.slice(1).map((value, index) => value - values[index]));
}

function standardDeviation(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }

  const average = mean(values);
  return Math.sqrt(mean(values.map((value) => (value - average) ** 2)));
}

function rms(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }

  return Math.sqrt(mean(values.map((value) => value * value)));
}

function range(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }

  return Math.max(...values) - Math.min(...values);
}

function ratioOf<T>(values: T[], predicate: (value: T) => boolean): number {
  if (values.length === 0) {
    return 0;
  }

  return values.filter(predicate).length / values.length;
}

function mean(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }

  return sum(values) / values.length;
}

function sum(values: number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

function safeDivide(numerator: number, denominator: number, fallback: number): number {
  if (denominator === 0 || !Number.isFinite(numerator) || !Number.isFinite(denominator)) {
    return fallback;
  }

  return numerator / denominator;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function roundScore(value: number): number {
  return Math.round(clamp(value, 0, 100));
}
