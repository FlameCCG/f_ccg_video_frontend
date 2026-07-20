<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { useSiteStore } from '@/stores/site'
import {
  getCurrentUserInfo,
  updateUserInfo,
  getUserConfig,
  updateUserConfig,
  changePassword,
  bindEmail,
  getLoginIpRecords,
  getExpRecords,
  getCoinRecords,
  type UserInfo,
  type UserConfig,
  type UpdateUserInfoParams,
  type UpdateUserConfigParams,
  type UserLoginRecordItem,
  type UserExpRecordItem,
  type UserCoinRecordItem,
} from '@/api/user'
import { sendEmailCaptcha } from '@/api/captcha'
import { uploadImage, type ImageUploadResult } from '@/api/upload'
import AppAvatar from '@/components/common/AppAvatar.vue'
import GraphicsCaptcha from '@/components/captcha/GraphicsCaptcha.vue'
import SlideCaptchaDialog from '@/components/captcha/SlideCaptchaDialog.vue'
import { toast } from 'vue-sonner'
import {
  Home,
  User,
  ShieldCheck,
  Lock,
  Camera,
  ExternalLink,
  Save,
  Eye,
  EyeOff,
  History,
  Clock3,
  Coins,
  ChevronLeft,
  ChevronRight,
  Mail,
  Send,
  Loader2,
  Sparkles,
} from 'lucide-vue-next'
import { levelColor } from '@/utils/format'

interface SlideCaptchaExposed {
  success: (result?: { token: string; x: number; y: number }) => void
  fail: () => void
  refresh: () => void
  reset: () => void
}

/** 仅滑块/图形验证码校验失败（不含发送频率等业务错误） */
const isCaptchaBusinessError = (message: string): boolean => {
  const lower = message.toLowerCase()
  return (
    lower.includes('验证码错误') ||
    lower.includes('验证码验证失败') ||
    lower.includes('验证码已过期') ||
    lower.includes('请填写图形验证码') ||
    lower.includes('图形验证码') ||
    lower.includes('captcha verification') ||
    lower.includes('captcha expired') ||
    lower.includes('slide captcha') ||
    lower.includes('invalid slide captcha')
  )
}

const router = useRouter()
const authStore = useAuthStore()
const siteStore = useSiteStore()

type SideTab = 'profile' | 'privacy' | 'security' | 'records'
type RecordTab = 'login' | 'exp' | 'coin'
const activeTab = ref<SideTab>('profile')
const activeRecordTab = ref<RecordTab>('login')

const userInfo = ref<UserInfo | null>(null)
const userConfig = ref<UserConfig | null>(null)
const loading = ref(true)
const saving = ref(false)

const formUsername = ref('')
const formDescription = ref('')
const formGender = ref(0)
const formBirthday = ref('')
const profileLikeTagInput = ref('')
const avatarUploading = ref(false)

const oldPassword = ref('')
const newPassword = ref('')
const confirmPassword = ref('')
const showOldPwd = ref(false)
const showNewPwd = ref(false)
const showConfirmPwd = ref(false)
const changingPwd = ref(false)
// 绑定 / 换绑邮箱
const bindEmailAddress = ref('')
const bindEmailCode = ref('')
const bindEmailID = ref('')
const bindingEmail = ref(false)
const isSendingBindEmail = ref(false)
const bindEmailCountdown = ref(0)
let bindEmailCountdownTimer: ReturnType<typeof setInterval> | null = null
const graphicsCaptchaRef = ref<InstanceType<typeof GraphicsCaptcha> | null>(null)
const graphicsCaptchaValue = ref<{ captchaID: string; captchaCode: string }>({
  captchaID: '',
  captchaCode: '',
})
const slideCaptchaOpen = ref(false)
const slideCaptchaDialogRef = ref<SlideCaptchaExposed | null>(null)

const RECORD_PAGE_SIZE = 8

const loginRecords = ref<UserLoginRecordItem[]>([])
const loginRecordTotal = ref(0)
const loginRecordPage = ref(1)
const loginRecordLoading = ref(false)

const expRecords = ref<UserExpRecordItem[]>([])
const expRecordTotal = ref(0)
const expRecordPage = ref(1)
const expRecordLoading = ref(false)

const coinRecords = ref<UserCoinRecordItem[]>([])
const coinRecordTotal = ref(0)
const coinRecordPage = ref(1)
const coinRecordLoading = ref(false)

// 经验进度条百分比算法（修复了总是满格的 Bug，且与后端 thresholds 对齐）
const expPct = computed(() => {
  if (!userInfo.value) return 0
  const thresholds = [0, 0, 1000, 3000, 6000, 10000, 20000]
  const lv = userInfo.value.level
  const exp = userInfo.value.exp
  if (lv >= 6) return 100
  const cur = thresholds[lv] ?? 0
  const next = thresholds[lv + 1] ?? cur
  if (next === cur) return 100
  const pct = Math.round(((exp - cur) / (next - cur)) * 100)
  return Math.max(0, Math.min(100, pct))
})

const expNext = computed(() => {
  if (!userInfo.value) return 0
  const thresholds = [0, 0, 1000, 3000, 6000, 10000, 20000]
  const lv = userInfo.value.level
  return thresholds[lv + 1] ?? thresholds[6]!
})

/**
 * 是否要求输入旧密码：以后端 info 返回的 hasPassword 为准。
 * - 已设密（邮箱注册，或第三方已设置过密码）→ 需要旧密码
 * - 第三方登录且从未设密 → 不需要旧密码
 * - 字段缺失（旧后端）→ 保守要求旧密码
 */
const requiresOldPassword = computed(() => {
  if (!userInfo.value) return true
  if (userInfo.value.hasPassword === undefined) return true
  return userInfo.value.hasPassword
})

const canSendBindEmail = computed(() => {
  if (bindEmailCountdown.value > 0 || isSendingBindEmail.value) return false
  const email = bindEmailAddress.value.trim()
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return false
  // 换绑时不允许与当前邮箱相同
  if (userInfo.value?.email && email.toLowerCase() === userInfo.value.email.toLowerCase()) {
    return false
  }
  if (
    siteStore.isRegisterGraphicsCaptchaEnabled &&
    !graphicsCaptchaValue.value.captchaCode.trim()
  ) {
    return false
  }
  return true
})

const refreshGraphicsCaptcha = () => {
  if (siteStore.isRegisterGraphicsCaptchaEnabled && graphicsCaptchaRef.value) {
    void graphicsCaptchaRef.value.loadCaptcha()
  }
}

const buildBindEmailCaptchaPayload = () => {
  const payload: {
    type: 3
    email: string
    captchaID?: string
    captchaCode?: string
    slideCaptchaToken?: string
    slideCaptchaX?: number
    slideCaptchaY?: number
  } = {
    type: 3,
    email: bindEmailAddress.value.trim(),
  }

  if (siteStore.isRegisterGraphicsCaptchaEnabled) {
    payload.captchaID = graphicsCaptchaValue.value.captchaID
    payload.captchaCode = graphicsCaptchaValue.value.captchaCode
  }

  return payload
}

const bindEmailActionLabel = computed(() => (userInfo.value?.email ? '换绑邮箱' : '绑定邮箱'))

const genderOptions = [
  { value: 0, label: '保密' },
  { value: 1, label: '男' },
  { value: 2, label: '女' },
]

