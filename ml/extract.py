"""Local MediaPipe VIDEO extraction preserving PyAV presentation timestamps.

Official API: https://ai.google.dev/edge/mediapipe/solutions/vision/pose_landmarker/python
No network access, camera access, or recording uploads occur in this program.
"""
import argparse
from dataclasses import asdict, is_dataclass
import hashlib
import importlib.metadata
import json
import math
from pathlib import Path
import subprocess

MODEL_SHA = '59929e1d1ee95287735ddd833b19cf4ac46d29bc7afddbbf6753c459690d574a'
ROOT = Path(__file__).resolve().parents[1]

def checksum(path):
    h = hashlib.sha256()
    with Path(path).open('rb') as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b''):
            h.update(chunk)
    return h.hexdigest()

def probe(path):
    data = json.loads(subprocess.check_output(['ffprobe', '-v', 'error', '-select_streams', 'v:0',
        '-show_streams', '-of', 'json', str(path)], text=True))['streams'][0]
    rotation = next((float(s['rotation']) for s in data.get('side_data_list', []) if 'rotation' in s),
                    float(data.get('tags', {}).get('rotate', 0)))
    # FFmpeg display matrix angle: -90 means display clockwise.
    if rotation % 90 != 0:
        raise ValueError(f'Unsupported display rotation {rotation}; explicit transform required')
    return data, int(rotation)

