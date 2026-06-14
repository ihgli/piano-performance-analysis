import { Midi } from "@tonejs/midi";
import { describe, expect, it } from "vitest";
import { analyzePianoMidiFile } from "./pianoTextureAnalysis";

describe("analyzePianoMidiFile", () => {
  it("analyzes polyphonic piano MIDI with chords and phrase breaths", async () => {
    const file = createPolyphonicPianoMidi();
    const analysis = await analyzePianoMidiFile(file);

    expect(analysis.summary.totalNotes).toBeGreaterThan(16);
    expect(analysis.summary.chordCount).toBeGreaterThan(3);
    expect(analysis.summary.breathCount).toBeGreaterThan(0);
    expect(analysis.scores.chordSynchrony).toBeGreaterThan(0);
    expect(analysis.scores.phraseBreath).toBeGreaterThan(0);
  });

  it("rejects empty MIDI files", async () => {
    const bytes = new Midi().toArray();
    const body = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
    const file = new File([body], "empty.mid", { type: "audio/midi" });

    await expect(analyzePianoMidiFile(file)).rejects.toThrow("没有可分析的钢琴音符");
  });

  it("rejects oversized MIDI files before parsing", async () => {
    const largeBody = new Uint8Array(1024 * 1024 + 1);
    const file = new File([largeBody.buffer as ArrayBuffer], "large.mid", { type: "audio/midi" });

    await expect(analyzePianoMidiFile(file)).rejects.toThrow("超过 1MB");
  });
});

function createPolyphonicPianoMidi() {
  const midi = new Midi();
  const track = midi.addTrack();
  const chords = [
    { time: 0, notes: [48, 55, 60, 64] },
    { time: 0.55, notes: [50, 57, 62, 65] },
    { time: 1.1, notes: [52, 59, 64, 67] },
    { time: 2.0, notes: [53, 60, 65, 69] },
    { time: 2.55, notes: [55, 62, 67, 71] },
    { time: 3.1, notes: [57, 64, 69, 72] },
  ];

  chords.forEach((chord, chordIndex) => {
    chord.notes.forEach((pitch, noteIndex) => {
      track.addNote({
        midi: pitch,
        time: chord.time + noteIndex * 0.012,
        duration: chordIndex === 2 ? 0.42 : 0.36,
        velocity: noteIndex === chord.notes.length - 1 ? 0.78 : 0.58,
      });
    });
  });

  const bytes = midi.toArray();
  const body = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;

  return new File([body], "polyphonic.mid", { type: "audio/midi" });
}
