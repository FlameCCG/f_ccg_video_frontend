<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import {
  getCurrentUserInfo,
  updateUserInfo,
  getUserConfig,
  updateUserConfig,
  changePassword,
  type UserInfo,
  type UserConfig,
  type UpdateUserInfoParams,
  type UpdateUserConfigParams,
} from '@/api/user'
import { uploadImage, type ImageUploadResult } from '@/api/upload'
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
} from 'lucide-vue-next'

const router = useRouter()
const authStore = useAuthStore()

type SideTab = 'profile' | 'privacy' | 'security'
const activeTab = ref<SideTab>('profile')

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
  { key: 'privacy', label: '隐私设置', icon: ShieldCheck },
  { key: 'security', label: '账号安全', icon: Lock },
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
              <img :src="userInfo.avatar" :alt="userInfo.username" class="ov-avatar" />
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

        <!-- Privacy -->
        <section v-else-if="activeTab === 'privacy' && userConfig" class="sec-anim">
          <h3 class="form-title">隐私设置</h3>
          <p class="form-sub">控制其他用户可以看到的个人信息</p>
          <div class="priv-list">
            <div class="priv-row">
              <div>
                <strong>公开收藏</strong>
                <p>其他人可以看到你的收藏夹</p>
              </div>
              <label class="sw"
                ><input v-model="userConfig.openCollect" type="checkbox" /><span></span
              ></label>
            </div>
            <div class="priv-row">
              <div>
                <strong>公开粉丝列表</strong>
                <p>其他人可以看到你的粉丝</p>
              </div>
              <label class="sw"
                ><input v-model="userConfig.openFans" type="checkbox" /><span></span
              ></label>
            </div>
            <div class="priv-row">
              <div>
                <strong>公开关注列表</strong>
                <p>其他人可以看到你的关注</p>
              </div>
              <label class="sw"
                ><input v-model="userConfig.openFollow" type="checkbox" /><span></span
              ></label>
            </div>
            <div class="priv-row">
              <div>
                <strong>公开点赞视频</strong>
                <p>其他人可以看到你点赞的视频</p>
              </div>
              <label class="sw"
                ><input v-model="userConfig.openLikeVideo" type="checkbox" /><span></span
              ></label>
            </div>
            <div class="priv-row">
              <div>
                <strong>公开投币视频</strong>
                <p>其他人可以看到你投币的视频</p>
              </div>
              <label class="sw"
                ><input v-model="userConfig.openCoinVideo" type="checkbox" /><span></span
              ></label>
            </div>
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
              <span>注册来源</span><span>{{ userInfo?.registerSource || '邮箱注册' }}</span>
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
  background: #f5f5f5;
  min-height: calc(100vh - 56px);
}

