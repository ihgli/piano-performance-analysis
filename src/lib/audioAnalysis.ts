export interface AudioCurvePoint {
  label: string;
  value: number;
}

export interface AudioAnalysisResult {
  fileName: string;
  durationSeconds: number;
  sampleRate: number;
  channelCount: number;
  integratedRms: number;
  peakAmplitude: number;
  dynamicRangeDb: number;
  crestFactorDb: number;
  estimatedOnsets: number;
  onsetRatePerSecond: number;
  silenceRatio: number;
  rmsCurve: AudioCurvePoint[];
  onsetCurve: AudioCurvePoint[];
  warnings: string[];
}

export interface AudioComparisonResult {
  overallSimilarity: number;
  dynamicSimilarity: number;
  onsetSimilarity: number;
  pacingSimilarity: number;
  recordingReadiness: number;
  explanation: string[];
}

const CURVE_POINT_COUNT = 48;
const MAX_AUDIO_FILE_SIZE_BYTES = 25 * 1024 * 1024;
const MAX_AUDIO_DURATION_SECONDS = 180;
const AUDIO_DECODE_TIMEOUT_MS = 15_000;

export async function analyzeAudioFile(file: File): Promise<AudioAnalysisResult> {
  if (file.size > MAX_AUDIO_FILE_SIZE_BYTES) {
    throw new Error("音频文件超过 25MB。当前上线版只支持短录音片段的本地音频级检查。");
  }

  const AudioContextCtor =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;

  if (!AudioContextCtor) {
    throw new Error("当前浏览器不支持 Web Audio API，无法进行本地音频分析。");
  }

  const buffer = await file.arrayBuffer();
  const audioContext = new AudioContextCtor();

  try {
    const decoded = await withTimeout(
      audioContext.decodeAudioData(buffer.slice(0)),
      AUDIO_DECODE_TIMEOUT_MS,
      "音频解码时间过长。请上传更短的 wav、mp3、m4a 或 flac 片段。",
    );

    if (decoded.duration > MAX_AUDIO_DURATION_SECONDS) {
      throw new Error("音频时长超过 3 分钟。当前上线版只支持短录音片段的本地音频级检查。");
    }

    const mono = mixToMono(decoded);
    const frameSize = 2048;
    const hopSize = 1024;
    const rmsFrames = buildRmsFrames(mono, frameSize, hopSize);
    const rmsCurve = downsampleCurve(rmsFrames, CURVE_POINT_COUNT);
    const onsetCurve = buildOnsetCurve(rmsFrames);
    const estimatedOnsets = countOnsets(onsetCurve, decoded.sampleRate, hopSize);
    const integratedRms = rms(mono);
    const peakAmplitude = peak(mono);
    const dbFrames = rmsFrames.map(amplitudeToDb).sort((a, b) => a - b);
    const dynamicRangeDb = percentile(dbFrames, 0.95) - percentile(dbFrames, 0.1);
    const silenceRatio = ratioOf(rmsFrames, (value) => amplitudeToDb(value) < -48);
    const onsetRatePerSecond = estimatedOnsets / Math.max(1, decoded.duration);
    const crestFactorDb = 20 * Math.log10((peakAmplitude + 1e-8) / (integratedRms + 1e-8));

    return {
      fileName: safeDisplayFileName(file.name),
      durationSeconds: decoded.duration,
      sampleRate: decoded.sampleRate,
      channelCount: decoded.numberOfChannels,
      integratedRms,
      peakAmplitude,
      dynamicRangeDb,
      crestFactorDb,
      estimatedOnsets,
      onsetRatePerSecond,
      silenceRatio,
      rmsCurve: rmsCurve.map((value, index) => ({
        label: `${index + 1}`,
        value,
      })),
      onsetCurve: downsampleCurve(onsetCurve, CURVE_POINT_COUNT).map((value, index) => ({
        label: `${index + 1}`,
        value,
      })),
      warnings: buildAudioWarnings(decoded.duration, peakAmplitude, integratedRms, silenceRatio),
    };
  } finally {
    void audioContext.close();
  }
}

