// Own every acquired stream, including streams returned after Stop or unmount.
export function createCameraManager({
  video,
  getUserMedia = (constraints) => navigator.mediaDevices.getUserMedia(constraints),
  onEnded = () => {},
  onMuted = () => {},
  onFileEnded = () => {},
  createObjectURL = (file) => URL.createObjectURL(file),
  revokeObjectURL = (url) => URL.revokeObjectURL(url),
}) {
  let generation = 0;
  let stream = null;
  let pending = null;
  let starting = null;
  let removeListeners = () => {};
  let fileUrl = null;
  const release = (value) => value?.getTracks().forEach((track) => track.stop());

  function stop() {
    generation += 1;
    starting = null;
    removeListeners();
    removeListeners = () => {};
    release(stream);
    stream = null;
    video.pause();
    video.srcObject = null;
    if (fileUrl) {
      video.removeAttribute('src');
      video.load?.();
      revokeObjectURL(fileUrl);
      fileUrl = null;
    }
  }

  // Play a local video file instead of the camera. The file stays in this browser (object URL only).
  async function startFile(file) {
    if (!file) throw new DOMException('Choose a video file first.', 'NotFoundError');
    stop();
    const session = generation;
    fileUrl = createObjectURL(file);
    video.srcObject = null;
    video.src = fileUrl;
    video.loop = false;
    const ended = () => { if (session === generation) onFileEnded(); };
    video.addEventListener('ended', ended);
    removeListeners = () => video.removeEventListener('ended', ended);
    try {
      await video.play();
    } catch (error) {
      if (session !== generation) return null;
      stop();
      throw error;
    }
    return session === generation ? file : null;
  }

  function start(deviceId = '') {
    if (stream) return Promise.resolve(stream);
    if (starting) return starting;
    const session = ++generation;
    const operation = (async () => {
      // Browsers cannot cancel a permission prompt. Wait for its answer before
      // requesting another stream; its original owner releases any late result.
      if (pending) await pending.catch(() => {});
      if (session !== generation) return null;
      const request = Promise.resolve().then(() => getUserMedia({
        video: {
          width: { ideal: 1280 }, height: { ideal: 720 },
          frameRate: { ideal: 30, max: 30 },
          ...(deviceId ? { deviceId: { exact: deviceId } } : { facingMode: 'user' }),
        },
        audio: false,
      }));
      pending = request;
      let acquired;
      try {
        acquired = await request;
      } finally {
        if (pending === request) pending = null;
      }
      if (session !== generation) {
        release(acquired);
        return null;
      }
      const tracks = acquired.getVideoTracks();
      if (!tracks.some((track) => track.readyState === 'live')) {
        release(acquired);
        throw new DOMException('The camera disconnected before it could start.', 'NotReadableError');
      }
      stream = acquired;
      video.srcObject = acquired;
      const ended = () => { stop(); onEnded(); };
      const muted = () => onMuted(true);
      const unmuted = () => onMuted(false);
      tracks.forEach((track) => {
        track.addEventListener('ended', ended);
        track.addEventListener('mute', muted);
        track.addEventListener('unmute', unmuted);
      });
      removeListeners = () => tracks.forEach((track) => {
        track.removeEventListener('ended', ended);
        track.removeEventListener('mute', muted);
        track.removeEventListener('unmute', unmuted);
      });
      onMuted(tracks.some((track) => track.readyState === 'live' && track.muted));
      try {
        await video.play();
      } catch (error) {
        if (session !== generation) return null;
        stop();
        throw error;
      }
      return session === generation ? acquired : null;
    })();
    starting = operation;
    operation.finally(() => {
      if (starting === operation) starting = null;
    }).catch(() => {});
    return operation;
  }
  return { start, startFile, stop };
}

export function cameraErrorMessage(error) {
  const messages = {
    NotAllowedError: 'Camera permission was denied. Allow camera access in your browser settings, then try again.',
    NotFoundError: 'No camera was found. Connect a camera and try again.',
    NotReadableError: 'The camera could not start. Close other apps using it and try again.',
    OverconstrainedError: 'This camera is unavailable or does not support the requested settings. Choose another camera.',
    SecurityError: 'Camera access is blocked. Open GymBud using HTTPS or localhost and check browser permissions.',
    AbortError: 'Camera startup was interrupted. Please try again.',
    NotSupportedError: 'This browser cannot play that video file. Try an MP4 (H.264) or WebM file.',
  };
  return messages[error?.name] || 'Could not start the camera. Check camera access and try again.';
}