const sideItems: { key: SideTab; label: string; icon: typeof Home }[] = [
  { key: 'profile', label: '我的信息', icon: User },
  { key: 'records', label: '记录中心', icon: History },
  { key: 'privacy', label: '隐私设置', icon: ShieldCheck },
  { key: 'security', label: '账号安全', icon: Lock },
]

const recordTabs: { key: RecordTab; label: string; icon: typeof Clock3 }[] = [
  { key: 'login', label: '登录 IP', icon: Clock3 },
  { key: 'exp', label: '经验记录', icon: History },
  { key: 'coin', label: '硬币记录', icon: Coins },
]

const normalizeLikeTags = (tags?: string[] | null) => {
  if (!Array.isArray(tags)) return []
  return tags
    .map((tag) => tag.trim())
    .filter((tag, index, arr) => tag.length > 0 && arr.indexOf(tag) === index)
}

const fetchData = async () => {
  loading.value = true
  try {
    const [info, config] = await Promise.all([getCurrentUserInfo(), getUserConfig()])
    userInfo.value = {
      ...info,
      likeTags: normalizeLikeTags(info.likeTags),
    }
    userConfig.value = {
      ...config,
      likeTags: normalizeLikeTags(config.likeTags),
    }
    formUsername.value = info.username
    formDescription.value = info.description || ''
    formGender.value = info.gender
    formBirthday.value = info.birthday || ''
  } catch {
    toast.error('获取用户信息失败')
  } finally {
    loading.value = false
  }
}

const formatDateTime = (value: string) => {
  if (!value) return '--'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value

  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}

const formatLoginType = (value: string) => {
  if (value === 'github') return 'GitHub 登录'
  if (value === 'pwd') return '密码登录'
  if (value === 'qq') return 'QQ 登录'
  if (value === 'x') return 'X 登录'
  if (value === 'google') return 'Google 登录'
  return value || '未知方式'
}

const formatRegisterSource = (value: string | undefined) => {
  if (!value || value === 'email' || value === 'pwd') return '邮箱注册'
  if (value === 'qq') return 'QQ 登录'
  if (value === 'google') return 'Google 登录'
  if (value === 'github') return 'GitHub 登录'
  if (value === 'linuxdo') return 'LinuxDo 登录'
  if (value === 'x') return 'X 登录'
  return value
}

const loadLoginRecords = async (page = 1) => {
  loginRecordLoading.value = true
  try {
    const result = await getLoginIpRecords({ page, pageSize: RECORD_PAGE_SIZE })
    loginRecords.value = result.list ?? []
    loginRecordTotal.value = result.total ?? 0
    loginRecordPage.value = page
  } catch {
    toast.error('获取登录记录失败')
  } finally {
    loginRecordLoading.value = false
  }
}

const loadExpRecords = async (page = 1) => {
  expRecordLoading.value = true
  try {
    const result = await getExpRecords({ page, pageSize: RECORD_PAGE_SIZE })
    expRecords.value = result.list ?? []
    expRecordTotal.value = result.total ?? 0
    expRecordPage.value = page
  } catch {
    toast.error('获取经验记录失败')
  } finally {
    expRecordLoading.value = false
  }
}

const loadCoinRecords = async (page = 1) => {
  coinRecordLoading.value = true
  try {
    const result = await getCoinRecords({ page, pageSize: RECORD_PAGE_SIZE })
    coinRecords.value = result.list ?? []
    coinRecordTotal.value = result.total ?? 0
    coinRecordPage.value = page
  } catch {
    toast.error('获取硬币记录失败')
  } finally {
    coinRecordLoading.value = false
  }
}

const ensureRecordLoaded = (tab: RecordTab) => {
  if (tab === 'login' && !loginRecords.value.length && !loginRecordLoading.value) {
    void loadLoginRecords()
  }
  if (tab === 'exp' && !expRecords.value.length && !expRecordLoading.value) {
    void loadExpRecords()
  }
  if (tab === 'coin' && !coinRecords.value.length && !coinRecordLoading.value) {
    void loadCoinRecords()
  }
}

const currentDeltaRecords = computed(() =>
  activeRecordTab.value === 'exp' ? expRecords.value : coinRecords.value
)

const currentRecordLoading = computed(() => {
  if (activeRecordTab.value === 'login') return loginRecordLoading.value
  if (activeRecordTab.value === 'exp') return expRecordLoading.value
  return coinRecordLoading.value
})

const currentRecordPage = computed(() => {
  if (activeRecordTab.value === 'login') return loginRecordPage.value
  if (activeRecordTab.value === 'exp') return expRecordPage.value
  return coinRecordPage.value
})

const currentRecordTotal = computed(() => {
  if (activeRecordTab.value === 'login') return loginRecordTotal.value
  if (activeRecordTab.value === 'exp') return expRecordTotal.value
  return coinRecordTotal.value
})

const currentRecordTotalPages = computed(() =>
  Math.max(1, Math.ceil(currentRecordTotal.value / RECORD_PAGE_SIZE))
)

const currentRecordEmptyText = computed(() => {
  if (activeRecordTab.value === 'login') return '还没有登录 IP 记录'
  if (activeRecordTab.value === 'exp') return '还没有经验变动记录'
  return '还没有硬币变动记录'
})

const switchRecordTab = (tab: RecordTab) => {
  activeRecordTab.value = tab
}

const changeRecordPage = (delta: number) => {
  const nextPage = currentRecordPage.value + delta
  if (nextPage < 1 || nextPage > currentRecordTotalPages.value) return

  if (activeRecordTab.value === 'login') {
    void loadLoginRecords(nextPage)
  } else if (activeRecordTab.value === 'exp') {
    void loadExpRecords(nextPage)
  } else {
    void loadCoinRecords(nextPage)
  }
}

