<script setup lang="ts">
import {
  ref,
  computed,
  onMounted,
  onBeforeUnmount,
  watch,
  nextTick,
  type ComponentPublicInstance,
} from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import {
  getDynamicList,
  getFollowsDynamic,
  markDynamicRead,
  createDynamic,
  deleteDynamic,
  pinDynamic,
  getWorkId,
  toggleDynamicLike,
  type WorkFeedItem,
  type FollowUserItem,
} from '@/api/dynamic'
import { toggleVideoLike } from '@/api/video'
import { uploadImage } from '@/api/upload'
import { getHotSearchKeywords, type HotKeywordItem } from '@/api/video'
import CommentSection from '@/components/comment/CommentSection.vue'
import AppAvatar from '@/components/common/AppAvatar.vue'
import { toast } from 'vue-sonner'
import {
  ImagePlus,
  SmilePlus,
  MessageSquare,
  Share2,
  ThumbsUp,
  Eye,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Zap,
  Pin,
  Trash2,
  MoreVertical,
  Play,
} from 'lucide-vue-next'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

const router = useRouter()
const route = useRoute()
const authStore = useAuthStore()

type DynamicTab = 'all' | 'video' | 'image'
const activeTab = ref<DynamicTab>('all')

const tabTypeMap: Record<DynamicTab, 0 | 1 | 2> = {
  all: 0,
  video: 1,
  image: 2,
}

const tabList: { key: DynamicTab; label: string }[] = [
  { key: 'all', label: '全部' },
  { key: 'video', label: '视频投稿' },
  { key: 'image', label: '图文' },
]

const feedItems = ref<WorkFeedItem[]>([])
const feedTotal = ref(0)
const feedPage = ref(1)
const feedLoading = ref(false)
const feedInitLoaded = ref(false)

const followUsers = ref<FollowUserItem[]>([])
const followUsersLoading = ref(false)
const hotKeywords = ref<HotKeywordItem[]>([])

// null = "全部动态" (self), otherwise = selected followed user
const selectedUserId = ref<number | null>(null)

const newContent = ref('')
const newImageUrl = ref('')
const publishing = ref(false)

// Swiper
const swiperRef = ref<HTMLDivElement | null>(null)
const canScrollLeft = ref(false)
const canScrollRight = ref(false)
const feedItemRefs = new Map<string, HTMLElement>()
const highlightedFeedKey = ref<string | null>(null)
let clearFeedHighlightTimer: ReturnType<typeof setTimeout> | null = null

const updateSwiperArrows = () => {
  const el = swiperRef.value
  if (!el) return
  canScrollLeft.value = el.scrollLeft > 4
  canScrollRight.value = el.scrollLeft < el.scrollWidth - el.clientWidth - 4
}

const scrollSwiper = (dir: 'left' | 'right') => {
  const el = swiperRef.value
  if (!el) return
  el.scrollBy({ left: dir === 'left' ? -260 : 260, behavior: 'smooth' })
}

const fmtDuration = (s: number): string => {
  const m = Math.floor(s / 60)
  const sec = s % 60
  return `${m}:${sec.toString().padStart(2, '0')}`
}

