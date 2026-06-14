import { Midi } from "@tonejs/midi";

export interface PianoMidiSummary {
  fileName: string;
  durationSeconds: number;
  totalNotes: number;
  trackCount: number;
  chordCount: number;
  singleNoteCount: number;
  meanChordSpreadMs: number;
  meanBreathGapSeconds: number;
  breathCount: number;
  densityNotesPerSecond: number;
  warnings: string[];
}

export interface PianoTextureScores {
  chordSynchrony: number;
  voicingClarity: number;
  phraseBreath: number;
  timingFlow: number;
  textureControl: number;
  recordingReadiness: number;
}

export interface PianoTexturePoint {
  label: string;
  value: number;
}

export interface PianoTextureAnalysis {
  summary: PianoMidiSummary;
  scores: PianoTextureScores;
  curves: {
    density: PianoTexturePoint[];
    voicing: PianoTexturePoint[];
    breathGaps: PianoTexturePoint[];
    chordSpread: PianoTexturePoint[];
  };
  evidence: {
    breathEvents: Array<{ label: string; gapSeconds: number }>;
    chordEvents: Array<{ label: string; noteCount: number; spreadMs: number; topVelocityLead: number }>;
  };
}

type ParsedPianoNote = {
  midi: number;
  time: number;
  duration: number;
  velocity: number;
  trackIndex: number;
};

type PianoEvent = {
  index: number;
  onset: number;
  end: number;
  notes: ParsedPianoNote[];
};

const MAX_POLYPHONIC_MIDI_BYTES = 1024 * 1024;
const MAX_POLYPHONIC_NOTE_COUNT = 2000;
const MIN_NOTE_DURATION_SECONDS = 0.018;
const CHORD_GROUP_WINDOW_SECONDS = 0.055;
const BREATH_GAP_SECONDS = 0.32;
const CURVE_POINTS = 48;