const computeFileHash = async (file: File): Promise<string> => {
  const buffer = await file.arrayBuffer()
  const hashBuffer = await crypto.subtle.digest('SHA-256', buffer)
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

const handleAvatarUpload = async (e: Event) => {
  const target = e.target as HTMLInputElement
  const file = target.files?.[0]
  if (!file) return
  avatarUploading.value = true
  try {
    const fileHash = await computeFileHash(file)
    const result: ImageUploadResult = await uploadImage(fileHash, file)
    await updateUserInfo({ avatar: result.imageUrl })
    if (userInfo.value) userInfo.value.avatar = result.imageUrl
    authStore.updateUser({ avatar: result.imageUrl })
    toast.success('头像更新成功')
  } catch {
    toast.error('头像上传失败')
  } finally {
    avatarUploading.value = false
    target.value = ''
  }
}

const handleSaveProfile = async () => {
  if (saving.value) return
  saving.value = true
  try {
    const params: UpdateUserInfoParams = {
      username: formUsername.value,
      description: formDescription.value,
      gender: formGender.value,
    }
    if (formBirthday.value) params.birthday = formBirthday.value
    await updateUserInfo(params)
    authStore.updateUser({
      username: formUsername.value,
      description: formDescription.value,
      gender: formGender.value,
    })
    toast.success('个人信息已保存')
  } catch {
    toast.error('保存失败')
  } finally {
    saving.value = false
  }
}

const handleSavePrivacy = async () => {
  if (!userConfig.value || saving.value) return
  saving.value = true
  try {
    const params: UpdateUserConfigParams = {
      openCollect: userConfig.value.openCollect,
      openFans: userConfig.value.openFans,
      openFollow: userConfig.value.openFollow,
      openLikeVideo: userConfig.value.openLikeVideo,
      openCoinVideo: userConfig.value.openCoinVideo,
    }
    await updateUserConfig(params)
    toast.success('隐私设置已保存')
  } catch {
    toast.error('保存失败')
  } finally {
    saving.value = false
  }
}

const handleSaveLikeTags = async (silent = false) => {
  if (!userConfig.value || saving.value) return
  saving.value = true
  const nextTags = normalizeLikeTags(userConfig.value.likeTags)
  try {
    await updateUserConfig({ likeTags: nextTags })
    userConfig.value.likeTags = nextTags
    if (userInfo.value) {
      userInfo.value.likeTags = nextTags
    }
    authStore.updateUser({ likeTags: nextTags })
    if (!silent) toast.success('个人标签已保存')
  } catch {
    toast.error('保存失败')
  } finally {
    saving.value = false
  }
}

const addProfileLikeTag = async () => {
  if (!userConfig.value) return
  const nextTag = profileLikeTagInput.value.trim()
  if (!nextTag) return
  if (userConfig.value.likeTags.includes(nextTag)) {
    profileLikeTagInput.value = ''
    return
  }
  userConfig.value.likeTags = [...userConfig.value.likeTags, nextTag]
  profileLikeTagInput.value = ''
  await handleSaveLikeTags(true)
}

const removeProfileLikeTag = async (tag: string) => {
  if (!userConfig.value) return
  userConfig.value.likeTags = userConfig.value.likeTags.filter((item) => item !== tag)
  await handleSaveLikeTags(true)
}

const handleChangePwd = async () => {
  if (!newPassword.value || !confirmPassword.value) {
    toast.warning('请填写完整')
    return
  }
  if (requiresOldPassword.value && !oldPassword.value.trim()) {
    toast.warning('请输入当前密码')
    return
  }
  if (newPassword.value !== confirmPassword.value) {
    toast.warning('两次密码不一致')
    return
  }
  if (newPassword.value.length < 6) {
    toast.warning('密码长度至少6位')
    return
  }
  changingPwd.value = true
  try {
    const params: { oldPassword?: string; newPassword: string } = {
      newPassword: newPassword.value,
    }
    if (requiresOldPassword.value) {
      params.oldPassword = oldPassword.value
    } else if (oldPassword.value.trim()) {
      // 第三方用户若主动填写了旧密码，一并提交
      params.oldPassword = oldPassword.value
    }

    await changePassword(
      {
        oldPassword: params.oldPassword ?? '',
        newPassword: params.newPassword,
      },
      { silent: true }
    )
    toast.success('密码修改成功，请重新登录')
    oldPassword.value = ''
    newPassword.value = ''
    confirmPassword.value = ''
    // 使用 clearAuth 避免 logout 再弹一次「已退出登录」
    authStore.clearAuth()
    void router.push('/')
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : '密码修改失败'
    toast.error(message || '密码修改失败')
  } finally {
    changingPwd.value = false
  }
}

const startBindEmailCountdown = () => {
  bindEmailCountdown.value = 60
  if (bindEmailCountdownTimer) clearInterval(bindEmailCountdownTimer)
  bindEmailCountdownTimer = setInterval(() => {
    bindEmailCountdown.value--
    if (bindEmailCountdown.value <= 0) {
      if (bindEmailCountdownTimer) clearInterval(bindEmailCountdownTimer)
      bindEmailCountdownTimer = null
    }
  }, 1000)
}

const handleSendBindEmailCode = () => {
  if (!canSendBindEmail.value) {
    if (
      userInfo.value?.email &&
      bindEmailAddress.value.trim().toLowerCase() === userInfo.value.email.toLowerCase()
    ) {
      toast.warning('新邮箱不能与当前邮箱相同')
    } else if (!bindEmailAddress.value.trim()) {
      toast.warning('请输入邮箱')
    } else if (
      siteStore.isRegisterGraphicsCaptchaEnabled &&
      !graphicsCaptchaValue.value.captchaCode.trim()
    ) {
      toast.warning('请填写图形验证码')
    }
    return
  }

  if (siteStore.isRegisterSlideCaptchaEnabled) {
    slideCaptchaOpen.value = true
    return
  }

  void sendBindEmailCodeWithoutSlide()
}

const sendBindEmailCodeWithoutSlide = async () => {
  isSendingBindEmail.value = true
  try {
    const result = await sendEmailCaptcha(buildBindEmailCaptchaPayload())
    bindEmailID.value = result.emailID
    toast.success('验证码已发送到您的邮箱')
    startBindEmailCountdown()
    refreshGraphicsCaptcha()
  } catch {
    refreshGraphicsCaptcha()
    // toast 由 request 拦截器处理
  } finally {
    isSendingBindEmail.value = false
  }
}

const handleSlideCaptchaConfirm = async (value: { token: string; x: number; y: number }) => {
  isSendingBindEmail.value = true
  try {
    const result = await sendEmailCaptcha(
      {
        ...buildBindEmailCaptchaPayload(),
        slideCaptchaToken: value.token,
        slideCaptchaX: value.x,
        slideCaptchaY: value.y,
      },
      { silent: true }
    )
    bindEmailID.value = result.emailID
    slideCaptchaDialogRef.value?.success(value)
    toast.success('验证码已发送到您的邮箱')
    startBindEmailCountdown()
    refreshGraphicsCaptcha()
  } catch (error: unknown) {
    slideCaptchaDialogRef.value?.fail()
    refreshGraphicsCaptcha()
    const message = error instanceof Error ? error.message : ''
    if (message && (message.includes('图形验证码') || !isCaptchaBusinessError(message))) {
      toast.error(message)
    }
  } finally {
    isSendingBindEmail.value = false
  }
}

const handleBindEmail = async () => {
  const email = bindEmailAddress.value.trim()
  const code = bindEmailCode.value.trim()
  if (!email) {
    toast.warning('请输入邮箱')
    return
  }
  if (!bindEmailID.value || !code) {
    toast.warning('请先获取并填写邮箱验证码')
    return
  }
  if (userInfo.value?.email && email.toLowerCase() === userInfo.value.email.toLowerCase()) {
    toast.warning('新邮箱不能与当前邮箱相同')
    return
  }

  bindingEmail.value = true
  try {
    await bindEmail(
      {
        email,
        emailID: bindEmailID.value,
        emailCode: code,
      },
      { silent: true }
    )
    toast.success(userInfo.value?.email ? '邮箱换绑成功' : '邮箱绑定成功')
    if (userInfo.value) {
      userInfo.value.email = email
    }
    authStore.updateUser({ email })
    bindEmailAddress.value = ''
    bindEmailCode.value = ''
    bindEmailID.value = ''
    bindEmailCountdown.value = 0
    if (bindEmailCountdownTimer) {
      clearInterval(bindEmailCountdownTimer)
      bindEmailCountdownTimer = null
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : '绑定失败'
    toast.error(message || '绑定失败')
  } finally {
    bindingEmail.value = false
  }
}

onMounted(() => {
  void siteStore.fetchConfig()
  void fetchData()
})

onUnmounted(() => {
  if (bindEmailCountdownTimer) {
    clearInterval(bindEmailCountdownTimer)
    bindEmailCountdownTimer = null
  }
})

watch(activeTab, (tab) => {
  if (tab === 'records') {
    ensureRecordLoaded(activeRecordTab.value)
  }
})

watch(activeRecordTab, (tab) => {
  if (activeTab.value === 'records') {
    ensureRecordLoaded(tab)
  }
})
</script>

<template>
  <div class="center-page">
    <!-- Widescreen Bilibili blue banner with cloud decor -->
    <div class="bili-banner">
      <div class="bili-banner-sky">
        <!-- SVG Clouds -->
        <svg class="cloud-svg cloud-svg-back" viewBox="0 0 1000 60" preserveAspectRatio="none">
          <path
            d="M0,45 C150,25 200,60 350,35 C500,10 600,55 750,25 C900,0 950,45 1000,15 L1000,60 L0,60 Z"
          />
        </svg>
        <svg class="cloud-svg cloud-svg-front" viewBox="0 0 1000 40" preserveAspectRatio="none">
          <path
            d="M0,30 C100,10 250,40 400,20 C550,5 700,30 850,15 C950,5 980,25 1000,10 L1000,40 L0,40 Z"
          />
        </svg>
      </div>

      <div class="bili-banner-content">
        <img src="/logo.png" alt="bilibili" class="bili-logo" />
      </div>
    </div>

    <!-- Main Container (width: 980px) -->
    <div class="center-body">
      <!-- Left Sidebar Menu (width: 150px) -->
      <aside class="center-side">
        <div class="side-header">个人中心</div>
        <nav class="side-nav">
          <button
            v-for="item in sideItems"
            :key="item.key"
            class="side-item"
            :class="{ active: activeTab === item.key }"
            @click="activeTab = item.key"
          >
            <component :is="item.icon" :size="14" />
            <span>{{ item.label }}</span>
          </button>
          <button class="side-item" @click="router.push(`/user/${authStore.userId}`)">
            <ExternalLink :size="14" />
            <span>个人空间</span>
          </button>
        </nav>
      </aside>

      <!-- Right Content Main Box (width: 820px) -->
      <main class="center-main">
        <div v-if="loading" class="center-loading">
          <div class="spinner"></div>
        </div>

        <!-- Profile Settings -->
        <section v-else-if="activeTab === 'profile' && userInfo" class="sec-anim">
          <!-- Bilibili style profile overview card -->
          <div class="bili-overview-card">
            <div class="ov-avatar-wrap">
              <AppAvatar
                :src="userInfo.avatar"
                :name="userInfo.username"
                :alt="userInfo.username"
                container-class="ov-avatar"
                text-class="text-xl font-bold"
              />
              <label class="ov-avatar-mask">
                <Camera :size="16" />
                <span>{{ avatarUploading ? '上传中' : '更换头像' }}</span>
                <input
                  type="file"
                  accept="image/*"
                  class="sr-only"
                  :disabled="avatarUploading"
                  @change="handleAvatarUpload"
                />
              </label>
            </div>

            <div class="ov-info">
              <div class="ov-name-row">
                <span class="username">{{ userInfo.username }}</span>
                <span class="member-tag">正式会员</span>
              </div>

              <!-- Level orange progress bar -->
              <div class="ov-level-row">
                <span class="lv-badge" :style="{ backgroundColor: levelColor(userInfo.level) }">
                  Lv{{ userInfo.level }}
                </span>
                <div class="level-progress-track">
                  <div class="level-progress-fill" :style="{ width: `${expPct}%` }"></div>
                </div>
                <span class="level-exp-text">{{
                  userInfo.level >= 6 ? '已满级' : `${userInfo.exp} / ${expNext}`
                }}</span>
              </div>

              <div class="ov-meta">
                <span class="meta-item">
                  <Coins :size="14" class="inline-block text-[#ffa726] mr-1" />
                  硬币:
                  <strong class="text-[var(--color-foreground)] font-semibold">{{
                    userInfo.coinCount
                  }}</strong>
                </span>
                <span class="meta-split"></span>
                <span class="meta-item font-mono">UID: {{ userInfo.id }}</span>
              </div>
            </div>

            <!-- Header buttons -->
            <div class="ov-actions">
              <button class="ov-btn" @click="handleSaveProfile">修改资料</button>
              <button class="ov-btn" @click="router.push(`/user/${authStore.userId}`)">
                个人空间 >
              </button>
            </div>
          </div>

          <!-- Profile form flat layout -->
          <div class="bili-form-section">
            <h4 class="form-section-title">基本信息</h4>

            <div class="form-group">
              <label class="form-label">用户名</label>
              <input
                v-model="formUsername"
                type="text"
                class="form-input"
                placeholder="请输入您的用户名"
              />
            </div>

            <div class="form-group">
              <label class="form-label">我的签名</label>
              <textarea
                v-model="formDescription"
                class="form-input form-textarea"
                placeholder="编辑签名，介绍下你自己吧..."
                rows="3"
              ></textarea>
            </div>

            <div class="form-group">
              <label class="form-label">性别</label>
              <div class="gender-radio-group">
                <label v-for="g in genderOptions" :key="g.value" class="gender-radio-label">
                  <input
                    v-model="formGender"
                    type="radio"
                    :value="g.value"
                    class="gender-radio-input"
                  />
                  <span class="gender-radio-custom"></span>
                  <span class="gender-radio-text">{{ g.label }}</span>
                </label>
              </div>
            </div>

            <div class="form-group">
              <label class="form-label">生日</label>
              <input v-model="formBirthday" type="date" class="form-input" />
            </div>

            <button class="bili-btn-primary" :disabled="saving" @click="handleSaveProfile">
              <Save :size="14" />
              <span>{{ saving ? '保存中...' : '保存' }}</span>
            </button>
          </div>

          <!-- Personalized tags board -->
          <div v-if="userConfig" class="bili-form-section" style="margin-top: 30px">
            <h4 class="form-section-title">个人标签设置</h4>

            <div class="bili-tags-board">
              <template v-if="userConfig.likeTags.length">
                <span v-for="tag in userConfig.likeTags" :key="tag" class="bili-tag-chip">
                  <Sparkles :size="12" class="text-[#00aeec] inline mr-1" />
                  {{ tag }}
                  <button
                    type="button"
                    class="tag-remove-btn"
                    aria-label="删除标签"
                    @click="removeProfileLikeTag(tag)"
                  >
                    ×
                  </button>
                </span>
              </template>
              <div v-else class="text-xs text-[#99a2aa] py-1 italic">
                暂无个性化标签，您可以在右侧输入新增
              </div>

              <!-- Input row -->
              <div class="tag-input-row">
                <div class="relative flex items-center h-[30px]">
                  <input
                    v-model="profileLikeTagInput"
                    type="text"
                    maxlength="24"
                    class="tag-input-field"
                    placeholder="新标签"
                    @keydown.enter.prevent="addProfileLikeTag"
                  />
                  <button
                    v-if="profileLikeTagInput"
                    class="tag-clear-btn"
                    @click="profileLikeTagInput = ''"
                  >
                    ×
                  </button>
                </div>
                <button class="tag-add-btn" @click="addProfileLikeTag">新增</button>
              </div>
            </div>
          </div>
        </section>

        <!-- Records Tab View -->
        <section v-else-if="activeTab === 'records'" class="sec-anim">
          <h4 class="form-section-title" style="border-bottom: none; margin-bottom: 10px">
            记录中心
          </h4>

          <div class="bili-records-tabs">
            <button
              v-for="item in recordTabs"
              :key="item.key"
              class="records-tab-btn"
              :class="{ active: activeRecordTab === item.key }"
              @click="switchRecordTab(item.key)"
            >
              <component :is="item.icon" :size="13" />
              <span>{{ item.label }}</span>
            </button>
          </div>

          <div class="records-container-box">
            <div v-if="currentRecordLoading" class="records-status-placeholder">
              <Loader2 :size="20" class="animate-spin text-[#00aeec]" />
            </div>

            <!-- Login records list -->
            <template v-else-if="activeRecordTab === 'login'">
              <div v-if="loginRecords.length" class="records-list-wrapper">
                <div v-for="item in loginRecords" :key="item.id" class="record-row-item">
                  <div class="record-row-left">
                    <div class="record-row-top-info">
                      <span class="record-ip-address">{{ item.ip }}</span>
                      <span class="record-badge-tag">{{ formatLoginType(item.loginType) }}</span>
                    </div>
                    <div class="record-row-bottom-info">
                      <span>{{ item.addr || '未知归属地' }}</span>
                      <span class="meta-dot">•</span>
                      <span class="ua-text">{{ item.userAgent || '未知设备' }}</span>
                    </div>
                  </div>
                  <div class="record-row-right">
                    {{ formatDateTime(item.createdAt) }}
                  </div>
                </div>
              </div>
              <div v-else class="records-status-placeholder">{{ currentRecordEmptyText }}</div>
            </template>

            <!-- Delta records list (Exp & Coin) -->
            <template v-else>
              <div v-if="currentDeltaRecords.length" class="records-list-wrapper">
                <div
                  v-for="item in currentDeltaRecords"
                  :key="item.id"
                  class="record-row-item flex-row-item"
                >
                  <div class="record-row-left">
                    <span class="record-reason-title">{{ item.reason || '系统奖励' }}</span>
                    <span class="record-desc-sub">
                      {{ activeRecordTab === 'exp' ? '经验值变动' : '硬币流水' }}
                    </span>
                  </div>
                  <div class="record-row-middle">
                    <span
                      class="delta-badge"
                      :class="(item.delta ?? 0) >= 0 ? 'is-positive' : 'is-negative'"
                    >
                      {{ (item.delta ?? 0) >= 0 ? '+' : '' }}{{ item.delta }}
                    </span>
                  </div>
                  <div class="record-row-right font-medium">
                    {{ formatDateTime(item.createdAt) }}
                  </div>
                </div>
              </div>
              <div v-else class="records-status-placeholder">{{ currentRecordEmptyText }}</div>
            </template>

            <!-- Pager footer -->
            <div class="records-pager-footer">
              <span class="pager-summary-text">
                共 {{ currentRecordTotal }} 条记录，第 {{ currentRecordPage }} /
                {{ currentRecordTotalPages }} 页
              </span>
              <div class="pager-button-group">
                <button
                  class="bili-pager-btn"
                  :disabled="currentRecordPage <= 1 || currentRecordLoading"
                  @click="changeRecordPage(-1)"
                >
                  <ChevronLeft :size="14" />
                  <span>上一页</span>
                </button>
                <button
                  class="bili-pager-btn"
                  :disabled="currentRecordPage >= currentRecordTotalPages || currentRecordLoading"
                  @click="changeRecordPage(1)"
                >
                  <span>下一页</span>
                  <ChevronRight :size="14" />
                </button>
              </div>
            </div>
          </div>
        </section>

        <!-- Privacy Settings View -->
        <section v-else-if="activeTab === 'privacy' && userConfig" class="sec-anim">
          <h4 class="form-section-title">隐私设置</h4>
          <p class="section-sub-desc">控制其他用户访问您的个人空间时能看到的内容模块</p>

          <div class="privacy-list-grid">
            <label
              v-for="item in [
                {
                  key: 'openCollect',
                  label: '公开收藏夹',
                  desc: '开启后，其他人可以在您的空间里查看您公开的收藏夹内容',
                },
                {
                  key: 'openFans',
                  label: '公开粉丝列表',
                  desc: '开启后，其他人可以在您的空间里查看您的粉丝列表',
                },
                {
                  key: 'openFollow',
                  label: '公开关注列表',
                  desc: '开启后，其他人可以在您的空间里查看您关注的Up主列表',
                },
                {
                  key: 'openLikeVideo',
                  label: '公开点赞视频',
                  desc: '开启后，其他人可以在您的空间里查看您点赞过的视频',
                },
                {
                  key: 'openCoinVideo',
                  label: '公开投币视频',
                  desc: '开启后，其他人可以在您的空间里查看您投币过的视频',
                },
              ] as { key: keyof UserConfig; label: string; desc: string }[]"
              :key="item.key"
              class="privacy-card-label"
            >
              <div class="privacy-card-left">
                <span class="privacy-card-title">{{ item.label }}</span>
                <p class="privacy-card-desc">{{ item.desc }}</p>
              </div>

              <!-- Standard flat switch slider -->
              <div class="bili-switch-track" :class="{ 'is-active': userConfig[item.key] }">
                <input v-model="userConfig[item.key]" type="checkbox" class="sr-only" />
                <span class="bili-switch-thumb"></span>
              </div>
            </label>
          </div>

          <button class="bili-btn-primary" :disabled="saving" @click="handleSavePrivacy">
            <Save :size="14" />
            <span>{{ saving ? '保存中...' : '保存隐私设置' }}</span>
          </button>
        </section>

        <!-- Security and Account settings tab -->
        <section v-else-if="activeTab === 'security'" class="sec-anim space-y-8">
          <div>
            <h4 class="form-section-title" style="margin-bottom: 12px">账号安全</h4>
          </div>

          <!-- Simple Security Table list -->
          <div class="bili-security-table">
            <div class="sec-row-item">
              <span class="sec-label-col">当前关联邮箱</span>
              <span class="sec-value-col font-bold text-[var(--color-foreground)]">{{
                userInfo?.email || '未绑定密保邮箱'
              }}</span>
            </div>
            <div class="sec-row-item">
              <span class="sec-label-col">账号注册方式</span>
              <span class="sec-value-col font-bold text-[var(--color-foreground)]">{{
                formatRegisterSource(userInfo?.registerSource)
              }}</span>
            </div>
          </div>

          <div class="grid grid-cols-1 lg:grid-cols-2 gap-8 pt-4">
            <!-- Email binding panel -->
            <div
              class="bili-form-section"
              style="border: 1px solid var(--color-border); padding: 20px; border-radius: 4px"
            >
              <h5 class="form-panel-title">{{ bindEmailActionLabel }}</h5>

              <div class="space-y-4">
                <div class="form-group-vertical">
                  <label class="form-label">目标邮箱</label>
                  <div class="form-input-icon-wrapper has-left-icon">
                    <input
                      v-model="bindEmailAddress"
                      type="email"
                      class="form-input"
                      placeholder="请输入新的邮箱地址"
                      autocomplete="email"
                    />
                    <Mail :size="14" class="absolute left-3 text-[#99a2aa]" />
                  </div>
                </div>

                <!-- Graphics captcha validation -->
                <div v-if="siteStore.isRegisterGraphicsCaptchaEnabled" class="form-group-vertical">
                  <label class="form-label">图形验证码</label>
                  <GraphicsCaptcha
                    ref="graphicsCaptchaRef"
                    v-model="graphicsCaptchaValue"
                    class="w-full"
                  />
                </div>

                <!-- Email code verify inputs -->
                <div class="form-group-vertical">
                  <label class="form-label">邮箱验证码</label>
                  <div class="flex gap-3 w-full">
                    <input
                      v-model="bindEmailCode"
                      type="text"
                      class="form-input flex-1"
                      placeholder="请输入验证码"
                      autocomplete="one-time-code"
                    />
                    <button
                      type="button"
                      class="bili-btn-code"
                      :disabled="!canSendBindEmail || bindEmailCountdown > 0"
                      @click="handleSendBindEmailCode"
                    >
                      <Loader2
                        v-if="isSendingBindEmail"
                        :size="12"
                        class="animate-spin text-[#6d757a]"
                      />
                      <Send v-else-if="bindEmailCountdown <= 0" :size="12" />
                      <span class="font-mono">
                        {{
                          isSendingBindEmail
                            ? '发送中'
                            : bindEmailCountdown > 0
                              ? `${bindEmailCountdown}s`
                              : '获取验证码'
                        }}
                      </span>
                    </button>
                  </div>
                </div>

                <button
                  type="button"
                  class="bili-btn-primary w-full justify-center"
                  :disabled="bindingEmail"
                  @click="handleBindEmail"
                >
                  <Mail :size="14" />
                  <span>{{ bindingEmail ? '正在绑定...' : bindEmailActionLabel }}</span>
                </button>
              </div>
            </div>

            <!-- Password change panel -->
            <div
              class="bili-form-section"
              style="border: 1px solid var(--color-border); padding: 20px; border-radius: 4px"
            >
              <h5 class="form-panel-title">修改登录密码</h5>

              <div class="space-y-4">
                <!-- Old password -->
                <div v-if="requiresOldPassword" class="form-group-vertical">
                  <label class="form-label">当前密码</label>
                  <div class="form-input-icon-wrapper has-right-icon">
                    <input
                      v-model="oldPassword"
                      :type="showOldPwd ? 'text' : 'password'"
                      class="form-input"
                      placeholder="请输入当前使用的密码"
                      autocomplete="current-password"
                    />
                    <button
                      type="button"
                      class="absolute right-3 text-[#99a2aa] hover:text-[var(--color-foreground)]"
                      @click="showOldPwd = !showOldPwd"
                    >
                      <component :is="showOldPwd ? EyeOff : Eye" :size="14" />
                    </button>
                  </div>
                </div>

                <!-- New password input -->
                <div class="form-group-vertical">
                  <label class="form-label">新密码</label>
                  <div class="form-input-icon-wrapper has-right-icon">
                    <input
                      v-model="newPassword"
                      :type="showNewPwd ? 'text' : 'password'"
                      class="form-input"
                      placeholder="新密码（至少6位）"
                      autocomplete="new-password"
                    />
                    <button
                      type="button"
                      class="absolute right-3 text-[#99a2aa] hover:text-[var(--color-foreground)]"
                      @click="showNewPwd = !showNewPwd"
                    >
                      <component :is="showNewPwd ? EyeOff : Eye" :size="14" />
                    </button>
                  </div>
                </div>

                <!-- Confirm password input -->
                <div class="form-group-vertical">
                  <label class="form-label">确认新密码</label>
                  <div class="form-input-icon-wrapper has-right-icon">
                    <input
                      v-model="confirmPassword"
                      :type="showConfirmPwd ? 'text' : 'password'"
                      class="form-input"
                      placeholder="请再次输入新密码"
                      autocomplete="new-password"
                    />
                    <button
                      type="button"
                      class="absolute right-3 text-[#99a2aa] hover:text-[var(--color-foreground)]"
                      @click="showConfirmPwd = !showConfirmPwd"
                    >
                      <component :is="showConfirmPwd ? EyeOff : Eye" :size="14" />
                    </button>
                  </div>
                </div>

                <button
                  type="button"
                  class="bili-btn-danger w-full justify-center"
                  :disabled="changingPwd"
                  @click="handleChangePwd"
                >
                  <Lock :size="14" />
                  <span>{{ changingPwd ? '正在修改密码...' : '修改密码' }}</span>
                </button>
              </div>
            </div>
          </div>
        </section>
      </main>
    </div>

    <!-- Dialog models for slide validation -->
    <SlideCaptchaDialog
      ref="slideCaptchaDialogRef"
      v-model:open="slideCaptchaOpen"
      @confirm="handleSlideCaptchaConfirm"
    />
  </div>
</template>

<style scoped lang="scss">
.center-page {
  background-color: var(--color-background);
  min-height: calc(100vh - 56px);
  padding-bottom: 50px;
}

.bili-banner {
  position: relative;
  height: 106px;
  background-color: #00aeec;
  overflow: hidden;

  &-sky {
    position: absolute;
    inset: 0;
    pointer-events: none;
  }

  &-content {
    position: relative;
    max-width: 980px;
    height: 100%;
    margin: 0 auto;
    padding: 0 20px;
    display: flex;
    align-items: center;
  }
}

.cloud-svg {
  position: absolute;
  bottom: 0;
  left: 0;
  width: 100%;
  fill: #ffffff;

  &-back {
    height: 60px;
    opacity: 0.22;
  }

  &-front {
    height: 40px;
    opacity: 0.45;
  }
}

.mascot-svg {
  position: absolute;
  right: 12%;
  bottom: 5px;
  width: 80px;
  height: 80px;
  opacity: 0.8;

  circle {
    fill: #ffffff;
  }
}

.bili-logo {
  height: 38px;
  filter: brightness(0) invert(1);
  opacity: 0.95;
}

.center-body {
  width: 980px;
  margin: 10px auto 0;
  display: flex;
  gap: 10px;
  align-items: flex-start;
}

.center-side {
  width: 150px;
  background-color: var(--color-card);
  border: 1px solid var(--color-border);
  border-radius: 4px;
  padding-bottom: 10px;
}

.side-header {
  font-size: 14px;
  font-weight: 700;
  color: var(--color-foreground);
  padding: 16px 20px;
  border-bottom: 1px solid var(--color-border);
  text-align: left;
}

.side-nav {
  display: flex;
  flex-direction: column;
  margin-top: 10px;
}

.side-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 20px;
  font-size: 13px;
  font-weight: 500;
  color: var(--color-foreground);
  cursor: pointer;
  border: none;
  background: none;
  text-align: left;
  transition:
    background-color 0.15s,
    color 0.15s;

  &:hover {
    background-color: var(--color-secondary);
  }

  &.active {
    background-color: var(--color-primary);
    color: var(--color-primary-foreground);
    font-weight: 600;

    svg {
      color: var(--color-primary-foreground);
    }
  }
}

