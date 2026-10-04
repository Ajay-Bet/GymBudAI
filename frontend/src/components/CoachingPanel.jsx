// Display-only panel for the feedback scheduler's state (Sprint 4, GB 402/403).
// Cue selection, cooldowns, tracking text and speech decisions come from `feedback/`; nothing is calculated here.
// Text never depends on speech: every spoken cue is the primary cue shown below.
import { SPEECH_UNAVAILABLE_TEXT, getTrackingText } from '../feedback/cues.js';

const OFF_TEXT = 'Form coaching off: no rule has been validated yet';
const REVIEW_LABEL = 'Unvalidated rule — review mode';

function cueArea(feedback, cameraOn) {
  if (!cameraOn) return { text: 'Start the camera to see coaching cues.', muted: true };
  if (!feedback) return { text: 'Waiting for tracking.', muted: true };
  if (feedback.primaryCue) return { text: feedback.primaryCue.text, cue: feedback.primaryCue };
  // Text for 'no-validated-rules' comes from the feedback module's tracking texts.
  if (feedback.status === 'off') return { text: feedback.tracking?.reason === 'no-validated-rules' && feedback.tracking.text ? feedback.tracking.text : OFF_TEXT, muted: true };
  if (feedback.status === 'unavailable') return { text: 'No form feedback while analysis is paused.', muted: true };
  // 'watching': analysis is running but no cue is eligible. This is not a statement that form is good.
  return { text: 'Watching — no correction to show.', muted: true };
}

function trackingArea(feedback, cameraOn) {
  if (!cameraOn) return { text: 'Analysis off: camera is not running.', paused: true };
  if (!feedback) return { text: 'Analysis paused: waiting for tracking.', paused: true };
  if (feedback.tracking?.assessable) return { text: 'Analysis active: your position can be assessed.', paused: false };
  // Every reason (including newer ones such as 'low-frame-rate') is worded by cues.js, never here.
  return { text: `Analysis paused: ${getTrackingText(feedback.tracking?.reason ?? 'tracking-loss')}`, paused: true };
}

const OUTPUT_OPTIONS = [
  { value: 'text', label: 'Text' },
  { value: 'audio-text', label: 'Audio + text' },
];
const AI_DISCLOSURE = 'Voice is AI-generated (OpenAI)';

const CoachingPanel = ({
  feedback, cameraOn,
  outputMode = 'text', onOutputModeChange,
  voiceAvailable, voiceMuted, onToggleVoiceMuted, volume, onVolumeChange,
  aiVoiceAvailable = false, aiVoice = false, onAiVoiceChange, voiceDisclosure,
  reviewMode, onReviewModeChange, reviewModeLocked,
}) => {
  const audioMode = outputMode === 'audio-text';
  const anyVoice = voiceAvailable || (aiVoiceAvailable && aiVoice);
  let voiceStatus;
  if (!audioMode) voiceStatus = 'Text only: nothing is spoken. Choose Audio + text to hear cues.';
  else if (!anyVoice) voiceStatus = `${SPEECH_UNAVAILABLE_TEXT}.`;
  else if (voiceMuted) voiceStatus = 'Voice muted; cues are still shown as text.';
  else voiceStatus = 'Voice on. Spoken cues repeat the text above and are rate-limited.';

  const cue = cueArea(feedback, cameraOn);
  const tracking = trackingArea(feedback, cameraOn);
  // The scheduler sets cue.label ('unvalidated rule') unless the rule is validated.
  const unvalidated = Boolean(cue.cue?.label);
  return (
    <div className="mt-5 rounded-lg border border-zinc-600 p-4 text-sm">
      <h3 className="font-bold text-[#7ccc44]">Form coaching</h3>

      <div className="mt-3 rounded-lg bg-zinc-900 p-4" role="status" aria-live="polite" aria-atomic="true">
        <p className="text-gray-300">Current cue</p>
        <p className={`mt-1 text-2xl sm:text-3xl font-bold leading-tight break-words ${cue.muted ? 'text-gray-200' : 'text-white'}`}>{cue.text}</p>
        {unvalidated && <p className="mt-2 inline-block rounded border border-amber-300 px-2 py-0.5 text-xs font-bold uppercase tracking-wide text-amber-200">{cue.cue.validation === 'experimental-model' ? 'Experimental rep-end model prediction' : REVIEW_LABEL}</p>}
      </div>

      <div className={`mt-3 rounded-lg border p-3 ${tracking.paused ? 'border-amber-300 text-amber-100' : 'border-zinc-600 text-gray-100'}`} role="status" aria-live="polite">
        <p><strong>Tracking:</strong> {tracking.text}</p>
      </div>

      <fieldset className="mt-4">
        <legend className="font-bold">Feedback output</legend>
        <div className="mt-2 inline-flex rounded-lg border border-zinc-500 overflow-hidden" role="radiogroup" aria-label="Feedback output">
          {OUTPUT_OPTIONS.map((option) => (
            <label key={option.value} className={`cursor-pointer px-4 py-2 ${outputMode === option.value ? 'bg-[#7ccc44] text-[#24201f] font-bold' : 'bg-zinc-800'}`}>
              <input type="radio" name="feedback-output" value={option.value} checked={outputMode === option.value}
                onChange={() => onOutputModeChange(option.value)} className="sr-only" />
              {option.label}
            </label>
          ))}
        </div>
      </fieldset>

      {audioMode && (
        <div className="mt-3 flex flex-wrap items-center gap-4">
          <button type="button" onClick={onToggleVoiceMuted} aria-pressed={voiceMuted} disabled={!anyVoice}
            className="px-4 py-2 rounded-lg bg-zinc-700 disabled:opacity-50">{voiceMuted ? 'Unmute voice' : 'Mute voice'}</button>
          <label className="flex items-center gap-2">
            <span>Voice volume</span>
            <input type="range" min="0" max="1" step="0.1" value={volume} onChange={(event) => onVolumeChange(Number(event.target.value))}
              disabled={!anyVoice} aria-valuetext={`${Math.round(volume * 100)}%`} className="w-32 accent-[#7ccc44]" />
            <span aria-hidden="true">{Math.round(volume * 100)}%</span>
          </label>
        </div>
      )}
      {audioMode && aiVoiceAvailable && (
        <label className="mt-3 flex items-start gap-2">
          <input type="checkbox" className="mt-1" checked={aiVoice} onChange={(event) => onAiVoiceChange(event.target.checked)} />
          <span>Natural AI voice <span className="text-gray-300">(falls back to the browser voice when slow or offline)</span></span>
        </label>
      )}
      {audioMode && aiVoiceAvailable && aiVoice && <p className="mt-1 font-bold text-sky-100">{voiceDisclosure || AI_DISCLOSURE}</p>}
      <p className="mt-2 text-gray-300" role="status" aria-live="polite">{voiceStatus}</p>

      <label className="mt-4 flex items-start gap-2">
        <input type="checkbox" className="mt-1" checked={reviewMode} onChange={(event) => onReviewModeChange(event.target.checked)} disabled={reviewModeLocked} />
        <span>Review unvalidated rules (developer)</span>
      </label>
      <p className="mt-1 text-gray-300">
        Off by default. When on, rules that have not been validated against reviewed examples can show and speak cues, each labelled as unvalidated. This is for evaluating recordings, not user coaching.
        {reviewModeLocked ? ' Stop the camera to change this setting.' : ''}
      </p>
      <p className="mt-2 text-gray-300">Cues describe observable movement from a side-on camera. They are not a medical assessment and do not prevent injury.</p>
    </div>
  );
};

export default CoachingPanel;
