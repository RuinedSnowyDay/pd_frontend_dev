<template>
  <nav class="leftnav">
    <router-link class="item" :class="{active: at('/') }" to="/">Home</router-link>
    <router-link class="item" :class="{active: at('/my') }" to="/my">My Papers</router-link>
    <router-link class="item" :class="{active: at('/groups') }" to="/groups">Groups</router-link>
    <!-- Explore removed -->
  </nav>
</template>

<script setup lang="ts">
import { useRoute } from 'vue-router';

const route = useRoute();
function at(path: string) { return route.path === path; }
</script>

<style scoped>
.leftnav { display: flex; flex-direction: column; gap: 6px; padding: 12px; }
a { padding: 8px 10px; border-radius: 6px; color: #111; text-decoration: none; }
a.active { border-left: 4px solid var(--brand); background: #fff; }
.section { margin-top: 8px; font-size: 12px; color: #666; text-transform: uppercase; }
</style>


