"""AI selects approved paraphrases; it cannot generate observations or scores."""
from __future__ import annotations
import json
from app.schemas.coach import WordingRequest, WordingResponse

SYSTEM_PROMPT = "Choose the friendliest approved variant for each field, preserving the supplied order. Return indices only. Never write new text."
_INDEX = {"type": "integer", "enum": [0, 1]}
OUTPUT_SCHEMA = {
    "type": "object", "additionalProperties": False,
    "properties": {"headline": _INDEX, "strengths": {"type": "array", "items": _INDEX},
                   "improvements": {"type": "array", "items": _INDEX}, "focus": {"type": ["integer", "null"], "enum": [0, 1, None]}},
    "required": ["headline", "strengths", "improvements", "focus"],
}
class InvalidWording(ValueError):
    """Public reason only; never includes model content."""

HEADLINES = ["Your set summary is ready.", "Here is what the camera recorded."]

def finding_options(finding, focus=False):
    code, v = finding.code, finding.values
    n = lambda key: str(int(v[key]))
    if focus:
        if code == "issue-torso-swing": return ["Next set, keep your chest tall and still.", "For the next set, aim to keep your torso still."]
        if code == "issue-upper-arm-drift": return ["Next set, keep your elbow by your side.", "For the next set, aim to keep your upper arm still."]
        if code == "partial-attempts": return ["Next set, aim to reach the calibrated top before lowering.", "For the next set, complete the calibrated range before lowering."]
        return ["Next set, stay side-on and fully in frame.", "For the next set, keep your selected arm visible to the camera."]
    if code == "completed-reps": return [f"You completed {n('completedReps')} counted reps.", f"The counter recorded {n('completedReps')} completed reps."]
    if code == "full-range-completed": return ["Every counted rep reached the calibrated top.", "Each completed rep reached the calibrated top zone."]
    if code == "steady-tracking": return ["Camera tracking covered most of the set.", "The camera tracked you steadily through most of the set."]
    if code.startswith("clean-reps-"):
        body = "torso movement" if code.endswith("torso-swing") else "upper-arm drift"
        return [f"No {body} was detected on {n('cleanReps')} of {n('analyzedReps')} analyzed reps.", f"The detector recorded {n('cleanReps')} of {n('analyzedReps')} analyzed reps without {body}."]
    if code.startswith("issue-"):
        body = "torso movement" if code.endswith("torso-swing") else "upper-arm drift"
        return [f"The detector recorded {body} on {n('reps')} of {n('analyzedReps')} analyzed reps.", f"{body.capitalize()} was detected on {n('reps')} of {n('analyzedReps')} analyzed reps."]
    if code == "partial-attempts": return [f"{n('count')} partial attempts were not counted.", f"The counter excluded {n('count')} attempts that ended partway."]
    if code == "low-tracking": return ["Tracking covered less than most of the set.", "Limited tracking reduced what the camera could assess."]
    return [f"Tracking loss interrupted {n('count')} attempts.", f"The counter recorded {n('count')} attempts interrupted by tracking loss."]

def approved_options(facts):
    f = facts.findings
    headlines = ["Experimental review with unvalidated rules: " + x for x in HEADLINES] if facts.score and facts.score.experimental else HEADLINES
    return {"headline": headlines, "strengths": [finding_options(x) for x in f.strengths],
            "improvements": [finding_options(x) for x in f.improvements],
            "focus": finding_options(f.focus, True) if f.focus else None}

def build_user_content(facts):
    return json.dumps(approved_options(facts), separators=(",", ":"))

def validate_wording(raw, facts: WordingRequest) -> WordingResponse:
    try:
        data = json.loads(raw) if isinstance(raw, str) else raw
        options = approved_options(facts)
        if not isinstance(data, dict) or set(data) != set(options): raise InvalidWording("schema")
        def select(index, choices):
            if type(index) is not int or index not in (0, 1): raise InvalidWording("variant")
            return choices[index]
        result = {"headline": select(data['headline'], options['headline'])}
        for name in ('strengths', 'improvements'):
            if not isinstance(data[name], list) or len(data[name]) != len(options[name]): raise InvalidWording("count")
            result[name] = [select(i, choices) for i, choices in zip(data[name], options[name])]
        if options['focus'] is None:
            if data['focus'] is not None: raise InvalidWording("focus")
            result['focus'] = None
        else: result['focus'] = select(data['focus'], options['focus'])
        # At most three approved sentences and within the TTS request cap. No model-authored narration.
        sentences = [result['headline'], *(result['strengths'][:1]), *([result['focus']] if result['focus'] else [])]
        result['narration'] = ' '.join(sentences)
        return WordingResponse.model_validate(result)
    except InvalidWording: raise
    except (ValueError, KeyError, TypeError): raise InvalidWording('schema') from None

def extract_output_text(body: dict) -> str:
    if body.get('status') != 'completed': raise InvalidWording('incomplete')
    output = body.get('output')
    if not isinstance(output, list): raise InvalidWording('schema')
    for item in output:
        if not isinstance(item, dict) or item.get('type') != 'message': continue
        content = item.get('content')
        if not isinstance(content, list): raise InvalidWording('schema')
        for part in content:
            if not isinstance(part, dict): continue
            if part.get('type') == 'refusal': raise InvalidWording('refusal')
            if part.get('type') == 'output_text' and isinstance(part.get('text'), str): return part['text']
    raise InvalidWording('no-output')
