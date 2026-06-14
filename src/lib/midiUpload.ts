import { Midi } from "@tonejs/midi";
import type { PerformanceTake, PerformedNote, ReferenceNote } from "./performanceMetrics";

export interface MidiUploadSummary {
  fileName: string;
  totalNotes: number;
  alignedNotes: number;
  ignoredNotes: number;
  noteTrackCount: number;
  pitchMatchRatio: number;
  durationSeconds: number;
  timeScale: number;
  pitchMatches: number;
  warnings: string[];
}

type ParsedMidiNote = {
  midi: number;
  time: number;
  duration: number;
  velocity: number;
};

const MIN_NOTE_DURATION_SECONDS = 0.02;
const MAX_MIDI_FILE_SIZE_BYTES = 512 * 1024;
const MAX_PARSED_NOTE_COUNT = 256;

export async function buildPerformanceTakeFromMidiFile(
  file: File,
  referenceNotes: ReferenceNote[],
): Promise<{ take: PerformanceTake; summary: MidiUploadSummary }> {
  if (file.size > MAX_MIDI_FILE_SIZE_BYTES) {
    throw new Error("MIDI 文件超过 512KB。当前上线版只支持短小练习片段，请先导出当前 16 音参考片段。");
  }

  const buffer = await file.arrayBuffer();
  const midi = new Midi(buffer);
  const parsedNotes = midi.tracks
    .flatMap((track) =>
      track.notes.map((note) => ({
        midi: note.midi,
        time: note.time,
        duration: note.duration,
        velocity: note.velocity,
      })),
    )
    .filter((note) => note.duration > MIN_NOTE_DURATION_SECONDS)
    .sort((a, b) => a.time - b.time || a.midi - b.midi);
  const noteTrackCount = midi.tracks.filter((track) =>
    track.notes.some((note) => note.duration > MIN_NOTE_DURATION_SECONDS),
  ).length;

  if (parsedNotes.length === 0) {
    throw new Error("这个 MIDI 文件里没有可分析的钢琴音符。");
  }

  if (parsedNotes.length > MAX_PARSED_NOTE_COUNT) {
    throw new Error("MIDI 音符数量超过当前上线版上限。请上传短小、单声部的当前参考片段。");
  }

  if (noteTrackCount > 1) {
    throw new Error("当前上线试行版仅支持单轨单声部旋律 MIDI；多轨文件需要先导出旋律轨。");
  }

  if (hasLikelyChordOrAccompaniment(parsedNotes)) {
    throw new Error("当前上线试行版暂不支持和弦、伴奏或左右手混合 MIDI；请上传单声部旋律片段。");
  }

  if (parsedNotes.length < referenceNotes.length) {
    throw new Error(
      `当前试行版需要至少 ${referenceNotes.length} 个有效音符；这个 MIDI 只检测到 ${parsedNotes.length} 个。`,
    );
  }

  const selectedNotes = parsedNotes.slice(0, referenceNotes.length);
  const firstTime = selectedNotes[0]?.time ?? 0;
  const lastTime = selectedNotes[selectedNotes.length - 1]?.time ?? firstTime;
  const uploadSpan = Math.max(0.001, lastTime - firstTime);
  const referenceSpan = Math.max(
    0.001,
    referenceNotes[referenceNotes.length - 1].expectedOnset - referenceNotes[0].expectedOnset,
  );
  const timeScale = referenceSpan / uploadSpan;
  const performedNotes = selectedNotes.map((note, index) =>
    convertMidiNoteToPerformedNote(note, referenceNotes[index], firstTime, timeScale),
  );
  const pitchMatches = selectedNotes.reduce((count, note, index) => {
    const referenceMidi = pitchNameToMidi(referenceNotes[index].pitch);
    return count + (referenceMidi === note.midi ? 1 : 0);
  }, 0);
  const pitchMatchRatio = pitchMatches / selectedNotes.length;

  if (pitchMatchRatio < 1) {
    throw new Error("上传 MIDI 与当前参考片段的音高顺序不匹配，不能生成正式评分。");
  }

  const warnings = buildWarnings(parsedNotes, selectedNotes, referenceNotes, pitchMatches);

  return {
    take: {
      id: `uploaded-${Date.now()}`,
      label: `上传 MIDI：${safeDisplayFileName(file.name, "MIDI")}`,
      instrument: "piano",
      performerKind: "student",
      referenceNotes,
      performedNotes,
    },
    summary: {
      fileName: safeDisplayFileName(file.name, "MIDI"),
      totalNotes: parsedNotes.length,
      alignedNotes: performedNotes.length,
      ignoredNotes: Math.max(0, parsedNotes.length - performedNotes.length),
      noteTrackCount,
      pitchMatchRatio,
      durationSeconds: midi.duration,
      timeScale,
      pitchMatches,
      warnings,
    },
  };
}

function convertMidiNoteToPerformedNote(
  note: ParsedMidiNote,
  reference: ReferenceNote,
  firstTime: number,
  timeScale: number,
): PerformedNote {
  return {
    referenceId: reference.id,
    performedOnset: (note.time - firstTime) * timeScale,
    performedDuration: Math.max(0.03, note.duration * timeScale),
    performedVelocity: Math.round(Math.max(1, Math.min(127, note.velocity * 127))),
  };
}

function buildWarnings(
  parsedNotes: ParsedMidiNote[],
  selectedNotes: ParsedMidiNote[],
  referenceNotes: ReferenceNote[],
  pitchMatches: number,
) {
  const warnings: string[] = [];

  if (parsedNotes.length > referenceNotes.length) {
    warnings.push(`文件中多出的 ${parsedNotes.length - referenceNotes.length} 个音暂未参与本次对齐。`);
  }

  const pitchMatchRatio = pitchMatches / selectedNotes.length;
  if (pitchMatchRatio < 1) {
    warnings.push("音高匹配率未达到 100%，不能作为正式评分。");
  }

  return warnings;
}

function safeDisplayFileName(fileName: string, fallback: string) {
  const extensionMatch = /\.[a-z0-9]+$/i.exec(fileName);
  return extensionMatch ? `本地${fallback}文件（${extensionMatch[0]}）` : `本地${fallback}文件`;
}

function hasLikelyChordOrAccompaniment(notes: ParsedMidiNote[]) {
  return notes.some((note, index) => {
    const previous = notes[index - 1];
    return previous !== undefined && Math.abs(note.time - previous.time) < 0.035;
  });
}

function pitchNameToMidi(pitch: string) {
  const match = /^([A-G])(#|b)?(-?\d+)$/.exec(pitch);
  if (!match) {
    return -1;
  }

  const semitoneByName: Record<string, number> = {
    C: 0,
    D: 2,
    E: 4,
    F: 5,
    G: 7,
    A: 9,
    B: 11,
  };
  const [, name, accidental = "", octaveText] = match;
  const accidentalOffset = accidental === "#" ? 1 : accidental === "b" ? -1 : 0;

  return (Number(octaveText) + 1) * 12 + semitoneByName[name] + accidentalOffset;
}