.center-main {
  width: 820px;
  background-color: var(--color-card);
  border: 1px solid var(--color-border);
  border-radius: 4px;
  padding: 25px 20px 40px;
}

.center-loading {
  display: flex;
  justify-content: center;
  align-items: center;
  min-height: 350px;
}

.spinner {
  width: 32px;
  height: 32px;
  border: 3px solid var(--color-border);
  border-top-color: var(--color-primary);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

.sec-anim {
  animation: fade-in 0.15s ease-out;
}

.bili-overview-card {
  display: flex;
  align-items: center;
  gap: 20px;
  padding-bottom: 25px;
  border-bottom: 1px solid var(--color-border);
  margin-bottom: 25px;
}

.ov-avatar {
  width: 100%;
  height: 100%;

  &-wrap {
    position: relative;
    flex-shrink: 0;
    width: 64px;
    height: 64px;
    border-radius: 50%;
    overflow: hidden;
    border: 1px solid var(--color-border);
  }

  &-mask {
    position: absolute;
    inset: 0;
    border-radius: 50%;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    background: rgb(0, 0, 0, 0.5);
    color: #ffffff;
    font-size: 9px;
    cursor: pointer;
    opacity: 0;
    transition: opacity 0.15s;

    &:hover {
      opacity: 1;
    }
  }
}

.ov-info {
  flex: 1;
  min-width: 0;
}

.ov-name-row {
  display: flex;
  align-items: center;
  gap: 10px;

  .username {
    font-size: 16px;
    font-weight: 700;
    color: var(--color-foreground);
  }

  .member-tag {
    border: 1px solid var(--color-border);
    border-radius: 4px;
    padding: 1px 6px;
    font-size: 10px;
    color: var(--color-muted-foreground);
  }
}

.ov-level-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 8px 0;
}

