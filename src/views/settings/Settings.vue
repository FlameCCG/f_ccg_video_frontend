<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import {
  getCurrentUserInfo,
  updateUserInfo,
  getUserConfig,
  updateUserConfig,
  changePassword,
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
import { uploadImage, type ImageUploadResult } from '@/api/upload'
import AppAvatar from '@/components/common/AppAvatar.vue'
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
} from 'lucide-vue-next'

const router = useRouter()
const authStore = useAuthStore()

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
const avatarUploading = ref(false)

const oldPassword = ref('')
const newPassword = ref('')
const confirmPassword = ref('')
const showOldPwd = ref(false)
const showNewPwd = ref(false)
const changingPwd = ref(false)

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

const levelColor = (level: number): string => {
  if (level >= 6) return '#ff6699'
  if (level >= 4) return '#ffb636'
  if (level >= 2) return '#7bcfa6'
  return '#c0c0c0'
}

const expPct = computed(() => {
  if (!userInfo.value) return 0
  const thresholds = [0, 200, 1500, 4500, 10800, 28800, 100000]
  const lv = userInfo.value.level
  const exp = userInfo.value.exp
  if (lv >= 6) return 100
  const cur = thresholds[lv] ?? 0
  const next = thresholds[lv + 1] ?? cur
  if (next === cur) return 100
  return Math.min(100, Math.round(((exp - cur) / (next - cur)) * 100))
})

const expNext = computed(() => {
  if (!userInfo.value) return 0
  const thresholds = [0, 200, 1500, 4500, 10800, 28800, 100000]
  const lv = userInfo.value.level
  return thresholds[lv + 1] ?? thresholds[6]!
})

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

