<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { followUser, unfollowUser, getRelation, type RelationInfo } from '@/api/social'
import type { VideoAuthorBrief } from '@/api/video'
import { toast } from 'vue-sonner'
import { UserPlus, UserCheck, Users } from 'lucide-vue-next'
import AppAvatar from '@/components/common/AppAvatar.vue'
import { levelColor } from '@/utils/format'

const props = defineProps<{
  author: VideoAuthorBrief
}>()

const router = useRouter()
const authStore = useAuthStore()

const relation = ref<RelationInfo | null>(null)
const followLoading = ref(false)

const isSelf = computed(() => authStore.isLoggedIn && authStore.userId === props.author.id)
const isFollowed = computed(() => relation.value?.isFocus ?? false)
const isMutual = computed(() => relation.value?.isMutualFollow ?? false)

const followBtnText = computed(() => {
  if (isMutual.value) return '互相关注'
  if (isFollowed.value) return '已关注'
  return '关注'
})

const fetchRelation = async () => {
  if (!authStore.isLoggedIn || !props.author.id || isSelf.value) return
  try {
    relation.value = await getRelation(props.author.id)
  } catch {
    // Ignore relation fetch errors
  }
}

const handleFollow = async () => {
  if (!authStore.isLoggedIn) {
    toast.warning('请先登录')
    return
  }
  if (followLoading.value) return
  followLoading.value = true

  try {
    if (isFollowed.value) {
      await unfollowUser({ focusUserId: props.author.id })
      relation.value = { ...relation.value!, isFocus: false, isMutualFollow: false }
      toast.success('已取消关注')
    } else {
      await followUser({ focusUserId: props.author.id })
      const isFans = relation.value?.isFans ?? false
      relation.value = { isFocus: true, isFans, isMutualFollow: isFans }
      toast.success('关注成功')
    }
  } catch {
    toast.error('操作失败')
  } finally {
    followLoading.value = false
  }
}

const goToUserPage = () => {
  void router.push(`/user/${props.author.id}`)
}

onMounted(fetchRelation)

watch(() => props.author.id, fetchRelation)
</script>

<template>
  <div class="author-card flex items-center gap-4 rounded-xl bg-card p-4">
    <!-- Avatar -->
    <div class="avatar-wrapper shrink-0 cursor-pointer relative group" @click="goToUserPage">
      <AppAvatar
        :src="author.avatar"
        :name="author.username"
        :alt="author.username"
        container-class="author-card__avatar relative z-10 h-12 w-12 shadow-surface ring-2 ring-border/50 group-hover:ring-primary/50"
        text-class="text-base font-bold"
      />
    </div>

    <!-- Info -->
    <div class="min-w-0 flex-1">
      <div class="flex items-center gap-2">
        <span
          class="t-tint cursor-pointer truncate text-base font-bold text-foreground hover:text-primary"
          @click="goToUserPage"
        >
          {{ author.username }}
        </span>
        <!-- Level Badge -->
        <span
          class="inline-flex items-center rounded px-1.5 py-0.5 text-2xs font-black tracking-wider text-[var(--signal-foreground)] shadow-surface"
          :style="{ backgroundColor: levelColor(author.level) }"
        >
          Lv{{ author.level }}
        </span>
      </div>
      <p
        v-if="author.description"
        class="mt-1 truncate text-sm-plus font-medium text-muted-foreground/80"
      >
        {{ author.description }}
      </p>
    </div>

    <!-- Follow Button (hidden for self) -->
    <button
      v-if="!isSelf"
      class="follow-btn shrink-0"
      :class="{
        'is-followed': isFollowed,
        'is-mutual': isMutual,
      }"
      :disabled="followLoading"
      @click="handleFollow"
    >
      <component
        :is="isMutual ? Users : isFollowed ? UserCheck : UserPlus"
        :size="16"
        stroke-width="2.5"
      />
      <span>{{ followBtnText }}</span>
    </button>
  </div>
</template>