/* Banner */
.center-banner {
  height: 80px;
  background: linear-gradient(135deg, #00a1d6, #00d4ff);
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
  background: #fff;
  border-radius: 8px;
  padding: 16px 0;
}

.side-header {
  font-size: 15px;
  font-weight: 600;
  color: #18191c;
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
  color: #61666d;
  cursor: pointer;
  border: none;
  background: none;
  text-align: left;
  transition: all 0.12s;
}

.side-item:hover {
  background: #f6f7f8;
  color: #18191c;
}

.side-item.active {
  background: rgb(0 161 214 / 0.08);
  color: #00a1d6;
  font-weight: 600;
}

/* Main */
.center-main {
  flex: 1;
  min-width: 0;
  background: #fff;
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
  border: 3px solid #e3e5e7;
  border-top-color: #00a1d6;
  border-radius: 50%;
  animation: spin 0.6s linear infinite;
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
  background: #f6f7f8;
  margin-bottom: 28px;
}

.ov-avatar-wrap {
  position: relative;
  flex-shrink: 0;
}

.ov-avatar {
  width: 60px;
  height: 60px;
  border-radius: 50%;
  object-fit: cover;
  border: 2px solid #fff;
  box-shadow: 0 1px 6px rgb(0 0 0 / 0.1);
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
  color: #fff;
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
  color: #18191c;
}

.lv {
  display: inline-block;
  padding: 1px 6px;
  border-radius: 3px;
  font-size: 10px;
  font-weight: 800;
  color: #fff;
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
  background: #e3e5e7;
  overflow: hidden;
}

.exp-fill {
  height: 100%;
  border-radius: 3px;
  background: linear-gradient(90deg, #00a1d6, #00d4ff);
  transition: width 0.4s;
}

.exp-txt {
  font-size: 11px;
  color: #9499a0;
}

.ov-meta {
  display: flex;
  gap: 14px;
  font-size: 12px;
  color: #9499a0;
}

.ov-space-btn {
  flex-shrink: 0;
  padding: 6px 14px;
  border-radius: 6px;
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  border: 1px solid #e3e5e7;
  background: #fff;
  color: #61666d;
  transition: all 0.12s;
}

.ov-space-btn:hover {
  border-color: #00a1d6;
  color: #00a1d6;
}

/* Form */
.form-block {
  margin-top: 4px;
}

.form-title {
  font-size: 15px;
  font-weight: 600;
  color: #18191c;
  margin-bottom: 16px;
}

.form-sub {
  font-size: 12px;
  color: #9499a0;
  margin: -8px 0 16px;
}

.fg {
  margin-bottom: 16px;
}

.fl {
  display: block;
  font-size: 12px;
  font-weight: 600;
  color: #18191c;
  margin-bottom: 6px;
}

.fi {
  width: 100%;
  padding: 8px 12px;
  border: 1px solid #e3e5e7;
  border-radius: 6px;
  font-size: 13px;
  background: #fff;
  color: #18191c;
  outline: none;
  transition:
    border-color 0.12s,
    box-shadow 0.12s;
}

.fi:focus {
  border-color: #00a1d6;
  box-shadow: 0 0 0 2px rgb(0 161 214 / 0.1);
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
  color: #9499a0;
  padding: 2px;
}

.fi-icon:hover {
  color: #61666d;
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
  color: #18191c;
}

.ri {
  display: none;
}

.rc {
  width: 16px;
  height: 16px;
  border-radius: 50%;
  border: 2px solid #e3e5e7;
  position: relative;
  transition: border-color 0.12s;
}

.ri:checked + .rc {
  border-color: #00a1d6;
}

.ri:checked + .rc::after {
  content: '';
  position: absolute;
  inset: 3px;
  border-radius: 50%;
  background: #00a1d6;
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
  background: #00a1d6;
  color: #fff;
  transition: all 0.12s;
  margin-top: 8px;
}

.btn-pri:hover:not(:disabled) {
  background: #00b5e5;
}

.btn-pri:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn-danger {
  background: #f25d8e;
}

.btn-danger:hover:not(:disabled) {
  background: #e04676;
}

/* Privacy */
.priv-list {
  display: flex;
  flex-direction: column;
}

.priv-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 0;
  border-bottom: 1px solid #f1f2f3;
}

.priv-row:last-child {
  border-bottom: none;
}

.priv-row strong {
  font-size: 13px;
  font-weight: 600;
  color: #18191c;
}

.priv-row p {
  font-size: 11px;
  color: #9499a0;
  margin-top: 2px;
}

/* Switch */
.sw {
  position: relative;
  display: inline-block;
  width: 40px;
  height: 22px;
  cursor: pointer;
  flex-shrink: 0;
}

.sw input {
  opacity: 0;
  width: 0;
  height: 0;
}

.sw span {
  position: absolute;
  inset: 0;
  background: #e3e5e7;
  border-radius: 11px;
  transition: background 0.2s;
}

.sw span::before {
  content: '';
  position: absolute;
  width: 16px;
  height: 16px;
  left: 3px;
  bottom: 3px;
  background: #fff;
  border-radius: 50%;
  box-shadow: 0 1px 2px rgb(0 0 0 / 0.12);
  transition: transform 0.2s;
}

.sw input:checked + span {
  background: #00a1d6;
}

.sw input:checked + span::before {
  transform: translateX(18px);
}

/* Security */
.sec-info {
  background: #f6f7f8;
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
  border-bottom: 1px solid #eee;
}

.sec-row span:first-child {
  color: #9499a0;
}

.sec-row span:last-child {
  color: #18191c;
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
</style>
