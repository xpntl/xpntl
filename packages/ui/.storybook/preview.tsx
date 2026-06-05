import type { Preview } from '@storybook/react';
import { withThemeByDataAttribute } from '@storybook/addon-themes';
import '../src/tokens.css';

const preview: Preview = {
  parameters: {
    layout: 'centered',
    backgrounds: { disable: true },
    controls: { matchers: { color: /(background|color)$/i, date: /Date$/i } },
  },
  globalTypes: {
    density: {
      name: 'Density',
      description: 'Row-height density',
      defaultValue: 'compact',
      toolbar: { icon: 'menu', items: ['compact', 'comfortable'], showName: true },
    },
    focusRing: {
      name: 'Focus ring',
      description: 'Designed focus-ring variant',
      defaultValue: 'offset',
      toolbar: { icon: 'circle', items: ['halo', 'offset', 'inset', 'dashed'], showName: true },
    },
  },
  decorators: [
    withThemeByDataAttribute({
      themes: { light: 'light', dark: 'dark' },
      defaultTheme: 'light',
      attributeName: 'data-theme',
    }),
    (Story, ctx) => {
      const root = document.documentElement;
      root.setAttribute('data-density',    String(ctx.globals.density    ?? 'compact'));
      root.setAttribute('data-focus-ring', String(ctx.globals.focusRing  ?? 'offset'));
      return Story();
    },
  ],
};

export default preview;
