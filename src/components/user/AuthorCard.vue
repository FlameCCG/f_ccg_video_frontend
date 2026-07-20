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
        container-class="relative h-12 w-12 ring-2 ring-border/50 transition-all duration-300 group-hover:ring-primary/50 group-hover:scale-105 shadow-sm z-10"
        text-class="text-base font-bold"
      />
    </div>

    <!-- Info -->
    <div class="min-w-0 flex-1">
      <div class="flex items-center gap-2">
        <span
          class="cursor-pointer truncate text-[15px] font-bold text-foreground transition-colors hover:text-primary"
          @click="goToUserPage"
        >
          {{ author.username }}
        </span>
        <!-- Level Badge -->
        <span
          class="inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-black tracking-wider text-white shadow-sm"
          :style="{ backgroundColor: levelColor(author.level) }"
        >
          Lv{{ author.level }}
        </span>
      </div>
      <p
        v-if="author.description"
        class="mt-1 truncate text-[13px] text-muted-foreground/80 font-medium"
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
.author-card {
  box-shadow: 0 2px 8px oklch(0% 0 0deg / 0.04);
  border: 1px solid oklch(var(--border) / 0.4);
  transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);

  &:hover {
    box-shadow: 0 8px 24px oklch(0% 0 0deg / 0.08);
    border-color: oklch(var(--border) / 0.8);
    transform: translateY(-2px);
  }
}

:global(.dark) .author-card {
  box-shadow: 0 2px 8px oklch(0% 0 0deg / 0.25);

  &:hover {
    box-shadow: 0 8px 24px oklch(0% 0 0deg / 0.45);
  }
}

.avatar-wrapper::before {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: 50%;
  background: oklch(var(--primary) / 0.2);
  transform: scale(1.1);
  opacity: 0;
  filter: blur(4px);
  transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
  z-index: 0;
}

.avatar-wrapper:hover::before {
  opacity: 1;
  transform: scale(1.25);
}

.follow-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 20px;
  border-radius: 9999px;
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.25s cubic-bezier(0.16, 1, 0.3, 1);
  border: 1px solid transparent;
  background-color: oklch(var(--primary));
  color: oklch(var(--primary-foreground));
  box-shadow: 0 4px 12px oklch(var(--primary) / 0.3);
  letter-spacing: 0.02em;

  &:hover:not(:disabled) {
    background-color: oklch(var(--primary) / 0.9);
    transform: translateY(-2px);
    box-shadow: 0 6px 16px oklch(var(--primary) / 0.4);
  }

  &:active:not(:disabled) {
    transform: translateY(0) scale(0.96);
    box-shadow: 0 2px 8px oklch(var(--primary) / 0.3);
    transition-duration: 0.1s;
  }

  &:disabled {
    opacity: 0.7;
    cursor: not-allowed;
    transform: none;
  }

  &.is-followed {
    background: oklch(var(--muted));
    color: oklch(var(--muted-foreground));
    border: 1px solid oklch(var(--border));
    box-shadow: none;

    &:hover:not(:disabled) {
      background: oklch(var(--destructive) / 0.1);
      color: oklch(var(--destructive));
      border-color: oklch(var(--destructive) / 0.3);
    }
  }

  &.is-mutual {
    background: oklch(var(--primary) / 0.1);
    color: oklch(var(--primary));
    border: 1px solid oklch(var(--primary) / 0.3);
    box-shadow: none;

    &:hover:not(:disabled) {
      background: oklch(var(--primary) / 0.15);
      border-color: oklch(var(--primary) / 0.4);
      box-shadow: 0 4px 12px oklch(var(--primary) / 0.2);
    }
  }
}
</style>