const fetchData = async () => {
  loading.value = true
  try {
    const [info, config] = await Promise.all([getCurrentUserInfo(), getUserConfig()])
    userInfo.value = info
    userConfig.value = config
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

const handleChangePwd = async () => {
  if (!newPassword.value || !oldPassword.value) {
    toast.warning('请填写完整')
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
    await changePassword({ oldPassword: oldPassword.value, newPassword: newPassword.value })
    toast.success('密码修改成功，请重新登录')
    authStore.logout()
    void router.push('/')
  } catch {
    toast.error('密码修改失败')
  } finally {
    changingPwd.value = false
  }
}

onMounted(fetchData)

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
    <!-- Bilibili header banner -->
    <div class="center-banner">
      <img src="/logo.png" alt="bilibili" class="center-logo" />
    </div>

    <div class="center-body">
      <!-- Left sidebar -->
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
            <component :is="item.icon" :size="16" />
            {{ item.label }}
          </button>
          <button class="side-item" @click="router.push(`/user/${authStore.userId}`)">
            <ExternalLink :size="16" />
            个人空间
          </button>
        </nav>
      </aside>

      <!-- Main content -->
      <main class="center-main">
        <div v-if="loading" class="center-loading">
          <div class="spinner"></div>
        </div>

        <!-- Profile -->
        <section v-else-if="activeTab === 'profile' && userInfo" class="sec-anim">
          <!-- Overview card -->
          <div class="ov-card">
            <div class="ov-avatar-wrap">
              <AppAvatar
                :src="userInfo.avatar"
                :name="userInfo.username"
                :alt="userInfo.username"
                container-class="ov-avatar"
                text-class="text-xl font-bold"
              />
              <label class="ov-avatar-mask">
                <Camera :size="18" />
                <span>{{ avatarUploading ? '上传中' : '更换' }}</span>
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
                <h3>{{ userInfo.username }}</h3>
                <span class="lv" :style="{ background: levelColor(userInfo.level) }">
                  Lv{{ userInfo.level }}
                </span>
              </div>
              <div class="ov-exp">
                <div class="exp-track">
                  <div class="exp-fill" :style="{ width: `${expPct}%` }"></div>
                </div>
                <span class="exp-txt">{{ userInfo.exp }} / {{ expNext }}</span>
              </div>
              <div class="ov-meta">
                <span>硬币: {{ userInfo.coinCount }}</span>
                <span>UID: {{ userInfo.id }}</span>
              </div>
            </div>
            <button class="ov-space-btn" @click="router.push(`/user/${authStore.userId}`)">
              个人空间 &gt;
            </button>
          </div>

          <!-- Form -->
          <div class="form-block">
            <h3 class="form-title">基本信息</h3>
            <div class="fg">
              <label class="fl">用户名</label>
              <input v-model="formUsername" type="text" class="fi" placeholder="用户名" />
            </div>
            <div class="fg">
              <label class="fl">个性签名</label>
              <textarea
                v-model="formDescription"
                class="fi fi-area"
                placeholder="编辑个性签名..."
                rows="3"
              ></textarea>
            </div>
            <div class="fg">
              <label class="fl">性别</label>
              <div class="radio-row">
                <label v-for="g in genderOptions" :key="g.value" class="rl">
                  <input v-model="formGender" type="radio" :value="g.value" class="ri" />
                  <span class="rc"></span>
                  {{ g.label }}
                </label>
              </div>
            </div>
            <div class="fg">
              <label class="fl">生日</label>
              <input v-model="formBirthday" type="date" class="fi" />
            </div>
            <button class="btn-pri" :disabled="saving" @click="handleSaveProfile">
              <Save :size="14" /> {{ saving ? '保存中...' : '保存修改' }}
            </button>
          </div>
        </section>

        <!-- Records -->
        <section v-else-if="activeTab === 'records'" class="sec-anim">
          <h3 class="form-title">记录中心</h3>
          <p class="form-sub">查看最近登录轨迹、经验变化与硬币流水</p>

          <div class="record-tabs">
            <button
              v-for="item in recordTabs"
              :key="item.key"
              class="record-tab"
              :class="{ active: activeRecordTab === item.key }"
              @click="switchRecordTab(item.key)"
            >
              <component :is="item.icon" :size="14" />
              {{ item.label }}
            </button>
          </div>

          <div class="record-panel">
            <div v-if="currentRecordLoading" class="record-loading">
              <div class="spinner small"></div>
            </div>

            <template v-else-if="activeRecordTab === 'login'">
              <div v-if="loginRecords.length" class="record-list">
                <div v-for="item in loginRecords" :key="item.id" class="record-item">
                  <div class="record-main">
                    <div class="record-title-row">
                      <strong>{{ item.ip }}</strong>
                      <span class="record-tag">{{ formatLoginType(item.loginType) }}</span>
                    </div>
                    <p class="record-sub">{{ item.addr || '未知归属地' }}</p>
                    <p class="record-sub record-ua">{{ item.userAgent || '未知设备' }}</p>
                  </div>
                  <div class="record-time">{{ formatDateTime(item.createdAt) }}</div>
                </div>
              </div>
              <div v-else class="record-empty">{{ currentRecordEmptyText }}</div>
            </template>

            <template v-else>
              <div v-if="currentDeltaRecords.length" class="record-list">
                <div
                  v-for="item in currentDeltaRecords"
                  :key="item.id"
                  class="record-item record-item-compact"
                >
                  <div class="record-main">
                    <div class="record-title-row">
                      <strong>{{ item.reason || '系统变更' }}</strong>
                      <span
                        class="record-delta"
                        :class="(item.delta ?? 0) >= 0 ? 'is-positive' : 'is-negative'"
                      >
                        {{ (item.delta ?? 0) >= 0 ? '+' : '' }}{{ item.delta }}
                      </span>
                    </div>
                    <p class="record-sub">
                      {{ activeRecordTab === 'exp' ? '经验值变动' : '硬币余额变动' }}
                    </p>
                  </div>
                  <div class="record-time">{{ formatDateTime(item.createdAt) }}</div>
                </div>
              </div>
              <div v-else class="record-empty">{{ currentRecordEmptyText }}</div>
            </template>

            <div class="record-footer">
              <span class="record-summary">
                第 {{ currentRecordPage }} / {{ currentRecordTotalPages }} 页，共
                {{ currentRecordTotal }} 条
              </span>
              <div class="record-pager">
                <button
                  class="pager-btn"
                  :disabled="currentRecordPage <= 1 || currentRecordLoading"
                  @click="changeRecordPage(-1)"
                >
                  <ChevronLeft :size="14" />
                  上一页
                </button>
                <button
                  class="pager-btn"
                  :disabled="currentRecordPage >= currentRecordTotalPages || currentRecordLoading"
                  @click="changeRecordPage(1)"
                >
                  下一页
                  <ChevronRight :size="14" />
                </button>
              </div>
            </div>
          </div>
        </section>

        <!-- Privacy -->
        <section v-else-if="activeTab === 'privacy' && userConfig" class="sec-anim">
          <h3 class="form-title">隐私设置</h3>
          <p class="form-sub">控制其他用户可以看到的个人信息</p>
          <div class="priv-grid">
            <label class="priv-card">
              <div class="priv-card-info">
                <strong>公开收藏</strong>
                <span>其他人可以看到你的收藏夹</span>
              </div>
              <div
                class="relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full transition-colors duration-200"
                :class="
                  userConfig.openCollect
                    ? 'bg-[var(--color-primary)]'
                    : 'bg-black/10 dark:bg-white/15'
                "
              >
                <input v-model="userConfig.openCollect" type="checkbox" class="sr-only" />
                <span
                  class="pointer-events-none block h-4 w-4 rounded-full bg-white shadow-sm ring-0 transition-transform duration-200"
                  :class="userConfig.openCollect ? 'translate-x-[18px]' : 'translate-x-[2px]'"
                ></span>
              </div>
            </label>
            <label class="priv-card">
              <div class="priv-card-info">
                <strong>公开粉丝列表</strong>
                <span>其他人可以看到你的粉丝</span>
              </div>
              <div
                class="relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full transition-colors duration-200"
                :class="
                  userConfig.openFans ? 'bg-[var(--color-primary)]' : 'bg-black/10 dark:bg-white/15'
                "
              >
                <input v-model="userConfig.openFans" type="checkbox" class="sr-only" />
                <span
                  class="pointer-events-none block h-4 w-4 rounded-full bg-white shadow-sm ring-0 transition-transform duration-200"
                  :class="userConfig.openFans ? 'translate-x-[18px]' : 'translate-x-[2px]'"
                ></span>
              </div>
            </label>
            <label class="priv-card">
              <div class="priv-card-info">
                <strong>公开关注列表</strong>
                <span>其他人可以看到你的关注</span>
              </div>
              <div
                class="relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full transition-colors duration-200"
                :class="
                  userConfig.openFollow
                    ? 'bg-[var(--color-primary)]'
                    : 'bg-black/10 dark:bg-white/15'
                "
              >
                <input v-model="userConfig.openFollow" type="checkbox" class="sr-only" />
                <span
                  class="pointer-events-none block h-4 w-4 rounded-full bg-white shadow-sm ring-0 transition-transform duration-200"
                  :class="userConfig.openFollow ? 'translate-x-[18px]' : 'translate-x-[2px]'"
                ></span>
              </div>
            </label>
            <label class="priv-card">
              <div class="priv-card-info">
                <strong>公开点赞视频</strong>
                <span>其他人可以看到你点赞的视频</span>
              </div>
              <div
                class="relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full transition-colors duration-200"
                :class="
                  userConfig.openLikeVideo
                    ? 'bg-[var(--color-primary)]'
                    : 'bg-black/10 dark:bg-white/15'
                "
              >
                <input v-model="userConfig.openLikeVideo" type="checkbox" class="sr-only" />
                <span
                  class="pointer-events-none block h-4 w-4 rounded-full bg-white shadow-sm ring-0 transition-transform duration-200"
                  :class="userConfig.openLikeVideo ? 'translate-x-[18px]' : 'translate-x-[2px]'"
                ></span>
              </div>
            </label>
            <label class="priv-card">
              <div class="priv-card-info">
                <strong>公开投币视频</strong>
                <span>其他人可以看到你投币的视频</span>
              </div>
              <div
                class="relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full transition-colors duration-200"
                :class="
                  userConfig.openCoinVideo
                    ? 'bg-[var(--color-primary)]'
                    : 'bg-black/10 dark:bg-white/15'
                "
              >
                <input v-model="userConfig.openCoinVideo" type="checkbox" class="sr-only" />
                <span
                  class="pointer-events-none block h-4 w-4 rounded-full bg-white shadow-sm ring-0 transition-transform duration-200"
                  :class="userConfig.openCoinVideo ? 'translate-x-[18px]' : 'translate-x-[2px]'"
                ></span>
              </div>
            </label>
          </div>
          <button class="btn-pri" :disabled="saving" @click="handleSavePrivacy">
            <Save :size="14" /> {{ saving ? '保存中...' : '保存设置' }}
          </button>
        </section>

        <!-- Security -->
        <section v-else-if="activeTab === 'security'" class="sec-anim">
          <h3 class="form-title">账号安全</h3>
          <div class="sec-info">
            <div class="sec-row">
              <span>邮箱</span><span>{{ userInfo?.email || '未绑定' }}</span>
            </div>
            <div class="sec-row">
              <span>注册来源</span><span>{{ formatRegisterSource(userInfo?.registerSource) }}</span>
            </div>
          </div>

          <h3 class="form-title" style="margin-top: 28px">修改密码</h3>
          <div class="fg">
            <label class="fl">当前密码</label>
            <div class="fi-wrap">
              <input
                v-model="oldPassword"
                :type="showOldPwd ? 'text' : 'password'"
                class="fi"
                placeholder="请输入当前密码"
              />
              <button class="fi-icon" @click="showOldPwd = !showOldPwd">
                <component :is="showOldPwd ? EyeOff : Eye" :size="15" />
              </button>
            </div>
          </div>
          <div class="fg">
            <label class="fl">新密码</label>
            <div class="fi-wrap">
              <input
                v-model="newPassword"
                :type="showNewPwd ? 'text' : 'password'"
                class="fi"
                placeholder="请输入新密码（至少6位）"
              />
              <button class="fi-icon" @click="showNewPwd = !showNewPwd">
                <component :is="showNewPwd ? EyeOff : Eye" :size="15" />
              </button>
            </div>
          </div>
          <div class="fg">
            <label class="fl">确认新密码</label>
            <input
              v-model="confirmPassword"
              type="password"
              class="fi"
              placeholder="请再次输入新密码"
            />
          </div>
          <button class="btn-pri btn-danger" :disabled="changingPwd" @click="handleChangePwd">
            <Lock :size="14" /> {{ changingPwd ? '修改中...' : '修改密码' }}
          </button>
        </section>
      </main>
    </div>
  </div>
</template>

<style scoped>
.center-page {
  background: var(--color-secondary);
  min-height: calc(100vh - 56px);
}

/* Banner */
.center-banner {
  height: 80px;
  background: linear-gradient(135deg, var(--color-primary), oklch(var(--primary) / 0.8));
  display: flex;
  align-items: center;
  justify-content: center;
}

.center-logo {
  height: 40px;
  filter: brightness(0) invert(1);
  opacity: 0.8;
}

/* Body */
.center-body {
  max-width: 1000px;
  margin: -20px auto 0;
  padding: 0 20px 40px;
  display: flex;
  gap: 16px;
  position: relative;
  z-index: 1;
}

/* Sidebar */
.center-side {
  width: 200px;
  flex-shrink: 0;
  background-color: var(--color-card);
  border-radius: 8px;
  padding: 16px 0;
}

.side-header {
  font-size: 15px;
  font-weight: 600;
  color: var(--color-foreground);
  padding: 0 16px 12px;
}

.side-nav {
  display: flex;
  flex-direction: column;
  gap: 1px;
}

.side-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 16px;
  font-size: 13px;
  font-weight: 500;
  color: var(--color-muted-foreground);
  cursor: pointer;
  border: none;
  background: none;
  text-align: left;
  transition: all 0.12s;
}

.side-item:hover {
  background-color: var(--color-secondary);
  color: var(--color-foreground);
}

.side-item.active {
  background: oklch(var(--primary) / 0.08);
  color: var(--color-primary);
  font-weight: 600;
}

/* Main */
.center-main {
  flex: 1;
  min-width: 0;
  background-color: var(--color-card);
  border-radius: 8px;
  padding: 24px;
}

.center-loading {
  display: flex;
  justify-content: center;
  align-items: center;
  min-height: 300px;
}

.spinner {
  width: 30px;
  height: 30px;
  border: 3px solid var(--color-border);
  border-top-color: var(--color-primary);
  border-radius: 50%;
  animation: spin 0.6s linear infinite;
}

.spinner.small {
  width: 22px;
  height: 22px;
  border-width: 2px;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

.sec-anim {
  animation: fade-up 0.2s ease;
}

@keyframes fade-up {
  from {
    opacity: 0;
    transform: translateY(6px);
  }

  to {
    opacity: 1;
    transform: translateY(0);
  }
}

/* Overview card */
.ov-card {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 20px;
  border-radius: 10px;
  background-color: var(--color-secondary);
  margin-bottom: 28px;
}

.ov-avatar-wrap {
  position: relative;
  flex-shrink: 0;
}

.ov-avatar {
  width: 60px;
  height: 60px;
  border: 2px solid var(--color-card);
  box-shadow: var(--shadow-raised);
}

.ov-avatar-mask {
  position: absolute;
  inset: 0;
  border-radius: 50%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 1px;
  background: rgb(0 0 0 / 0.45);
  color: var(--color-primary-foreground);
  font-size: 10px;
  cursor: pointer;
  opacity: 0;
  transition: opacity 0.15s;
}

.ov-avatar-mask:hover {
  opacity: 1;
}

.ov-info {
  flex: 1;
  min-width: 0;
}

.ov-name-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.ov-name-row h3 {
  font-size: 16px;
  font-weight: 700;
  color: var(--color-foreground);
}

.lv {
  display: inline-block;
  padding: 1px 6px;
  border-radius: 3px;
  font-size: 10px;
  font-weight: 800;
  color: var(--color-primary-foreground);
}

.ov-exp {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 6px 0 4px;
}

.exp-track {
  width: 160px;
  height: 5px;
  border-radius: 3px;
  background-color: var(--color-secondary);
  overflow: hidden;
}

.exp-fill {
  height: 100%;
  border-radius: 3px;
  background: linear-gradient(90deg, var(--color-primary), oklch(var(--primary) / 0.8));
  transition: width 0.4s;
}

.exp-txt {
  font-size: 11px;
  color: var(--color-muted-foreground);
}

.ov-meta {
  display: flex;
  gap: 14px;
  font-size: 12px;
  color: var(--color-muted-foreground);
}

.ov-space-btn {
  flex-shrink: 0;
  padding: 6px 14px;
  border-radius: 6px;
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  border: 1px solid var(--color-border);
  background-color: var(--color-card);
  color: var(--color-muted-foreground);
  transition: all 0.12s;
}

.ov-space-btn:hover {
  border-color: var(--color-primary);
  color: var(--color-primary);
}

/* Records */
.record-tabs {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 16px;
}

.record-tab {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  border: 1px solid var(--color-border);
  background-color: var(--color-card);
  color: var(--color-muted-foreground);
  padding: 8px 12px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  transition:
    border-color 0.12s,
    color 0.12s,
    background 0.12s;
}

.record-tab:hover {
  border-color: var(--color-primary);
  color: var(--color-primary);
}

.record-tab.active {
  background: oklch(var(--primary) / 0.08);
  border-color: oklch(var(--primary) / 0.18);
  color: var(--color-primary);
}

.record-panel {
  border: 1px solid var(--color-border);
  border-radius: 10px;
  background: linear-gradient(180deg, var(--color-secondary) 0%, var(--color-card) 100%);
  overflow: hidden;
}

.record-loading,
.record-empty {
  min-height: 220px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--color-muted-foreground);
  font-size: 13px;
}

.record-list {
  display: flex;
  flex-direction: column;
}

.record-item {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  padding: 16px 18px;
  border-bottom: 1px solid var(--color-border);
}

.record-item:last-child {
  border-bottom: none;
}

.record-item-compact {
  align-items: center;
}

.record-main {
  min-width: 0;
  flex: 1;
}

.record-title-row {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.record-title-row strong {
  min-width: 0;
  font-size: 13px;
  color: var(--color-foreground);
}

.record-tag {
  flex-shrink: 0;
  border-radius: 999px;
  background-color: var(--color-secondary);
  color: var(--color-muted-foreground);
  padding: 2px 8px;
  font-size: 11px;
  font-weight: 600;
}

.record-sub {
  margin-top: 4px;
  font-size: 12px;
  color: var(--color-muted-foreground);
}

.record-ua {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.record-delta {
  flex-shrink: 0;
  font-size: 13px;
  font-weight: 700;
}

.record-delta.is-positive {
  color: var(--color-primary);
}

.record-delta.is-negative {
  color: var(--color-accent);
}

.record-time {
  flex-shrink: 0;
  font-size: 12px;
  color: var(--color-muted-foreground);
  white-space: nowrap;
}

.record-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 14px 18px;
  background: var(--color-secondary);
  border-top: 1px solid var(--color-border);
}

.record-summary {
  font-size: 12px;
  color: var(--color-muted-foreground);
}

.record-pager {
  display: flex;
  gap: 8px;
}

.pager-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 7px 10px;
  border: 1px solid var(--color-border);
  border-radius: 8px;
  background-color: var(--color-card);
  color: var(--color-muted-foreground);
  font-size: 12px;
  cursor: pointer;
  transition:
    border-color 0.12s,
    color 0.12s,
    background 0.12s;
}

.pager-btn:hover:not(:disabled) {
  border-color: var(--color-primary);
  color: var(--color-primary);
}

.pager-btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

/* Form */
.form-block {
  margin-top: 4px;
}

.form-title {
  font-size: 15px;
  font-weight: 600;
  color: var(--color-foreground);
  margin-bottom: 16px;
}

.form-sub {
  font-size: 12px;
  color: var(--color-muted-foreground);
  margin: -8px 0 16px;
}

.fg {
  margin-bottom: 16px;
}

.fl {
  display: block;
  font-size: 12px;
  font-weight: 600;
  color: var(--color-foreground);
  margin-bottom: 6px;
}

.fi {
  width: 100%;
  padding: 8px 12px;
  border: 1px solid var(--color-border);
  border-radius: 6px;
  font-size: 13px;
  background-color: var(--color-card);
  color: var(--color-foreground);
  outline: none;
  transition:
    border-color 0.12s,
    box-shadow 0.12s;
}

.fi:focus {
  border-color: var(--color-primary);
  box-shadow: 0 0 0 2px oklch(var(--primary) / 0.1);
}

.fi-area {
  resize: vertical;
  font-family: inherit;
}

.fi-wrap {
  position: relative;
}

.fi-wrap .fi {
  padding-right: 36px;
}

.fi-icon {
  position: absolute;
  right: 8px;
  top: 50%;
  transform: translateY(-50%);
  border: none;
  background: none;
  cursor: pointer;
  color: var(--color-muted-foreground);
  padding: 2px;
}

.fi-icon:hover {
  color: var(--color-muted-foreground);
}

.radio-row {
  display: flex;
  gap: 20px;
}

.rl {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  cursor: pointer;
  color: var(--color-foreground);
}

.ri {
  display: none;
}

.rc {
  width: 16px;
  height: 16px;
  border-radius: 50%;
  border: 2px solid var(--color-border);
  position: relative;
  transition: border-color 0.12s;
}

.ri:checked + .rc {
  border-color: var(--color-primary);
}

.ri:checked + .rc::after {
  content: '';
  position: absolute;
  inset: 3px;
  border-radius: 50%;
  background-color: var(--color-primary);
}

.btn-pri {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 24px;
  border-radius: 6px;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  border: none;
  background-color: var(--color-primary);
  color: var(--color-primary-foreground);
  transition: all 0.12s;
  margin-top: 8px;
}

.btn-pri:hover:not(:disabled) {
  background-color: var(--color-primary);
}

.btn-pri:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn-danger {
  background: var(--color-accent);
}

.btn-danger:hover:not(:disabled) {
  background: oklch(from var(--color-accent) calc(l - 0.08) c h);
}

/* Privacy */
.priv-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 10px;
  margin-bottom: 20px;
}