.lv-badge {
  display: inline-block;
  padding: 1px 5px;
  border-radius: 3px;
  font-size: 10px;
  font-weight: 800;
  color: #ffffff;
  line-height: 1.2;
}

.level-progress-track {
  width: 260px;
  height: 10px;
  border-radius: 5px;
  background-color: var(--color-secondary);
  overflow: hidden;
  border: 1px solid var(--color-border);
}

.level-progress-fill {
  height: 100%;
  background-color: #ff8547;
  border-radius: 5px;
  transition: width 0.3s ease;
}

.level-exp-text {
  font-size: 11px;
  color: var(--color-muted-foreground);
  font-family: monospace;
}

.ov-meta {
  display: flex;
  align-items: center;
  gap: 12px;
  font-size: 12px;
  color: var(--color-muted-foreground);
}

.meta-split {
  width: 1px;
  height: 12px;
  background-color: var(--color-border);
}

.ov-actions {
  display: flex;
  gap: 10px;
  align-self: center;
}

.ov-btn {
  background-color: var(--color-card);
  border: 1px solid var(--color-border);
  border-radius: 4px;
  color: var(--color-muted-foreground);
  padding: 5px 12px;
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  transition:
    border-color 0.15s,
    color 0.15s,
    background-color 0.15s;

  &:hover {
    border-color: var(--color-primary);
    color: var(--color-primary);
    background-color: var(--color-secondary);
  }
}

