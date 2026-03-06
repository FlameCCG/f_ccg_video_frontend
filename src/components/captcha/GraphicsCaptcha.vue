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
  <div class="flex items-center gap-2">
    <!-- Input -->
    <Input
      type="text"
      placeholder="请输入验证码"
      class="flex-1"
      :model-value="captchaCode"
      @update:model-value="handleInput"
    />

    <!-- Captcha Image -->
    <div
      class="relative h-10 w-28 cursor-pointer overflow-hidden rounded-md border bg-muted"
      @click="loadCaptcha"
    >
      <!-- Loading State -->
      <div v-if="isLoading" class="flex h-full items-center justify-center">
        <Loader2 class="h-5 w-5 animate-spin text-muted-foreground" />
      </div>

      <!-- Captcha Image -->
      <img
        v-else-if="captchaData"
        :src="captchaData.captchaB64"
        alt="图形验证码"
        class="h-full w-full object-cover"
      />

      <!-- Refresh Hint -->
      <div
        class="absolute inset-0 flex items-center justify-center bg-black/50 opacity-0 transition-opacity hover:opacity-100"
      >
        <RefreshCw class="h-5 w-5 text-white" />
      </div>
    </div>
  </div>
</template>
