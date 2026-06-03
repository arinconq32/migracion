<script setup>
import { ref, onBeforeUnmount } from "vue";

const props = defineProps({
  src: {
    type: String,
    required: true,
  },
});

const audioRef = ref(null);
const isPlaying = ref(false);
const currentTime = ref(0);
const duration = ref(0);
const progressPercent = ref(0);

const formatTime = (seconds) => {
  if (!Number.isFinite(seconds) || seconds < 0) return "00:00";
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
};

const currentTimeLabel = () => formatTime(currentTime.value);
const durationLabel = () => formatTime(duration.value);

const togglePlay = () => {
  const audio = audioRef.value;
  if (!audio) return;
  if (isPlaying.value) {
    audio.pause();
  } else {
    audio.play().catch(() => {});
  }
};

const onTimeUpdate = () => {
  const audio = audioRef.value;
  if (!audio || !Number.isFinite(audio.duration) || audio.duration <= 0) return;
  currentTime.value = audio.currentTime;
  progressPercent.value = (audio.currentTime / audio.duration) * 100;
};

const setDurationFromAudio = () => {
  const audio = audioRef.value;
  if (!audio) return;
  const d = audio.duration;
  if (Number.isFinite(d) && d > 0) {
    duration.value = d;
    return;
  }

  let retries = 0;
  const maxRetries = 10;
  const intervalId = setInterval(() => {
    const nextDuration = audioRef.value?.duration;
    if (Number.isFinite(nextDuration) && nextDuration > 0) {
      duration.value = nextDuration;
      clearInterval(intervalId);
      return;
    }
    retries += 1;
    if (retries >= maxRetries) {
      clearInterval(intervalId);
    }
  }, 100);
};

const onSeek = (event) => {
  const audio = audioRef.value;
  const bar = event.currentTarget;
  if (!audio || !bar || !Number.isFinite(audio.duration) || audio.duration <= 0) {
    return;
  }
  const rect = bar.getBoundingClientRect();
  const ratio = Math.min(
    1,
    Math.max(0, (event.clientX - rect.left) / rect.width),
  );
  audio.currentTime = audio.duration * ratio;
};

const onPlay = () => {
  isPlaying.value = true;
};

const onPause = () => {
  isPlaying.value = false;
};

const onEnded = () => {
  isPlaying.value = false;
  currentTime.value = 0;
  progressPercent.value = 0;
  if (audioRef.value) {
    audioRef.value.currentTime = 0;
  }
};

onBeforeUnmount(() => {
  audioRef.value?.pause();
});
</script>

<template>
  <div class="custom-audio-player">
    <audio
      ref="audioRef"
      :src="src"
      preload="auto"
      @timeupdate="onTimeUpdate"
      @loadedmetadata="setDurationFromAudio"
      @play="onPlay"
      @pause="onPause"
      @ended="onEnded"
    ></audio>
    <button
      type="button"
      class="play-pause-btn"
      :aria-label="isPlaying ? 'Pausar' : 'Reproducir'"
      @click="togglePlay"
    >
      <svg
        v-if="!isPlaying"
        xmlns="http://www.w3.org/2000/svg"
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="currentColor"
      >
        <path d="M8 5v14l11-7z" />
      </svg>
      <svg
        v-else
        xmlns="http://www.w3.org/2000/svg"
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="currentColor"
      >
        <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
      </svg>
    </button>
    <span class="audio-time-display">{{ currentTimeLabel() }}</span>
    <span class="audio-separator">/</span>
    <span class="audio-duration-display">{{ durationLabel() }}</span>
    <div class="progress-bar-container" @click="onSeek">
      <div
        class="progress-bar-fill"
        :style="{ width: `${progressPercent}%` }"
      ></div>
    </div>
  </div>
</template>

<style scoped>
.custom-audio-player {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 220px;
  max-width: 280px;
  padding: 4px 2px;
}

.custom-audio-player audio {
  display: none;
}

.play-pause-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border: none;
  border-radius: 50%;
  background: rgba(0, 0, 0, 0.08);
  color: inherit;
  cursor: pointer;
  flex-shrink: 0;
}

.play-pause-btn:hover {
  background: rgba(0, 0, 0, 0.14);
}

.audio-time-display,
.audio-duration-display,
.audio-separator {
  font-size: 11px;
  opacity: 0.85;
  flex-shrink: 0;
}

.progress-bar-container {
  flex: 1;
  height: 6px;
  border-radius: 999px;
  background: rgba(0, 0, 0, 0.12);
  cursor: pointer;
  overflow: hidden;
}

.progress-bar-fill {
  height: 100%;
  border-radius: inherit;
  background: currentColor;
  opacity: 0.75;
  width: 0;
  transition: width 0.05s linear;
}
</style>