const fmtTime = (dateStr: string): string => {
  if (!dateStr) return '暂无更新'

  const d = new Date(dateStr)
  if (Number.isNaN(d.getTime())) return '暂无更新'

  const now = new Date()
  const diffMs = now.getTime() - d.getTime()
  const diffMin = Math.floor(diffMs / 60000)
  if (diffMin < 1) return '刚刚'
  if (diffMin < 60) return `${diffMin}分钟前`
  const diffHour = Math.floor(diffMin / 60)
  if (diffHour < 24) return `${diffHour}小时前`
  const diffDay = Math.floor(diffHour / 24)
  if (diffDay < 30) return `${diffDay}天前`
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

const fmtCount = (n: number): string => {
  if (n >= 10000) return `${(n / 10000).toFixed(1)}万`
  return n.toString()
}

const getFeedItemKey = (item: WorkFeedItem) => `${item.workType}-${getWorkId(item)}`

const setFeedItemRef = (key: string, el: Element | ComponentPublicInstance | null) => {
  if (el instanceof HTMLElement) {
    feedItemRefs.set(key, el)
    return
  }

  feedItemRefs.delete(key)
}

const highlightFeedItem = (key: string) => {
  if (clearFeedHighlightTimer) {
    clearTimeout(clearFeedHighlightTimer)
  }

  highlightedFeedKey.value = key
  clearFeedHighlightTimer = setTimeout(() => {
    if (highlightedFeedKey.value === key) {
      highlightedFeedKey.value = null
    }
  }, 2200)
}

const scrollToFeedItem = (key: string) => {
  void nextTick(() => {
    const el = feedItemRefs.get(key)
    if (!el) return

    el.scrollIntoView({ behavior: 'smooth', block: 'center' })
    highlightFeedItem(key)
  })
}

const getRouteTargetFeedKey = (items: WorkFeedItem[]) => {
  const rawDynamicId = Array.isArray(route.query.dynamicId)
    ? route.query.dynamicId[0]
    : route.query.dynamicId
  const dynamicId = Number(rawDynamicId)
  if (dynamicId > 0) {
    const targetItem = items.find((item) => item.workType === 2 && item.dynamic?.id === dynamicId)
    if (targetItem) return getFeedItemKey(targetItem)
  }

  const rawVideoId = Array.isArray(route.query.videoId)
    ? route.query.videoId[0]
    : route.query.videoId
  const videoId = Number(rawVideoId)
  if (videoId > 0) {
    const targetItem = items.find((item) => item.workType === 1 && item.video?.id === videoId)
    if (targetItem) return getFeedItemKey(targetItem)
  }

  return null
}

const effectiveUserId = computed(() => selectedUserId.value ?? authStore.userId!)

const fetchFeed = async (page = 1) => {
  feedLoading.value = true
  try {
    const res = await getDynamicList({
      userId: effectiveUserId.value,
      type: tabTypeMap[activeTab.value],
      page,
      pageSize: 20,
    })
    feedItems.value = page === 1 ? res.list : [...feedItems.value, ...res.list]
    feedTotal.value = res.total
    feedPage.value = page
    feedInitLoaded.value = true

    const targetFeedKey = getRouteTargetFeedKey(feedItems.value)
    if (targetFeedKey) {
      expandedComments.value.add(targetFeedKey)
      scrollToFeedItem(targetFeedKey)
    }

    // 消费完 query 参数后清除，避免刷新时重复触发展开
    if (route.query.dynamicId || route.query.videoId || route.query.commentId) {
      // 保存 commentId 给 CommentSection 使用（query 清除后 CommentSection 读不到）
      if (route.query.commentId) {
        const rawCid = route.query.commentId
        savedCommentId.value = Number(Array.isArray(rawCid) ? rawCid[0] : rawCid)
      }
      void router.replace({ path: route.path, query: {} })
    }
  } catch {
    if (!feedInitLoaded.value) feedInitLoaded.value = true
  } finally {
    feedLoading.value = false
  }
}

const fetchFollowUsers = async () => {
  followUsersLoading.value = true
  try {
    const res = await getFollowsDynamic({ page: 1, pageSize: 50 })
    followUsers.value = res.list
    await nextTick()
    updateSwiperArrows()
  } catch {
    /* noop */
  } finally {
    followUsersLoading.value = false
  }
}

const selectSwiperUser = async (user: FollowUserItem) => {
  if (selectedUserId.value === user.userId) return
  selectedUserId.value = user.userId
  activeTab.value = 'all'
  feedItems.value = []
  feedPage.value = 1
  void fetchFeed(1)
  if (user.isUnread) {
    try {
      await markDynamicRead({ authorId: user.userId })
      const idx = followUsers.value.findIndex((u) => u.userId === user.userId)
      if (idx >= 0) followUsers.value[idx]!.isUnread = false
    } catch {
      /* noop */
    }
  }
}

const selectAll = () => {
  if (selectedUserId.value === null) return
  selectedUserId.value = null
  activeTab.value = 'all'
  feedItems.value = []
  feedPage.value = 1
  void fetchFeed(1)
}

const switchTab = (tab: DynamicTab) => {
  if (activeTab.value === tab) return
  activeTab.value = tab
  feedItems.value = []
  feedPage.value = 1
  void fetchFeed(1)
}

const loadMore = () => {
  if (feedItems.value.length < feedTotal.value) {
    void fetchFeed(feedPage.value + 1)
  }
}

const publishDynamic = async () => {
  if (!newContent.value.trim()) {
    toast.warning('请输入动态内容')
    return
  }
  publishing.value = true
  try {
    await createDynamic({
      content: newContent.value.trim(),
      imageUrl: newImageUrl.value || undefined,
    })
    newContent.value = ''
    newImageUrl.value = ''
    toast.success('发布成功')
    if (!selectedUserId.value) void fetchFeed(1)
  } catch {
    toast.error('发布失败')
  } finally {
    publishing.value = false
  }
}

const handleImageUpload = async (e: Event) => {
  const target = e.target as HTMLInputElement
  const file = target.files?.[0]
  if (!file) return
  try {
    const hash = `dyn-${Date.now()}`
    const res = await uploadImage(hash, file)
    newImageUrl.value = res.imageUrl
  } catch {
    toast.error('图片上传失败')
  }
}

const showEmojiPicker = ref(false)
const editorRef = ref<HTMLTextAreaElement | null>(null)

const emojiList = [
  '😀',
  '😁',
  '😂',
  '🤣',
  '😃',
  '😄',
  '😅',
  '😆',
  '😉',
  '😊',
  '😋',
  '😎',
  '😍',
  '🥰',
  '😘',
  '😗',
  '🤔',
  '🤨',
  '😮',
  '😯',
  '😲',
  '🙄',
  '😏',
  '😣',
  '😥',
  '😢',
  '😭',
  '😤',
  '😠',
  '🤯',
  '😳',
  '🥺',
  '👍',
  '👎',
  '👏',
  '🙏',
  '💪',
  '🎉',
  '🎊',
  '❤️',
  '🔥',
  '⭐',
  '💯',
  '✅',
  '👀',
  '💬',
  '📷',
  '🎵',
]

const insertEmoji = (emoji: string) => {
  const textarea = editorRef.value
  if (textarea) {
    const start = textarea.selectionStart
    const end = textarea.selectionEnd
    const before = newContent.value.slice(0, start)
    const after = newContent.value.slice(end)
    newContent.value = before + emoji + after
    void nextTick(() => {
      const pos = start + emoji.length
      textarea.setSelectionRange(pos, pos)
      textarea.focus()
    })
  } else {
    newContent.value += emoji
  }
}

const toggleEmojiPicker = () => {
  showEmojiPicker.value = !showEmojiPicker.value
}

const closeEmojiOnOutsideClick = () => {
  showEmojiPicker.value = false
}

const expandedComments = ref<Set<string>>(new Set())
const savedCommentId = ref<number | undefined>()

const toggleComments = (item: WorkFeedItem) => {
  const key = getFeedItemKey(item)
  if (expandedComments.value.has(key)) {
    expandedComments.value.delete(key)
  } else {
    expandedComments.value.add(key)
  }
}

const isCommentExpanded = (item: WorkFeedItem) => {
  return expandedComments.value.has(getFeedItemKey(item))
}

const getVideoId = (item: WorkFeedItem) => {
  return item.workType === 1 && item.video ? item.video.id : undefined
}

const getDynamicId = (item: WorkFeedItem) => {
  return item.workType === 2 && item.dynamic ? item.dynamic.id : undefined
}

const isSelfDynamic = (item: WorkFeedItem) =>
  authStore.isLoggedIn && item.author.id === authStore.userId

const handleDeleteDynamic = async (item: WorkFeedItem) => {
  if (!item.dynamic) return
  try {
    await deleteDynamic({ dynamicId: item.dynamic.id })
    toast.success('已删除')
    void fetchFeed(1)
  } catch {
    toast.error('删除失败')
  }
}

const handlePinDynamic = async (item: WorkFeedItem) => {
  try {
    const isPinned = item.dynamic?.isPinned || item.video?.isPinned || false
    if (item.workType === 2 && item.dynamic) {
      await pinDynamic({ dynamicId: item.dynamic.id, pinned: !isPinned })
    } else if (item.workType === 1 && item.video) {
      await pinDynamic({ videoId: item.video.id, pinned: !isPinned })
    }
    toast.success(isPinned ? '已取消置顶' : '已置顶')
    void fetchFeed(1)
  } catch {
    toast.error('操作失败')
  }
}

const handleLike = async (item: WorkFeedItem) => {
  if (!authStore.isLoggedIn) {
    toast.error('请先登录')
    return
  }

  try {
    if (item.workType === 1 && item.video) {
      const res = await toggleVideoLike(item.video.id)
      item.video.isLiked = res.isLiked
      item.video.likeCount = res.likes
    } else if (item.workType === 2 && item.dynamic) {
      const res = await toggleDynamicLike(item.dynamic.id)
      item.dynamic.isLiked = res.isLiked
      item.dynamic.likeCount = res.likeCount
    }
  } catch {
    toast.error('操作失败')
  }
}

const goVideo = (id: number) => void router.push(`/video/${id}`)
const goUser = (id: number) => void router.push(`/user/${id}`)
const goUserTab = (id: number, tab: string) =>
  void router.push({ path: `/user/${id}`, query: { tab } })

const unreadFollowUsers = computed(() => followUsers.value.filter((u) => u.isUnread))

const fetchHotKeywords = async () => {
  try {
    hotKeywords.value = await getHotSearchKeywords()
  } catch {
    /* noop */
  }
}

onMounted(() => {
  document.addEventListener('click', closeEmojiOnOutsideClick)
  void fetchFeed(1)
  void fetchFollowUsers()
  void fetchHotKeywords()
})

onBeforeUnmount(() => {
  document.removeEventListener('click', closeEmojiOnOutsideClick)
  feedItemRefs.clear()
  if (clearFeedHighlightTimer) clearTimeout(clearFeedHighlightTimer)
})

watch(
  () => authStore.userId,
  () => {
    if (authStore.userId) {
      void fetchFeed(1)
      void fetchFollowUsers()
    }
  }
)

watch(
  () => [route.query.dynamicId, route.query.videoId, route.query.commentId] as const,
  ([dynamicId, videoId, commentId], [previousDynamicId, previousVideoId, previousCommentId]) => {
    if (
      dynamicId === previousDynamicId &&
      videoId === previousVideoId &&
      commentId === previousCommentId
    ) {
      return
    }

    if (dynamicId || videoId || commentId) {
      void fetchFeed(1)
    }
  }
)
</script>

<template>
  <div class="dyn-page">
    <div class="dyn-container">
      <!-- ====== Left Sidebar ====== -->
      <aside class="dyn-sidebar-left">
        <div v-if="authStore.isLoggedIn && authStore.user" class="dyn-profile-card">
          <div class="dyn-profile-top" @click="goUser(authStore.userId!)">
            <AppAvatar
              :src="authStore.user.avatar"
              :name="authStore.user.username"
              container-class="dyn-profile-avatar"
              text-class="text-base font-bold"
            />
            <div class="dyn-profile-info">
              <span class="dyn-profile-name">{{ authStore.user.username }}</span>
              <span
                class="dyn-profile-level"
                :style="{
                  background:
                    authStore.level >= 6
                      ? '#ff6699'
                      : authStore.level >= 4
                        ? '#ffb636'
                        : authStore.level >= 2
                          ? '#7bcfa6'
                          : '#c0c0c0',
                }"
              >
                Lv{{ authStore.level }}
              </span>
            </div>
          </div>
          <div class="dyn-profile-stats">
            <div class="dyn-stat" @click="goUserTab(authStore.userId!, 'following')">
              <span class="dyn-stat-num">{{ fmtCount(authStore.user.followCount) }}</span>
              <span class="dyn-stat-label">关注</span>
            </div>
            <div class="dyn-stat" @click="goUserTab(authStore.userId!, 'fans')">
              <span class="dyn-stat-num">{{ fmtCount(authStore.user.fansCount) }}</span>
              <span class="dyn-stat-label">粉丝</span>
            </div>
            <div class="dyn-stat" @click="goUserTab(authStore.userId!, 'dynamic')">
              <span class="dyn-stat-num">{{ fmtCount(authStore.user.dynamicCount) }}</span>
              <span class="dyn-stat-label">动态</span>
            </div>
          </div>
        </div>

        <div v-if="followUsers.length > 0" class="dyn-left-follow">
          <div class="dyn-left-follow-header">
            <span>我的关注</span>
            <span class="dyn-left-follow-more" @click="goUser(authStore.userId!)">更多 ></span>
          </div>
          <div class="dyn-left-follow-list">
            <div
              v-for="fu in followUsers.slice(0, 8)"
              :key="fu.userId"
              class="dyn-left-follow-item"
              @click="goUser(fu.userId)"
            >
              <div class="dyn-left-follow-aw">
                <AppAvatar
                  :src="fu.avatar"
                  :name="fu.username"
                  container-class="dyn-left-follow-avatar"
                  text-class="text-xs font-semibold"
                />
                <span v-if="fu.isUnread" class="dyn-left-follow-dot"></span>
              </div>
              <div class="dyn-left-follow-info">
                <span class="dyn-left-follow-name">{{ fu.username }}</span>
                <span class="dyn-left-follow-desc">{{ fmtTime(fu.latestWorkAt) }}</span>
              </div>
            </div>
          </div>
        </div>
      </aside>

      <!-- ====== Center Content ====== -->
      <main class="dyn-main">
        <!-- Post Editor -->
        <div class="dyn-editor">
          <div class="dyn-editor-inner">
            <AppAvatar
              v-if="authStore.user"
              :src="authStore.user.avatar"
              :name="authStore.user.username"
              container-class="dyn-editor-avatar"
              text-class="text-sm font-semibold"
            />
            <div class="dyn-editor-body">
              <textarea
                ref="editorRef"
                v-model="newContent"
                class="dyn-editor-input"
                rows="2"
                placeholder="好的标题更容易获得支持，建议20字"
                @focus="showEmojiPicker = false"
              ></textarea>
              <div v-if="newImageUrl" class="dyn-editor-preview">
                <img :src="newImageUrl" class="dyn-editor-preview-img" />
                <button class="dyn-editor-preview-close" @click="newImageUrl = ''">×</button>
              </div>
              <div class="dyn-editor-toolbar">
                <div class="dyn-editor-tools">
                  <label class="dyn-tool-btn" title="上传图片">
                    <ImagePlus :size="18" />
                    <input
                      type="file"
                      accept="image/*"
                      class="hidden"
                      @change="handleImageUpload"
                    />
                  </label>
                  <div class="relative">
                    <button class="dyn-tool-btn" title="表情" @click.stop="toggleEmojiPicker">
                      <SmilePlus :size="18" />
                    </button>
                    <div v-if="showEmojiPicker" class="dyn-emoji-panel" @click.stop>
                      <div class="dyn-emoji-grid">
                        <button
                          v-for="emoji in emojiList"
                          :key="emoji"
                          class="dyn-emoji-item"
                          @click="insertEmoji(emoji)"
                        >
                          {{ emoji }}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
                <div class="dyn-editor-actions">
                  <span class="dyn-char-count">{{ newContent.length }}</span>
                  <button
                    class="dyn-publish-btn"
                    :disabled="publishing || !newContent.trim()"
                    @click="publishDynamic"
                  >
                    {{ publishing ? '发布中...' : '发布' }}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Followed Users Swiper -->
        <div v-if="followUsers.length > 0" class="dyn-swiper-wrap">
          <button
            v-show="canScrollLeft"
            class="dyn-swiper-arrow dyn-swiper-arrow-left"
            @click="scrollSwiper('left')"
          >
            <ChevronLeft :size="16" />
          </button>
          <div ref="swiperRef" class="dyn-swiper" @scroll="updateSwiperArrows">
            <div
              class="dyn-swiper-item"
              :class="{ 'dyn-swiper-item-active': selectedUserId === null }"
              @click="selectAll"
            >
              <div class="dyn-swiper-icon dyn-swiper-icon-all">
                <Zap :size="22" />
              </div>
              <span class="dyn-swiper-name">全部动态</span>
            </div>
            <div
              v-for="fu in followUsers"
              :key="fu.userId"
              class="dyn-swiper-item"
              :class="{ 'dyn-swiper-item-active': selectedUserId === fu.userId }"
              @click="selectSwiperUser(fu)"
            >
              <div class="dyn-swiper-avatar-wrap">
                <AppAvatar
                  :src="fu.avatar"
                  :name="fu.username"
                  container-class="dyn-swiper-avatar"
                  text-class="text-sm font-semibold"
                />
                <span v-if="fu.isUnread" class="dyn-swiper-unread"></span>
              </div>
              <span class="dyn-swiper-name">{{ fu.username }}</span>
            </div>
          </div>
          <button
            v-show="canScrollRight"
            class="dyn-swiper-arrow dyn-swiper-arrow-right"
            @click="scrollSwiper('right')"
          >
            <ChevronRight :size="16" />
          </button>
        </div>

        <!-- Tabs (always visible) -->
        <div class="dyn-tabs">
          <button
            v-for="t in tabList"
            :key="t.key"
            class="dyn-tab"
            :class="{ 'dyn-tab-active': activeTab === t.key }"
            @click="switchTab(t.key)"
          >
            {{ t.label }}
          </button>
        </div>

        <!-- Feed -->
        <div class="dyn-feed">
          <div
            v-for="item in feedItems"
            :key="getFeedItemKey(item)"
            :ref="
              (el) => {
                setFeedItemRef(getFeedItemKey(item), el)
              }
            "
            class="dyn-feed-item"
            :class="{ 'dyn-feed-item-highlight': highlightedFeedKey === getFeedItemKey(item) }"
          >
            <div class="cursor-pointer" @click="goUser(item.author.id)">
              <AppAvatar
                :src="item.author.avatar"
                :name="item.author.username"
                container-class="dyn-feed-avatar"
                text-class="text-sm font-semibold"
              />
            </div>
            <div class="dyn-feed-body">
              <div class="dyn-feed-header">
                <span class="dyn-feed-author" @click="goUser(item.author.id)">
                  {{ item.author.username }}
                </span>
                <span v-if="item.workType === 1" class="dyn-feed-badge">投稿了视频</span>
                <span class="dyn-feed-time">{{ fmtTime(item.createdAt) }}</span>
                <DropdownMenu v-if="isSelfDynamic(item)">
                  <DropdownMenuTrigger as-child>
                    <button class="dyn-feed-more">
                      <MoreVertical :size="16" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem
                      class="cursor-pointer text-[13px]"
                      @select="handlePinDynamic(item)"
                    >
                      <Pin class="mr-2 h-4 w-4" />
                      {{ item.dynamic?.isPinned || item.video?.isPinned ? '取消置顶' : '置顶' }}
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      v-if="item.workType === 2"
                      class="cursor-pointer text-[13px] text-red-500"
                      @select="handleDeleteDynamic(item)"
                    >
                      <Trash2 class="mr-2 h-4 w-4" />
                      删除
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>

              <div v-if="item.dynamic?.isPinned || item.video?.isPinned" class="dyn-pinned-badge">
                <Pin :size="10" /> 已置顶
              </div>

              <div v-if="item.workType === 2 && item.dynamic" class="dyn-feed-content">
                <p class="dyn-feed-text">{{ item.dynamic.content }}</p>
                <img
                  v-if="item.dynamic.imageUrl"
                  :src="item.dynamic.imageUrl"
                  class="dyn-feed-image"
                />
              </div>

              <div
                v-if="item.workType === 1 && item.video"
                class="dyn-video-card"
                @click="goVideo(item.video!.id)"
              >
                <div class="dyn-video-cover">
                  <img :src="item.video.cover" />
                  <span class="dyn-video-dur">{{ fmtDuration(item.video.duration) }}</span>
                </div>
                <div class="dyn-video-info">
                  <h4 class="dyn-video-title">{{ item.video.title }}</h4>
                  <p v-if="item.video.description" class="dyn-video-desc">
                    {{ item.video.description }}
                  </p>
                  <div class="dyn-video-stats">
                    <span class="dyn-video-stat">
                      <Play :size="12" /> {{ fmtCount(item.video.views) }}
                    </span>
                    <span class="dyn-video-stat">
                      <MessageSquare :size="12" /> {{ fmtCount(item.video.danmuCount) }}
                    </span>
                  </div>
                </div>
              </div>

              <div class="dyn-feed-actions">
                <button class="dyn-action-btn">
                  <Share2 :size="14" />
                  <span>转发</span>
                </button>
                <button
                  class="dyn-action-btn"
                  :class="{ 'dyn-action-btn-active': isCommentExpanded(item) }"
                  @click="toggleComments(item)"
                >
                  <MessageSquare :size="14" />
                  <span v-if="item.workType === 1 && item.video?.commentCount">{{
                    item.video.commentCount
                  }}</span>
                  <span v-else-if="item.workType === 2 && item.dynamic?.commentCount">{{
                    item.dynamic.commentCount
                  }}</span>
                  <span v-else>评论</span>
                </button>
                <button
                  class="dyn-action-btn"
                  :class="{
                    'text-primary':
                      item.workType === 1 ? item.video?.isLiked : item.dynamic?.isLiked,
                  }"
                  @click="handleLike(item)"
                >
                  <ThumbsUp
                    :size="14"
                    :class="{
                      'fill-current':
                        item.workType === 1 ? item.video?.isLiked : item.dynamic?.isLiked,
                    }"
                  />
                  <span v-if="item.workType === 1 && item.video?.likeCount">{{
                    item.video.likeCount
                  }}</span>
                  <span v-else-if="item.workType === 2 && item.dynamic?.likeCount">{{
                    item.dynamic.likeCount
                  }}</span>
                  <span v-else>点赞</span>
                </button>
              </div>

              <div v-if="isCommentExpanded(item)" class="dyn-feed-comments">
                <CommentSection
                  :video-id="getVideoId(item)"
                  :dynamic-id="getDynamicId(item)"
                  :author-id="item.author.id"
                  :initial-comment-id="savedCommentId"
                  @comment-consumed="savedCommentId = undefined"
                />
              </div>
            </div>
          </div>

          <div v-if="feedItems.length === 0 && !feedLoading && feedInitLoaded" class="dyn-empty">
            <Eye :size="48" class="text-muted-foreground" />
            <p>还没有动态，关注更多UP主吧</p>
          </div>

          <div v-if="feedLoading && feedItems.length === 0" class="dyn-loading">
            <Loader2 :size="24" class="animate-spin text-primary" />
            <span>加载中...</span>
          </div>

          <div v-if="feedItems.length > 0 && feedItems.length < feedTotal" class="dyn-loadmore">
            <button class="dyn-loadmore-btn" :disabled="feedLoading" @click="loadMore">
              {{ feedLoading ? '加载中...' : '加载更多' }}
            </button>
          </div>
        </div>
      </main>

      <!-- ====== Right Sidebar ====== -->
      <aside class="dyn-sidebar-right">
        <div class="dyn-right-card dyn-tips-card">
          <div class="dyn-tips-icon">
            <Zap :size="20" class="text-primary" />
          </div>
          <div class="dyn-tips-body">
            <div class="dyn-tips-title">动态</div>
            <p class="dyn-tips-desc">关注的UP主发布的最新内容都会出现在这里</p>
          </div>
        </div>

        <div v-if="unreadFollowUsers.length > 0" class="dyn-right-card">
          <div class="dyn-right-card-header">
            <span>最近更新</span>
          </div>
          <div class="dyn-recent-list">
            <div
              v-for="fu in unreadFollowUsers.slice(0, 10)"
              :key="fu.userId"
              class="dyn-recent-item"
              @click="selectSwiperUser(fu)"
            >
              <AppAvatar
                :src="fu.avatar"
                :name="fu.username"
                container-class="dyn-recent-avatar"
                text-class="text-xs font-semibold"
              />
              <div class="dyn-recent-info">
                <span class="dyn-recent-name">{{ fu.username }}</span>
              </div>
              <span class="dyn-recent-type">
                {{ fu.latestWorkType === 1 ? '视频' : '图文' }}
              </span>
            </div>
          </div>
        </div>

        <!-- Hot Search Card -->
        <div v-if="hotKeywords.length > 0" class="dyn-right-card">
          <div class="dyn-right-card-header">
            <span>CCG热搜</span>
          </div>
          <div class="dyn-hot-list">
            <div
              v-for="(kw, idx) in hotKeywords.slice(0, 10)"
              :key="kw.keyword"
              class="dyn-hot-item"
              @click="router.push({ name: 'search', query: { keyword: kw.keyword } })"
            >
              <span class="dyn-hot-rank" :class="idx < 3 ? 'dyn-hot-rank-top' : ''">
                {{ idx + 1 }}
              </span>
              <span class="dyn-hot-keyword">{{ kw.keyword }}</span>
              <span v-if="idx < 3" class="dyn-hot-badge">
                {{ idx === 0 ? '🔥' : idx === 1 ? '🔥' : '热' }}
              </span>
            </div>
          </div>
        </div>
      </aside>
    </div>
  </div>
