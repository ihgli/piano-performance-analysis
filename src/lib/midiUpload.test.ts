import { Midi } from "@tonejs/midi";
import { describe, expect, it } from "vitest";
import { buildPerformanceTakeFromMidiFile } from "./midiUpload";
import { performerLabReferenceNotes } from "./sampleData";

const referenceMidiPitches = [60, 62, 64, 67, 69, 67, 64, 62, 60, 64, 67, 71, 69, 67, 64, 60];

describe("buildPerformanceTakeFromMidiFile", () => {
  it("accepts a matching single-track monophonic 16-note MIDI", async () => {
    const file = createMidiFile(referenceMidiPitches);
    const result = await buildPerformanceTakeFromMidiFile(file, performerLabReferenceNotes);

    expect(result.take.performedNotes).toHaveLength(16);
    expect(result.summary.alignedNotes).toBe(16);
    expect(result.summary.pitchMatchRatio).toBe(1);
    expect(result.summary.noteTrackCount).toBe(1);
  });

  it("rejects MIDI files with too few effective notes", async () => {
    const file = createMidiFile(referenceMidiPitches.slice(0, 15));

    await expect(buildPerformanceTakeFromMidiFile(file, performerLabReferenceNotes)).rejects.toThrow(
      "至少 16 个有效音符",
    );
  });

  it("rejects multi-track MIDI files", async () => {
    const file = createMidiFile(referenceMidiPitches, { splitAcrossTracks: true });

    await expect(buildPerformanceTakeFromMidiFile(file, performerLabReferenceNotes)).rejects.toThrow(
      "仅支持单轨单声部",
    );
  });

  it("rejects likely chord or accompaniment MIDI files", async () => {
    const file = createMidiFile(referenceMidiPitches, { makeChordAtStart: true });

    await expect(buildPerformanceTakeFromMidiFile(file, performerLabReferenceNotes)).rejects.toThrow(
      "暂不支持和弦",
    );
  });

  it("rejects pitch sequences that do not match the current reference excerpt", async () => {
    const file = createMidiFile(referenceMidiPitches.map((pitch) => pitch + 7));

    await expect(buildPerformanceTakeFromMidiFile(file, performerLabReferenceNotes)).rejects.toThrow(
      "音高顺序不匹配",
    );
  });

  it("accepts extra trailing notes when the first 16 notes match and reports ignored notes", async () => {
    const file = createMidiFile([...referenceMidiPitches, 72, 74]);
    const result = await buildPerformanceTakeFromMidiFile(file, performerLabReferenceNotes);

    expect(result.summary.alignedNotes).toBe(16);
    expect(result.summary.totalNotes).toBe(18);
    expect(result.summary.ignoredNotes).toBe(2);
    expect(result.summary.warnings).toContain("文件中多出的 2 个音暂未参与本次对齐。");
  });
});

function createMidiFile(
  pitches: number[],
  options: { splitAcrossTracks?: boolean; makeChordAtStart?: boolean } = {},
) {
  const midi = new Midi();
  const primaryTrack = midi.addTrack();
  const secondaryTrack = options.splitAcrossTracks ? midi.addTrack() : primaryTrack;

  pitches.forEach((pitch, index) => {
    const track = options.splitAcrossTracks && index % 2 === 1 ? secondaryTrack : primaryTrack;
    const time = options.makeChordAtStart && index === 1 ? 0 : index * 0.5;
    track.addNote({
      midi: pitch,
      time,
      duration: 0.35,
      velocity: 0.65,
    });
  });

  const bytes = midi.toArray();
  const body = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;

  return new File([body], "performance.mid", { type: "audio/midi" });
}
