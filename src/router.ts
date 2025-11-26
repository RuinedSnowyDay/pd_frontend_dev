import { createRouter, createWebHistory } from 'vue-router';

export const routes = [
  { path: '/', name: 'home', component: () => import('./views/HomeFeed.vue') },
  { path: '/search', name: 'search', component: () => import('./views/SearchResults.vue') },
  { path: '/annotate_test/paper/:id', name: 'annotate_test', component: () => import('./views/AnnotateTest.vue') },
  { path: '/paper/:id', name: 'paper', component: () => import('./views/PaperPage.vue'), props: true },
  { path: '/my', name: 'my', component: () => import('./views/MyPapers.vue') },
  { path: '/groups', name: 'groups', component: () => import('./views/Groups.vue') },
  { path: '/login', name: 'login', component: () => import('./views/Login.vue') },
];

const router = createRouter({
  history: createWebHistory(),
  routes,
  scrollBehavior() { return { left: 0, top: 0 }; },
});

export default router;