</template>

<style scoped>
.dyn-page {
  max-width: 1180px;
  margin: 0 auto;
  padding: 20px 16px 60px;
}

.dyn-container {
  display: grid;
  grid-template-columns: 210px 1fr 250px;
  gap: 16px;
  align-items: start;
}

/* ===================== Left Sidebar ===================== */
.dyn-sidebar-left {
  position: sticky;
  top: 20px;
}

.dyn-profile-card {
  background-color: var(--color-card);
  border-radius: 8px;
  padding: 18px 14px;
  box-shadow: var(--shadow-surface);
}

.dyn-profile-top {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 14px;
  cursor: pointer;
}

.dyn-profile-avatar {
  width: 48px;
  height: 48px;
  border-radius: 50%;
  object-fit: cover;
  flex-shrink: 0;
}

.dyn-profile-info {
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.dyn-profile-name {
  font-size: 14px;
  font-weight: 600;
  color: var(--color-foreground);
}

.dyn-profile-level {
  display: inline-block;
  padding: 1px 5px;
  border-radius: 3px;
  font-size: 10px;
  font-weight: 700;
  color: var(--color-primary-foreground);
  width: fit-content;
}

.dyn-profile-stats {
  display: flex;
  justify-content: space-between;
  border-top: 1px solid var(--color-border);
  padding-top: 12px;
}

.dyn-stat {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  cursor: pointer;
}

.dyn-stat-num {
  font-size: 15px;
  font-weight: 600;
  color: var(--color-foreground);
}

.dyn-stat-label {
  font-size: 11px;
  color: var(--color-muted-foreground);
  margin-top: 1px;
}

/* Left follow list */
.dyn-left-follow {
  background-color: var(--color-card);
  border-radius: 8px;
  margin-top: 10px;
  padding: 12px 0;
  box-shadow: var(--shadow-surface);
}

.dyn-left-follow-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0 14px 10px;
  font-size: 13px;
  font-weight: 600;
  color: var(--color-foreground);
}

