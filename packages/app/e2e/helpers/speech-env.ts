const LOCAL_SPEECH_ENV_KEYS = [
  "CODIUS_LOCAL_MODELS_DIR",
  "CODIUS_DICTATION_LOCAL_STT_MODEL",
  "CODIUS_VOICE_LOCAL_STT_MODEL",
  "CODIUS_VOICE_LOCAL_TTS_MODEL",
  "CODIUS_VOICE_LOCAL_TTS_SPEAKER_ID",
  "CODIUS_VOICE_LOCAL_TTS_SPEED",
] as const;

const DISABLED_E2E_SPEECH_ENV = {
  CODIUS_DICTATION_ENABLED: "0",
  CODIUS_VOICE_MODE_ENABLED: "0",
  CODIUS_DICTATION_STT_PROVIDER: "openai",
  CODIUS_VOICE_TURN_DETECTION_PROVIDER: "openai",
  CODIUS_VOICE_STT_PROVIDER: "openai",
  CODIUS_VOICE_TTS_PROVIDER: "openai",
} as const;

export function withDisabledE2ESpeechEnv(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  // Default app E2E does not cover speech flows; keep restarts from starting
  // background local-model downloads for unrelated tests.
  const next: NodeJS.ProcessEnv = {
    ...env,
    ...DISABLED_E2E_SPEECH_ENV,
  };

  for (const key of LOCAL_SPEECH_ENV_KEYS) {
    delete next[key];
  }

  return next;
}
