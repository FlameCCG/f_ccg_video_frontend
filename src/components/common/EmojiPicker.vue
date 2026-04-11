<script setup lang="ts">
import { ref } from 'vue'

const activeTab = ref<'emoji' | 'sticker'>('emoji')
const emojis = [
  '😀',
  '😃',
  '😄',
  '😁',
  '😆',
  '😅',
  '😂',
  '🤣',
  '😊',
  '😇',
  '🙂',
  '🙃',
  '😉',
  '😌',
  '😍',
  '🥰',
  '😘',
  '😗',
  '😙',
  '😚',
  '😋',
  '😛',
  '😝',
  '😜',
  '🤪',
  '🤨',
  '🧐',
  '🤓',
  '😎',
  '🤩',
  '🥳',
  '😏',
  '😒',
  '😞',
  '😔',
  '😟',
  '😕',
  '🙁',
  '☹️',
  '😣',
  '😖',
  '😫',
  '😩',
  '🥺',
  '😢',
  '😭',
  '😤',
  '😠',
  '😡',
  '🤬',
  '🤯',
  '😳',
  '🥵',
  '🥶',
  '😱',
  '😨',
  '😰',
  '😥',
  '😓',
  '🤔',
  '🤗',
  '🤭',
  '🤫',
  '🤥',
  '😶',
  '😐',
  '😑',
  '😬',
  '🙄',
  '😯',
  '😦',
  '😧',
  '😮',
  '😲',
  '🥱',
  '😴',
  '🤤',
  '😪',
  '😵',
  '🤐',
  '🥴',
  '🤢',
  '🤮',
  '🤧',
  '😷',
  '🤒',
  '🤕',
  '🤑',
  '🤠',
  '😈',
  '👿',
  '👹',
  '👺',
  '🤡',
  '💩',
  '👻',
  '💀',
  '☠️',
  '👽',
  '👾',
  '🤖',
  '🎃',
  '😺',
  '😸',
  '😹',
  '😻',
  '😼',
  '😽',
  '🙀',
  '😿',
  '😾',
  '👋',
  '🤚',
  '🖐',
  '✋',
  '🖖',
  '👌',
  '🤏',
  '✌️',
  '🤞',
  '🤟',
  '🤘',
  '🤙',
  '👈',
  '👉',
  '👆',
  '🖕',
  '👇',
  '☝️',
  '👍',
  '👎',
  '✊',
  '👊',
  '🤛',
  '🤜',
  '👏',
  '🙌',
  '👐',
  '🤲',
  '🤝',
  '🙏',
  '✍️',
  '💅',
  '🤳',
  '💪',
  '🦾',
  '🦿',
  '🦵',
  '🦶',
  '👂',
  '🦻',
  '👃',
  '🧠',
  '🦷',
  '🦴',
  '👀',
  '👁',
  '👅',
  '👄',
  '💋',
]

const stickers = [
  'bili_emoji_10.png',
  'bili_emoji_19.png',
  'bili_emoji_20.png',
  'bili_emoji_21.png',
  'bili_emoji_22.png',
  'bili_emoji_43.png',
  'bili_emoji_44.png',
  'bili_emoji_45.png',
  'bili_emoji_46.png',
  'bili_emoji_47.png',
  'bili_emoji_48.png',
  'bili_emoji_49.png',
  'bili_emoji_50.png',
  'bili_emoji_7.png',
  'bili_emoji_8.png',
  'bili_emoji_9.png',
  'mujica夜愿华章表情包_呐喊.png',
  'mujica夜愿华章表情包_唱歌.png',
  'mujica夜愿华章表情包_害羞.png',
  'mujica夜愿华章表情包_小祥.png',
  'mujica夜愿华章表情包_思考.png',
  'mujica夜愿华章表情包_抱抱.png',
  'mujica夜愿华章表情包_接电话.png',
  'mujica夜愿华章表情包_撩发.png',
  'mujica夜愿华章表情包_是秘密哦.png',
  'mujica夜愿华章表情包_没收.png',
  'mujica夜愿华章表情包_点赞.png',
  'mujica夜愿华章表情包_雨天.png',
  '千恋万花动态表情包_呆.webp',
  '千恋万花动态表情包_哇.webp',
  '千恋万花动态表情包_哎.webp',
  '千恋万花动态表情包_快看！.webp',
  '千恋万花动态表情包_是笨蛋吗.webp',
  '千恋万花动态表情包_真好啊.webp',
  '千恋万花动态表情包_真的吗.webp',
  '千恋万花表情包_不愧是我.png',
  '千恋万花表情包_丛雨Ciallo.png',
  '千恋万花表情包_可爱.png',
  '千恋万花表情包_呆.png',
  '千恋万花表情包_哼哼.png',
  '千恋万花表情包_害羞.png',
  '饿殍表情包2_万穗爷.png',
  '饿殍表情包2_吃红薯.png',
  '饿殍表情包2_呜呜.png',
  '饿殍表情包2_坏笑.png',
  '饿殍表情包2_害羞.png',
  '饿殍表情包2_小哑巴.png',
  '饿殍表情包2_无奈.png',
  '饿殍表情包2_杀！.png',
  '饿殍表情包2_泡澡.png',
  '饿殍表情包2_猫猫穗穗.png',
  '饿殍表情包2_生气.png',
  '饿殍表情包2_皮影戏穗.png',
  '饿殍表情包2_穗门.png',
  '饿殍表情包2_肘击！.png',
  '饿殍表情包2_良爷！.png',
  '饿殍表情包2_被掐.png'
]

