import type { AiModelOption } from '@/api/ai'

export type AiModelType = 'text' | 'image' | 'video'

export type AiPastedImage = { url: string; file: File }

export type AiComposerSendPayload = {
  text: string
  images: AiPastedImage[]
  mode: AiModelType
  chat: {
    model: string
    thinking: boolean
    thinkingEffort: string
    thinkingFeatureEnabled: boolean
  }
  image: {
    model: string
    resolution: string
    ratio: string
    count: number
  }
  video: {
    model: string
    resolution: string
    ratio: string
    duration: number
  }
}

export type AiOptionsBundle = {
  chatModelOptions: AiModelOption[]
  imageModelOptions: AiModelOption[]
  videoModelOptions: AiModelOption[]
  thinkingEffortOptions: AiModelOption[]
  thinkingFeatureEnabled: boolean
  defaults: {
    chatModel: string
    imageModel: string
    videoModel: string
    thinkingEffort: string
  }
}
