import { defineConfig, mergeConfig } from 'vitest/config';
import base from '../../vitest.base.mts';

export default mergeConfig(base, defineConfig({ test: { name: 'web' } }));
