<script setup lang="ts">
import { computed } from 'vue'

// 当日热量呼吸环：外圈光晕随呼吸节律缓慢起伏，进度弧用弹性缓动过渡
const props = defineProps<{ value: number; goal: number; size?: number }>()

const size = computed(() => props.size ?? 148)
const stroke = 9
const r = computed(() => (size.value - stroke) / 2 - 6)
const circ = computed(() => 2 * Math.PI * r.value)
const ratio = computed(() => Math.min(1, props.value / (props.goal || 1)))
const over = computed(() => props.value > props.goal)
const remain = computed(() => Math.abs(props.goal - props.value))
</script>

<template>
  <div
    class="relative grid place-items-center"
    :style="{ width: size + 'px', height: size + 'px' }"
    role="progressbar"
    :aria-valuenow="value"
    aria-valuemin="0"
    :aria-valuemax="goal"
    :aria-label="`今日已摄入 ${value} 千卡，目标 ${goal} 千卡`"
  >
    <!-- 呼吸光晕 -->
    <div
      class="breathe absolute inset-0 rounded-full"
      :style="{ background: `radial-gradient(circle, ${over ? 'rgb(196 106 79 / 0.16)' : 'rgb(95 143 114 / 0.16)'} 0%, transparent 68%)` }"
      aria-hidden="true"
    />
    <svg :width="size" :height="size" class="relative -rotate-90" aria-hidden="true">
      <circle :cx="size / 2" :cy="size / 2" :r="r" fill="none" stroke="rgb(43 42 39 / 0.06)" :stroke-width="stroke" />
      <circle
        :cx="size / 2"
        :cy="size / 2"
        :r="r"
        fill="none"
        :stroke="over ? 'var(--color-clay)' : 'var(--color-sage)'"
        :stroke-width="stroke"
        stroke-linecap="round"
        :stroke-dasharray="circ"
        :stroke-dashoffset="circ * (1 - ratio)"
        style="transition: stroke-dashoffset 1.2s var(--ease-spring), stroke 600ms var(--ease-out)"
      />
    </svg>
    <div class="absolute text-center">
      <div class="num text-[1.9rem] leading-none font-light tracking-tight">{{ value }}</div>
      <div class="eyebrow mt-1.5">{{ over ? '超出' : '还可摄入' }} <span class="num">{{ remain }}</span></div>
    </div>
  </div>
</template>
