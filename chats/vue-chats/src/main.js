import "./assets/main.css";
import { bootstrapAgentFromUrl } from "@/utils/agentId";

bootstrapAgentFromUrl();

import { createApp } from "vue";
import { createPinia } from 'pinia'
import App from './App.vue'

const app = createApp(App)
app.use(createPinia())
app.mount('#app')