const emit = defineEmits<{
  (e: 'select', emoji: string): void
  (e: 'select-sticker', url: string): void
}>()

const handleSelect = (emoji: string) => {
  emit('select', emoji)
}

const handleSelectSticker = (sticker: string) => {
  emit('select-sticker', `/表情包/${sticker}`)
}
</script>

<template>
  <div
    class="flex flex-col bg-popover text-popover-foreground border shadow-md rounded-md w-72 h-80 overflow-hidden"
  >
    <!-- Header Tabs -->
    <div class="flex border-b text-sm font-medium sticky top-0 bg-popover z-10 shrink-0">
      <button
        class="flex-1 py-2 text-center transition-colors"
        :class="activeTab === 'emoji' ? 'text-primary border-b-2 border-primary bg-muted/30' : 'text-muted-foreground hover:bg-muted'"
        @click="activeTab = 'emoji'"
      >
        默认表情
      </button>
      <button
        class="flex-1 py-2 text-center transition-colors"
        :class="activeTab === 'sticker' ? 'text-primary border-b-2 border-primary bg-muted/30' : 'text-muted-foreground hover:bg-muted'"
        @click="activeTab = 'sticker'"
      >
        表情包
      </button>
    </div>
    
    <!-- Emoji Grid -->
    <div v-show="activeTab === 'emoji'" class="flex-1 overflow-y-auto p-2 [&::-webkit-scrollbar-thumb]:rounded-[6px] [&::-webkit-scrollbar-thumb]:bg-muted-foreground/20 hover:[&::-webkit-scrollbar-thumb]:bg-muted-foreground/40 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar]:w-1.5">
      <div class="grid grid-cols-8 gap-1">
        <button
          v-for="emoji in emojis"
          :key="emoji"
          class="flex items-center justify-center p-1.5 h-8 text-xl rounded-md hover:bg-muted transition-colors focus:outline-none focus:ring-2 focus:ring-ring"
          :title="emoji"
          @click="handleSelect(emoji)"
        >
          {{ emoji }}
        </button>
      </div>
    </div>

    <!-- Sticker Grid -->
    <div v-show="activeTab === 'sticker'" class="flex-1 overflow-y-auto p-2 [&::-webkit-scrollbar-thumb]:rounded-[6px] [&::-webkit-scrollbar-thumb]:bg-muted-foreground/20 hover:[&::-webkit-scrollbar-thumb]:bg-muted-foreground/40 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar]:w-1.5">
      <div class="grid grid-cols-4 gap-2">
        <button
          v-for="sticker in stickers"
          :key="sticker"
          class="flex items-center justify-center p-1 rounded-md hover:bg-muted transition-colors focus:outline-none focus:ring-2 focus:ring-ring"
          @click="handleSelectSticker(sticker)"
        >
          <img :src="`/表情包/${sticker}`" class="h-14 w-14 object-contain" :alt="sticker" loading="lazy" />
        </button>
      </div>
    </div>
  </div>
</template>