<style scoped lang="scss">
/* 抬起只动 transform，阴影交给 ::after 的 opacity —— 原来是 transition: all 0.3s，
   把两层大 blur 阴影一起逐帧插值。 */
.author-card {
  position: relative;
  border: 1px solid oklch(var(--border) / 0.4);
  box-shadow: var(--shadow-surface);
  transition:
    border-color var(--duration-normal) var(--ease-out-expo),
    transform var(--duration-normal) var(--ease-out-expo);

  &::after {
    content: '';
    position: absolute;
    inset: 0;
    border-radius: inherit;
    box-shadow: var(--shadow-raised);
    opacity: 0;
    pointer-events: none;
    transition: opacity var(--duration-normal) var(--ease-out-quart);
  }
}

.avatar-wrapper::before {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: 50%;
  background: color-mix(in oklch, var(--color-primary) 20%, transparent);
  transform: scale(1.1);
  opacity: 0;
  filter: blur(4px);
  transition:
    opacity var(--duration-normal) var(--ease-out-expo),
    transform var(--duration-normal) var(--ease-out-expo);
  z-index: 0;
}

:deep(.author-card__avatar) {
  transition:
    transform var(--duration-normal) var(--ease-out-expo),
    box-shadow var(--duration-normal) var(--ease-out-expo);
}

.follow-btn {
  position: relative;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 20px;
  border-radius: 9999px;
  font-size: var(--text-sm-plus, 0.8125rem);
  font-weight: 700;
  cursor: pointer;
  transition:
    background-color var(--duration-normal) var(--ease-out-expo),
    border-color var(--duration-normal) var(--ease-out-expo),
    color var(--duration-fast) linear,
    opacity var(--duration-fast) linear,
    transform var(--duration-fast) var(--ease-out-quint);
  border: 1px solid transparent;
  background-color: var(--color-primary);
  color: var(--color-primary-foreground);
  box-shadow: var(--shadow-raised);
  letter-spacing: 0.02em;

  &:active:not(:disabled) {
    transform: scale(0.96);
    transition-duration: 80ms;
  }

  &:disabled {
    opacity: 0.7;
    cursor: not-allowed;
    transform: none;
  }

  &.is-followed {
    background: oklch(var(--muted));
    color: oklch(var(--muted-foreground));
    border-color: oklch(var(--border));
    box-shadow: none;

    &:hover:not(:disabled) {
      background: color-mix(in oklch, var(--color-destructive) 10%, transparent);
      color: var(--color-destructive);
      border-color: color-mix(in oklch, var(--color-destructive) 30%, transparent);
    }
  }

  &.is-mutual {
    background: color-mix(in oklch, var(--color-primary) 10%, transparent);
    color: var(--color-primary);
    border-color: color-mix(in oklch, var(--color-primary) 30%, transparent);
    box-shadow: none;

    &:hover:not(:disabled) {
      background: color-mix(in oklch, var(--color-primary) 16%, transparent);
      border-color: color-mix(in oklch, var(--color-primary) 40%, transparent);
    }
  }
}

/* 触屏上 :hover 会在点击后粘住，卡片长期停在抬起态 */
@media (hover: hover) and (pointer: fine) {
  .author-card:hover {
    border-color: oklch(var(--border) / 0.8);
    transform: translate3d(0, -2px, 0);
  }

  .author-card:hover::after {
    opacity: 1;
  }

  .avatar-wrapper:hover::before {
    opacity: 1;
    transform: scale(1.25);
  }

  .avatar-wrapper:hover :deep(.author-card__avatar) {
    /* 全站封面/头像统一 1.04 */
    transform: scale(1.04);
  }

  .follow-btn:hover:not(:disabled) {
    background-color: oklch(var(--primary) / 0.9);
    transform: translate3d(0, -2px, 0);
  }
}

@media (prefers-reduced-motion: reduce) {
  .author-card:hover,
  .follow-btn:hover:not(:disabled),
  .avatar-wrapper:hover :deep(.author-card__avatar) {
    transform: none;
  }
}
</style>