.dyn-left-follow-more {
  font-size: 11px;
  font-weight: 400;
  color: var(--color-muted-foreground);
  cursor: pointer;
}

.dyn-left-follow-more:hover {
  color: var(--color-primary);
}

.dyn-left-follow-list {
  max-height: 300px;
  overflow-y: auto;
}

.dyn-left-follow-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 7px 14px;
  cursor: pointer;
  transition: background 0.12s;
}

.dyn-left-follow-item:hover {
  background-color: var(--color-secondary);
}

.dyn-left-follow-aw {
  position: relative;
  flex-shrink: 0;
  width: 32px;
  height: 32px;
}

.dyn-left-follow-avatar {
  width: 100%;
  height: 100%;
}

.dyn-left-follow-dot {
  position: absolute;
  top: 0;
  right: -1px;
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background-color: var(--color-accent);
  border: 1.5px solid var(--color-card);
}

.dyn-left-follow-info {
  flex: 1;
  min-width: 0;
}

.dyn-left-follow-name {
  display: block;
  font-size: 13px;
  color: var(--color-foreground);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.dyn-left-follow-desc {
  font-size: 11px;
  color: var(--color-muted-foreground);
}

/* ===================== Center Main ===================== */
.dyn-main {
  min-width: 0;
}

/* Editor */
.dyn-editor {
  background-color: var(--color-card);
  border-radius: 8px;
  padding: 16px 18px;
  margin-bottom: 10px;
  box-shadow: var(--shadow-surface);
}

.dyn-editor-inner {
  display: flex;
  gap: 12px;
}

.dyn-editor-avatar {
  width: 38px;
  height: 38px;
  border-radius: 50%;
  object-fit: cover;
  flex-shrink: 0;
}

.dyn-editor-body {
  flex: 1;
  min-width: 0;
}

.dyn-editor-input {
  width: 100%;
  border: 1px solid var(--color-border);
  border-radius: 8px;
  padding: 10px 12px;
  font-size: 13px;
  color: var(--color-foreground);
  resize: none;
  outline: none;
  transition: border-color 0.2s;
  line-height: 1.6;
}

.dyn-editor-input:focus {
  border-color: var(--color-primary);
}

.dyn-editor-input::placeholder {
  color: var(--color-muted-foreground);
}

.dyn-editor-preview {
  margin-top: 8px;
  display: inline-block;
  position: relative;
}

.dyn-editor-preview-img {
  height: 72px;
  border-radius: 6px;
  display: block;
}

.dyn-editor-preview-close {
  position: absolute;
  top: -6px;
  right: -6px;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: rgb(0 0 0 / 0.6);
  color: #fff;
  font-size: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  border: none;
}

.dyn-editor-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 8px;
}

