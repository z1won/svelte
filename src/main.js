import MediaApp from './MediaApp.svelte';
import { mount } from 'svelte';

const app = mount(MediaApp, { target: document.getElementById('app') });

export default app;
