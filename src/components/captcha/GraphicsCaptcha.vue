<script setup lang="ts">
/**
 * 图形文字验证码（注册 / 找回密码 / 换绑邮箱的前置校验）
 *
 * 与滑块、点选共用一套视觉语言：加载走 skeleton-shimmer 而不是转圈，
 * 换一张是「原地换图」的交叉淡入，不再整块消失再弹出。
 */
import { ref, computed, onMounted } from 'vue'
import { RefreshCw } from 'lucide-vue-next'
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

const captchaData = ref<GraphicsTextCaptcha | null>(null)
const isLoading = ref(false)
const captchaCode = ref('')

const currentValue = computed(() => ({
  captchaID: captchaData.value?.captchaID || '',
  captchaCode: captchaCode.value,
}))

const loadCaptcha = async () => {
  if (isLoading.value) return
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

onMounted(() => {
  void loadCaptcha()
})

defineExpose({
  loadCaptcha,
})
</script>

<template>
  <div class="graphics-captcha cap-scope">
    <input
      type="text"
      inputmode="text"
      autocomplete="off"
      placeholder="图形验证码"
      class="graphics-captcha__input"
      :value="captchaCode"
      @input="handleInput(($event.target as HTMLInputElement).value)"
    />

    <button
      type="button"
      class="graphics-captcha__figure"
      :disabled="isLoading"
      aria-label="换一张图形验证码"
      @click="loadCaptcha"
    >
      <Transition name="gc-swap" mode="out-in">
        <span
          v-if="isLoading"
          key="loading"
          class="skeleton-shimmer graphics-captcha__skeleton"
        ></span>
        <img
          v-else-if="captchaData"
          key="image"
          :src="captchaData.captchaB64"
          class="graphics-captcha__image"
          alt="图形验证码"
          draggable="false"
        />
        <span v-else key="empty" class="graphics-captcha__empty">点击加载</span>
      </Transition>

      <span class="graphics-captcha__hint" aria-hidden="true">
        <RefreshCw class="graphics-captcha__hint-icon" />
      </span>
    </button>
  </div>
</template>

<style scoped lang="scss">
@use './captcha-tokens';

.graphics-captcha {
  display: flex;
  gap: 0.625rem;
  align-items: center;
  width: 100%;

  &__input {
    flex: 1;
    min-width: 0;
    height: 2.5rem;
    padding: 0 0.75rem;
    color: var(--cap-text);
    font-size: 0.8125rem;
    background-color: color-mix(in oklch, var(--cap-sunken) 70%, transparent);
    border: 1px solid transparent;
    border-radius: 0.65rem;
    transition:
      background-color var(--cap-fast) linear,
      border-color var(--cap-fast) linear;

    &::placeholder {
      color: color-mix(in oklch, var(--cap-text-muted) 78%, transparent);
    }

    &:focus-visible {
      background-color: var(--cap-surface);
      border-color: color-mix(in oklch, var(--cap-primary) 45%, transparent);
    }
  }

  &__figure {
    position: relative;
    display: flex;
    flex-shrink: 0;
    align-items: center;
    justify-content: center;
    width: 6.875rem;
    height: 2.5rem;
    overflow: hidden;
    cursor: pointer;
    background-color: var(--cap-sunken);
    border: 1px solid color-mix(in oklch, var(--cap-border) 80%, transparent);
    border-radius: 0.65rem;
    transition:
      border-color var(--cap-fast) linear,
      transform var(--cap-fast) var(--cap-quint);

    &:hover:not(:disabled) {
      border-color: color-mix(in oklch, var(--cap-primary) 55%, var(--cap-border));
    }

    &:active:not(:disabled) {
      transform: scale(0.97);
    }

    &:disabled {
      cursor: progress;
    }
  }

  &__skeleton {
    display: block;
    width: 100%;
    height: 100%;
  }

  &__image {
    display: block;
    width: 100%;
    height: 100%;
    padding: 0.125rem;
    object-fit: contain;
  }

  &__empty {
    color: var(--cap-text-muted);
    font-size: 0.75rem;
  }

  /* 「点一下换一张」的提示：hover 才浮出来，平时不占视觉 */
  &__hint {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--media-overlay-text);
    background-color: var(--media-overlay);
    opacity: 0;
    transition: opacity var(--cap-fast) linear;
  }

  &__hint-icon {
    width: 1rem;
    height: 1rem;
    transition: transform var(--cap-normal) var(--cap-quint);
  }

  @media (hover: hover) and (pointer: fine) {
    &__figure:hover:not(:disabled) &__hint {
      opacity: 1;
    }

    &__figure:hover:not(:disabled) &__hint-icon {
      transform: rotate(-90deg);
    }
  }
}

/* 换一张：原地交叉淡入，不再整块消失再弹出 */
.gc-swap-enter-active {
  transition: opacity var(--cap-normal) var(--cap-out);
}

.gc-swap-leave-active {
  transition: opacity var(--cap-fast) linear;
}

.gc-swap-enter-from,
.gc-swap-leave-to {
  opacity: 0;
}

@media (prefers-reduced-motion: reduce) {
  .graphics-captcha__figure,
  .graphics-captcha__hint,
  .graphics-captcha__hint-icon {
    transition: none;
  }
}
</style>
