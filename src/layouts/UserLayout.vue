<script setup lang="ts">
import { RouterView } from 'vue-router'
</script>

<template>
  <div class="user-layout min-h-screen bg-secondary">
    <RouterView v-slot="{ Component, route }">
      <Transition name="route" mode="out-in">
        <component :is="Component" :key="route.path" />
      </Transition>
    </RouterView>
  </div>
</template>
