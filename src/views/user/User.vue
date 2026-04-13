<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import {
  getUserDetail,
  type UserDetail,
  getUserVideoList,
  getRecentLikedVideos,
  getRecentCoinedVideos,
  type UserVideoItem,
  getUserConfig,
  updateUserConfig,
  type UserConfig,
  type UpdateUserConfigParams,
} from '@/api/user'
import {
  followUser,
  unfollowUser,
  getRelation,
  getFollowingList,
  getFansList,
  type RelationInfo,
  type SocialUserInfo,
} from '@/api/social'
import {
  getFolderList,
  getFolderVideos,
  toggleVideoLike,
  type FolderItem,
  type FolderVideoItem,
} from '@/api/video'
import {
  getDynamicList,
  createDynamic,
  deleteDynamic,
  pinDynamic,
  toggleDynamicLike,
  getWorkId,
  type WorkFeedItem,
} from '@/api/dynamic'
import { createConversation } from '@/api/chat'
import { uploadImage } from '@/api/upload'
import { toast } from 'vue-sonner'
import Navbar from '@/components/layout/Navbar.vue'
import AppAvatar from '@/components/common/AppAvatar.vue'
import CommentSection from '@/components/comment/CommentSection.vue'
import UserBannerPicker from '@/components/user/UserBannerPicker.vue'
import {
  Home,
  Zap,
  PlaySquare,
  Star,
  Settings,
  Play,
  MessageSquare,
  Upload,
  FileVideo,
  ChevronRight,
  Shirt,
  VenusAndMars,
  Pin,
  Trash2,
  MoreVertical,
  ImagePlus,
  Search,
  UserCheck,
  ThumbsUp,
} from 'lucide-vue-next'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

const route = useRoute()
const router = useRouter()
const authStore = useAuthStore()

const userId = computed(() => Number(route.params.id))
const isSelf = computed(() => authStore.isLoggedIn && authStore.userId === userId.value)

const user = ref<UserDetail | null>(null)
const relation = ref<RelationInfo | null>(null)
const loading = ref(true)
const followLoading = ref(false)
const chatOpening = ref(false)
const bannerPreviewUrl = ref('')
const bannerPickerOpen = ref(false)

type TabKey = 'home' | 'dynamic' | 'videos' | 'favorites' | 'following' | 'fans' | 'settings'
const activeTab = ref<TabKey>('home')

// Home Tab Data
const homeVideos = ref<UserVideoItem[]>([])
const homeVideoTotal = ref(0)
const homeVideoSort = ref<0 | 1 | 2>(0)
const homeVideosLoading = ref(false)
const likedVideos = ref<UserVideoItem[]>([])
const coinedVideos = ref<UserVideoItem[]>([])
const folders = ref<FolderItem[]>([])
const folderCovers = ref<Record<number, string>>({})

// Dynamic Tab Data
const dynamics = ref<WorkFeedItem[]>([])
const dynamicTotal = ref(0)
const dynamicPage = ref(1)
const dynamicsLoading = ref(false)
const dynamicFilter = ref<'all' | 'video' | 'image'>('all')
const newDynamicContent = ref('')
const newDynamicImageUrl = ref('')
const dynamicPublishing = ref(false)
const expandedComments = ref<Set<string>>(new Set())

// Videos Tab Data
const videos = ref<UserVideoItem[]>([])
const videoTotal = ref(0)
const videoPage = ref(1)
const videoSort = ref<0 | 1 | 2>(0)
const videosLoading = ref(false)

// Favorites Tab Data
const selectedFolderId = ref<number | null>(null)
const folderVideos = ref<FolderVideoItem[]>([])
const folderVideoTotal = ref(0)
const folderVideoPage = ref(1)
const folderVideoSort = ref<0 | 1 | 2>(0)
const folderVideosLoading = ref(false)

// Settings Tab Data
const userConf = ref<UserConfig | null>(null)
const confLoading = ref(false)
const confSaving = ref(false)

// Following Tab Data
const followingList = ref<SocialUserInfo[]>([])
const followingTotal = ref(0)
const followingPage = ref(1)
const followingLoading = ref(false)
const followingKeyword = ref('')

// Fans Tab Data
const fansList = ref<SocialUserInfo[]>([])
const fansTotal = ref(0)
const fansPage = ref(1)
const fansLoading = ref(false)
const fansKeyword = ref('')

// Track local follow state for social lists
const localFollowState = ref(new Map<number, boolean>())

const isFollowed = computed(() => relation.value?.isFocus ?? false)
const isMutual = computed(() => relation.value?.isMutualFollow ?? false)
const displayBannerUrl = computed(() => bannerPreviewUrl.value || user.value?.bannerUrl || '')

const followBtnText = computed(() => {
  if (isMutual.value) return '互相关注'
  if (isFollowed.value) return '已关注'
  return '关注'
})

const levelColor = (level: number): string => {
  if (level >= 6) return '#ff6699'
  if (level >= 4) return '#ffb636'
  if (level >= 2) return '#7bcfa6'
  return '#c0c0c0'
}

const fmtCount = (n: number): string => {
  if (n >= 10000) return `${(n / 10000).toFixed(1)}万`
  return n.toString()
}

const fmtDuration = (s: number): string => {
  const m = Math.floor(s / 60)
  const sec = s % 60
  return `${m}:${sec.toString().padStart(2, '0')}`
}