.dyn-editor-tools {
  display: flex;
  gap: 2px;
}

.dyn-tool-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  border-radius: 6px;
  color: var(--color-muted-foreground);
  cursor: pointer;
  transition:
    color 0.12s,
    background 0.12s;
  border: none;
  background: none;
}

.dyn-tool-btn:hover {
  color: var(--color-primary);
  background: var(--color-secondary);
}

.dyn-emoji-panel {
  position: absolute;
  bottom: calc(100% + 8px);
  left: 0;
  width: 320px;
  background-color: var(--color-card);
  border: 1px solid var(--color-border);
  border-radius: 8px;
  box-shadow:
    0 4px 12px rgb(0 0 0 / 0.08),
    0 1px 3px rgb(0 0 0 / 0.04);
  padding: 10px;
  z-index: 100;
}

.dyn-emoji-grid {
  display: grid;
  grid-template-columns: repeat(8, 1fr);
  gap: 2px;
}

.dyn-emoji-item {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 34px;
  height: 34px;
  font-size: 20px;
  border-radius: 6px;
  cursor: pointer;
  border: none;
  background: none;
  transition:
    background 0.15s,
    transform 0.15s;
}

.dyn-emoji-item:hover {
  background: var(--color-secondary);
  transform: scale(1.2);
}