.bili-form-section {
  padding-top: 10px;
}

.form-section-title {
  font-size: 14px;
  font-weight: 700;
  color: var(--color-foreground);
  padding-bottom: 10px;
  border-bottom: 1px solid var(--color-border);
  margin-bottom: 20px;
}

.form-panel-title {
  font-size: 13px;
  font-weight: 700;
  color: var(--color-foreground);
  margin-bottom: 15px;
}

.form-group {
  display: flex;
  margin-bottom: 20px;
  align-items: flex-start;

  &-vertical {
    display: flex;
    flex-direction: column;
    gap: 6px;
    margin-bottom: 16px;
    width: 100%;

    .form-label {
      width: auto;
      padding-top: 0;
      margin-bottom: 0;
    }

    .form-input {
      width: 100%;
      max-width: 100%;
    }
  }
}

.form-label {
  width: 100px;
  font-size: 12px;
  color: var(--color-muted-foreground);
  padding-top: 8px;
  flex-shrink: 0;
}

.form-input {
  flex: 1;
  max-width: 400px;
  border: 1px solid var(--color-border);
  border-radius: 4px;
  padding: 8px 12px;
  font-size: 12px;
  background-color: var(--color-card);
  color: var(--color-foreground);
  outline: none;
  transition:
    border-color 0.15s,
    box-shadow 0.15s;

  &-icon-wrapper {
    position: relative;
    display: flex;
    align-items: center;
    width: 100%;

    .form-input {
      width: 100%;
      max-width: 100%;
    }

    &.has-left-icon .form-input {
      padding-left: 36px;
    }

    &.has-right-icon .form-input {
      padding-right: 36px;
    }
  }

  &:focus {
    border-color: var(--color-primary);
    box-shadow: 0 0 4px var(--color-ring);
  }
}