export function compareAudioAnalyses(
  student: AudioAnalysisResult,
  expert: AudioAnalysisResult,
): AudioComparisonResult {
  const studentRms = student.rmsCurve.map((point) => point.value);
  const expertRms = expert.rmsCurve.map((point) => point.value);
  const studentOnset = student.onsetCurve.map((point) => point.value);
  const expertOnset = expert.onsetCurve.map((point) => point.value);
  const dynamicSimilarity = scoreFromError(meanAbsoluteError(studentRms, expertRms), 0.18);
  const onsetSimilarity = scoreFromCorrelation(correlation(studentOnset, expertOnset));
  const pacingSimilarity = scoreFromError(
    Math.abs(student.onsetRatePerSecond - expert.onsetRatePerSecond),
    1.15,
  );
  const recordingReadiness = recordingReadinessScore(student);
  const overallSimilarity = weightedAverage([
    [dynamicSimilarity, 0.34],
    [onsetSimilarity, 0.31],
    [pacingSimilarity, 0.2],
    [recordingReadiness, 0.15],
  ]);

  return {
    overallSimilarity: Math.round(overallSimilarity),
    dynamicSimilarity: Math.round(dynamicSimilarity),
    onsetSimilarity: Math.round(onsetSimilarity),
    pacingSimilarity: Math.round(pacingSimilarity),
    recordingReadiness: Math.round(recordingReadiness),
    explanation: [
      "这是音频级相似度，不是音符级艺术评分。",
      "当前比较真实音频中的力度包络、起音能量变化和整体推进速度。",
      "上线级音符评分仍需要谱面/MIDI 对齐或后端音频转录模型。",
    ],
  };
}

export function isAudioFile(file: File) {
  return file.type.startsWith("audio/") || /\.(wav|mp3|m4a|aac|ogg|flac)$/i.test(file.name);
}

function mixToMono(buffer: AudioBuffer) {
  const samples = new Float32Array(buffer.length);

  for (let channel = 0; channel < buffer.numberOfChannels; channel += 1) {
    const data = buffer.getChannelData(channel);
    for (let index = 0; index < data.length; index += 1) {
      samples[index] += data[index] / buffer.numberOfChannels;
    }
  }

  return samples;
}

function buildRmsFrames(samples: Float32Array, frameSize: number, hopSize: number) {
  const frames: number[] = [];

  for (let start = 0; start < samples.length; start += hopSize) {
    const frame = samples.subarray(start, Math.min(samples.length, start + frameSize));
    frames.push(rms(frame));
  }

  return frames;
}

function buildOnsetCurve(rmsFrames: number[]) {
  const normalized = normalize(rmsFrames);
  return normalized.map((value, index) => Math.max(0, value - (normalized[index - 1] ?? value)));
}

function countOnsets(onsetCurve: number[], sampleRate: number, hopSize: number) {
  const average = mean(onsetCurve);
  const deviation = standardDeviation(onsetCurve);
  const threshold = average + deviation * 1.45;
  const minFrameDistance = Math.max(1, Math.round((0.08 * sampleRate) / hopSize));
  let count = 0;
  let lastOnsetIndex = -minFrameDistance;

  onsetCurve.forEach((value, index) => {
    if (value > threshold && index - lastOnsetIndex >= minFrameDistance) {
      count += 1;
      lastOnsetIndex = index;
    }
  });

  return count;
}

function downsampleCurve(values: number[], count: number) {
  const normalized = normalize(values);
  if (normalized.length <= count) {
    return normalized;
  }

  return Array.from({ length: count }, (_, index) => {
    const start = Math.floor((index / count) * normalized.length);
    const end = Math.max(start + 1, Math.floor(((index + 1) / count) * normalized.length));
    return mean(normalized.slice(start, end));
  });
}

function buildAudioWarnings(
  durationSeconds: number,
  peakAmplitude: number,
  integratedRms: number,
  silenceRatio: number,
) {
  const warnings: string[] = [];

  if (durationSeconds < 4) {
    warnings.push("音频时长较短，暂不适合做稳定的表现力判断。");
  }

  if (peakAmplitude > 0.98) {
    warnings.push("检测到接近削波的峰值，建议降低录音输入音量后重录。");
  }

  if (integratedRms < 0.012) {
    warnings.push("录音整体电平偏低，可能影响起音和力度曲线。");
  }

  if (silenceRatio > 0.42) {
    warnings.push("静音比例偏高，请确认文件中包含完整演奏。");
  }

  return warnings;
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  let timeoutId: number | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = window.setTimeout(() => reject(new Error(message)), timeoutMs);
  });

  return Promise.race([promise, timeoutPromise]).finally(() => {
    if (timeoutId !== undefined) {
      window.clearTimeout(timeoutId);
    }
  });
}