.dyn-editor-actions {
  display: flex;
  align-items: center;
  gap: 10px;
}

.dyn-char-count {
  font-size: 12px;
  color: var(--color-muted-foreground);
}

.dyn-publish-btn {
  padding: 5px 22px;
  border-radius: 6px;
  background-color: var(--color-primary);
  color: #fff;
  font-size: 13px;
  font-weight: 500;
  border: none;
  cursor: pointer;
  transition: background 0.15s;
}

.dyn-publish-btn:hover:not(:disabled) {
  background-color: var(--color-primary);
}

.dyn-publish-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* ===================== Swiper ===================== */
.dyn-swiper-wrap {
  position: relative;
  background-color: var(--color-card);
  border-radius: 8px;
  padding: 14px 12px;
  margin-bottom: 10px;
  box-shadow: var(--shadow-surface);
}

.dyn-swiper {
  display: flex;
  gap: 8px;
  overflow-x: auto;
  scroll-behavior: smooth;
  scroll-snap-type: x mandatory;
  scrollbar-width: none;
  -ms-overflow-style: none;
  padding: 2px 0;
}

.dyn-swiper::-webkit-scrollbar {
  display: none;
}

.dyn-swiper-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
  width: 64px;
  cursor: pointer;
  scroll-snap-align: start;
}

