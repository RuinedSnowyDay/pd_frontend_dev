<template>
  <nav class="leftnav">
    <router-link class="item" :class="{active: at('/') }" to="/">Home</router-link>
    <router-link class="item" :class="{active: at('/my') }" to="/my">My Papers</router-link>
    <!-- Explore removed -->
  </nav>
</template>

<script setup lang="ts">
import { useRoute } from 'vue-router';

const route = useRoute();
function at(path: string) { return route.path === path; }
</script>

<style scoped>
.leftnav {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
a {
  padding: 12px 16px;
  border-radius: 8px;
  color: var(--text);
  text-decoration: none;
  font-weight: 500;
  transition: all 0.2s ease;
  position: relative;
}
a:hover {
  background: #f9fafb;
  color: var(--brand);
}
a.active {
  background: linear-gradient(90deg, #fef2f2 0%, #ffffff 100%);
  color: var(--brand);
  font-weight: 600;
  box-shadow: inset 3px 0 0 var(--brand);
}
.section {
  margin-top: 12px;
  font-size: 11px;
  font-weight: 700;
  color: var(--muted);
  text-transform: uppercase;
  letter-spacing: 0.5px;
  padding: 0 16px;
}
</style>


