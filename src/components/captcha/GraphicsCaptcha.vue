<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { RefreshCw, Loader2 } from 'lucide-vue-next'
import { getGraphicsTextCaptcha, type GraphicsTextCaptcha } from '@/api/captcha'

const props = defineProps<{
  modelValue?: {
    captchaID: string
    captchaCode: string
  }
  type?: 1 | 2 | 3 | 4 // 1=算术运算 2=数字字母混合 3=纯数字 4=纯字母
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', value: { captchaID: string; captchaCode: string }): void
}>()

// State
const captchaData = ref<GraphicsTextCaptcha | null>(null)
const isLoading = ref(false)
const captchaCode = ref('')

// Computed
const currentValue = computed(() => ({
  captchaID: captchaData.value?.captchaID || '',
  captchaCode: captchaCode.value,
}))

// Methods
const loadCaptcha = async () => {
  isLoading.value = true
  captchaCode.value = ''
  try {
    captchaData.value = await getGraphicsTextCaptcha({ type: props.type })
    emit('update:modelValue', { captchaID: captchaData.value.captchaID, captchaCode: '' })
  } catch {
    // Error handled by request interceptor
  } finally {
    isLoading.value = false
  }
}

const handleInput = (value: string) => {
  captchaCode.value = value
  emit('update:modelValue', currentValue.value)
}

// Lifecycle
onMounted(() => {
  void loadCaptcha()
})

// Expose methods
defineExpose({
  loadCaptcha,
})
</script>

<template>
  <div class="flex items-center gap-2.5 w-full">
    <!-- Input -->
    <input
      type="text"
      placeholder="验证码"
      class="form-captcha-input"
      :value="captchaCode"
      @input="handleInput(($event.target as HTMLInputElement).value)"
    />

    <!-- Captcha Image -->
    <div
      class="relative h-10 w-[110px] cursor-pointer overflow-hidden rounded border border-[var(--color-border)] bg-[var(--color-secondary)] shadow-sm transition-all hover:border-[var(--color-primary)]"
      @click="loadCaptcha"
    >
      <!-- Loading State -->
      <div
        v-if="isLoading"
        class="flex h-full items-center justify-center bg-muted/40 backdrop-blur-sm"
      >
        <Loader2 class="h-4 w-4 animate-spin text-[var(--color-muted-foreground)]" />
      </div>

      <!-- Captcha Image -->
      <img
        v-else-if="captchaData"
        :src="captchaData.captchaB64"
        alt="图形验证码"
        class="h-full w-full object-contain p-1"
      />

      <!-- Refresh Hint -->
      <div
        class="absolute inset-0 flex items-center justify-center bg-background/50 opacity-0 backdrop-blur-[2px] transition-opacity hover:opacity-100"
      >
        <RefreshCw class="h-4 w-4 text-[var(--color-foreground)] drop-shadow-sm" />
      </div>
    </div>
  </div>
</template>

<style scoped>
.form-captcha-input {
  height: 40px;
  flex: 1;
  border: 1px solid var(--color-border);
  border-radius: 4px;
  padding: 8px 12px;
  font-size: 12px;
  background-color: var(--color-card);
  color: var(--color-foreground);
  outline: none;
  min-width: 0;
  transition:
    border-color 0.15s,
    box-shadow 0.15s;
}

.form-captcha-input:focus {
  border-color: var(--color-primary);
  box-shadow: 0 0 4px var(--color-ring);
  outline: none;
}
</style>