.dyn-swiper-icon {
  width: 50px;
  height: 50px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: transform 0.18s;
  border: 2.5px solid transparent;
}

.dyn-swiper-icon-all {
  background: linear-gradient(135deg, oklch(var(--primary) / 0.8), var(--color-primary));
  color: var(--color-primary-foreground);
}

.dyn-swiper-item-active .dyn-swiper-icon {
  border-color: var(--color-primary);
  transform: scale(1.06);
}

.dyn-swiper-item:hover .dyn-swiper-icon {
  transform: scale(1.06);
}

.dyn-swiper-avatar-wrap {
  position: relative;
  width: 50px;
  height: 50px;
}

.dyn-swiper-avatar {
  width: 50px;
  height: 50px;
  border-radius: 50%;
  object-fit: cover;
  border: 2.5px solid transparent;
  transition:
    border-color 0.18s,
    transform 0.18s;
  box-sizing: border-box;
}

.dyn-swiper-item:hover .dyn-swiper-avatar {
  transform: scale(1.06);
  border-color: oklch(var(--primary) / 0.2);
}

.dyn-swiper-item-active .dyn-swiper-avatar {
  border-color: var(--color-primary);
  transform: scale(1.06);
}

.dyn-swiper-unread {
  position: absolute;
  top: 1px;
  right: 1px;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background-color: var(--color-accent);
  border: 1.5px solid #fff;
}

.dyn-swiper-name {
  font-size: 11px;
  color: var(--color-muted-foreground);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 60px;
  text-align: center;
}

.dyn-swiper-item-active .dyn-swiper-name {
  color: var(--color-primary);
  font-weight: 500;
}

.dyn-swiper-arrow {
  position: absolute;
  top: 50%;
  transform: translateY(-50%);
  z-index: 2;
  width: 28px;
  height: 28px;
  border-radius: 50%;
  background-color: var(--color-card);
  border: 1px solid var(--color-border);
  box-shadow: 0 2px 6px rgb(0 0 0 / 0.1);
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--color-muted-foreground);
  cursor: pointer;
  transition:
    background 0.15s,
    color 0.15s;
}

.dyn-swiper-arrow:hover {
  background-color: var(--color-primary);
  color: #fff;
  border-color: var(--color-primary);
}

.dyn-swiper-arrow-left {
  left: 2px;
}

.dyn-swiper-arrow-right {
  right: 2px;
}

/* ===================== Tabs ===================== */
.dyn-tabs {
  display: flex;
  gap: 0;
  background-color: var(--color-card);
  border-radius: 8px;
  padding: 0 4px;
  margin-bottom: 10px;
  box-shadow: var(--shadow-surface);
}

.dyn-tab {
  position: relative;
  padding: 13px 18px;
  font-size: 14px;
  color: var(--color-muted-foreground);
  cursor: pointer;
  border: none;
  background: none;
  transition: color 0.12s;
  white-space: nowrap;
}

.dyn-tab:hover {
  color: var(--color-foreground);
}

.dyn-tab-active {
  color: var(--color-primary);
  font-weight: 600;
}

.dyn-tab-active::after {
  content: '';
  position: absolute;
  bottom: 0;
  left: 50%;
  transform: translateX(-50%);
  width: 22px;
  height: 3px;
  border-radius: 2px;
  background-color: var(--color-primary);
}

