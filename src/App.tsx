import {
  Activity,
  AlertTriangle,
  BarChart3,
  CheckCircle2,
  Clock3,
  FileAudio,
  Gauge,
  Info,
  ListChecks,
  Music2,
  Piano,
  ShieldCheck,
  Target,
  UploadCloud,
  Waves,
} from "lucide-react";
import type { ReactNode } from "react";
import { useMemo, useRef, useState } from "react";
import {
  analyzeAudioFile,
  compareAudioAnalyses,
  isAudioFile,
  type AudioAnalysisResult,
  type AudioComparisonResult,
} from "./lib/audioAnalysis";
import {
  analyzePerformanceSet,
  type ArticulationRatioPoint,
  type DynamicCurvePoint,
  type OnsetDeviationPoint,
  type PerformanceAnalysisResult,
  type PerformanceScores,
  type PerformanceTake,
  type PhraseSummary,
  type TempoCurvePoint,
} from "./lib/performanceMetrics";
import type { PianoTextureAnalysis } from "./lib/pianoTextureAnalysis";
import type { MidiUploadSummary } from "./lib/midiUpload";
import { performerLabSampleTakes } from "./lib/sampleData";

type AppMode =
  | { kind: "empty" }
  | { kind: "processing"; input: "student-audio" | "expert-audio" }
  | { kind: "demo"; takeId: string }
  | {
      kind: "audio-comparison";
      student: AudioAnalysisResult;
      expert: AudioAnalysisResult;
      comparison: AudioComparisonResult;
      analyzedAt: string;
    }
  | { kind: "piano-midi"; analysis: PianoTextureAnalysis; analyzedAt: string }
  | { kind: "real-midi"; take: PerformanceTake; summary: MidiUploadSummary; analyzedAt: string }
  | { kind: "upload-error"; message: string }
  | { kind: "audio-pending"; analysis: AudioAnalysisResult; analyzedAt: string };

type ChartSeriesPoint = {
  label: string;
  value: number;
};

type AdjustmentItem = {
  id: string;
  priority: "重点" | "观察" | "保持";
  title: string;
  scoreText: string;
  evidenceText: string;
  actionText: string;
};

const scoreLabels: Array<{
  key: keyof PerformanceScores;
  label: string;
  detail: string;
}> = [
  { key: "timingExpressivity", label: "速度处理 / Rubato", detail: "速度塑形、局部推拉、回收控制" },
  { key: "dynamicShaping", label: "力度塑形", detail: "力度轮廓与乐句拱形" },
  { key: "articulationControl", label: "触键控制", detail: "触键连断与时值比例" },
  { key: "phraseCoherence", label: "乐句连贯性", detail: "乐句边界、方向感、一致性" },
  { key: "performanceStability", label: "演奏稳定性", detail: "演奏选择的可控程度" },
  { key: "styleDistance", label: "风格距离", detail: "与参考轨的距离，越低越接近" },
];

export default function App() {
  const [mode, setMode] = useState<AppMode>({ kind: "empty" });
  const [isReading, setIsReading] = useState(false);
  const [studentAudio, setStudentAudio] = useState<AudioAnalysisResult | null>(null);
  const [expertAudio, setExpertAudio] = useState<AudioAnalysisResult | null>(null);
  const requestIdRef = useRef(0);
  const realTake = mode.kind === "real-midi" ? mode.take : null;
  const availableTakes = useMemo(
    () => (realTake === null ? performerLabSampleTakes : [realTake, ...performerLabSampleTakes]),
    [realTake],
  );
  const analyses = useMemo(() => analyzePerformanceSet(availableTakes, "expert-reference"), [availableTakes]);
  const expertTake = availableTakes.find((take) => take.id === "expert-reference") ?? availableTakes[0];
  const selectedTake =
    mode.kind === "real-midi"
      ? mode.take
      : mode.kind === "demo"
        ? availableTakes.find((take) => take.id === mode.takeId) ?? null
        : null;
  const analysis = selectedTake === null ? null : analyses[selectedTake.id];
  const expertAnalysis = analyses[expertTake.id];
  const isDemo = mode.kind === "demo";
  const cancelPendingRead = () => {
    requestIdRef.current += 1;
    setIsReading(false);
  };
  const showDemoReport = () => {
    cancelPendingRead();
    setMode({ kind: "demo", takeId: "student-take-a" });
  };

  const handleAudioUpload = async (slot: "student" | "expert", file: File | null) => {
    if (file === null) {
      return;
    }

    if (!isAudioFile(file)) {
      cancelPendingRead();
      setMode({ kind: "upload-error", message: "请上传 wav、mp3、m4a、flac 等常见音频文件。" });
      return;
    }

    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    setIsReading(true);
    setMode({ kind: "processing", input: slot === "student" ? "student-audio" : "expert-audio" });

    try {
      const audioAnalysis = await analyzeAudioFile(file);
      if (requestIdRef.current !== requestId) {
        return;
      }

      const nextStudent = slot === "student" ? audioAnalysis : studentAudio;
      const nextExpert = slot === "expert" ? audioAnalysis : expertAudio;

      if (slot === "student") {
        setStudentAudio(audioAnalysis);
      } else {
        setExpertAudio(audioAnalysis);
      }

      if (nextStudent !== null && nextExpert !== null) {
        setMode({
          kind: "audio-comparison",
          student: nextStudent,
          expert: nextExpert,
          comparison: compareAudioAnalyses(nextStudent, nextExpert),
          analyzedAt: new Date().toLocaleString("zh-CN"),
        });
      } else {
        setMode({ kind: "empty" });
      }
    } catch (error) {
      if (requestIdRef.current !== requestId) {
        return;
      }

      setMode({
        kind: "upload-error",
        message: error instanceof Error ? error.message : "音频解析失败，请换一个文件再试。",
      });
    } finally {
      if (requestIdRef.current === requestId) {
        setIsReading(false);
      }
    }
  };

  return (
    <main className="app-shell" data-testid={`app-mode-${mode.kind}`}>
      <header className="topbar">
        <div className="brand-lockup">
          <div className="brand-mark" aria-hidden="true">
            <Piano size={22} />
          </div>
          <div>
            <p className="eyebrow">钢琴音频对比试行版</p>
            <h1>钢琴演奏表现力分析</h1>
          </div>
        </div>
        <div className="topbar-status">
          <ShieldCheck size={16} />
          <span>本地处理 · 双音频对比 · 文件不上传服务器</span>
        </div>
      </header>

      <section className="comparison-strip" aria-label="当前产品状态">
        <div className="comparison-strip__icon" aria-hidden="true">
          {mode.kind === "real-midi" ? <CheckCircle2 size={18} /> : <Info size={18} />}
        </div>
        <div>
          <p className="eyebrow">当前状态</p>
          <h2>{statusTitle(mode)}</h2>
        </div>
        <strong className={statusPillClass(mode)}>{statusPillText(mode)}</strong>
      </section>

      <UploadWorkspace
        isReading={isReading}
        studentAudio={studentAudio}
        expertAudio={expertAudio}
        onStudentAudioUpload={(file) => handleAudioUpload("student", file)}
        onExpertAudioUpload={(file) => handleAudioUpload("expert", file)}
        onLoadDemo={showDemoReport}
      />

      {mode.kind === "empty" && <EmptyState studentAudio={studentAudio} expertAudio={expertAudio} onLoadDemo={showDemoReport} />}
      {mode.kind === "processing" && <ProcessingState input={mode.input} />}
      {mode.kind === "upload-error" && <UploadErrorState message={mode.message} />}
      {mode.kind === "audio-comparison" && <AudioComparisonReport mode={mode} />}
      {mode.kind === "piano-midi" && <PianoTextureReport mode={mode} />}
      {mode.kind === "audio-pending" && <AudioPendingState mode={mode} />}
      {analysis !== null && selectedTake !== null && (
        <PerformanceReport
          analysis={analysis}
          expertAnalysis={expertAnalysis}
          take={selectedTake}
          expertLabel={expertTake.label}
          isDemo={isDemo}
          summary={mode.kind === "real-midi" ? mode.summary : null}
          analyzedAt={mode.kind === "real-midi" ? mode.analyzedAt : null}
        />
      )}
    </main>
  );
}