.priv-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 14px 16px;
  border: 1px solid var(--color-border);
  border-radius: 10px;
  background-color: var(--color-secondary);
  cursor: pointer;
  transition: border-color 0.15s;
}

.priv-card:hover {
  border-color: var(--color-primary);
}

.priv-card-info {
  display: flex;
  flex-direction: column;
  gap: 3px;
  min-width: 0;
}

.priv-card-info strong {
  font-size: 13px;
  font-weight: 600;
  color: var(--color-foreground);
}

.priv-card-info span {
  font-size: 11px;
  color: var(--color-muted-foreground);
}

@media (width <= 600px) {
  .priv-grid {
    grid-template-columns: 1fr;
  }
}

/* Security */
.sec-info {
  background-color: var(--color-secondary);
  border-radius: 8px;
  padding: 14px 16px;
  margin-bottom: 8px;
}

.sec-row {
  display: flex;
  justify-content: space-between;
  padding: 8px 0;
  font-size: 13px;
}

.sec-row:not(:last-child) {
  border-bottom: 1px solid var(--color-border);
}

.sec-row span:first-child {
  color: var(--color-muted-foreground);
}

.sec-row span:last-child {
  color: var(--color-foreground);
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

@media (width <= 900px) {
  .center-body {
    flex-direction: column;
  }

  .center-side {
    width: 100%;
  }

  .center-main {
    padding: 18px;
  }

  .ov-card {
    flex-wrap: wrap;
  }

  .ov-space-btn {
    width: 100%;
    justify-content: center;
  }

  .record-item,
  .record-footer {
    flex-direction: column;
    align-items: flex-start;
  }

  .record-time,
  .record-summary {
    white-space: normal;
  }

  .record-pager {
    width: 100%;
  }

  .pager-btn {
    flex: 1;
    justify-content: center;
  }
}
</style>