const fmtDate = (dateStr: string): string => {
  const d = new Date(dateStr)
  return `${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

const fmtTime = (dateStr: string): string => {
  const d = new Date(dateStr)
  const now = new Date()
  const diffDays = Math.floor((now.getTime() - d.getTime()) / 86400000)
  if (diffDays < 1) return '今天'
  if (diffDays < 30) return `${diffDays}天前`
  return fmtDate(dateStr)
}

const fmtFullTime = (dateStr: string): string => {
  const d = new Date(dateStr)
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

const genderText = computed(() => {
  if (!user.value) return ''
  if (user.value.gender === 1) return '男'
  if (user.value.gender === 2) return '女'
  return '保密'
})

const normalizeLikeTags = (tags?: string[] | null) => {
  if (!Array.isArray(tags)) return []
  return tags
    .map((tag) => tag.trim())
    .filter((tag, index, arr) => tag.length > 0 && arr.indexOf(tag) === index)
}

const visibleLikeTags = computed(() => normalizeLikeTags(user.value?.likeTags))

type ProfileMetaItem =
  | { key: string; label: string; icon: any; value: string; tags?: never }
  | { key: string; label: string; icon: any; value?: never; tags: string[] }

const profileMetaItems = computed<ProfileMetaItem[]>(() => {
  if (!user.value) return []

  const items: ProfileMetaItem[] = [
    { key: 'uid', label: 'UID', icon: 'vui_icon sic-fsp-uid_line', value: String(user.value.id) },
    {
      key: 'birthday',
      label: '生日',
      icon: 'vui_icon sic-fsp-cake_line',
      value: user.value.birthday ? fmtDate(user.value.birthday) : '-',
    },
    { key: 'gender', label: '性别', icon: VenusAndMars, value: genderText.value || '-' },
  ]

  if (visibleLikeTags.value.length) {
    items.push({
      key: 'likeTags',
      label: '兴趣',
      icon: 'vui_icon sic-fsp-tag_line',
      tags: visibleLikeTags.value,
    })
  }

  return items
})

const likeTagInput = ref('')

const addLikeTagDraft = async () => {
  if (!userConf.value) return
  const nextTag = likeTagInput.value.trim()
  if (!nextTag) return
  if (userConf.value.likeTags.includes(nextTag)) {
    likeTagInput.value = ''
    return
  }
  userConf.value.likeTags = [...userConf.value.likeTags, nextTag]
  likeTagInput.value = ''
  await saveLikeTags(true)
}

const removeLikeTagDraft = async (tag: string) => {
  if (!userConf.value) return
  userConf.value.likeTags = userConf.value.likeTags.filter((item) => item !== tag)
  await saveLikeTags(true)
}

const saveLikeTags = async (silent = false) => {
  if (!userConf.value || confSaving.value) return

  confSaving.value = true
  const nextTags = normalizeLikeTags(userConf.value.likeTags)
  try {
    await updateUserConfig({ likeTags: nextTags })
    userConf.value.likeTags = nextTags
    if (user.value) {
      user.value.likeTags = nextTags
    }
    authStore.updateUser({ likeTags: nextTags })
    if (silent !== true) toast.success('兴趣标签已保存')
  } catch {
    toast.error('保存兴趣标签失败')
  } finally {
    confSaving.value = false
  }
}

// ---- Fetchers ----

const fetchUserProfile = async () => {
  loading.value = true
  try {
    const detail = await getUserDetail(userId.value)
    user.value = {
      ...detail,
      likeTags: normalizeLikeTags(detail.likeTags),
    }
    if (authStore.isLoggedIn && !isSelf.value) {
      relation.value = await getRelation(userId.value)
    }
  } catch {
    toast.error('获取用户信息失败')
  } finally {
    loading.value = false
  }
}

const fetchHomeVideos = async () => {
  homeVideosLoading.value = true
  try {
    const result = await getUserVideoList({
      userId: userId.value,
      page: 1,
      pageSize: 8,
      sort: homeVideoSort.value,
    })
    homeVideos.value = result.list
    homeVideoTotal.value = result.total
  } catch {
    /* noop */
  } finally {
    homeVideosLoading.value = false
  }
}

const changeHomeVideoSort = (sort: 0 | 1 | 2) => {
  homeVideoSort.value = sort
  void fetchHomeVideos()
}

const fetchVideos = async (page = 1) => {
  videosLoading.value = true
  try {
    const result = await getUserVideoList({
      userId: userId.value,
      page,
      pageSize: 20,
      sort: videoSort.value,
    })
    videos.value = page === 1 ? result.list : [...videos.value, ...result.list]
    videoTotal.value = result.total
    videoPage.value = page
  } catch {
    toast.error('获取投稿列表失败')
  } finally {
    videosLoading.value = false
  }
}

const fetchLiked = async () => {
  try {
    const r = await getRecentLikedVideos(userId.value)
    likedVideos.value = r.list
  } catch {
    /* noop */
  }
}

const fetchCoined = async () => {
  try {
    const r = await getRecentCoinedVideos(userId.value)
    coinedVideos.value = r.list
  } catch {
    /* noop */
  }
}

const fetchFolders = async () => {
  if (!isSelf.value) return
  try {
    const r = await getFolderList()
    folders.value = r.list
    void fetchFolderCovers()
  } catch {
    /* noop */
  }
}

const fetchFolderCovers = async () => {
  const covers: Record<number, string> = {}
  await Promise.all(
    folders.value.map(async (f) => {
      if (f.videoCount <= 0) return
      try {
        const res = await getFolderVideos({ folderId: f.id, page: 1, pageSize: 1 })
        if (res.list.length > 0) covers[f.id] = res.list[0]!.cover
      } catch {
        /* noop */
      }
    })
  )
  folderCovers.value = covers
}

const fetchFolderVideos = async (page = 1) => {
  if (!selectedFolderId.value) return
  folderVideosLoading.value = true
  try {
    const res = await getFolderVideos({
      folderId: selectedFolderId.value,
      page,
      pageSize: 20,
      sort: folderVideoSort.value,
    })
    folderVideos.value = page === 1 ? res.list : [...folderVideos.value, ...res.list]
    folderVideoTotal.value = res.total
    folderVideoPage.value = page
  } catch {
    toast.error('获取收藏夹视频失败')
  } finally {
    folderVideosLoading.value = false
  }
}

const dynamicTypeMap: Record<'all' | 'video' | 'image', 0 | 1 | 2> = {
  all: 0,
  video: 1,
  image: 2,
}

const fetchDynamics = async (page = 1) => {
  dynamicsLoading.value = true
  try {
    const res = await getDynamicList({
      userId: userId.value,
      type: dynamicTypeMap[dynamicFilter.value],
      page,
      pageSize: 20,
    })
    dynamics.value = page === 1 ? res.list : [...dynamics.value, ...res.list]
    dynamicTotal.value = res.total
    dynamicPage.value = page
  } catch {
    toast.error('获取动态失败')
  } finally {
    dynamicsLoading.value = false
  }
}

const fetchUserConf = async () => {
  confLoading.value = true
  try {
    const config = await getUserConfig()
    userConf.value = {
      ...config,
      likeTags: normalizeLikeTags(config.likeTags),
    }
  } catch {
    toast.error('获取隐私设置失败')
  } finally {
    confLoading.value = false
  }
}

const fetchFollowing = async (page = 1) => {
  followingLoading.value = true
  try {
    const res = await getFollowingList(userId.value, {
      page,
      pageSize: 20,
      keyword: followingKeyword.value || undefined,
    })
    followingList.value = page === 1 ? res.list : [...followingList.value, ...res.list]
    followingTotal.value = res.total
    followingPage.value = page
    for (const u of res.list) {
      if (!localFollowState.value.has(u.id)) {
        localFollowState.value.set(u.id, true)
      }
    }
  } catch {
    toast.error('获取关注列表失败')
  } finally {
    followingLoading.value = false
  }
}

const fetchFans = async (page = 1) => {
  fansLoading.value = true
  try {
    const res = await getFansList(userId.value, {
      page,
      pageSize: 20,
      keyword: fansKeyword.value || undefined,
    })
    fansList.value = page === 1 ? res.list : [...fansList.value, ...res.list]
    fansTotal.value = res.total
    fansPage.value = page
  } catch {
    toast.error('获取粉丝列表失败')
  } finally {
    fansLoading.value = false
  }
}

const searchFollowing = () => {
  followingList.value = []
  void fetchFollowing(1)
}

const searchFans = () => {
  fansList.value = []
  void fetchFans(1)
}

const loadMoreFollowing = () => {
  if (followingList.value.length < followingTotal.value) {
    void fetchFollowing(followingPage.value + 1)
  }
}

const loadMoreFans = () => {
  if (fansList.value.length < fansTotal.value) {
    void fetchFans(fansPage.value + 1)
  }
}

const isUserFollowedByMe = (uid: number): boolean => {
  return localFollowState.value.get(uid) ?? false
}

const handleFollowInList = async (targetId: number) => {
  if (!authStore.isLoggedIn) {
    toast.warning('请先登录')
    return
  }
  const currentlyFollowed = isUserFollowedByMe(targetId)
  try {
    if (currentlyFollowed) {
      await unfollowUser({ focusUserId: targetId })
      localFollowState.value.set(targetId, false)
      if (activeTab.value === 'following') {
        followingList.value = followingList.value.filter((u) => u.id !== targetId)
        followingTotal.value = Math.max(0, followingTotal.value - 1)
      }
      toast.success('已取消关注')
    } else {
      await followUser({ focusUserId: targetId })
      localFollowState.value.set(targetId, true)
      toast.success('关注成功')
    }
  } catch {
    toast.error('操作失败')
  }
}

// ---- Actions ----

const selectFolder = (id: number) => {
  selectedFolderId.value = id
  folderVideoPage.value = 1
  folderVideoSort.value = 0
  folderVideos.value = []
  void fetchFolderVideos()
}

const changeFolderSort = (sort: 0 | 1 | 2) => {
  folderVideoSort.value = sort
  void fetchFolderVideos(1)
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
      await unfollowUser({ focusUserId: userId.value })
      relation.value = { ...relation.value!, isFocus: false, isMutualFollow: false }
      toast.success('已取消关注')
    } else {
      await followUser({ focusUserId: userId.value })
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

const handleOpenChat = async () => {
  if (isSelf.value) return
  if (!authStore.isLoggedIn) {
    toast.warning('请先登录')
    return
  }
  if (chatOpening.value) return

  chatOpening.value = true
  try {
    await createConversation({ peerId: userId.value })
    void router.push({ name: 'message-chat-room', params: { peerId: userId.value } })
  } catch {
    toast.error('发起私聊失败')
  } finally {
    chatOpening.value = false
  }
}

const publishDynamic = async () => {
  if (!newDynamicContent.value.trim()) {
    toast.warning('请输入动态内容')
    return
  }
  dynamicPublishing.value = true
  try {
    await createDynamic({
      content: newDynamicContent.value.trim(),
      imageUrl: newDynamicImageUrl.value || undefined,
    })
    newDynamicContent.value = ''
    newDynamicImageUrl.value = ''
    toast.success('发布成功')
    void fetchDynamics(1)
  } catch {
    toast.error('发布失败')
  } finally {
    dynamicPublishing.value = false
  }
}

const handleDeleteDynamic = async (item: WorkFeedItem) => {
  if (!item.dynamic) return
  try {
    await deleteDynamic({ dynamicId: item.dynamic.id })
    toast.success('已删除')
    void fetchDynamics(1)
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
    void fetchDynamics(1)
  } catch {
    toast.error('操作失败')
  }
}

const getDynamicFeedKey = (item: WorkFeedItem) => `${item.workType}-${getWorkId(item)}`

const toggleComments = (item: WorkFeedItem) => {
  const key = getDynamicFeedKey(item)
  if (expandedComments.value.has(key)) {
    expandedComments.value.delete(key)
    return
  }
  expandedComments.value.add(key)
}

const isCommentExpanded = (item: WorkFeedItem) =>
  expandedComments.value.has(getDynamicFeedKey(item))

const getVideoId = (item: WorkFeedItem) => {
  return item.workType === 1 && item.video ? item.video.id : undefined
}

const getDynamicId = (item: WorkFeedItem) => {
  return item.workType === 2 && item.dynamic ? item.dynamic.id : undefined
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

const handleDynamicImageUpload = async (e: Event) => {
  const target = e.target as HTMLInputElement
  const file = target.files?.[0]
  if (!file) return
  try {
    const hash = `img-${Date.now()}`
    const res = await uploadImage(hash, file)
    newDynamicImageUrl.value = res.imageUrl
  } catch {
    toast.error('图片上传失败')
  }
}

const toggleConf = async (key: keyof UpdateUserConfigParams) => {
  if (!userConf.value || confSaving.value) return
  confSaving.value = true
  const current = userConf.value[key as keyof UserConfig]
  const newVal = !current
  try {
    await updateUserConfig({ [key]: newVal })
    ;(userConf.value as Record<string, unknown>)[key as string] = newVal
  } catch {
    toast.error('保存失败')
  } finally {
    confSaving.value = false
  }
}

const handleBannerPreview = (url: string | null) => {
  bannerPreviewUrl.value = url ?? ''
}

const handleBannerSaved = (payload: { bannerId: number; bannerUrl: string }) => {
  bannerPreviewUrl.value = ''

  if (user.value) {
    user.value.bannerUrl = payload.bannerUrl
  }

  if (userConf.value) {
    userConf.value.bannerId = payload.bannerId
    userConf.value.bannerUrl = payload.bannerId === 0 ? payload.bannerUrl : ''
  }

  authStore.updateUser({ bannerUrl: payload.bannerUrl })
}

const toggleBannerPicker = () => {
  bannerPickerOpen.value = !bannerPickerOpen.value
}

const closeBannerPicker = () => {
  bannerPickerOpen.value = false
}

const getTabQueryValue = (tab: TabKey): string | undefined => {
  return tab === 'home' ? undefined : tab
}

const syncTabQuery = (tab: TabKey) => {
  const currentTab = Array.isArray(route.query.tab) ? route.query.tab[0] : route.query.tab
  const nextTab = getTabQueryValue(tab)

  if ((currentTab ?? undefined) === nextTab) return

  const nextQuery = { ...route.query }
  if (nextTab) nextQuery.tab = nextTab
  else delete nextQuery.tab

  void router.replace({ path: route.path, query: nextQuery })
}

const switchTab = (tab: TabKey, syncQuery = true) => {
  activeTab.value = tab
  if (syncQuery) syncTabQuery(tab)
  if (tab === 'home') {
    if (!homeVideos.value.length) void fetchHomeVideos()
    if (!likedVideos.value.length) void fetchLiked()
    if (!coinedVideos.value.length) void fetchCoined()
    if (!folders.value.length) void fetchFolders()
  } else if (tab === 'dynamic') {
    if (!dynamics.value.length) void fetchDynamics()
  } else if (tab === 'videos') {
    if (!videos.value.length) void fetchVideos()
  } else if (tab === 'favorites') {
    const pickFolderId = (): number | null => {
      const q = route.query.folderId
      const id = q ? Number(q) : null
      if (id != null && folders.value.some((f) => f.id === id)) return id
      if (folders.value.length > 0) return folders.value[0]!.id
      return null
    }
    if (!folders.value.length) {
      void getFolderList().then((r) => {
        folders.value = r.list
        void fetchFolderCovers()
        const toSelect = pickFolderId()
        if (toSelect != null) selectFolder(toSelect)
      })
    } else {
      const toSelect = pickFolderId()
      if (toSelect != null && selectedFolderId.value !== toSelect) selectFolder(toSelect)
    }
  } else if (tab === 'following') {
    if (!followingList.value.length) void fetchFollowing()
  } else if (tab === 'fans') {
    if (!fansList.value.length) void fetchFans()
  } else if (tab === 'settings') {
    if (!userConf.value) void fetchUserConf()
  }
}

const changeSort = (sort: 0 | 1 | 2) => {
  videoSort.value = sort
  void fetchVideos(1)
}

const loadMoreVideos = () => {
  if (videos.value.length < videoTotal.value) {
    void fetchVideos(videoPage.value + 1)
  }
}

const loadMoreFolderVideos = () => {
  if (folderVideos.value.length < folderVideoTotal.value) {
    void fetchFolderVideos(folderVideoPage.value + 1)
  }
}

const loadMoreDynamics = () => {
  if (dynamics.value.length < dynamicTotal.value) {
    void fetchDynamics(dynamicPage.value + 1)
  }
}

const goVideo = (id: number) => void router.push(`/video/${id}`)

const filteredDynamics = computed(() => dynamics.value)

const switchDynamicFilter = (filter: 'all' | 'video' | 'image') => {
  if (dynamicFilter.value === filter) return
  dynamicFilter.value = filter
  dynamics.value = []
  dynamicPage.value = 1
  expandedComments.value.clear()
  void fetchDynamics(1)
}

const applyTabFromQuery = () => {
  const tab = route.query.tab as string | undefined
  if (tab === 'favorites' && tabs.value.some((t) => t.key === 'favorites')) {
    switchTab('favorites', false)
  } else if (tab === 'dynamic') {
    switchTab('dynamic', false)
  } else if (tab === 'videos') {
    switchTab('videos', false)
  } else if (tab === 'following') {
    switchTab('following', false)
  } else if (tab === 'fans') {
    switchTab('fans', false)
  } else if (tab === 'settings' && isSelf.value) {
    switchTab('settings', false)
  } else if (activeTab.value !== 'home') {
    switchTab('home', false)
  }
}

onMounted(() => {
  void fetchUserProfile()
  void fetchHomeVideos()
  void fetchLiked()
  void fetchCoined()
  void fetchFolders()
  applyTabFromQuery()
})

watch(
  () => route.query.tab,
  () => {
    applyTabFromQuery()
  }
)

watch(userId, () => {
  activeTab.value = 'home'
  homeVideos.value = []
  homeVideoTotal.value = 0
  homeVideoSort.value = 0
  videos.value = []
  likedVideos.value = []
  coinedVideos.value = []
  folders.value = []
  folderCovers.value = {}
  selectedFolderId.value = null
  folderVideos.value = []
  dynamics.value = []
  dynamicTotal.value = 0
  dynamicPage.value = 1
  dynamicFilter.value = 'all'
  expandedComments.value.clear()
  userConf.value = null
  bannerPreviewUrl.value = ''
  bannerPickerOpen.value = false
  followingList.value = []
  followingTotal.value = 0
  followingPage.value = 1
  followingKeyword.value = ''
  fansList.value = []
  fansTotal.value = 0
  fansPage.value = 1
  fansKeyword.value = ''
  localFollowState.value.clear()
  void fetchUserProfile()
  void fetchHomeVideos()
  void fetchLiked()
  void fetchCoined()
  void fetchFolders()
  applyTabFromQuery()
})

const tabs = computed(() => {
  const list: { key: TabKey; label: string; icon: typeof Home }[] = [
    { key: 'home', label: '主页', icon: Home },
    { key: 'dynamic', label: '动态', icon: Zap },
    { key: 'videos', label: '投稿', icon: PlaySquare },
    { key: 'favorites', label: '收藏', icon: Star },
  ]
  if (isSelf.value) {
    list.push({ key: 'settings', label: '设置', icon: Settings })
  }
  return list
})

const sortOpts = [
  { value: 0 as const, label: '最新发布' },
  { value: 1 as const, label: '最多播放' },
  { value: 2 as const, label: '最多收藏' },
]

const folderSortOpts = [
  { value: 0 as const, label: '最近收藏' },
  { value: 1 as const, label: '最多播放' },
  { value: 2 as const, label: '最多点赞' },
]

const selectedFolder = computed(() => folders.value.find((f) => f.id === selectedFolderId.value))

const privacySettings = [
  { key: 'openCollect' as const, label: '公开我的收藏' },
  { key: 'openFollow' as const, label: '公开我的关注列表' },
  { key: 'openFans' as const, label: '公开我的粉丝列表' },
  { key: 'openLikeVideo' as const, label: '公开最近点赞的视频' },
  { key: 'openCoinVideo' as const, label: '公开最近投币的视频' },
]
</script>

<template>
  <div class="uspace">
    <!-- Skeleton -->
    <div v-if="loading" class="sk-wrap">
      <div class="sk-banner"></div>
      <div class="sk-body">
        <div class="sk-avatar"></div>
        <div class="sk-lines">
          <div></div>
          <div></div>
        </div>
      </div>
    </div>

    <template v-else-if="user">
      <!-- Header & Banner -->
      <div class="h-header relative h-[220px]">
        <div class="absolute inset-0 z-0 overflow-hidden">
          <img v-if="displayBannerUrl" :src="displayBannerUrl" class="h-full w-full object-cover" />
          <div v-else class="w-full h-full bg-gradient-to-r from-primary to-accent"></div>
        </div>
        <div
          class="absolute top-0 left-0 right-0 z-50 bg-gradient-to-b from-black/50 to-transparent pb-10 pointer-events-none"
        >
          <div class="pointer-events-auto">
            <Navbar class="text-white">
              <template #after-actions="{ actionTextClass }">
                <button
                  v-if="isSelf"
                  type="button"
                  class="ml-1 flex h-8 w-8 flex-shrink-0 items-center translate-x-[-80px] translate-y-[150px] justify-center rounded-full border border-white/12 bg-black/20 shadow-[0_18px_34px_-24px_rgba(0,0,0,0.72)] backdrop-blur-md sm:ml-2"
                  :class="[
                    actionTextClass,
                    bannerPickerOpen
                      ? 'border-white/40 bg-black/36 text-white'
                      : 'hover:border-white/35 hover:bg-black/30',
                  ]"
                  :aria-expanded="bannerPickerOpen"
                  :title="bannerPickerOpen ? '收起横幅面板' : '打开横幅面板'"
                  aria-label="切换横幅面板"
                  @click="toggleBannerPicker"
                >
                  <Shirt class="h-4 w-4" />
                </button>
              </template>
            </Navbar>
          </div>
        </div>
        <div
          class="absolute bottom-0 left-0 right-0 z-10 flex items-end pb-4 pt-24 bg-gradient-to-t from-black/60 to-transparent"
        >
          <div class="w-full px-4 md:px-8 xl:px-[140px] flex items-end">
            <AppAvatar
              :src="user.avatar"
              :name="user.username"
              container-class="h-[84px] w-[84px] border-[2px] border-white/80 shadow-md"
              text-class="text-2xl font-bold"
            />
            <div class="ml-5 text-white mb-1">
              <div class="flex items-center gap-2">
                <h1 class="text-[22px] font-bold drop-shadow-md">{{ user.username }}</h1>
                <span
                  class="px-1.5 py-0.5 rounded text-[12px] font-bold shadow-sm"
                  :style="{ background: levelColor(user.level) }"
                >
                  Lv{{ user.level }}
                </span>
              </div>
              <div class="text-[13px] text-white/80 mt-1 drop-shadow-sm">
                {{ user.description || '编辑个性签名' }}
              </div>
            </div>
            <div class="ml-auto mb-2 flex items-center gap-3">
              <button
                v-if="isSelf"
                class="px-6 py-1.5 rounded bg-card/20 hover:bg-card/30 text-white border border-white/50 text-[14px] transition-colors"
                @click="router.push('/settings')"
              >
                编辑资料
              </button>
              <template v-else>
                <button
                  class="px-8 py-1.5 rounded text-white text-[14px] font-medium transition-colors"
                  :class="
                    isFollowed
                      ? 'bg-card/20 hover:bg-card/30 border border-white/50'
                      : 'bg-primary hover:bg-primary/80 border border-transparent'
                  "
                  @click="handleFollow"
                >
                  {{ followBtnText }}
                </button>
                <button
                  class="inline-flex items-center gap-1 rounded border border-white/50 bg-card/15 px-5 py-1.5 text-[14px] text-white transition-colors hover:bg-card/25 disabled:cursor-not-allowed disabled:opacity-60"
                  :disabled="chatOpening"
                  @click="handleOpenChat"
                >
                  <MessageSquare :size="14" />
                  <span>{{ chatOpening ? '打开中...' : '私聊' }}</span>
                </button>
              </template>
            </div>
          </div>
        </div>
      </div>

      <div class="bg-card border-b border-border sticky top-0 z-40 shadow-sm">
        <div class="w-full px-4 md:px-8 xl:px-[140px] flex items-center h-[50px]">
          <div class="flex gap-6 h-full">
            <button
              v-for="t in tabs"
              :key="t.key"
              class="relative h-full flex items-center text-[14px] cursor-pointer transition-colors hover:text-primary"
              :class="activeTab === t.key ? 'text-primary font-medium' : 'text-foreground'"
              @click="switchTab(t.key)"
            >
              <component :is="t.icon" class="mr-1" :size="16" />
              {{ t.label }}
              <div
                v-if="activeTab === t.key"
                class="absolute bottom-0 left-1/2 -translate-x-1/2 w-5 h-[3px] bg-primary rounded-t-sm"
              ></div>
            </button>
          </div>

          <div class="ml-auto flex items-center gap-5 text-[13px] text-muted-foreground">
            <div
              class="flex flex-col items-center leading-tight cursor-pointer transition-colors"
              @click="switchTab('following')"
            >
              <span
                class="font-medium text-[14px] transition-colors"
                :class="activeTab === 'following' ? 'text-primary' : 'text-foreground'"
                >{{ fmtCount(user.followCount) }}</span
              >
              <span class="text-[11px]" :class="activeTab === 'following' ? 'text-primary' : ''"
                >关注数</span
              >
            </div>
            <div
              class="flex flex-col items-center leading-tight cursor-pointer transition-colors"
              @click="switchTab('fans')"
            >
              <span
                class="font-medium text-[14px] transition-colors"
                :class="activeTab === 'fans' ? 'text-primary' : 'text-foreground'"
                >{{ fmtCount(user.fansCount) }}</span
              >
              <span class="text-[11px]" :class="activeTab === 'fans' ? 'text-primary' : ''"
                >粉丝数</span
              >
            </div>
            <div class="flex flex-col items-center leading-tight">
              <span class="text-foreground font-medium text-[14px]">{{
                fmtCount(user.totalLikes)
              }}</span>
              <span class="text-[11px]">获赞数</span>
            </div>
            <div class="flex flex-col items-center leading-tight">
              <span class="text-foreground font-medium text-[14px]">{{
                fmtCount(user.totalViews)
              }}</span>
              <span class="text-[11px]">播放数</span>
            </div>
          </div>
        </div>
      </div>

      <!-- Main Content -->
      <div class="w-full px-4 md:px-8 xl:px-[140px] pt-5 pb-12">
        <!-- ==================== HOME TAB ==================== -->
        <div v-if="activeTab === 'home'" class="space-y-8">
          <div class="flex flex-col gap-5 xl:flex-row xl:items-start">
            <div class="min-w-0 flex-1">
              <!-- User Videos Section -->
              <div>
                <div class="mb-4 flex items-center justify-between">
                  <div class="flex items-center gap-3">
                    <h3 class="text-[16px] font-bold text-foreground">
                      视频 · {{ homeVideoTotal }}
                    </h3>
                    <div class="flex gap-1">
                      <button
                        v-for="o in sortOpts"
                        :key="o.value"
                        class="px-3 py-0.5 rounded-full text-[12px] transition-colors"
                        :class="
                          homeVideoSort === o.value
                            ? 'bg-primary text-white'
                            : 'bg-secondary text-muted-foreground hover:text-foreground'
                        "
                        @click="changeHomeVideoSort(o.value)"
                      >
                        {{ o.label }}
                      </button>
                    </div>
                  </div>
                  <div class="flex items-center gap-3">
                    <button
                      class="flex items-center gap-1 text-[12px] text-muted-foreground transition-colors hover:text-primary"
                    >
                      <Play :size="12" fill="currentColor" /> 播放全部
                    </button>
                    <button
                      class="flex items-center text-[12px] text-muted-foreground transition-colors hover:text-primary"
                      @click="switchTab('videos')"
                    >
                      查看更多 <ChevronRight :size="14" />
                    </button>
                  </div>
                </div>
                <div v-if="homeVideos.length > 0" class="grid grid-cols-4 gap-4">
                  <div
                    v-for="v in homeVideos"
                    :key="v.id"
                    class="u-video-card"
                    @click="goVideo(v.id)"
                  >
                    <div class="uvc-cover">
                      <img :src="v.cover" />
                      <div class="uvc-stats">
                        <span><Play :size="11" /> {{ fmtCount(v.views) }}</span>
                        <span><MessageSquare :size="11" /> {{ fmtCount(v.danmuCount) }}</span>
                      </div>
                      <div class="uvc-dur">{{ fmtDuration(v.duration) }}</div>
                    </div>
                    <h4 class="uvc-title">{{ v.title }}</h4>
                    <div class="uvc-time">{{ fmtTime(v.createdAt) }}</div>
                  </div>
                </div>
                <div
                  v-else-if="!homeVideosLoading"
                  class="py-10 text-center text-[13px] text-muted-foreground/80"
                >
                  暂无投稿视频
                </div>
              </div>
            </div>

            <!-- Right Sidebar -->
            <div class="w-full flex-shrink-0 space-y-4 xl:w-[260px]">
              <div v-if="isSelf" class="rounded-lg bg-secondary p-4">
                <div class="mb-3 flex items-center justify-between">
                  <span class="text-[14px] font-medium text-foreground">创作中心</span>
                  <button class="text-[12px] text-primary" @click="router.push('/creator')">
                    进入 >
                  </button>
                </div>
                <div class="flex gap-2">
                  <button
                    class="flex flex-1 items-center justify-center gap-1 rounded bg-secondary py-1.5 text-[12px] text-muted-foreground transition-colors hover:text-primary"
                    @click="router.push('/creator/upload')"
                  >
                    <Upload :size="13" /> 视频投稿
                  </button>
                  <button
                    class="flex flex-1 items-center justify-center gap-1 rounded bg-secondary py-1.5 text-[12px] text-muted-foreground transition-colors hover:text-primary"
                    @click="router.push('/creator/content')"
                  >
                    <FileVideo :size="13" /> 投稿管理
                  </button>
                </div>
              </div>

              <div class="rounded-lg bg-secondary p-4">
                <div
                  class="mb-2 border-b border-border pb-2 text-[14px] font-medium text-foreground"
                >
                  个人资料
                </div>
                <div class="flex flex-col gap-2.5 text-[13px]">
                  <template v-for="item in profileMetaItems" :key="item.key">
                    <div
                      v-if="'value' in item"
                      class="flex items-center gap-2 text-muted-foreground"
                    >
                      <component
                        :is="item.icon"
                        v-if="typeof item.icon !== 'string'"
                        class="h-[18px] w-[18px] flex-shrink-0 text-muted-foreground/75"
                      />
                      <i
                        v-else
                        :class="item.icon"
                        class="text-[18px] w-[18px] h-[18px] not-italic inline-flex items-center justify-center flex-shrink-0 text-muted-foreground/75"
                      ></i>
                      <div class="min-w-0 flex-1 flex items-center min-h-[22px]">
                        <span class="leading-none pt-[1.5px]">{{ item.value }}</span>
                      </div>
                    </div>
                    <div v-else class="grid grid-cols-2 gap-x-2 gap-y-2.5 mt-2">
                      <div
                        v-for="tag in item.tags"
                        :key="`${item.key}-${tag}`"
                        class="flex items-center gap-1.5 text-foreground/90 overflow-hidden"
                      >
                        <i
                          class="vui_icon sic-fsp-tag_line text-[14px] not-italic inline-flex items-center justify-center text-muted-foreground/80 shrink-0"
                        ></i>
                        <span class="text-[13px] leading-none pt-[1px] truncate">{{ tag }}</span>
                      </div>
                    </div>
                  </template>
                </div>
              </div>

              <div class="rounded-lg bg-secondary p-4">
                <div
                  class="mb-2 border-b border-border pb-2 text-[14px] font-medium text-foreground"
                >
                  公告
                </div>
                <div class="text-[12px] text-muted-foreground/80">这个人很懒，什么都没写</div>
              </div>
            </div>
          </div>

          <div class="space-y-8 xl:pr-[280px]">
            <!-- Liked Videos -->
            <div v-if="likedVideos.length > 0">
              <h3 class="mb-4 text-[16px] font-bold text-foreground">最近点赞的视频</h3>
              <div class="grid grid-cols-4 gap-4">
                <div
                  v-for="v in likedVideos.slice(0, 8)"
                  :key="v.id"
                  class="u-video-card"
                  @click="goVideo(v.id)"
                >
                  <div class="uvc-cover">
                    <img :src="v.cover" />
                    <div class="uvc-stats">
                      <span><Play :size="11" /> {{ fmtCount(v.views) }}</span>
                      <span><MessageSquare :size="11" /> {{ fmtCount(v.danmuCount) }}</span>
                    </div>
                    <div class="uvc-dur">{{ fmtDuration(v.duration) }}</div>
                  </div>
                  <h4 class="uvc-title">{{ v.title }}</h4>
                  <div class="uvc-time">{{ fmtTime(v.createdAt) }}</div>
                </div>
              </div>
            </div>

            <!-- Coined Videos -->
            <div v-if="coinedVideos.length > 0">
              <h3 class="mb-4 text-[16px] font-bold text-foreground">最近投币的视频</h3>
              <div class="grid grid-cols-4 gap-4">
                <div
                  v-for="v in coinedVideos.slice(0, 8)"
                  :key="v.id"
                  class="u-video-card"
                  @click="goVideo(v.id)"
                >
                  <div class="uvc-cover">
                    <img :src="v.cover" />
                    <div class="uvc-stats">
                      <span><Play :size="11" /> {{ fmtCount(v.views) }}</span>
                      <span><MessageSquare :size="11" /> {{ fmtCount(v.danmuCount) }}</span>
                    </div>
                    <div class="uvc-dur">{{ fmtDuration(v.duration) }}</div>
                  </div>
                  <h4 class="uvc-title">{{ v.title }}</h4>
                  <div class="uvc-time">{{ fmtTime(v.createdAt) }}</div>
                </div>
              </div>
            </div>

            <!-- Folders on Home -->
            <div v-if="folders.length > 0">
              <div class="mb-4 flex items-center justify-between">
                <div class="flex items-center gap-2">
                  <h3 class="text-[16px] font-bold text-foreground">收藏夹</h3>
                  <span class="text-[12px] text-muted-foreground/80">· {{ folders.length }}</span>
                </div>
                <button
                  class="flex items-center text-[12px] text-muted-foreground transition-colors hover:text-primary"
                  @click="router.push('/favorites')"
                >
                  查看更多 <ChevronRight :size="14" />
                </button>
              </div>
              <div class="grid grid-cols-4 gap-4">
                <div
                  v-for="f in folders.slice(0, 4)"
                  :key="f.id"
                  class="u-folder-card"
                  @click="router.push({ path: '/favorites', query: { folderId: String(f.id) } })"
                >
                  <div class="ufc-cover">
                    <img
                      v-if="folderCovers[f.id]"
                      :src="folderCovers[f.id]"
                      class="ufc-cover-img"
                    />
                    <div v-else class="ufc-cover-placeholder"></div>
                    <div class="ufc-overlay">
                      <span class="ufc-vcount">{{ f.videoCount }}个视频</span>
                    </div>
                  </div>
                  <h4 class="ufc-title">{{ f.name }}</h4>
                  <div class="ufc-meta">公开</div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- ==================== DYNAMIC TAB ==================== -->
        <div v-else-if="activeTab === 'dynamic'" class="flex gap-5 items-start">
          <!-- Left Sidebar -->
          <div class="w-[180px] flex-shrink-0 bg-secondary rounded-lg py-3">
            <button
              class="w-full text-left px-5 py-2 text-[13px] transition-colors"
              :class="
                dynamicFilter === 'all'
                  ? 'bg-primary text-white'
                  : 'text-muted-foreground hover:bg-secondary'
              "
              @click="switchDynamicFilter('all')"
            >
              全部
            </button>
            <button
              class="w-full text-left px-5 py-2 text-[13px] transition-colors"
              :class="
                dynamicFilter === 'video'
                  ? 'bg-primary text-white'
                  : 'text-muted-foreground hover:bg-secondary'
              "
              @click="switchDynamicFilter('video')"
            >
              视频
            </button>
            <button
              class="w-full text-left px-5 py-2 text-[13px] transition-colors"
              :class="
                dynamicFilter === 'image'
                  ? 'bg-primary text-white'
                  : 'text-muted-foreground hover:bg-secondary'
              "
              @click="switchDynamicFilter('image')"
            >
              图文
            </button>
          </div>

          <!-- Center Content -->
          <div class="flex-1 min-w-0 space-y-4">
            <!-- Post Editor (self only) -->
            <div v-if="isSelf" class="border border-border rounded-lg p-5">
              <div class="flex gap-3">
                <AppAvatar
                  :src="user.avatar"
                  :name="user.username"
                  container-class="h-10 w-10 flex-shrink-0"
                  text-class="text-sm font-semibold"
                />
                <div class="flex-1">
                  <textarea
                    v-model="newDynamicContent"
                    class="w-full border border-border rounded-lg p-3 text-[13px] resize-none focus:outline-none focus:border-primary transition-colors"
                    rows="3"
                    placeholder="有什么想和大家分享的？"
                  ></textarea>
                  <div v-if="newDynamicImageUrl" class="mt-2 relative inline-block">
                    <img :src="newDynamicImageUrl" class="h-20 rounded" />
                    <button
                      class="absolute -top-1 -right-1 w-4 h-4 bg-black/60 text-white rounded-full text-[10px] flex items-center justify-center"
                      @click="newDynamicImageUrl = ''"
                    >
                      ×
                    </button>
                  </div>
                  <div class="flex items-center justify-between mt-2">
                    <label
                      class="cursor-pointer text-muted-foreground/80 hover:text-primary transition-colors"
                    >
                      <ImagePlus :size="18" />
                      <input
                        type="file"
                        accept="image/*"
                        class="hidden"
                        @change="handleDynamicImageUpload"
                      />
                    </label>
                    <button
                      class="px-5 py-1.5 rounded bg-primary hover:bg-primary/80 text-primary-foreground text-[13px] transition-colors disabled:opacity-50"
                      :disabled="dynamicPublishing || !newDynamicContent.trim()"
                      @click="publishDynamic"
                    >
                      {{ dynamicPublishing ? '发布中...' : '发布' }}
                    </button>
                  </div>
                </div>
              </div>
            </div>

            <!-- Dynamic Feed -->
            <div
              v-for="item in filteredDynamics"
              :key="`${item.workType}-${getWorkId(item)}`"
              class="border border-border rounded-lg p-5"
            >
              <div class="flex gap-3">
                <div
                  class="flex-shrink-0 cursor-pointer"
                  @click="router.push(`/user/${item.author.id}`)"
                >
                  <AppAvatar
                    :src="item.author.avatar"
                    :name="item.author.username"
                    container-class="h-10 w-10"
                    text-class="text-sm font-semibold"
                  />
                </div>
                <div class="flex-1 min-w-0">
                  <div class="flex items-center justify-between">
                    <div>
                      <span
                        class="text-[14px] font-medium text-primary cursor-pointer hover:text-primary/80"
                        @click="router.push(`/user/${item.author.id}`)"
                        >{{ item.author.username }}</span
                      >
                      <span class="text-[12px] text-muted-foreground/80 ml-2">{{
                        fmtFullTime(item.createdAt)
                      }}</span>
                      <span
                        v-if="item.workType === 1"
                        class="text-[11px] text-muted-foreground/80 ml-2"
                        >· 投稿了视频</span
                      >
                    </div>
                    <DropdownMenu v-if="isSelf">
                      <DropdownMenuTrigger as-child>
                        <button
                          class="p-1 text-muted-foreground/80 hover:text-muted-foreground transition-colors"
                        >
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

                  <!-- Pinned badge -->
                  <div
                    v-if="item.dynamic?.isPinned || item.video?.isPinned"
                    class="mt-1 inline-flex items-center gap-1 rounded-full border border-[var(--status-warning-border)] bg-[var(--status-warning-soft)] px-2 py-0.5 text-[11px] font-medium text-[var(--status-warning-ink)]"
                  >
                    <Pin :size="10" /> 已置顶
                  </div>

                  <!-- Dynamic content -->
                  <div v-if="item.workType === 2 && item.dynamic" class="mt-2">
                    <p class="text-[13px] text-foreground leading-relaxed whitespace-pre-wrap">
                      {{ item.dynamic.content }}
                    </p>
                    <img
                      v-if="item.dynamic.imageUrl"
                      :src="item.dynamic.imageUrl"
                      class="mt-3 max-w-[360px] rounded-lg cursor-pointer"
                    />
                  </div>

                  <!-- Video card in dynamic -->
                  <div
                    v-if="item.workType === 1 && item.video"
                    class="mt-3 flex gap-3 p-3 bg-secondary rounded-lg cursor-pointer hover:bg-muted transition-colors"
                    @click="goVideo(item.video!.id)"
                  >
                    <div
                      class="relative w-[160px] aspect-video rounded overflow-hidden flex-shrink-0 bg-accent"
                    >
                      <img :src="item.video.cover" class="w-full h-full object-cover" />
                      <div
                        class="absolute bottom-1 right-1 bg-black/70 text-white text-[10px] px-1 rounded"
                      >
                        {{ fmtDuration(item.video.duration) }}
                      </div>
                    </div>
                    <div class="flex-1 min-w-0 py-0.5">
                      <h4 class="text-[13px] font-medium text-foreground line-clamp-2">
                        {{ item.video.title }}
                      </h4>
                    </div>
                  </div>

                  <div
                    class="mt-4 flex flex-wrap items-center gap-2 border-t border-border/60 pt-3"
                  >
                    <button
                      class="inline-flex min-w-[78px] items-center gap-1.5 rounded-full px-3 py-1.5 text-[13px] transition-colors"
                      :class="
                        isCommentExpanded(item)
                          ? 'bg-primary/8 text-primary'
                          : 'text-muted-foreground/80 hover:bg-secondary hover:text-foreground'
                      "
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
                      class="inline-flex min-w-[78px] items-center gap-1.5 rounded-full px-3 py-1.5 text-[13px] transition-colors hover:bg-secondary"
                      :class="
                        item.workType === 1
                          ? item.video?.isLiked
                            ? 'text-primary'
                            : 'text-muted-foreground/80 hover:text-foreground'
                          : item.dynamic?.isLiked
                            ? 'text-primary'
                            : 'text-muted-foreground/80 hover:text-foreground'
                      "
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

                  <div v-if="isCommentExpanded(item)" class="mt-4 border-t border-border/50 pt-4">
                    <CommentSection
                      :video-id="getVideoId(item)"
                      :dynamic-id="getDynamicId(item)"
                      :author-id="item.author.id"
                    />
                  </div>
                </div>
              </div>
            </div>

            <div
              v-if="filteredDynamics.length === 0 && !dynamicsLoading"
              class="py-16 text-center text-muted-foreground/80 text-[13px]"
            >
              还没有发布过动态
            </div>

            <div v-if="dynamics.length < dynamicTotal" class="text-center pt-2">
              <button
                class="px-6 py-1.5 rounded border border-border text-muted-foreground text-[12px] hover:text-primary hover:border-primary transition-colors"
                :disabled="dynamicsLoading"
                @click="loadMoreDynamics"
              >
                {{ dynamicsLoading ? '加载中...' : '加载更多' }}
              </button>
            </div>
          </div>

          <!-- Right Sidebar (same as home) -->
          <div class="w-[260px] flex-shrink-0 space-y-4">
            <div class="bg-secondary rounded-lg p-4">
              <div class="text-[14px] font-medium text-foreground mb-2 pb-2 border-b border-border">
                个人资料
              </div>
              <div class="flex flex-col gap-2 text-[12px]">
                <template v-for="item in profileMetaItems" :key="item.key">
                  <div v-if="'value' in item" class="flex items-center gap-2 text-muted-foreground">
                    <component
                      :is="item.icon"
                      v-if="typeof item.icon !== 'string'"
                      class="h-[18px] w-[18px] flex-shrink-0 text-muted-foreground/75"
                    />
                    <i
                      v-else
                      :class="item.icon"
                      class="text-[18px] w-[18px] h-[18px] not-italic inline-flex items-center justify-center flex-shrink-0 text-muted-foreground/75"
                    ></i>
                    <div class="min-w-0 flex-1 flex items-center min-h-[22px]">
                      <span class="leading-none pt-[1.5px] text-[13px]">{{ item.value }}</span>
                    </div>
                  </div>
                  <div v-else class="grid grid-cols-2 gap-x-2 gap-y-2.5 mt-2">
                    <div
                      v-for="tag in item.tags"
                      :key="`${item.key}-${tag}`"
                      class="flex items-center gap-1.5 text-foreground/90 overflow-hidden"
                    >
                      <i
                        class="vui_icon sic-fsp-tag_line text-[14px] not-italic inline-flex items-center justify-center text-muted-foreground/80 shrink-0"
                      ></i>
                      <span class="text-[13px] leading-none pt-[1px] truncate">{{ tag }}</span>
                    </div>
                  </div>
                </template>
              </div>
            </div>

            <div class="bg-secondary rounded-lg p-4">
              <div class="text-[14px] font-medium text-foreground mb-2 pb-2 border-b border-border">
                公告
              </div>
              <div class="text-[12px] text-muted-foreground/80">这个人很懒，什么都没写</div>
            </div>
          </div>
        </div>

        <!-- ==================== VIDEOS TAB ==================== -->
        <div
          v-else-if="activeTab === 'videos'"
          class="flex gap-4 items-start bg-card rounded-lg min-h-[500px]"
        >
          <div class="w-[160px] flex-shrink-0 border-r border-border py-3">
            <div class="px-4 text-[14px] font-medium text-foreground mb-1">TA的视频</div>
            <div
              class="flex items-center justify-between px-4 py-2 bg-primary text-white cursor-pointer"
            >
              <span class="text-[13px]">视频</span>
              <span class="text-[11px] bg-card/20 px-1.5 rounded">{{ videoTotal }}</span>
            </div>
          </div>
          <div class="flex-1 p-5">
            <div class="flex items-center justify-between mb-5">
              <h3 class="text-[16px] font-medium text-foreground">TA的视频</h3>
              <div class="flex bg-secondary rounded-full p-0.5">
                <button
                  v-for="o in sortOpts"
                  :key="o.value"
                  class="px-3 py-1 rounded-full text-[12px] transition-colors"
                  :class="
                    videoSort === o.value
                      ? 'bg-card text-primary shadow-sm'
                      : 'text-muted-foreground hover:text-foreground'
                  "
                  @click="changeSort(o.value)"
                >
                  {{ o.label }}
                </button>
              </div>
            </div>

            <div v-if="videos.length > 0" class="grid grid-cols-6 gap-5">
              <div
                v-for="v in videos"
                :key="v.id"
                class="u-video-card cursor-pointer hover-lift"
                @click="goVideo(v.id)"
              >
                <div class="uvc-cover">
                  <img :src="v.cover" />
                  <div class="uvc-stats">
                    <span><Play :size="11" /> {{ fmtCount(v.views) }}</span>
                    <span><MessageSquare :size="11" /> {{ fmtCount(v.danmuCount) }}</span>
                  </div>
                  <div class="uvc-dur">{{ fmtDuration(v.duration) }}</div>
                </div>
                <h4 class="uvc-title">{{ v.title }}</h4>
                <div class="uvc-time">{{ fmtTime(v.createdAt) }}</div>
              </div>
            </div>
            <div
              v-else-if="!videosLoading"
              class="py-16 text-center text-muted-foreground/80 text-[13px]"
            >
              暂无视频
            </div>

            <div v-if="videos.length < videoTotal" class="text-center mt-6">
              <button
                class="px-6 py-1.5 rounded border border-border text-muted-foreground text-[12px] hover:text-primary hover:border-primary transition-colors"
                :disabled="videosLoading"
                @click="loadMoreVideos"
              >
                {{ videosLoading ? '加载中...' : '加载更多' }}
              </button>
            </div>
          </div>
        </div>

        <!-- ==================== FAVORITES TAB ==================== -->
        <div
          v-else-if="activeTab === 'favorites'"
          class="flex gap-4 items-start bg-card rounded-lg min-h-[500px]"
        >
          <div class="w-[180px] flex-shrink-0 border-r border-border py-3">
            <div class="px-4 text-[14px] font-medium text-foreground mb-1">我创建的收藏夹</div>
            <div
              v-for="f in folders"
              :key="f.id"
              class="flex items-center justify-between px-4 py-2.5 cursor-pointer transition-colors"
              :class="
                selectedFolderId === f.id
                  ? 'bg-primary text-white'
                  : 'text-muted-foreground hover:bg-secondary'
              "
              @click="selectFolder(f.id)"
            >
              <span class="text-[13px] truncate flex-1">{{ f.name }}</span>
              <span
                class="text-[11px] ml-2"
                :class="
                  selectedFolderId === f.id
                    ? 'bg-card/20 px-1.5 rounded'
                    : 'text-muted-foreground/80'
                "
                >{{ f.videoCount }}</span
              >
            </div>
          </div>
          <div v-if="selectedFolder" class="flex-1 p-5">
            <div class="flex items-center justify-between mb-5 pb-5 border-b border-border">
              <div>
                <h3 class="text-[16px] font-medium text-foreground mb-1">
                  {{ selectedFolder.name }}
                </h3>
                <div class="text-[11px] text-muted-foreground/80">
                  创建者：{{ user.username }} · {{ selectedFolder.videoCount }}个内容
                </div>
              </div>
              <div class="flex items-center gap-3">
                <div class="flex bg-secondary rounded-full p-0.5">
                  <button
                    v-for="o in folderSortOpts"
                    :key="o.value"
                    class="px-3 py-1 rounded-full text-[12px] transition-colors"
                    :class="
                      folderVideoSort === o.value
                        ? 'bg-card text-primary shadow-sm'
                        : 'text-muted-foreground hover:text-foreground'
                    "
                    @click="changeFolderSort(o.value)"
                  >
                    {{ o.label }}
                  </button>
                </div>
                <button
                  class="flex items-center gap-1 px-4 py-1.5 rounded bg-primary hover:bg-primary/80 text-primary-foreground text-[12px] transition-colors"
                >
                  <Play :size="12" fill="currentColor" /> 播放全部
                </button>
              </div>
            </div>

            <div v-if="folderVideos.length > 0" class="grid grid-cols-6 gap-5">
              <div
                v-for="v in folderVideos"
                :key="v.id"
                class="u-video-card"
                @click="goVideo(v.id)"
              >
                <div class="uvc-cover">
                  <img :src="v.cover" />
                  <div class="uvc-stats">
                    <span><Play :size="11" /> {{ fmtCount(v.views) }}</span>
                    <span><MessageSquare :size="11" /> {{ fmtCount(v.danmuCount) }}</span>
                  </div>
                  <div class="uvc-dur">{{ fmtDuration(v.duration) }}</div>
                </div>
                <h4 class="uvc-title">{{ v.title }}</h4>
                <div class="uvc-time">
                  <span class="mr-2">{{ v.author?.username || 'UP主' }}</span>
                  <span v-if="v.favoritedAt">{{ fmtDate(v.favoritedAt) }} 收藏</span>
                </div>
              </div>
            </div>
            <div
              v-else-if="!folderVideosLoading"
              class="py-16 text-center text-muted-foreground/80 text-[13px]"
            >
              收藏夹为空
            </div>

            <div v-if="folderVideos.length < folderVideoTotal" class="text-center mt-6">
              <button
                class="px-6 py-1.5 rounded border border-border text-muted-foreground text-[12px] hover:text-primary hover:border-primary transition-colors"
                :disabled="folderVideosLoading"
                @click="loadMoreFolderVideos"
              >
                {{ folderVideosLoading ? '加载中...' : '加载更多' }}
              </button>
            </div>
          </div>
        </div>

        <!-- ==================== SETTINGS TAB ==================== -->
        <div v-else-if="activeTab === 'settings' && isSelf" class="bg-card rounded-lg p-6">
          <h2 class="text-[18px] font-bold text-foreground mb-6">主页设置</h2>

          <div v-if="confLoading" class="py-16 text-center text-muted-foreground/80 text-[13px]">
            加载中...
          </div>

          <div v-else-if="userConf" class="space-y-8">
            <div>
              <h3 class="mb-4 text-[15px] font-semibold text-foreground">隐私设置</h3>
              <div class="grid grid-cols-3 gap-x-8 gap-y-5">
                <div
                  v-for="s in privacySettings"
                  :key="s.key"
                  class="flex items-center justify-between"
                >
                  <span class="text-[13px] text-foreground">{{ s.label }}</span>
                  <button
                    class="relative h-[22px] w-[40px] cursor-pointer rounded-full transition-colors"
                    :class="
                      (userConf as Record<string, unknown>)[s.key]
                        ? 'bg-primary'
                        : 'bg-black/10 dark:bg-white/15'
                    "
                    :disabled="confSaving"
                    @click="toggleConf(s.key)"
                  >
                    <span
                      class="absolute left-0 top-[2px] h-[18px] w-[18px] rounded-full bg-white shadow transition-transform"
                      :class="
                        (userConf as Record<string, unknown>)[s.key]
                          ? 'translate-x-[20px]'
                          : 'translate-x-[2px]'
                      "
                    ></span>
                  </button>
                </div>
              </div>
            </div>

            <div class="mt-8">
              <h3 class="text-[20px] font-bold text-foreground mb-6 tracking-tight">
                个人标签设置
              </h3>

              <div class="flex flex-wrap items-center gap-3">
                <template v-if="userConf.likeTags.length">
                  <span
                    v-for="tag in userConf.likeTags"
                    :key="tag"
                    class="inline-flex items-center gap-1.5 px-3 h-[34px] rounded shrink-0 border border-border/70 text-[13px] text-foreground bg-transparent shadow-sm"
                  >
                    <i
                      class="vui_icon sic-fsp-tag_line mt-[1px] text-[14px] text-muted-foreground not-italic"
                    ></i>
                    {{ tag }}
                    <button
                      type="button"
                      class="ml-1 w-[14px] h-[14px] bg-muted-foreground/60 hover:bg-muted-foreground/80 rounded-full flex items-center justify-center transition-colors"
                      aria-label="删除标签"
                      @click="removeLikeTagDraft(tag)"
                    >
                      <span class="text-card text-[11px] leading-none pb-[1px]">×</span>
                    </button>
                  </span>
                </template>

                <div class="flex items-center h-[34px] shadow-sm rounded">
                  <div class="relative w-[200px] h-full">
                    <input
                      v-model="likeTagInput"
                      type="text"
                      maxlength="24"
                      class="w-full h-full bg-card border border-border/70 border-r-0 px-3 pr-8 text-[13px] rounded-l outline-none focus:border-primary transition-colors text-foreground"
                      @keydown.enter.prevent="addLikeTagDraft"
                    />
                    <!-- Clear button visible only when user typing -->
                    <button
                      v-if="likeTagInput"
                      class="absolute right-2 top-1/2 -translate-y-1/2 w-[14px] h-[14px] bg-muted-foreground/60 hover:bg-muted-foreground/80 rounded-full flex items-center justify-center transition-colors"
                      @click="likeTagInput = ''"
                    >
                      <span class="text-card text-[11px] leading-none pb-[1px]">×</span>
                    </button>
                  </div>
                  <button
                    class="h-full border border-border/70 px-5 rounded-r text-[13px] text-primary hover:bg-primary/5 transition-colors focus:border-primary bg-card whitespace-nowrap font-medium"
                    @click="addLikeTagDraft"
                  >
                    新增
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- ==================== FOLLOWING / FANS TAB ==================== -->
        <div
          v-else-if="activeTab === 'following' || activeTab === 'fans'"
          class="flex gap-4 items-start bg-card rounded-lg min-h-[500px]"
        >
          <!-- Left Sidebar -->
          <div class="w-[180px] flex-shrink-0 border-r border-border py-3">
            <div class="px-4 text-[14px] font-medium text-foreground mb-1">
              {{ isSelf ? '我的关注' : 'TA的关注' }}
            </div>
            <div
              class="flex items-center justify-between px-4 py-2.5 cursor-pointer transition-colors"
              :class="
                activeTab === 'following'
                  ? 'bg-primary text-white'
                  : 'text-muted-foreground hover:bg-secondary'
              "
              @click="switchTab('following')"
            >
              <span class="text-[13px]">全部关注</span>
              <span
                class="text-[11px] ml-2"
                :class="
                  activeTab === 'following'
                    ? 'bg-card/20 px-1.5 rounded'
                    : 'text-muted-foreground/80'
                "
                >{{ followingTotal || user.followCount }}</span
              >
            </div>

            <div class="px-4 text-[14px] font-medium text-foreground mb-1 mt-4">
              {{ isSelf ? '我的粉丝' : 'TA的粉丝' }}
            </div>
            <div
              class="flex items-center justify-between px-4 py-2.5 cursor-pointer transition-colors"
              :class="
                activeTab === 'fans'
                  ? 'bg-primary text-white'
                  : 'text-muted-foreground hover:bg-secondary'
              "
              @click="switchTab('fans')"
            >
              <span class="text-[13px]">{{ isSelf ? '我的粉丝' : 'TA的粉丝' }}</span>
              <span
                class="text-[11px] ml-2"
                :class="
                  activeTab === 'fans' ? 'bg-card/20 px-1.5 rounded' : 'text-muted-foreground/80'
                "
                >{{ fansTotal || user.fansCount }}</span
              >
            </div>
          </div>

          <!-- Main Content -->
          <div class="flex-1 p-5">
            <div class="flex items-center justify-between mb-5">
              <h3 class="text-[16px] font-medium text-foreground">
                {{ activeTab === 'following' ? '全部关注' : isSelf ? '我的粉丝' : 'TA的粉丝' }}
              </h3>
              <div v-if="activeTab === 'following'" class="relative">
                <input
                  v-model="followingKeyword"
                  class="w-[200px] h-[32px] pl-3 pr-8 rounded border border-border text-[13px] focus:outline-none focus:border-primary transition-colors"
                  placeholder="搜索关注"
                  @keyup.enter="searchFollowing"
                />
                <Search
                  class="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground/80 cursor-pointer hover:text-primary transition-colors"
                  :size="16"
                  @click="searchFollowing"
                />
              </div>
              <div v-else class="relative">
                <input
                  v-model="fansKeyword"
                  class="w-[200px] h-[32px] pl-3 pr-8 rounded border border-border text-[13px] focus:outline-none focus:border-primary transition-colors"
                  placeholder="搜索粉丝"
                  @keyup.enter="searchFans"
                />
                <Search
                  class="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground/80 cursor-pointer hover:text-primary transition-colors"
                  :size="16"
                  @click="searchFans"
                />
              </div>
            </div>

            <!-- Following List -->
            <template v-if="activeTab === 'following'">
              <div v-if="followingList.length > 0" class="grid grid-cols-3 gap-x-4 gap-y-1">
                <div v-for="u in followingList" :key="u.id" class="sc-card">
                  <div @click="router.push(`/user/${u.id}`)">
                    <AppAvatar
                      :src="u.avatar"
                      :name="u.username"
                      :alt="u.username"
                      container-class="sc-avatar"
                      text-class="text-base font-semibold"
                    />
                  </div>
                  <div class="sc-info">
                    <div class="sc-name" @click="router.push(`/user/${u.id}`)">
                      {{ u.username }}
                    </div>
                    <div class="sc-desc">{{ u.description || '暂无简介' }}</div>
                  </div>
                  <button
                    v-if="isSelf && u.id !== authStore.userId"
                    class="sc-btn"
                    :class="isUserFollowedByMe(u.id) ? 'sc-btn-followed' : 'sc-btn-follow'"
                    @click.stop="handleFollowInList(u.id)"
                  >
                    <UserCheck v-if="isUserFollowedByMe(u.id)" :size="12" class="mr-1" />
                    {{ isUserFollowedByMe(u.id) ? '已关注' : '关注' }}
                  </button>
                </div>
              </div>
              <div
                v-if="followingList.length === 0 && !followingLoading"
                class="py-16 text-center text-muted-foreground/80 text-[13px]"
              >
                {{ followingKeyword ? '未找到匹配的关注用户' : '暂无关注' }}
              </div>
              <div
                v-if="followingLoading && followingList.length === 0"
                class="py-16 text-center text-muted-foreground/80 text-[13px]"
              >
                加载中...
              </div>
              <div
                v-if="followingList.length > 0 && followingList.length < followingTotal"
                class="text-center mt-6"
              >
                <button
                  class="px-6 py-1.5 rounded border border-border text-muted-foreground text-[12px] hover:text-primary hover:border-primary transition-colors"
                  :disabled="followingLoading"
                  @click="loadMoreFollowing"
                >
                  {{ followingLoading ? '加载中...' : '加载更多' }}
                </button>
              </div>
            </template>

            <!-- Fans List -->
            <template v-else>
              <div v-if="fansList.length > 0" class="grid grid-cols-3 gap-x-4 gap-y-1">
                <div v-for="u in fansList" :key="u.id" class="sc-card">
                  <div @click="router.push(`/user/${u.id}`)">
                    <AppAvatar
                      :src="u.avatar"
                      :name="u.username"
                      :alt="u.username"
                      container-class="sc-avatar"
                      text-class="text-base font-semibold"
                    />
                  </div>
                  <div class="sc-info">
                    <div class="sc-name" @click="router.push(`/user/${u.id}`)">
                      {{ u.username }}
                    </div>
                    <div class="sc-desc">{{ u.description || '暂无简介' }}</div>
                  </div>
                  <button
                    v-if="authStore.isLoggedIn && u.id !== authStore.userId"
                    class="sc-btn"
                    :class="isUserFollowedByMe(u.id) ? 'sc-btn-followed' : 'sc-btn-follow'"
                    @click.stop="handleFollowInList(u.id)"
                  >
                    <UserCheck v-if="isUserFollowedByMe(u.id)" :size="12" class="mr-1" />
                    {{ isUserFollowedByMe(u.id) ? '已关注' : '关注' }}
                  </button>
                </div>
              </div>
              <div
                v-if="fansList.length === 0 && !fansLoading"
                class="py-16 text-center text-muted-foreground/80 text-[13px]"
              >
                {{ fansKeyword ? '未找到匹配的粉丝' : '暂无粉丝' }}
              </div>
              <div
                v-if="fansLoading && fansList.length === 0"
                class="py-16 text-center text-muted-foreground/80 text-[13px]"
              >
                加载中...
              </div>
              <div
                v-if="fansList.length > 0 && fansList.length < fansTotal"
                class="text-center mt-6"
              >
                <button
                  class="px-6 py-1.5 rounded border border-border text-muted-foreground text-[12px] hover:text-primary hover:border-primary transition-colors"
                  :disabled="fansLoading"
                  @click="loadMoreFans"
                >
                  {{ fansLoading ? '加载中...' : '加载更多' }}
                </button>
              </div>
            </template>
          </div>
        </div>

        <Teleport to="body">
          <transition name="banner-sheet">
            <div
              v-if="isSelf && bannerPickerOpen"
              class="fixed inset-x-0 bottom-0 z-[70] pointer-events-none"
            >
              <div
                class="banner-sheet-panel pointer-events-auto w-screen border-t border-border/70 bg-card/[0.98] shadow-[0_-28px_80px_-40px_rgba(0,0,0,0.48)] backdrop-blur-xl"
              >
                <UserBannerPicker
                  :open="bannerPickerOpen"
                  class="!rounded-none !border-x-0 !border-b-0 !shadow-none"
                  @close="closeBannerPicker"
                  @preview="handleBannerPreview"
                  @saved="handleBannerSaved"
                />
              </div>
            </div>
          </transition>
        </Teleport>
      </div>
    </template>
  </div>
</template>

<style scoped>
.uspace {
  min-height: 100vh;
  background: var(--color-background);
}

/* Video Card */
.u-video-card {
  cursor: pointer;
}

.uvc-cover {
  position: relative;
  aspect-ratio: 16/10;
  border-radius: 6px;
  overflow: hidden;
  background-color: var(--color-secondary);
}

.uvc-cover img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  transition: transform 0.3s;
}

.u-video-card:hover .uvc-cover img {
  transform: scale(1.05);
}

.uvc-stats {
  position: absolute;
  bottom: 4px;
  left: 6px;
  display: flex;
  gap: 8px;
  color: #fff;
  font-size: 11px;
  text-shadow: 0 1px 2px rgb(0 0 0 / 0.5);
}

.uvc-stats span {
  display: flex;
  align-items: center;
  gap: 2px;
}

.uvc-dur {
  position: absolute;
  bottom: 4px;
  right: 6px;
  color: #fff;
  font-size: 11px;
  background: rgb(0 0 0 / 0.5);
  padding: 0 4px;
  border-radius: 2px;
}

.uvc-title {
  margin-top: 6px;
  font-size: 13px;
  color: var(--color-foreground);
  display: -webkit-box;
  -webkit-line-clamp: 2;
  line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  line-height: 1.4;
  transition: color 0.2s;
}

.u-video-card:hover .uvc-title {
  color: var(--color-primary);
}

.uvc-time {
  margin-top: 3px;
  font-size: 11px;
  color: var(--color-muted-foreground);
}

/* Folder Card */
.u-folder-card {
  cursor: pointer;
}

.ufc-cover {
  position: relative;
  aspect-ratio: 16/10;
  border-radius: 6px;
  overflow: hidden;
  background: var(--color-secondary);
}

.ufc-cover-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  transition: transform 0.3s;
}

.u-folder-card:hover .ufc-cover-img {
  transform: scale(1.05);
}

.ufc-cover-placeholder {
  width: 100%;
  height: 100%;
  background: linear-gradient(135deg, var(--color-secondary), var(--color-card));
}

.ufc-overlay {
  position: absolute;
  inset: 0;
  background: linear-gradient(to top, rgb(0 0 0 / 0.6) 0%, transparent 50%);
  display: flex;
  align-items: flex-end;
  justify-content: flex-end;
  padding: 6px 8px;
}

.ufc-vcount {
  color: #fff;
  font-size: 11px;
  text-shadow: 0 1px 2px rgb(0 0 0 / 0.5);
}

.ufc-title {
  margin-top: 6px;
  font-size: 13px;
  color: var(--color-foreground);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  transition: color 0.2s;
}

.u-folder-card:hover .ufc-title {
  color: var(--color-primary);
}

.ufc-meta {
  margin-top: 2px;
  font-size: 11px;
  color: var(--color-muted-foreground);
}

/* Skeleton */
.sk-wrap {
  background: var(--color-background);
  min-height: 100vh;
}

.sk-banner {
  height: 220px;
  background: var(--color-secondary);
}

.sk-body {
  padding: 20px 24px;
  display: flex;
  gap: 16px;
}

.sk-avatar {
  width: 84px;
  height: 84px;
  border-radius: 50%;
  background: var(--color-muted);
  margin-top: -42px;
}

.sk-lines {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding-top: 4px;
}

.sk-lines div:first-child {
  width: 140px;
  height: 20px;
  border-radius: 4px;
  background: var(--color-muted);
}

.sk-lines div:last-child {
  width: 240px;
  height: 14px;
  border-radius: 4px;
  background: var(--color-secondary);
}

/* Social Cards */
.sc-card {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px 12px;
  border-radius: 8px;
  transition: background-color 0.2s;
}

.sc-card:hover {
  background: var(--color-secondary);
}

.sc-avatar {
  width: 48px;
  height: 48px;
  border-radius: 50%;
  object-fit: cover;
  flex-shrink: 0;
  cursor: pointer;
  transition: opacity 0.2s;
}

.sc-avatar:hover {
  opacity: 0.85;
}

.sc-info {
  flex: 1;
  min-width: 0;
}

.sc-name {
  font-size: 14px;
  font-weight: 500;
  color: var(--color-primary);
  cursor: pointer;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  transition: opacity 0.2s;
}

.sc-name:hover {
  opacity: 0.8;
}

.sc-desc {
  font-size: 12px;
  color: var(--color-muted-foreground);
  margin-top: 2px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.sc-btn {
  display: inline-flex;
  align-items: center;
  padding: 5px 16px;
  border-radius: 4px;
  font-size: 12px;
  white-space: nowrap;
  transition: all 0.2s;
  flex-shrink: 0;
  cursor: pointer;
}

.sc-btn-followed {
  background: var(--color-secondary);
  color: var(--color-muted-foreground);
  border: 1px solid var(--color-border);
}

.sc-btn-followed:hover {
  color: var(--color-accent);
  border-color: var(--color-accent);
  background: color-mix(in oklch, var(--color-accent) 10%, transparent);
}

.sc-btn-follow {
  background: var(--color-primary);
  color: var(--color-primary-foreground);
  border: 1px solid transparent;
}

.sc-btn-follow:hover {
  opacity: 0.9;
}

.banner-sheet-enter-active,
.banner-sheet-leave-active {
  transition: opacity 180ms ease;
}

.banner-sheet-enter-active .banner-sheet-panel,
.banner-sheet-leave-active .banner-sheet-panel {
  transition:
    transform 260ms cubic-bezier(0.22, 1, 0.36, 1),
    opacity 180ms ease;
}

.banner-sheet-enter-from,
.banner-sheet-leave-to {
  opacity: 0;
}

.banner-sheet-enter-from .banner-sheet-panel,
.banner-sheet-leave-to .banner-sheet-panel {
  transform: translateY(100%);
}
</style>