.form-textarea {
  resize: vertical;
  min-height: 80px;
}

.gender-radio-group {
  display: flex;
  gap: 20px;
  padding-top: 6px;
}

.gender-radio-label {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  cursor: pointer;
  color: var(--color-foreground);
}

.gender-radio-input {
  display: none;

  &:checked + .gender-radio-custom {
    border-color: var(--color-primary);

    &::after {
      content: '';
      position: absolute;
      inset: 3px;
      border-radius: 50%;
      background-color: var(--color-primary);
    }
  }
}

.gender-radio-custom {
  width: 14px;
  height: 14px;
  border-radius: 50%;
  border: 1px solid var(--color-border);
  position: relative;
  transition: border-color 0.15s;
}

.bili-btn-primary {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  background-color: var(--color-primary);
  color: var(--color-primary-foreground);
  padding: 8px 24px;
  border-radius: 4px;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  border: none;
  transition: background-color 0.15s;

  &:hover:not(:disabled) {
    background-color: color-mix(in oklch, var(--color-primary) 85%, white 15%);
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
}

.bili-btn-danger {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  background-color: var(--color-destructive);
  color: var(--color-destructive-foreground);
  padding: 8px 24px;
  border-radius: 4px;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  border: none;
  transition: opacity 0.15s;

  &:hover:not(:disabled) {
    opacity: 0.95;
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
}

.bili-tags-board {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  padding: 15px;
  border: 1px solid var(--color-border);
  background-color: var(--color-secondary);
  border-radius: 4px;
  align-items: center;
}

.bili-tag-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  border: 1px solid var(--color-border);
  background-color: var(--color-card);
  color: var(--color-foreground);
  padding: 4px 10px;
  border-radius: 4px;
  font-size: 11px;
}

.tag-remove-btn {
  border: none;
  background: transparent;
  color: var(--color-muted-foreground);
  cursor: pointer;
  padding: 0;
  line-height: 1;
  font-size: 12px;

  &:hover {
    color: var(--color-foreground);
  }
}

.tag-input-row {
  display: flex;
  gap: 8px;
  margin-left: auto;
}

.tag-input-field {
  border: 1px solid var(--color-border);
  border-radius: 4px 0 0 4px;
  padding: 4px 8px;
  font-size: 11px;
  background-color: var(--color-card);
  color: var(--color-foreground);
  outline: none;
  height: 30px;
  width: 120px;

  &:focus {
    border-color: var(--color-primary);
  }
}

.tag-clear-btn {
  position: absolute;
  right: 8px;
  color: var(--color-muted-foreground);
  background: none;
  border: none;
  font-size: 12px;
  cursor: pointer;
}

.tag-add-btn {
  border: 1px solid var(--color-primary);
  background-color: var(--color-primary);
  color: var(--color-primary-foreground);
  padding: 0 12px;
  border-radius: 0 4px 4px 0;
  font-size: 11px;
  cursor: pointer;
  height: 30px;
  font-weight: 600;

  &:hover {
    background-color: color-mix(in oklch, var(--color-primary) 85%, white 15%);
    border-color: color-mix(in oklch, var(--color-primary) 85%, white 15%);
  }
}

.bili-records-tabs {
  display: flex;
  gap: 5px;
  margin-bottom: 15px;
  border-bottom: 1px solid var(--color-border);
  padding-bottom: 1px;
}

.records-tab-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 16px;
  border: none;
  background: none;
  font-size: 13px;
  font-weight: 500;
  color: var(--color-muted-foreground);
  cursor: pointer;
  position: relative;
  transition: color 0.15s;

  &:hover {
    color: var(--color-primary);
  }

  &.active {
    color: var(--color-primary);
    font-weight: 600;

    &::after {
      content: '';
      position: absolute;
      bottom: -1px;
      left: 0;
      right: 0;
      height: 2px;
      background-color: var(--color-primary);
    }
  }
}