function safeDisplayFileName(fileName: string) {
  const extensionMatch = /\.[a-z0-9]+$/i.exec(fileName);
  return extensionMatch ? `本地音频文件（${extensionMatch[0]}）` : "本地音频文件";
}

function recordingReadinessScore(analysis: AudioAnalysisResult) {
  return weightedAverage([
    [scoreFromError(Math.abs(analysis.peakAmplitude - 0.72), 0.45), 0.3],
    [scoreFromError(Math.abs(analysis.integratedRms - 0.09), 0.08), 0.28],
    [scoreFromError(analysis.silenceRatio, 0.28), 0.24],
    [scoreFromError(Math.max(0, 4 - analysis.durationSeconds), 4), 0.18],
  ]);
}

function scoreFromCorrelation(value: number) {
  if (!Number.isFinite(value)) {
    return 50;
  }

  return Math.round(clamp((value + 1) * 50, 0, 100));
}

function scoreFromError(error: number, tolerance: number) {
  if (!Number.isFinite(error) || tolerance <= 0) {
    return 0;
  }

  return clamp(100 / (1 + (error / tolerance) ** 2), 0, 100);
}

function weightedAverage(values: Array<[value: number, weight: number]>) {
  const totalWeight = values.reduce((total, [, weight]) => total + weight, 0);
  return values.reduce((total, [value, weight]) => total + value * weight, 0) / totalWeight;
}

function meanAbsoluteError(xs: number[], ys: number[]) {
  const length = Math.min(xs.length, ys.length);
  if (length === 0) {
    return 1;
  }

  return mean(xs.slice(0, length).map((value, index) => Math.abs(value - ys[index])));
}

function correlation(xs: number[], ys: number[]) {
  const length = Math.min(xs.length, ys.length);
  if (length < 2) {
    return Number.NaN;
  }

  const xValues = xs.slice(0, length);
  const yValues = ys.slice(0, length);
  const xMean = mean(xValues);
  const yMean = mean(yValues);
  const xStd = standardDeviation(xValues);
  const yStd = standardDeviation(yValues);

  if (xStd === 0 || yStd === 0) {
    return Number.NaN;
  }

  return (
    xValues.reduce((total, value, index) => total + (value - xMean) * (yValues[index] - yMean), 0) /
    (length * xStd * yStd)
  );
}

function normalize(values: number[]) {
  const min = Math.min(...values);
  const max = Math.max(...values);
  if (!Number.isFinite(min) || !Number.isFinite(max) || max === min) {
    return values.map(() => 0);
  }

  return values.map((value) => (value - min) / (max - min));
}

function percentile(sortedValues: number[], quantile: number) {
  if (sortedValues.length === 0) {
    return 0;
  }

  const index = Math.min(sortedValues.length - 1, Math.max(0, Math.floor(quantile * sortedValues.length)));
  return sortedValues[index];
}

function amplitudeToDb(value: number) {
  return 20 * Math.log10(Math.max(value, 1e-7));
}

function rms(values: ArrayLike<number>) {
  if (values.length === 0) {
    return 0;
  }

  let sum = 0;
  for (let index = 0; index < values.length; index += 1) {
    sum += values[index] * values[index];
  }

  return Math.sqrt(sum / values.length);
}

function peak(values: ArrayLike<number>) {
  let max = 0;
  for (let index = 0; index < values.length; index += 1) {
    max = Math.max(max, Math.abs(values[index]));
  }

  return max;
}

function ratioOf<T>(values: T[], predicate: (value: T) => boolean) {
  if (values.length === 0) {
    return 0;
  }

  return values.filter(predicate).length / values.length;
}

function standardDeviation(values: number[]) {
  if (values.length === 0) {
    return 0;
  }

  const average = mean(values);
  return Math.sqrt(mean(values.map((value) => (value - average) ** 2)));
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