def orient(rgb, rotation):
    import numpy as np
    return np.ascontiguousarray(np.rot90(rgb, k=(rotation // 90) % 4))

def source_timestamp_ms(frame):
    if frame.pts is None or frame.time_base is None:
        return None
    return float(frame.pts * frame.time_base * 1000)

def landmarks(items):
    result = []
    for point in items:
        values = asdict(point) if is_dataclass(point) else {k: getattr(point, k, None) for k in ('x','y','z','visibility','presence')}
        result.append({k: values.get(k) for k in ('x','y','z','visibility','presence')})
    return result

def overlay(rgb, points, destination):
    from PIL import Image, ImageDraw
    image = Image.fromarray(rgb)
    draw = ImageDraw.Draw(image)
    edges = [(11,12),(11,13),(13,15),(12,14),(14,16),(11,23),(12,24),(23,24),(23,25),(24,26),(25,27),(26,28)]
    xy = [(p['x']*image.width, p['y']*image.height) for p in points]
    for a,b in edges:
        if max(a,b) < len(xy):
            draw.line([xy[a],xy[b]],fill='yellow',width=3)
    for i, (x,y) in enumerate(xy):
        draw.ellipse((x-3,y-3,x+3,y+3),fill='lime')
        if i in [11,12,13,14,15,16,23,24]: draw.text((x+4,y),str(i),fill='red')
    image.save(destination)

def extract(path, output, model, sample_fps=None, overlay_seconds=(0,3,8), force=False):
    import av
    import mediapipe as mp
    info, rotation = probe(path)
    output.mkdir(parents=True, exist_ok=True)
    if checksum(model) != MODEL_SHA:
        raise ValueError('Pose model checksum mismatch')
    cached = output/'manifest.json'
    if cached.exists() and not force:
        prior = json.loads(cached.read_text())
        if (prior.get('extractorVersion') == '1.0.0' and prior.get('sourceSha256') == checksum(path) and prior.get('modelSha256') == MODEL_SHA
            and prior.get('mediapipeVersion') == importlib.metadata.version('mediapipe')
            and prior.get('sampleFps') == sample_fps
            and all((output/name).exists() and checksum(output/name) == prior.get(key)
                    for name,key in [('poses.jsonl','posesSha256'),('frames.jsonl','framesSha256')])):
            print(json.dumps({'recordingId':path.name,'cache':'verified-reused'}),flush=True)
            return prior
        raise ValueError(f'Existing extraction differs or is corrupt: {output}; choose another output or --force')
    # A stale completion marker must not make an interrupted replacement look complete.
    if cached.exists(): cached.unlink()
    manifest = {'schemaVersion':'pose-source-v1','extractorVersion':'1.0.0','recordingId':path.name,'sourceSha256':checksum(path),
        'model':'pose_landmarker_lite','modelSha256':MODEL_SHA,'mediapipeVersion':importlib.metadata.version('mediapipe'),
        'avVersion':importlib.metadata.version('av'),'encodedWidth':info['width'],'encodedHeight':info['height'],
        'displayRotationDeg':rotation,'timestampConvention':'original PTS * time_base in ms; origin preserved',
        'frameIndexConvention':'zero-based decoded presentation order; annotation end frame inclusive',
        'sampleFps':sample_fps,'sourceStartTime':info.get('start_time'),'timeBase':info.get('time_base'),
        'coordinateSpace':'unmirrored display-oriented normalized image; world landmarks in meters',
        'side':None,'view':None,'metadataConfirmed':False}
    options = mp.tasks.vision.PoseLandmarkerOptions(base_options=mp.tasks.BaseOptions(model_asset_path=str(model)),
        running_mode=mp.tasks.vision.RunningMode.VIDEO, num_poses=1,
        min_pose_detection_confidence=0.5,min_pose_presence_confidence=0.5,min_tracking_confidence=0.5)
    decoded=processed=detected=0
    last_sample=None
    last_api=-1
    selected=set()
    with av.open(str(path)) as video, mp.tasks.vision.PoseLandmarker.create_from_options(options) as detector, \
         (output / 'poses.partial.jsonl').open('w') as poses, (output / 'frames.partial.jsonl').open('w') as frames:
        for index, frame in enumerate(video.decode(video=0)):
            decoded+=1
            timestamp=source_timestamp_ms(frame)
            eligible=timestamp is not None and timestamp>=0 and (sample_fps is None or last_sample is None or timestamp-last_sample>=1000/sample_fps-1e-6)
            api_ms=round(timestamp) if timestamp is not None else None
            eligible=eligible and api_ms>last_api
            mapping={'frameIndex':index,'pts':frame.pts,'timeBase':str(frame.time_base),
                'timestampMs':timestamp,'processed':eligible}
            frames.write(json.dumps(mapping)+'\n')
            if not eligible: continue
            rgb=orient(frame.to_ndarray(format='rgb24'),rotation)
            result=detector.detect_for_video(mp.Image(image_format=mp.ImageFormat.SRGB,data=rgb),api_ms)
            points=landmarks(result.pose_landmarks[0]) if result.pose_landmarks else []
            world=landmarks(result.pose_world_landmarks[0]) if result.pose_world_landmarks else []
            record={**mapping,'recordingId':path.name,'sourceWidth':rgb.shape[1],'sourceHeight':rgb.shape[0],
                'apiTimestampMs':api_ms,'landmarks':points,'worldLandmarks':world,'poseDetected':bool(points),
                'landmarkValidity':[all(isinstance(p[k],(int,float)) and math.isfinite(p[k]) for k in ('x','y','z')) for p in points],
                'confidenceValidity':[all(isinstance(p[k],(int,float)) and math.isfinite(p[k]) and p[k]>=0.5 for k in ('visibility','presence')) for p in points],
                'confidenceMeaning':'MediaPipe visibility/presence; not correctness probabilities'}
            poses.write(json.dumps(record,allow_nan=False)+'\n')
            for sec in overlay_seconds:
                if sec not in selected and timestamp>=sec*1000:
                    overlay(rgb,points,output/f'overlay-{sec:03d}s.png'); selected.add(sec)
            processed+=1;detected+=bool(points);last_sample=timestamp;last_api=api_ms
    # Publish complete streams only after decode/inference close successfully. Readers must
    # require the completion manifest and verify its checksums before opening these streams.
    (output/'poses.partial.jsonl').replace(output/'poses.jsonl')
    (output/'frames.partial.jsonl').replace(output/'frames.jsonl')
    manifest.update(decodedFrames=decoded,processedFrames=processed,detectedFrames=detected,
        posesSha256=checksum(output/'poses.jsonl'),framesSha256=checksum(output/'frames.jsonl'))
    (output/'manifest.partial.json').write_text(json.dumps(manifest,indent=2)+'\n')
    (output/'manifest.partial.json').replace(output/'manifest.json')
    print(json.dumps({'recordingId':path.name,'decoded':decoded,'processed':processed,'detected':detected}),flush=True)
    return manifest

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--videos',type=Path,default=ROOT/'video.assets')
    parser.add_argument('--output',type=Path,default=ROOT/'ml/outputs/extraction')
    parser.add_argument('--model',type=Path,default=ROOT/'frontend/public/vision/pose_landmarker_lite.task')
    parser.add_argument('--sample-fps',type=float,default=None)
    parser.add_argument('--force',action='store_true',help='Replace derived extraction outputs after provenance mismatch')
    args=parser.parse_args()
    if args.sample_fps is not None and (not math.isfinite(args.sample_fps) or args.sample_fps<=0): parser.error('sample-fps must be finite and positive')
    paths=sorted(args.videos.glob('*.mp4')) if args.videos.is_dir() else [args.videos]
    if not paths: parser.error('No MP4 recordings found')
    for path in paths: extract(path,args.output/path.stem,args.model,args.sample_fps,force=args.force)

if __name__=='__main__': main()