.records-container-box {
  border: 1px solid var(--color-border);
  border-radius: 4px;
  background-color: var(--color-card);
  overflow: hidden;
}

.records-status-placeholder {
  min-height: 220px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--color-muted-foreground);
  font-size: 12px;
}

.records-list-wrapper {
  display: flex;
  flex-direction: column;
}

.record-row-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 20px;
  border-bottom: 1px solid var(--color-border);

  &:last-child {
    border-bottom: none;
  }
}

.record-row-left {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.record-row-top-info {
  display: flex;
  align-items: center;
  gap: 8px;
}

.record-ip-address {
  font-size: 13px;
  font-weight: 600;
  color: var(--color-foreground);
  font-family: monospace;
}

.record-badge-tag {
  border-radius: 2px;
  background-color: var(--color-secondary);
  color: var(--color-muted-foreground);
  padding: 1px 6px;
  font-size: 10px;
  font-weight: 600;
}

.record-row-bottom-info {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
  color: var(--color-muted-foreground);
}

.meta-dot {
  color: var(--color-border);
}

.ua-text {
  max-width: 350px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.record-row-right {
  font-size: 12px;
  color: var(--color-muted-foreground);
  white-space: nowrap;
}

.flex-row-item {
  align-items: center;
}

.record-reason-title {
  font-size: 13px;
  font-weight: 700;
  color: var(--color-foreground);
}

.record-desc-sub {
  font-size: 11px;
  color: var(--color-muted-foreground);
}

.record-row-middle {
  margin-left: auto;
  margin-right: 40px;
}

.delta-badge {
  font-size: 12px;
  font-weight: 700;
  font-family: monospace;

  &.is-positive {
    color: #4caf50;
  }

  &.is-negative {
    color: var(--color-destructive);
  }
}

.records-pager-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 20px;
  background-color: var(--color-secondary);
  border-top: 1px solid var(--color-border);
}

.pager-summary-text {
  font-size: 11px;
  color: var(--color-muted-foreground);
}

.pager-button-group {
  display: flex;
  gap: 6px;
}

.bili-pager-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 6px 10px;
  border: 1px solid var(--color-border);
  border-radius: 4px;
  background-color: var(--color-card);
  color: var(--color-muted-foreground);
  font-size: 11px;
  cursor: pointer;
  transition:
    border-color 0.15s,
    color 0.15s;

  &:hover:not(:disabled) {
    border-color: var(--color-primary);
    color: var(--color-primary);
  }

  &:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }
}

.section-sub-desc {
  font-size: 12px;
  color: var(--color-muted-foreground);
  margin-top: -15px;
  margin-bottom: 20px;
}

.privacy-list-grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: 12px;
  margin-bottom: 25px;
}

.privacy-card-label {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 15px 20px;
  border: 1px solid var(--color-border);
  border-radius: 4px;
  background-color: var(--color-card);
  cursor: pointer;
  transition: border-color 0.15s;

  &:hover {
    border-color: var(--color-primary);
  }
}

.privacy-card-left {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.privacy-card-title {
  font-size: 13px;
  font-weight: 700;
  color: var(--color-foreground);
}

.privacy-card-desc {
  font-size: 11px;
  color: var(--color-muted-foreground);
}

.bili-switch-track {
  position: relative;
  width: 38px;
  height: 20px;
  border-radius: 10px;
  background-color: var(--color-border);
  cursor: pointer;
  transition: background-color 0.2s;
  flex-shrink: 0;

  &.is-active {
    background-color: var(--color-primary);

    .bili-switch-thumb {
      transform: translateX(18px);
    }
  }
}

.bili-switch-thumb {
  position: absolute;
  top: 2px;
  left: 2px;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background-color: #ffffff;
  transition: transform 0.2s;
}

.bili-security-table {
  border: 1px solid var(--color-border);
  border-radius: 4px;
  background-color: var(--color-card);
  margin-bottom: 25px;
}

.sec-row-item {
  display: flex;
  padding: 16px 20px;
  border-bottom: 1px solid var(--color-border);
  font-size: 12px;

  &:last-child {
    border-bottom: none;
  }
}

.sec-label-col {
  width: 120px;
  color: var(--color-muted-foreground);
  flex-shrink: 0;
}

.sec-value-col {
  color: var(--color-foreground);
}

.bili-btn-code {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  padding: 0 12px;
  border-radius: 4px;
  border: 1px solid var(--color-border);
  background-color: var(--color-card);
  color: var(--color-foreground);
  font-size: 11px;
  font-weight: 600;
  cursor: pointer;
  height: 34px;
  transition:
    border-color 0.15s,
    background-color 0.15s;

  &:hover:not(:disabled) {
    border-color: var(--color-primary);
    color: var(--color-primary);
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
}

.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
  border-width: 0;
}

/* Widescreen Banner Container (Height 106px - exactly Bilibili size) */

/* Layout width: 980px */

/* Left Sidebar Menu (width: 150px) */

/* Right Content Main Box (width: 820px) */
@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

@keyframes fade-in {
  from {
    opacity: 0;
  }

  to {
    opacity: 1;
  }
}

/* Overview Card Style */

/* Flat Form Style */

/* Personalized tag board flat */

/* Records List design flat */

/* Privacy Settings grid flat */

/* Bilibili flat Switch track style */

/* Security Table list */

/* Responsive side elements styling */
@media (width <= 900px) {
  .center-body {
    flex-direction: column;
    width: 100%;
    padding: 0 10px;
  }

  .center-side {
    width: 100%;
  }

  .center-main {
    width: 100%;
  }

  .rewards-grid {
    grid-template-columns: 1fr 1fr;
  }

  .reward-card {
    border-bottom: 1px solid var(--color-border);

    &:nth-child(even) {
      border-right: none;
    }
  }

  .reward-card:nth-child(3),
  .reward-card:nth-child(4) {
    border-bottom: none;
  }
}
</style>