function UploadWorkspace({
  isReading,
  studentAudio,
  expertAudio,
  onStudentAudioUpload,
  onExpertAudioUpload,
  onLoadDemo,
}: {
  isReading: boolean;
  studentAudio: AudioAnalysisResult | null;
  expertAudio: AudioAnalysisResult | null;
  onStudentAudioUpload: (file: File | null) => void;
  onExpertAudioUpload: (file: File | null) => void;
  onLoadDemo: () => void;
}) {
  return (
    <section className="launch-grid" aria-label="开始分析" data-testid="upload-workspace">
      <article className="launch-card launch-card--primary" data-testid="student-audio-upload-card">
        <div className="launch-card__title">
          <span className="upload-panel__icon">
            <FileAudio size={18} />
          </span>
          <div>
            <p className="eyebrow">开始一次真实分析</p>
            <h2>上传演奏者音频</h2>
          </div>
        </div>
        <p>上传学生或演奏者的钢琴录音，系统会提取力度包络、起音能量、推进速度和录音可读性。</p>
        <div className="requirement-list">
          <span>支持 wav / mp3 / m4a / flac</span>
          <span>建议 10 秒到 3 分钟</span>
          <span>本地浏览器分析，不上传文件</span>
        </div>
        <FileInputButton
          accept="audio/*,.wav,.mp3,.m4a,.aac,.ogg,.flac"
          disabled={isReading}
          icon={<UploadCloud size={16} />}
          label={isReading ? "正在分析文件" : studentAudio ? "重新选择演奏者音频" : "选择演奏者音频"}
          onFile={onStudentAudioUpload}
        />
        {studentAudio && <UploadSummary label="演奏者音频已就绪" analysis={studentAudio} />}
      </article>

      <article className="launch-card" data-testid="expert-audio-upload-card">
        <div className="launch-card__title">
          <span className="upload-panel__icon">
            <FileAudio size={18} />
          </span>
          <div>
            <p className="eyebrow">专家参考版本</p>
            <h2>上传对比音频</h2>
          </div>
        </div>
        <p>上传教师、专家或目标版本的同一片段。两个音频都完成后，会自动生成对比报告和练习建议。</p>
        <div className="requirement-list">
          <span>片段内容应与演奏者版本一致</span>
          <span>音量不要削波</span>
          <span>用于建立本次评价基准</span>
        </div>
        <FileInputButton
          accept="audio/*,.wav,.mp3,.m4a,.aac,.ogg,.flac"
          disabled={isReading}
          icon={<UploadCloud size={16} />}
          label={isReading ? "正在分析文件" : expertAudio ? "重新选择专家音频" : "选择专家对比音频"}
          onFile={onExpertAudioUpload}
          secondary
        />
        {expertAudio && <UploadSummary label="专家音频已就绪" analysis={expertAudio} />}
      </article>

      <article className="launch-card launch-card--demo" data-testid="demo-card">
        <div className="launch-card__title">
          <span className="upload-panel__icon">
            <Music2 size={18} />
          </span>
          <div>
            <p className="eyebrow">Demo 示例</p>
            <h2>查看报告结构</h2>
          </div>
        </div>
        <p>Demo 只用于了解报告结构，不代表你的演奏，也不会进入真实历史记录。</p>
        <button className="ghost-button" type="button" onClick={onLoadDemo}>
          查看 Demo 报告
        </button>
      </article>
    </section>
  );
}

function UploadSummary({ label, analysis }: { label: string; analysis: AudioAnalysisResult }) {
  return (
    <div className="upload-summary">
      <strong>{label}</strong>
      <span>
        {analysis.durationSeconds.toFixed(1)}s · {analysis.sampleRate}Hz · {analysis.channelCount} 声道
      </span>
      {analysis.warnings.length > 0 && <p>{analysis.warnings[0]}</p>}
    </div>
  );
}

function FileInputButton({
  accept,
  disabled,
  icon,
  label,
  onFile,
  secondary,
}: {
  accept: string;
  disabled: boolean;
  icon: ReactNode;
  label: string;
  onFile: (file: File | null) => void;
  secondary?: boolean;
}) {
  return (
    <label className={secondary ? "upload-button upload-button--secondary" : "upload-button"}>
      {icon}
      <span>{label}</span>
      <input
        type="file"
        accept={accept}
        disabled={disabled}
        onChange={(event) => onFile(event.target.files?.[0] ?? null)}
      />
    </label>
  );
}

function EmptyState({
  studentAudio,
  expertAudio,
  onLoadDemo,
}: {
  studentAudio: AudioAnalysisResult | null;
  expertAudio: AudioAnalysisResult | null;
  onLoadDemo: () => void;
}) {
  const missingText =
    studentAudio === null && expertAudio === null
      ? "请先上传演奏者音频和专家对比音频。"
      : studentAudio === null
        ? "还需要上传演奏者音频，才能生成对比报告。"
        : expertAudio === null
          ? "还需要上传专家对比音频，才能生成对比报告。"
          : "两个音频已就绪，系统将生成报告。";

  return (
    <section className="state-panel" aria-label="空状态" data-testid="empty-state">
      <div>
        <p className="eyebrow">真实分析状态区</p>
        <h2>等待双音频对比</h2>
        <p>{missingText} 默认不会展示样例评分。</p>
      </div>
      <button className="ghost-button" type="button" onClick={onLoadDemo}>
        查看 Demo 示例
      </button>
    </section>
  );
}

