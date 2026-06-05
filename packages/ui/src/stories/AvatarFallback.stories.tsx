import type { Meta, StoryObj } from '@storybook/react';
import { AvatarFallback } from '../screens/AvatarFallback';

const meta = {
  title: 'Screens/PER-107 · Avatar fallback',
  component: AvatarFallback,
  parameters: { layout: 'padded' },
} satisfies Meta<typeof AvatarFallback>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