export async function analyzePianoMidiFile(file: File): Promise<PianoTextureAnalysis> {
  if (file.size > MAX_POLYPHONIC_MIDI_BYTES) {
    throw new Error("MIDI 文件超过 1MB。当前钢琴上线版只支持中短片段，请先截取需要分析的段落。");
  }

  const midi = new Midi(await file.arrayBuffer());
  const notes = midi.tracks
    .flatMap((track, trackIndex) =>
      track.notes.map((note) => ({
        midi: note.midi,
        time: note.time,
        duration: note.duration,
        velocity: Math.max(1, Math.min(127, Math.round(note.velocity * 127))),
        trackIndex,
      })),
    )
    .filter((note) => note.duration >= MIN_NOTE_DURATION_SECONDS)
    .sort((a, b) => a.time - b.time || a.midi - b.midi);

  if (notes.length === 0) {
    throw new Error("这个 MIDI 文件里没有可分析的钢琴音符。");
  }

  if (notes.length > MAX_POLYPHONIC_NOTE_COUNT) {
    throw new Error("MIDI 音符数量超过 2000。当前版本适合分析中短钢琴片段，请先截取片段后再试。");
  }

  const events = groupNotesIntoEvents(notes);
  const chordEvents = events.filter((event) => event.notes.length > 1);
  const breathEvents = buildBreathEvents(events);
  const chordSpreadValues = chordEvents.map(chordSpreadMs);
  const topVelocityLeadValues = chordEvents.map(topVelocityLead);
  const eventGaps = events.slice(1).map((event, index) => event.onset - events[index].onset);
  const breathGaps = breathEvents.map((event) => event.gapSeconds);
  const durationSeconds = Math.max(midi.duration, notes[notes.length - 1].time + notes[notes.length - 1].duration);
  const meanChordSpreadMs = mean(chordSpreadValues);
  const meanBreathGapSeconds = mean(breathGaps);
  const densityNotesPerSecond = notes.length / Math.max(1, durationSeconds);
  const chordSynchrony = scoreFromError(meanChordSpreadMs, 38);
  const voicingClarity = scoreFromTarget(mean(topVelocityLeadValues), 9, 12);
  const phraseBreath = scorePhraseBreath(breathEvents.length, meanBreathGapSeconds, durationSeconds);
  const timingFlow = scoreFromError(successiveDifferenceRms(eventGaps), 0.28);
  const textureControl = weightedAverage([
    [scoreFromError(standardDeviation(events.map((event) => event.notes.length)), 2.1), 0.35],
    [scoreFromError(successiveDifferenceRms(events.map((event) => event.notes.length)), 1.8), 0.3],
    [scoreFromError(densityNotesPerSecond, 28), 0.35],
  ]);
  const recordingReadiness = weightedAverage([
    [scoreFromError(Math.max(0, 6 - durationSeconds), 6), 0.25],
    [scoreFromError(Math.max(0, notes.length - MAX_POLYPHONIC_NOTE_COUNT * 0.75), 800), 0.25],
    [scoreFromError(chordEvents.length === 0 ? 0 : meanChordSpreadMs, 60), 0.25],
    [scoreFromError(densityNotesPerSecond, 36), 0.25],
  ]);

  return {
    summary: {
      fileName: safeDisplayFileName(file.name),
      durationSeconds,
      totalNotes: notes.length,
      trackCount: new Set(notes.map((note) => note.trackIndex)).size,
      chordCount: chordEvents.length,
      singleNoteCount: events.length - chordEvents.length,
      meanChordSpreadMs,
      meanBreathGapSeconds,
      breathCount: breathEvents.length,
      densityNotesPerSecond,
      warnings: buildWarnings(notes, events, chordEvents, breathEvents, durationSeconds),
    },
    scores: {
      chordSynchrony: Math.round(chordSynchrony),
      voicingClarity: Math.round(voicingClarity),
      phraseBreath: Math.round(phraseBreath),
      timingFlow: Math.round(timingFlow),
      textureControl: Math.round(textureControl),
      recordingReadiness: Math.round(recordingReadiness),
    },
    curves: {
      density: downsample(events.map((event) => event.notes.length), CURVE_POINTS),
      voicing: downsample(events.map((event) => topVelocityLead(event)), CURVE_POINTS),
      breathGaps: downsample(events.map((event, index) => Math.max(0, event.onset - (events[index - 1]?.end ?? event.onset))), CURVE_POINTS),
      chordSpread: downsample(events.map((event) => chordSpreadMs(event)), CURVE_POINTS),
    },
    evidence: {
      breathEvents: breathEvents.slice(0, 8).map((event) => ({
        label: `气口 ${event.afterEventIndex}`,
        gapSeconds: event.gapSeconds,
      })),
      chordEvents: chordEvents.slice(0, 10).map((event) => ({
        label: `和弦 ${event.index + 1}`,
        noteCount: event.notes.length,
        spreadMs: chordSpreadMs(event),
        topVelocityLead: topVelocityLead(event),
      })),
    },
  };
}

function groupNotesIntoEvents(notes: ParsedPianoNote[]): PianoEvent[] {
  const events: PianoEvent[] = [];

  for (const note of notes) {
    const current = events[events.length - 1];
    if (current && note.time - current.onset <= CHORD_GROUP_WINDOW_SECONDS) {
      current.notes.push(note);
      current.end = Math.max(current.end, note.time + note.duration);
    } else {
      events.push({
        index: events.length,
        onset: note.time,
        end: note.time + note.duration,
        notes: [note],
      });
    }
  }

  return events;
}

function buildBreathEvents(events: PianoEvent[]) {
  return events
    .slice(1)
    .map((event, index) => ({
      afterEventIndex: index + 1,
      gapSeconds: event.onset - events[index].end,
    }))
    .filter((event) => event.gapSeconds >= BREATH_GAP_SECONDS);
}

function chordSpreadMs(event: PianoEvent) {
  if (event.notes.length <= 1) {
    return 0;
  }

  const times = event.notes.map((note) => note.time);
  return (Math.max(...times) - Math.min(...times)) * 1000;
}

