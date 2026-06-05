import type { Meta, StoryObj } from '@storybook/react';
import { Peek } from '../screens/Peek';

const meta = {
  title: 'Screens/PER-106 · Peek',
  component: Peek,
  parameters: { layout: 'centered' },
  render: () => <div style={{ height: 600 }}><Peek /></div>,
} satisfies Meta<typeof Peek>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
