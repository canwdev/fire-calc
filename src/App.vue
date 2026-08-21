<script setup lang="ts">
import { provide } from 'vue'
import { snapdom } from '@zumer/snapdom'
import { useRoute } from 'vue-router'
import { snapdomKey } from '@/components/FireCalc/types'
import packageJson from '../package.json'

provide(snapdomKey, snapdom)

const route = useRoute()
const version = packageJson.version
const githubUrl = packageJson.repository?.url
</script>

<template>
  <RouterView />
  <footer class="app-footer">
    <span class="version">v{{ version }}</span>
    <RouterLink v-if="route.name === 'old'" to="/" class="version-link">go to new version</RouterLink>
    <RouterLink v-if="route.name === 'home'" to="/old" class="version-link">back to old version</RouterLink>
    <a v-if="githubUrl" :href="githubUrl" target="_blank" rel="noopener noreferrer" class="github-link">
      GitHub
    </a>
  </footer>
</template>

<style>
html {
  position: relative;
}

body {
  margin: 0;
  font-family: "PingFang SC", Inter, Avenir, Helvetica, Arial, sans-serif;
  touch-action: manipulation;
}

* {
  box-sizing: border-box;
}

.app-footer {
  position: fixed;
  bottom: 10px;
  right: 10px;
  display: flex;
  align-items: center;
  gap: 12px;
  font-size: 12px;
  color: #666;
  z-index: 100;
}

.app-footer .version {
  color: #999;
}

.app-footer .github-link {
  color: #666;
  text-decoration: none;
  transition: color 0.2s;
}

.app-footer .version-link {
  color: #666;
  text-decoration: none;
  transition: color 0.2s;
}

.app-footer .version-link:hover {
  color: #333;
  text-decoration: underline;
}

.app-footer .github-link:hover {
  color: #333;
  text-decoration: underline;
}
</style>
