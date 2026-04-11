<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { RefreshCw, Loader2 } from 'lucide-vue-next'
import { getGraphicsTextCaptcha, type GraphicsTextCaptcha } from '@/api/captcha'
import { Input } from '@/components/ui/input'

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

const handleInput = (value: string | number) => {
  captchaCode.value = String(value)
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
  <div class="flex items-center gap-3">
    <!-- Input -->
    <Input
      type="text"
      placeholder="验证码"
      class="h-12 flex-1 rounded-xl border border-transparent bg-muted/40 px-4 text-sm transition-all placeholder:text-muted-foreground/50 focus-visible:border-primary/30 focus-visible:bg-transparent focus-visible:ring-4 focus-visible:ring-primary/10"
      :model-value="captchaCode"
      @update:model-value="handleInput"
    />

    <!-- Captcha Image -->
    <div
      class="relative h-12 w-[110px] cursor-pointer overflow-hidden rounded-xl border border-border/40 bg-muted/20 shadow-sm transition-all hover:border-primary/50"
      @click="loadCaptcha"
    >
      <!-- Loading State -->
      <div
        v-if="isLoading"
        class="flex h-full items-center justify-center bg-muted/40 backdrop-blur-sm"
      >
        <Loader2 class="h-4 w-4 animate-spin text-muted-foreground" />
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
        <RefreshCw class="h-5 w-5 text-foreground drop-shadow-md" />
      </div>
    </div>
  </div>
</template>