function ProcessingState({ input }: { input: "student-audio" | "expert-audio" }) {
  const isStudent = input === "student-audio";

  return (
    <section className="state-panel" aria-live="polite" data-testid="processing-state">
      <div>
        <p className="eyebrow">处理中</p>
        <h2>{isStudent ? "正在分析演奏者音频" : "正在分析专家对比音频"}</h2>
        <p>系统正在提取音频包络、起音能量、节奏推进和录音可读性。两个音频都完成后会自动生成对比报告。</p>
        <p>这个过程在本地浏览器中完成，不会上传或保存你的演奏文件。</p>
      </div>
    </section>
  );
}

function UploadErrorState({ message }: { message: string }) {
  return (
    <section className="state-panel state-panel--error" aria-live="polite" data-testid="upload-error-state">
      <AlertTriangle size={20} />
      <div>
        <p className="eyebrow">不可分析状态</p>
        <h2>这个文件暂时不能生成可靠报告</h2>
        <p>{message}</p>
        <p>请上传中短钢琴音频片段。若文件过大或录音过长，请先截取需要分析的段落后再试。</p>
      </div>
    </section>
  );
}

function PianoTextureReport({ mode }: { mode: Extract<AppMode, { kind: "piano-midi" }> }) {
  const analysis = mode.analysis;
  const scoreItems = [
    { label: "和弦同步", value: analysis.scores.chordSynchrony, detail: "多音同时下键的紧密度" },
    { label: "声部突出", value: analysis.scores.voicingClarity, detail: "旋律声部是否从和声中浮现" },
    { label: "句法气口", value: analysis.scores.phraseBreath, detail: "句尾释放、停顿与再进入" },
    { label: "时间流动", value: analysis.scores.timingFlow, detail: "整体推进是否平稳可控" },
    { label: "织体控制", value: analysis.scores.textureControl, detail: "多声部密度变化的稳定性" },
    { label: "文件可读性", value: analysis.scores.recordingReadiness, detail: "当前 MIDI 是否适合分析" },
  ];

  return (
    <>
      <section className="notice-banner notice-banner--real" data-testid="piano-midi-notice">
        <div>
          钢琴多声部 MIDI 分析：{analysis.summary.fileName}；{analysis.summary.totalNotes} 个音；
          {analysis.summary.chordCount} 个和弦事件；分析时间 {mode.analyzedAt}
        </div>
        {analysis.summary.warnings.length > 0 && (
          <ul className="notice-list">
            {analysis.summary.warnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        )}
      </section>

      <section className="overview-grid" aria-label="钢琴多声部分析总览">
        <MetricCard
          label="核心观察"
          value="多声部钢琴报告"
          detail="当前报告分析正常钢琴片段里的和弦同步、声部突出、织体密度与句法气口。"
          strong
        />
        <MetricCard
          label="平均和弦错位"
          value={`${analysis.summary.meanChordSpreadMs.toFixed(0)}ms`}
          detail="数值越小，和弦纵向同步越集中。"
        />
        <MetricCard
          label="检测到的气口"
          value={String(analysis.summary.breathCount)}
          detail={`平均气口 ${analysis.summary.meanBreathGapSeconds.toFixed(2)}s。`}
        />
      </section>

      <section className="workspace-grid">
        <aside className="panel">
          <div className="panel-heading">
            <h2>钢琴表现力指标</h2>
            <Gauge size={18} />
          </div>
          <dl className="take-meta">
            <div>
              <dt>输入来源</dt>
              <dd>钢琴 MIDI</dd>
            </div>
            <div>
              <dt>轨道数</dt>
              <dd>{analysis.summary.trackCount}</dd>
            </div>
            <div>
              <dt>音符数</dt>
              <dd>{analysis.summary.totalNotes}</dd>
            </div>
            <div>
              <dt>密度</dt>
              <dd>{analysis.summary.densityNotesPerSecond.toFixed(1)} 音/秒</dd>
            </div>
          </dl>
          <div className="score-list">
            {scoreItems.map((item) => (
              <article key={item.label} className="score-row">
                <div className="score-row__header">
                  <div>
                    <h3>{item.label}</h3>
                    <p>{item.detail}</p>
                  </div>
                  <div className="score-values">
                    <strong>{item.value}</strong>
                    <span>规则指标</span>
                  </div>
                </div>
                <div className="meter" aria-hidden="true">
                  <span style={{ width: `${Math.max(4, item.value)}%` }} />
                </div>
              </article>
            ))}
          </div>
        </aside>

        <section className="main-panel">
          <div className="section-heading">
            <div>
              <p className="eyebrow">多声部证据</p>
              <h2>正常钢琴片段的可观察处理</h2>
            </div>
            <Waves size={18} />
          </div>
          <div className="chart-grid">
            <SimpleCurveCard title="织体密度" points={analysis.curves.density} />
            <SimpleCurveCard title="声部突出" points={analysis.curves.voicing} />
            <SimpleCurveCard title="气口间隔" points={analysis.curves.breathGaps} />
            <SimpleCurveCard title="和弦错位" points={analysis.curves.chordSpread} />
          </div>
        </section>

        <aside className="panel evidence-panel">
          <div className="panel-heading">
            <h2>气口与和弦证据</h2>
            <ListChecks size={18} />
          </div>
          <div className="phrase-list">
            {analysis.evidence.breathEvents.length === 0 ? (
              <article className="phrase-card">
                <h3>未检测到明显气口</h3>
                <p>这不一定是问题。若作品本身是连续织体，可结合谱面结构再判断。</p>
              </article>
            ) : (
              analysis.evidence.breathEvents.map((event) => (
                <article key={event.label} className="phrase-card">
                  <div className="phrase-card__top">
                    <h3>{event.label}</h3>
                    <strong>{event.gapSeconds.toFixed(2)}s</strong>
                  </div>
                  <p>这里出现较明显的句法停顿，可作为“气口”或段落再进入的候选位置。</p>
                </article>
              ))
            )}
          </div>
          <div className="research-note">
            <div className="note-title">
              <Info size={16} />
              <strong>体系保留方式</strong>
            </div>
            <p>
              原来的单声部参考对齐体系保留为 future reference-alignment 模块，更适合后续弦乐、管乐或指定谱面片段。
              钢琴默认走多声部与和弦分析。
            </p>
          </div>
        </aside>
      </section>
    </>
  );
}

function AudioPendingState({ mode }: { mode: Extract<AppMode, { kind: "audio-pending" }> }) {
  const analysis = mode.analysis;

  return (
    <section className="audio-panel" aria-label="音频级分析结果" data-testid="audio-pending-state">
      <div className="section-heading">
        <div>
          <p className="eyebrow">音频级分析</p>
          <h2>录音质量与包络概览</h2>
        </div>
        <FileAudio size={18} />
      </div>
      <div className="notice-banner">
        当前音频结果不是音符级表现力评分。如需乐句、触键和音符偏差报告，请上传可对齐的 MIDI。
      </div>
      <div className="overview-grid">
        <MetricCard label="文件" value={analysis.fileName} detail={`分析时间：${mode.analyzedAt}`} />
        <MetricCard label="时长" value={`${analysis.durationSeconds.toFixed(1)}s`} detail={`${analysis.sampleRate}Hz / ${analysis.channelCount} 声道`} />
        <MetricCard label="起音能量" value={String(analysis.estimatedOnsets)} detail={`约 ${analysis.onsetRatePerSecond.toFixed(2)} 次/秒`} />
      </div>
      <div className="chart-grid chart-grid--audio">
        <SimpleCurveCard title="力度包络" points={analysis.rmsCurve} />
        <SimpleCurveCard title="起音能量变化" points={analysis.onsetCurve} />
      </div>
      {analysis.warnings.length > 0 && (
        <div className="source-learning">
          <h3>录音提示</h3>
          <ul>
            {analysis.warnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

function AudioComparisonReport({ mode }: { mode: Extract<AppMode, { kind: "audio-comparison" }> }) {
  const { student, expert, comparison } = mode;
  const adviceItems = buildAudioComparisonAdvice(student, expert, comparison);
  const primaryGap = getPrimaryAudioGap(comparison);

  return (
    <>
      <section className="notice-banner notice-banner--real" data-testid="audio-comparison-notice">
        <div>
          真实音频对比：演奏者版本 vs 专家版本；分析时间 {mode.analyzedAt}
        </div>
        {(student.warnings.length > 0 || expert.warnings.length > 0) && (
          <ul className="notice-list">
            {student.warnings.map((warning) => (
              <li key={`student-${warning}`}>演奏者音频：{warning}</li>
            ))}
            {expert.warnings.map((warning) => (
              <li key={`expert-${warning}`}>专家音频：{warning}</li>
            ))}
          </ul>
        )}
      </section>

      <section className="overview-grid" aria-label="音频对比总览">
        <MetricCard
          label="核心差距"
          value={primaryGap.label}
          detail={primaryGap.text}
          strong
        />
        <MetricCard
          label="综合接近度"
          value={String(comparison.overallSimilarity)}
          detail="综合力度包络、起音能量、推进速度和录音可读性。"
        />
        <MetricCard
          label="改进建议"
          value={String(adviceItems.length)}
          detail="每条建议都绑定评分差距和音频证据。"
        />
      </section>

      <section className="workspace-grid">
        <aside className="panel">
          <div className="panel-heading">
            <h2>音频对比评分</h2>
            <Gauge size={18} />
          </div>
          <dl className="take-meta">
            <div>
              <dt>演奏者版本</dt>
              <dd>{student.durationSeconds.toFixed(1)}s</dd>
            </div>
            <div>
              <dt>专家版本</dt>
              <dd>{expert.durationSeconds.toFixed(1)}s</dd>
            </div>
            <div>
              <dt>演奏者起音</dt>
              <dd>{student.estimatedOnsets}</dd>
            </div>
            <div>
              <dt>专家起音</dt>
              <dd>{expert.estimatedOnsets}</dd>
            </div>
          </dl>
          <div className="score-list">
            <AudioScoreRow
              label="力度轮廓接近度"
              detail="两版音频的能量包络形状是否接近"
              value={comparison.dynamicSimilarity}
            />
            <AudioScoreRow
              label="起音结构接近度"
              detail="重音、进入点和局部起伏是否接近"
              value={comparison.onsetSimilarity}
            />
            <AudioScoreRow
              label="推进速度接近度"
              detail="整体事件密度是否接近专家版本"
              value={comparison.pacingSimilarity}
            />
            <AudioScoreRow
              label="录音可读性"
              detail="电平、静音和削波是否足以支撑判断"
              value={comparison.recordingReadiness}
            />
          </div>
        </aside>

        <section className="main-panel">
          <div className="section-heading">
            <div>
              <p className="eyebrow">对比证据</p>
              <h2>演奏者与专家版本的音频曲线</h2>
            </div>
            <Waves size={18} />
          </div>
          <div className="chart-grid">
            <LineChart
              title="力度包络"
              subtitle="绿色为演奏者，灰色虚线为专家"
              points={student.rmsCurve}
              referencePoints={expert.rmsCurve}
              valueFormatter={(value) => value.toFixed(2)}
              icon={<Activity size={17} />}
            />
            <LineChart
              title="起音能量变化"
              subtitle="用于观察重音、进入点和局部清晰度"
              points={student.onsetCurve}
              referencePoints={expert.onsetCurve}
              valueFormatter={(value) => value.toFixed(2)}
              icon={<Target size={17} />}
            />
          </div>
          <div className="source-learning">
            <h3>评分解释</h3>
            <ul>
              {comparison.explanation.map((line) => (
                <li key={line}>{line}</li>
              ))}
              <li>上线前当前版本将专家音频视为本次任务的参照标准，减少人工专家逐项打分带来的主观漂移。</li>
            </ul>
          </div>
        </section>

        <aside className="panel evidence-panel">
          <div className="panel-heading">
            <h2>应该如何改进</h2>
            <ListChecks size={18} />
          </div>
          <AdjustmentPanel items={adviceItems} />
          <div className="research-note">
            <div className="note-title">
              <Info size={16} />
              <strong>上线边界</strong>
            </div>
            <p>
              当前版本做音频级对比，适合先判断力度、起音、整体推进和录音质量。若要精确到错音、左右手声部或和弦纵向同步，下一阶段需要加入谱面或音频转 MIDI 对齐。
            </p>
          </div>
        </aside>
      </section>
    </>
  );
}

function AudioScoreRow({ label, detail, value }: { label: string; detail: string; value: number }) {
  return (
    <article className="score-row">
      <div className="score-row__header">
        <div>
          <h3>{label}</h3>
          <p>{detail}</p>
        </div>
        <div className="score-values">
          <strong>{Math.round(value)}</strong>
          <span>满分 100</span>
        </div>
      </div>
      <div className={value >= 70 ? "score-delta" : "score-delta score-delta--low"}>
        {value >= 85 ? "接近专家版本" : value >= 70 ? "可接受，但有局部差异" : "需要重点调整"}
      </div>
      <div className="meter" aria-hidden="true">
        <span style={{ width: `${Math.max(4, Math.min(100, value))}%` }} />
      </div>
    </article>
  );
}

function PerformanceReport({
  analysis,
  expertAnalysis,
  take,
  expertLabel,
  isDemo,
  summary,
  analyzedAt,
}: {
  analysis: PerformanceAnalysisResult;
  expertAnalysis: PerformanceAnalysisResult;
  take: PerformanceTake;
  expertLabel: string;
  isDemo: boolean;
  summary: MidiUploadSummary | null;
  analyzedAt: string | null;
}) {
  const primaryGap = getPrimaryScoreGap(analysis.scores, expertAnalysis.scores);
  const adjustmentItems = buildAdjustmentItems(analysis, expertAnalysis);

  return (
    <>
      {isDemo ? (
        <DemoModeNotice />
      ) : (
        <RealAnalysisNotice take={take} summary={summary} analyzedAt={analyzedAt} />
      )}
      <section className="overview-grid" aria-label="分析总览">
        <MetricCard
          label={isDemo ? "示例报告结构" : "核心差距"}
          value={isDemo ? "Demo 报告" : primaryGap.label}
          detail={
            isDemo
              ? "这是一组用于展示图表和建议格式的示例数据，不代表你的演奏水平。"
              : primaryGap.text
          }
          strong
        />
        <MetricCard label="风格距离" value={String(Math.round(analysis.scores.styleDistance))} detail="相对参考轨越低越接近。" />
        <MetricCard label="可执行建议" value={String(adjustmentItems.length)} detail="每条建议由评分差距和证据曲线共同触发。" />
      </section>

      <section className="workspace-grid">
        <aside className="panel">
          <div className="panel-heading">
            <h2>表现力指标</h2>
            <Gauge size={18} />
          </div>
          <TakeMeta take={take} analysis={analysis} expertLabel={expertLabel} />
          <div className="score-list">
            {scoreLabels.map((score) => (
              <ScoreRow
                key={score.key}
                label={score.label}
                detail={score.detail}
                value={analysis.scores[score.key]}
                referenceValue={expertAnalysis.scores[score.key]}
                inverse={score.key === "styleDistance"}
              />
            ))}
          </div>
        </aside>

        <section className="main-panel">
          <div className="section-heading">
            <div>
              <p className="eyebrow">证据曲线</p>
              <h2>可观察的钢琴演奏处理</h2>
            </div>
            <Waves size={18} />
          </div>
          <div className="chart-grid">
            <LineChart title="局部速度比例" subtitle="谱面间隔 / 实际演奏间隔" points={analysis.evidence.tempoCurve.map(tempoPoint)} referencePoints={expertAnalysis.evidence.tempoCurve.map(tempoPoint)} valueFormatter={(value) => `${value.toFixed(2)}x`} icon={<Clock3 size={17} />} />
            <LineChart title="力度轮廓" subtitle="实际力度与谱面力度走向" points={analysis.evidence.dynamicCurve.map(dynamicPoint)} referencePoints={expertAnalysis.evidence.dynamicCurve.map(dynamicPoint)} valueFormatter={(value) => String(Math.round(value))} icon={<Activity size={17} />} />
            <BarChart title="起音偏差" subtitle="相对谱面网格的秒级偏移" points={analysis.evidence.onsetDeviations.map(onsetPoint)} referencePoints={expertAnalysis.evidence.onsetDeviations.map(onsetPoint)} valueFormatter={(value) => `${value >= 0 ? "+" : ""}${value.toFixed(2)}s`} icon={<Target size={17} />} />
            <LineChart title="触键时值比例" subtitle="实际时值 / 谱面时值" points={analysis.evidence.articulationRatios.map(articulationPoint)} referencePoints={expertAnalysis.evidence.articulationRatios.map(articulationPoint)} valueFormatter={(value) => `${value.toFixed(2)}x`} icon={<BarChart3 size={17} />} />
          </div>
        </section>

        <aside className="panel evidence-panel">
          <div className="panel-heading">
            <h2>证据与建议</h2>
            <ListChecks size={18} />
          </div>
          <PhraseList phrases={analysis.evidence.phraseSummaries} />
          <AdjustmentPanel items={adjustmentItems} />
          <div className="research-note">
            <div className="note-title">
              <Info size={16} />
              <strong>解释边界</strong>
            </div>
            <p>当前指标是规则化试行分析，用于描述可观察的演奏选择，不代表艺术价值判断，也不能替代教师批改。</p>
          </div>
        </aside>
      </section>
    </>
  );
}

function MetricCard({
  label,
  value,
  detail,
  strong,
}: {
  label: string;
  value: string;
  detail: string;
  strong?: boolean;
}) {
  return (
    <article className={strong ? "overview-card overview-card--strong" : "overview-card"}>
      <span>{label}</span>
      <strong>{value}</strong>
      <p>{detail}</p>
    </article>
  );
}

function DemoModeNotice() {
  return (
    <section className="notice-banner notice-banner--demo" data-testid="demo-notice">
      Demo 示例数据，不代表你的演奏。它只用于了解报告结构，不会作为真实分析结果。
    </section>
  );
}

function RealAnalysisNotice({
  take,
  summary,
  analyzedAt,
}: {
  take: PerformanceTake;
  summary: MidiUploadSummary | null;
  analyzedAt: string | null;
}) {
  return (
    <section className="notice-banner notice-banner--real" data-testid="real-analysis-notice">
      <div>
        真实 MIDI 分析：{take.label}
        {summary && `；音高匹配率 ${Math.round(summary.pitchMatchRatio * 100)}%，对齐 ${summary.alignedNotes}/${summary.totalNotes} 音`}
        {analyzedAt && `；分析时间 ${analyzedAt}`}
      </div>
      {summary && summary.warnings.length > 0 && (
        <ul className="notice-list">
          {summary.warnings.map((warning) => (
            <li key={warning}>{warning}</li>
          ))}
        </ul>
      )}
    </section>
  );
}

function TakeMeta({
  take,
  analysis,
  expertLabel,
}: {
  take: PerformanceTake;
  analysis: PerformanceAnalysisResult;
  expertLabel: string;
}) {
  const meanDeviation =
    analysis.evidence.onsetDeviations.reduce((sum, point) => sum + point.absoluteDeviation, 0) /
    analysis.evidence.onsetDeviations.length;

  return (
    <dl className="take-meta">
      <div>
        <dt>输入来源</dt>
        <dd>{take.id.startsWith("uploaded") ? "上传 MIDI" : "Demo 示例"}</dd>
      </div>
      <div>
        <dt>音符数</dt>
        <dd>{analysis.alignedNotes.length}</dd>
      </div>
      <div>
        <dt>平均起音误差</dt>
        <dd>{meanDeviation.toFixed(3)}s</dd>
      </div>
      <div>
        <dt>参考轨</dt>
        <dd>{expertLabel}</dd>
      </div>
      <div className="wide">
        <dt>数据集</dt>
        <dd>{take.label}</dd>
      </div>
    </dl>
  );
}

function ScoreRow({
  label,
  detail,
  value,
  referenceValue,
  inverse,
}: {
  label: string;
  detail: string;
  value: number;
  referenceValue: number;
  inverse?: boolean;
}) {
  const displayValue = Math.round(value);
  const strength = inverse ? 100 - value : value;
  const delta = value - referenceValue;
  const normalizedDelta = inverse ? -delta : delta;
  const deltaLabel =
    Math.abs(delta) < 0.5
      ? "与参考轨持平"
      : `${normalizedDelta > 0 ? "高于" : "低于"}参考轨 ${Math.abs(Math.round(delta))}`;

  return (
    <article className="score-row">
      <div className="score-row__header">
        <div>
          <h3>{label}</h3>
          <p>{detail}</p>
        </div>
        <div className="score-values">
          <strong>{displayValue}</strong>
          <span>参考 {Math.round(referenceValue)}</span>
        </div>
      </div>
      <div className={normalizedDelta >= -0.5 ? "score-delta" : "score-delta score-delta--low"}>{deltaLabel}</div>
      <div className="meter" aria-hidden="true">
        <span style={{ width: `${Math.max(4, Math.min(100, strength))}%` }} />
      </div>
    </article>
  );
}

function PhraseList({ phrases }: { phrases: PhraseSummary[] }) {
  return (
    <div className="phrase-list">
      {phrases.map((phrase) => (
        <article key={phrase.phraseId} className="phrase-card">
          <div className="phrase-card__top">
            <h3>{phrase.phraseId.toUpperCase()}</h3>
            <strong>{Math.round(phrase.stabilityScore)}</strong>
          </div>
          <dl>
            <div>
              <dt>速度波动</dt>
              <dd>{phrase.tempoVariation.toFixed(3)}</dd>
            </div>
            <div>
              <dt>力度范围</dt>
              <dd>{phrase.dynamicRange.toFixed(1)}</dd>
            </div>
            <div>
              <dt>触键比例</dt>
              <dd>{phrase.meanArticulationRatio.toFixed(2)}x</dd>
            </div>
            <div>
              <dt>起音 RMS</dt>
              <dd>{phrase.onsetDeviationRms.toFixed(3)}s</dd>
            </div>
          </dl>
        </article>
      ))}
    </div>
  );
}

function AdjustmentPanel({ items }: { items: AdjustmentItem[] }) {
  return (
    <section className="adjustment-panel" aria-label="应该如何调整">
      <div className="adjustment-panel__heading">
        <div>
          <p className="eyebrow">调整建议</p>
          <h2>应该如何调整</h2>
        </div>
      </div>
      <div className="adjustment-list">
        {items.map((item) => (
          <article key={item.id} className="adjustment-card">
            <div className="adjustment-card__top">
              <span className={`priority-badge priority-badge--${item.priority}`}>{item.priority}</span>
              <h3>{item.title}</h3>
            </div>
            <dl>
              <div>
                <dt>评分依据</dt>
                <dd>{item.scoreText}</dd>
              </div>
              <div>
                <dt>证据解释</dt>
                <dd>{item.evidenceText}</dd>
              </div>
              <div>
                <dt>调整动作</dt>
                <dd>{item.actionText}</dd>
              </div>
            </dl>
          </article>
        ))}
      </div>
    </section>
  );
}

function LineChart({
  icon,
  title,
  subtitle,
  points,
  referencePoints,
  valueFormatter,
}: {
  icon: ReactNode;
  title: string;
  subtitle: string;
  points: ChartSeriesPoint[];
  referencePoints: ChartSeriesPoint[];
  valueFormatter: (value: number) => string;
}) {
  const [min, max] = extent([...points, ...referencePoints].map((point) => point.value));
  const path = makeLinePath(points, min, max);
  const referencePath = makeLinePath(referencePoints, min, max);

  return (
    <article className="chart-card">
      <ChartTitle icon={icon} title={title} subtitle={subtitle} />
      <svg className="chart" viewBox="0 0 360 170" role="img" aria-label={title}>
        <g className="grid-lines">
          {[30, 70, 110, 150].map((y) => (
            <line key={y} x1="24" x2="342" y1={y} y2={y} />
          ))}
        </g>
        <path className="line-path line-path--reference" d={referencePath} />
        <path className="line-path" d={path} />
        {points.map((point, index) => {
          const x = xScale(index, points.length);
          const y = yScale(point.value, min, max);
          return <circle key={`${point.label}-${index}`} cx={x} cy={y} r="3.8" />;
        })}
      </svg>
      <div className="chart-footer">
        <span>{points[0]?.label}</span>
        <strong>{valueFormatter(points[points.length - 1]?.value ?? 0)}</strong>
      </div>
    </article>
  );
}

function BarChart({
  icon,
  title,
  subtitle,
  points,
  referencePoints,
  valueFormatter,
}: {
  icon: ReactNode;
  title: string;
  subtitle: string;
  points: ChartSeriesPoint[];
  referencePoints: ChartSeriesPoint[];
  valueFormatter: (value: number) => string;
}) {
  const maxAbs = Math.max(
    ...points.map((point) => Math.abs(point.value)),
    ...referencePoints.map((point) => Math.abs(point.value)),
    0.01,
  );

  return (
    <article className="chart-card">
      <ChartTitle icon={icon} title={title} subtitle={subtitle} />
      <svg className="chart" viewBox="0 0 360 170" role="img" aria-label={title}>
        <line className="zero-line" x1="24" x2="342" y1="85" y2="85" />
        {points.map((point, index) => {
          const x = xScale(index, points.length);
          const barHeight = (Math.abs(point.value) / maxAbs) * 58;
          const y = point.value >= 0 ? 85 - barHeight : 85;
          return (
            <rect
              key={`${point.label}-${index}`}
              className={point.value >= 0 ? "bar-positive" : "bar-negative"}
              x={x - 5}
              y={y}
              width="10"
              height={Math.max(3, barHeight)}
            />
          );
        })}
      </svg>
      <div className="chart-footer">
        <span>{points[0]?.label}</span>
        <strong>{valueFormatter(points[points.length - 1]?.value ?? 0)}</strong>
      </div>
    </article>
  );
}

function SimpleCurveCard({ title, points }: { title: string; points: ChartSeriesPoint[] }) {
  return (
    <LineChart
      icon={<Waves size={17} />}
      title={title}
      subtitle="归一化音频特征，不是音符级评分"
      points={points}
      referencePoints={points}
      valueFormatter={(value) => value.toFixed(2)}
    />
  );
}

function ChartTitle({ icon, title, subtitle }: { icon: ReactNode; title: string; subtitle: string }) {
  return (
    <div className="chart-card__title">
      <span className="icon-box">{icon}</span>
      <div>
        <h3>{title}</h3>
        <p>{subtitle}</p>
      </div>
    </div>
  );
}

function statusTitle(mode: AppMode) {
  if (mode.kind === "processing") return mode.input === "student-audio" ? "正在检查演奏者音频" : "正在检查专家音频";
  if (mode.kind === "audio-comparison") return "已生成演奏者与专家音频对比报告";
  if (mode.kind === "piano-midi") return "已生成钢琴多声部 MIDI 报告";
  if (mode.kind === "demo") return "正在查看 Demo 示例报告";
  if (mode.kind === "real-midi") return `${mode.take.label} 对比参考轨`;
  if (mode.kind === "audio-pending") return "音频已完成本地质量检查";
  if (mode.kind === "upload-error") return "文件未通过可分析性检查";
  return "等待上传演奏者音频与专家音频";
}

function statusPillText(mode: AppMode) {
  if (mode.kind === "processing") return "本地处理中";
  if (mode.kind === "audio-comparison") return "真实音频对比";
  if (mode.kind === "piano-midi") return "钢琴多声部分析";
  if (mode.kind === "demo") return "Demo 示例";
  if (mode.kind === "real-midi") return "真实 MIDI 分析";
  if (mode.kind === "audio-pending") return "音频级分析";
  if (mode.kind === "upload-error") return "未生成评分";
  return "空状态";
}

function statusPillClass(mode: AppMode) {
  if (mode.kind === "audio-comparison" || mode.kind === "real-midi" || mode.kind === "piano-midi") return "status-pill";
  if (mode.kind === "processing") return "status-pill status-pill--warning";
  if (mode.kind === "demo") return "status-pill status-pill--warning";
  if (mode.kind === "upload-error") return "status-pill status-pill--error";
  return "status-pill status-pill--neutral";
}

function tempoPoint(point: TempoCurvePoint): ChartSeriesPoint {
  return { label: point.noteId, value: point.localTempoRatio };
}

function dynamicPoint(point: DynamicCurvePoint): ChartSeriesPoint {
  return { label: point.noteId, value: point.performedVelocity };
}

function onsetPoint(point: OnsetDeviationPoint): ChartSeriesPoint {
  return { label: point.noteId, value: point.deviation };
}

function articulationPoint(point: ArticulationRatioPoint): ChartSeriesPoint {
  return { label: point.noteId, value: point.ratio };
}

function getPrimaryAudioGap(comparison: AudioComparisonResult) {
  const candidates = [
    { label: "力度轮廓", score: comparison.dynamicSimilarity, text: "演奏者版本与专家版本的力度包络差异最大。" },
    { label: "起音结构", score: comparison.onsetSimilarity, text: "重音、进入点或局部起伏与专家版本差异最大。" },
    { label: "整体推进", score: comparison.pacingSimilarity, text: "演奏事件密度和整体推进速度需要优先校准。" },
    { label: "录音质量", score: comparison.recordingReadiness, text: "当前录音条件影响了系统判断，需要先改善录音。" },
  ].sort((a, b) => a.score - b.score);

  const primary = candidates[0];
  if (primary.score >= 82) {
    return { label: "整体接近专家版本", text: "主要音频指标接近，可以进入局部乐句精修。" };
  }

  return { label: primary.label, text: `${primary.text} 当前该项接近度为 ${Math.round(primary.score)}。` };
}

function buildAudioComparisonAdvice(
  student: AudioAnalysisResult,
  expert: AudioAnalysisResult,
  comparison: AudioComparisonResult,
): AdjustmentItem[] {
  const items: AdjustmentItem[] = [];
  const dynamicRangeGap = expert.dynamicRangeDb - student.dynamicRangeDb;
  const onsetRateGap = student.onsetRatePerSecond - expert.onsetRatePerSecond;
  const durationGap = student.durationSeconds - expert.durationSeconds;

  if (comparison.dynamicSimilarity < 78) {
    items.push({
      id: "audio-dynamic-shape",
      priority: comparison.dynamicSimilarity < 62 ? "重点" : "观察",
      title: dynamicRangeGap > 1.8 ? "扩大乐句内部的力度层次" : "让力度峰值位置更接近专家版本",
      scoreText: `力度轮廓接近度 ${comparison.dynamicSimilarity} 分；演奏者动态范围 ${student.dynamicRangeDb.toFixed(1)}dB，专家版本 ${expert.dynamicRangeDb.toFixed(1)}dB。`,
      evidenceText: "中央“力度包络”曲线中绿色线与灰色虚线分离的位置，就是需要对照练习的乐句区域。",
      actionText:
        dynamicRangeGap > 1.8
          ? "先用中慢速练习，把每个乐句的起点、最高点、回落点标在谱面上，避免全句同一音量。"
          : "不要只追求更响，先模仿专家版本的峰值出现时机，再决定是否增加音量。",
    });
  }

  if (comparison.onsetSimilarity < 78) {
    items.push({
      id: "audio-onset-clarity",
      priority: comparison.onsetSimilarity < 62 ? "重点" : "观察",
      title: "校准重音和进入点的清晰度",
      scoreText: `起音结构接近度 ${comparison.onsetSimilarity} 分；演奏者检测到 ${student.estimatedOnsets} 个起音，专家版本 ${expert.estimatedOnsets} 个。`,
      evidenceText: "“起音能量变化”曲线峰值不一致时，通常意味着重音位置、句首进入或触键清晰度不同。",
      actionText: "分手练习旋律声部，先让句首和重音点稳定出现；再加入伴奏声部和踏板。",
    });
  }

  if (comparison.pacingSimilarity < 78 || Math.abs(durationGap) > 2.5) {
    items.push({
      id: "audio-pacing",
      priority: comparison.pacingSimilarity < 62 ? "重点" : "观察",
      title: onsetRateGap > 0 ? "减少抢拍和过密推进" : "增强段落推进，不要停滞",
      scoreText: `推进速度接近度 ${comparison.pacingSimilarity} 分；演奏者约 ${student.onsetRatePerSecond.toFixed(2)} 次起音/秒，专家约 ${expert.onsetRatePerSecond.toFixed(2)} 次起音/秒。`,
      evidenceText: "如果两版总时长或单位时间起音数量差异明显，整体速度框架会先于细节表现被拉开。",
      actionText:
        onsetRateGap > 0
          ? "先用节拍器固定大拍，只允许句尾做微小延展，避免中段无意识加速。"
          : "保持大拍流动，句尾停顿后要主动回到下一句，不要让气口变成断裂。",
    });
  }

  if (comparison.recordingReadiness < 75 || student.warnings.length > 0) {
    items.push({
      id: "audio-recording",
      priority: comparison.recordingReadiness < 58 ? "重点" : "观察",
      title: "先修正录音条件，再判断演奏问题",
      scoreText: `录音可读性 ${comparison.recordingReadiness} 分；峰值 ${student.peakAmplitude.toFixed(2)}，静音比例 ${(student.silenceRatio * 100).toFixed(0)}%。`,
      evidenceText: "电平过低、削波或长时间静音会让系统误判起音和力度曲线。",
      actionText: "手机或麦克风离钢琴保持固定距离，试录时让最强音不要爆音，导出前截掉开头结尾空白。",
    });
  }

  if (items.length === 0) {
    return [
      {
        id: "audio-close-reference",
        priority: "保持",
        title: "整体已经接近专家音频",
        scoreText: `综合接近度 ${comparison.overallSimilarity} 分，主要指标没有明显短板。`,
        evidenceText: "两条证据曲线整体贴近，差异更可能来自局部乐句或音符级细节。",
        actionText: "保持当前整体处理，下一步建议上传更长片段或引入谱面对齐来定位具体小节。",
      },
    ];
  }

  return items.slice(0, 4);
}

function getPrimaryScoreGap(scores: PerformanceScores, expertScores: PerformanceScores) {
  const gaps = scoreLabels.map((score) => {
    const rawGap = expertScores[score.key] - scores[score.key];
    const gap = score.key === "styleDistance" ? scores[score.key] - expertScores[score.key] : rawGap;
    return { label: score.label, gap };
  });
  const primary = gaps.sort((a, b) => b.gap - a.gap)[0];

  if (!primary || primary.gap <= 1) {
    return { label: "接近参考轨", text: "当前版本与参考轨的主要指标接近，可转向局部乐句精修。" };
  }

  return { label: primary.label, text: `当前最需要关注的维度，和参考轨相差约 ${Math.round(primary.gap)} 分。` };
}

function buildAdjustmentItems(
  analysis: PerformanceAnalysisResult,
  expertAnalysis: PerformanceAnalysisResult,
): AdjustmentItem[] {
  const items: AdjustmentItem[] = [];
  const timingGap = expertAnalysis.scores.timingExpressivity - analysis.scores.timingExpressivity;
  const dynamicGap = expertAnalysis.scores.dynamicShaping - analysis.scores.dynamicShaping;
  const articulationGap = expertAnalysis.scores.articulationControl - analysis.scores.articulationControl;
  const phraseGap = expertAnalysis.scores.phraseCoherence - analysis.scores.phraseCoherence;

  if (timingGap > 4) {
    items.push({
      id: "timing",
      priority: timingGap > 12 ? "重点" : "观察",
      title: "先把 rubato 从随机推拉改成乐句级塑形",
      scoreText: `速度处理低于参考轨 ${Math.round(timingGap)} 分。`,
      evidenceText: "查看局部速度比例曲线中绿色线与灰色参考线差距最大的段落。",
      actionText: "用慢速节拍器固定骨架，再只允许句尾 1-2 个音做微小延展。",
    });
  }

  if (dynamicGap > 4) {
    items.push({
      id: "dynamic",
      priority: dynamicGap > 12 ? "重点" : "观察",
      title: "重画每个乐句的力度拱形",
      scoreText: `力度塑形低于参考轨 ${Math.round(dynamicGap)} 分。`,
      evidenceText: "力度轮廓曲线显示当前演奏与参考轨的峰值位置或力度范围不同。",
      actionText: "先在谱面上标出每句的最低点、最高点和回落点；练习时只保留一个主峰。",
    });
  }

  if (articulationGap > 4) {
    items.push({
      id: "articulation",
      priority: articulationGap > 12 ? "重点" : "观察",
      title: "统一触键比例，再处理细节连断",
      scoreText: `触键控制低于参考轨 ${Math.round(articulationGap)} 分。`,
      evidenceText: "触键时值比例曲线可显示偏短、偏长或不稳定的音符段落。",
      actionText: "先分手练习旋律声部，保持离键时间可预测；再加入踏板。",
    });
  }

  if (phraseGap > 4) {
    items.push({
      id: "phrase",
      priority: phraseGap > 12 ? "重点" : "观察",
      title: "优先修正乐句方向感",
      scoreText: `乐句连贯性低于参考轨 ${Math.round(phraseGap)} 分。`,
      evidenceText: "乐句证据中稳定度较低的句子通常同时出现速度、力度或触键波动。",
      actionText: "把该乐句拆成起句、推进、落点三段，只允许一个主要方向。",
    });
  }

  if (items.length === 0) {
    return [
      {
        id: "close-reference",
        priority: "保持",
        title: "当前版本已接近参考轨",
        scoreText: "主要指标没有明显低于参考轨。",
        evidenceText: "绿色当前曲线与灰色参考线整体接近，差异主要集中在局部音符。",
        actionText: "保持当前整体处理，只针对最不稳定的单个乐句做慢练和复录验证。",
      },
    ];
  }

  return items.slice(0, 4);
}

function makeLinePath(points: ChartSeriesPoint[], min: number, max: number) {
  return points
    .map((point, index) => {
      const command = index === 0 ? "M" : "L";
      return `${command} ${xScale(index, points.length).toFixed(2)} ${yScale(point.value, min, max).toFixed(2)}`;
    })
    .join(" ");
}

function xScale(index: number, count: number) {
  return count <= 1 ? 24 : 24 + (index / (count - 1)) * 318;
}

function yScale(value: number, min: number, max: number) {
  if (max === min) {
    return 85;
  }

  return 150 - ((value - min) / (max - min)) * 120;
}

function extent(values: number[]): [number, number] {
  const min = Math.min(...values);
  const max = Math.max(...values);
  const pad = (max - min || 1) * 0.12;
  return [min - pad, max + pad];
}