function topVelocityLead(event: PianoEvent) {
  if (event.notes.length <= 1) {
    return 0;
  }

  const sorted = [...event.notes].sort((a, b) => a.midi - b.midi);
  const top = sorted[sorted.length - 1];
  const lowerMean = mean(sorted.slice(0, -1).map((note) => note.velocity));
  return top.velocity - lowerMean;
}

function buildWarnings(
  notes: ParsedPianoNote[],
  events: PianoEvent[],
  chordEvents: PianoEvent[],
  breathEvents: Array<{ afterEventIndex: number; gapSeconds: number }>,
  durationSeconds: number,
) {
  const warnings: string[] = [];
  const chordRatio = chordEvents.length / Math.max(1, events.length);

  if (durationSeconds < 6) {
    warnings.push("片段时长较短，气口和结构判断只能作为局部参考。");
  }

  if (chordRatio < 0.12) {
    warnings.push("检测到的和弦较少，当前报告更接近旋律线分析。");
  }

  if (breathEvents.length === 0 && durationSeconds > 8) {
    warnings.push("未检测到明显气口；如果这是连贯段落可以接受，否则建议检查句尾释放。");
  }

  if (notes.length / Math.max(1, durationSeconds) > 28) {
    warnings.push("单位时间音符密度较高，复杂踏板或装饰音可能影响当前版本的织体判断。");
  }

  return warnings;
}

function scorePhraseBreath(count: number, meanGap: number, durationSeconds: number) {
  if (durationSeconds < 6) {
    return 55;
  }

  const expectedCount = Math.max(1, Math.round(durationSeconds / 7));
  const countScore = scoreFromError(Math.abs(count - expectedCount), Math.max(1, expectedCount * 0.8));
  const gapScore = scoreFromTarget(meanGap, 0.55, 0.38);

  return weightedAverage([
    [countScore, 0.48],
    [gapScore, 0.52],
  ]);
}

function downsample(values: number[], count: number): PianoTexturePoint[] {
  if (values.length <= count) {
    return values.map((value, index) => ({ label: String(index + 1), value }));
  }

  return Array.from({ length: count }, (_, index) => {
    const start = Math.floor((index / count) * values.length);
    const end = Math.max(start + 1, Math.floor(((index + 1) / count) * values.length));
    return {
      label: String(index + 1),
      value: mean(values.slice(start, end)),
    };
  });
}

function scoreFromError(error: number, tolerance: number) {
  if (!Number.isFinite(error) || tolerance <= 0) {
    return 0;
  }

  return clamp(100 / (1 + (error / tolerance) ** 2), 0, 100);
}

function scoreFromTarget(value: number, target: number, width: number) {
  if (!Number.isFinite(value) || width <= 0) {
    return 0;
  }

  const normalizedDistance = (value - target) / width;
  return clamp(100 * Math.exp(-(normalizedDistance ** 2)), 0, 100);
}

function weightedAverage(values: Array<[value: number, weight: number]>) {
  const usable = values.filter(([value, weight]) => Number.isFinite(value) && weight > 0);
  const totalWeight = usable.reduce((total, [, weight]) => total + weight, 0);
  return usable.reduce((total, [value, weight]) => total + value * weight, 0) / totalWeight;
}

function successiveDifferenceRms(values: number[]) {
  if (values.length < 2) {
    return 0;
  }

  return rms(values.slice(1).map((value, index) => value - values[index]));
}

function standardDeviation(values: number[]) {
  if (values.length === 0) {
    return 0;
  }

  const average = mean(values);
  return Math.sqrt(mean(values.map((value) => (value - average) ** 2)));
}

function rms(values: number[]) {
  if (values.length === 0) {
    return 0;
  }

  return Math.sqrt(mean(values.map((value) => value * value)));
}

function mean(values: number[]) {
  if (values.length === 0) {
    return 0;
  }

  return values.reduce((total, value) => total + value, 0) / values.length;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function safeDisplayFileName(fileName: string) {
  const extensionMatch = /\.[a-z0-9]+$/i.exec(fileName);
  return extensionMatch ? `本地钢琴 MIDI 文件（${extensionMatch[0]}）` : "本地钢琴 MIDI 文件";
}