/* ===================== Feed ===================== */
.dyn-feed {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.dyn-feed-item {
  display: flex;
  gap: 12px;
  padding: 16px 18px;
  background-color: var(--color-card);
  border-radius: 8px;
  box-shadow: var(--shadow-surface);
  transition:
    box-shadow 0.18s,
    background-color 0.18s;
}

.dyn-feed-item:hover {
  box-shadow: 0 2px 8px rgb(0 0 0 / 0.08);
}

.dyn-feed-item-highlight {
  background-color: color-mix(in oklab, var(--color-card) 92%, var(--color-primary));
  box-shadow:
    0 0 0 1px oklch(var(--primary) / 0.12),
    0 16px 32px -28px oklch(var(--primary) / 0.45);
}

.dyn-feed-avatar {
  width: 38px;
  height: 38px;
  border-radius: 50%;
  object-fit: cover;
  flex-shrink: 0;
  cursor: pointer;
}

.dyn-feed-body {
  flex: 1;
  min-width: 0;
}

.dyn-feed-header {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 6px;
}

.dyn-feed-author {
  font-size: 13px;
  font-weight: 500;
  color: var(--color-primary);
  cursor: pointer;
  transition: color 0.12s;
}

.dyn-feed-author:hover {
  color: var(--color-primary);
}

.dyn-feed-badge {
  font-size: 11px;
  color: var(--color-muted-foreground);
}

.dyn-feed-time {
  font-size: 12px;
  color: var(--color-muted-foreground);
  margin-left: auto;
}

.dyn-feed-more {
  padding: 4px;
  border-radius: 4px;
  color: var(--color-muted-foreground);
  background: none;
  border: none;
  cursor: pointer;
  transition:
    color 0.12s,
    background 0.12s;
  flex-shrink: 0;
  margin-left: 4px;
}

.dyn-feed-more:hover {
  color: var(--color-muted-foreground);
  background: var(--color-secondary);
}

.dyn-pinned-badge {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  margin-top: 4px;
  margin-bottom: 4px;
  padding: 1px 6px;
  border: 1px solid var(--status-warning-border);
  background: var(--status-warning-soft);
  color: var(--status-warning-ink);
  font-size: 11px;
  border-radius: 999px;
  font-weight: 500;
}

.dyn-feed-content {
  margin-bottom: 8px;
}

.dyn-feed-text {
  font-size: 14px;
  color: var(--color-foreground);
  line-height: 1.7;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

.dyn-feed-image {
  margin-top: 10px;
  max-width: 340px;
  max-height: 300px;
  border-radius: 8px;
  object-fit: cover;
  cursor: pointer;
  transition: opacity 0.12s;
}

.dyn-feed-image:hover {
  opacity: 0.92;
}

/* Video card */
.dyn-video-card {
  display: flex;
  gap: 12px;
  padding: 10px;
  background-color: var(--color-secondary);
  border-radius: 8px;
  cursor: pointer;
  margin-bottom: 8px;
  transition: background 0.12s;
}

.dyn-video-card:hover {
  background: var(--color-muted);
}

.dyn-video-cover {
  position: relative;
  width: 168px;
  aspect-ratio: 16 / 9;
  border-radius: 6px;
  overflow: hidden;
  flex-shrink: 0;
  background-color: var(--color-secondary);
}

.dyn-video-cover img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.dyn-video-dur {
  position: absolute;
  bottom: 4px;
  right: 6px;
  background: rgb(0 0 0 / 0.7);
  color: #fff;
  font-size: 11px;
  padding: 0 5px;
  border-radius: 3px;
  line-height: 1.6;
}

.dyn-video-info {
  flex: 1;
  min-width: 0;
  padding: 2px 0;
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 4px;
}

.dyn-video-title {
  font-size: 14px;
  font-weight: 500;
  color: var(--color-foreground);
  display: -webkit-box;
  -webkit-line-clamp: 2;
  line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  line-height: 1.5;
}

.dyn-video-desc {
  font-size: 12px;
  color: var(--color-muted-foreground);
  display: -webkit-box;
  -webkit-line-clamp: 1;
  line-clamp: 1;
  -webkit-box-orient: vertical;
  overflow: hidden;
  line-height: 1.5;
  margin: 0;
}

.dyn-video-stats {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-top: auto;
}

.dyn-video-stat {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  font-size: 12px;
  color: var(--color-muted-foreground);
}

/* Feed Actions */
.dyn-feed-actions {
  display: flex;
  gap: 4px;
  padding-top: 8px;
  border-top: 1px solid var(--color-border);
}

.dyn-action-btn {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 5px 14px;
  border-radius: 6px;
  font-size: 12px;
  color: var(--color-muted-foreground);
  background: none;
  border: none;
  cursor: pointer;
  transition:
    color 0.12s,
    background 0.12s;
}

.dyn-action-btn:hover {
  color: var(--color-primary);
  background: oklch(var(--primary) / 0.06);
}

.dyn-action-btn-active {
  color: var(--color-primary);
}

.dyn-feed-comments {
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px solid var(--color-border);
}

/* Empty / Loading / Load More */
.dyn-empty {
  padding: 60px 0;
  text-align: center;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
}

.dyn-empty p {
  font-size: 13px;
  color: var(--color-muted-foreground);
}

.dyn-loading {
  padding: 40px 0;
  text-align: center;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  font-size: 13px;
  color: var(--color-muted-foreground);
}

.dyn-loadmore {
  text-align: center;
  padding: 8px 0;
}

.dyn-loadmore-btn {
  padding: 7px 28px;
  border-radius: 20px;
  border: 1px solid var(--color-border);
  background-color: var(--color-card);
  color: var(--color-muted-foreground);
  font-size: 13px;
  cursor: pointer;
  transition:
    color 0.12s,
    border-color 0.12s;
}

.dyn-loadmore-btn:hover:not(:disabled) {
  color: var(--color-primary);
  border-color: var(--color-primary);
}

.dyn-loadmore-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

/* ===================== Right Sidebar ===================== */
.dyn-sidebar-right {
  position: sticky;
  top: 20px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.dyn-right-card {
  background-color: var(--color-card);
  border-radius: 8px;
  padding: 14px;
  box-shadow: var(--shadow-surface);
}

.dyn-tips-card {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  background: oklch(var(--primary) / 0.05);
  border: 1px solid oklch(var(--primary) / 0.1);
}

.dyn-tips-icon {
  width: 36px;
  height: 36px;
  border-radius: 8px;
  background-color: var(--color-card);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.dyn-tips-body {
  flex: 1;
  min-width: 0;
}

.dyn-tips-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--color-primary);
  margin-bottom: 4px;
}

.dyn-tips-desc {
  font-size: 12px;
  color: var(--color-muted-foreground);
  line-height: 1.5;
}

.dyn-right-card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 10px;
  padding-bottom: 8px;
  border-bottom: 1px solid var(--color-border);
  font-size: 13px;
  font-weight: 600;
  color: var(--color-foreground);
}

.dyn-recent-list {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.dyn-recent-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 6px 4px;
  border-radius: 6px;
  cursor: pointer;
  transition: background 0.12s;
}

.dyn-recent-item:hover {
  background-color: var(--color-secondary);
}

.dyn-recent-avatar {
  width: 30px;
  height: 30px;
  border-radius: 50%;
  object-fit: cover;
  flex-shrink: 0;
}

.dyn-recent-info {
  flex: 1;
  min-width: 0;
}

.dyn-recent-name {
  display: block;
  font-size: 13px;
  color: var(--color-foreground);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.dyn-recent-type {
  font-size: 11px;
  color: var(--color-primary);
  flex-shrink: 0;
  padding: 2px 6px;
  background: oklch(var(--primary) / 0.08);
  border-radius: 4px;
}

/* Hot Search */
.dyn-hot-list {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.dyn-hot-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 7px 4px;
  border-radius: 6px;
  cursor: pointer;
  transition: background 0.12s;
}

.dyn-hot-item:hover {
  background-color: var(--color-secondary);
}

.dyn-hot-rank {
  width: 18px;
  height: 18px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  font-weight: 700;
  color: var(--color-muted-foreground);
  flex-shrink: 0;
  border-radius: 4px;
}

.dyn-hot-rank-top {
  background-color: var(--color-primary);
  color: #fff;
}

.dyn-hot-keyword {
  flex: 1;
  min-width: 0;
  font-size: 13px;
  color: var(--color-foreground);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.dyn-hot-badge {
  font-size: 11px;
  flex-shrink: 0;
}

/* ===================== Responsive ===================== */
@media (width <= 1060px) {
  .dyn-container {
    grid-template-columns: 1fr 240px;
  }

  .dyn-sidebar-left {
    display: none;
  }
}

@media (width <= 768px) {
  .dyn-container {
    grid-template-columns: 1fr;
  }

  .dyn-sidebar-right {
    display: none;
  }
}
</style>
