import type { Meta, StoryObj } from '@storybook/react';
import { Button } from '../primitives/Button';
import { Kbd } from '../primitives/Kbd';

const meta = {
  title: 'Primitives/Button',
  component: Button,
  args: { children: 'SAVE', variant: 'secondary', size: 'md' },
  argTypes: {
    variant: { control: 'select', options: ['primary', 'secondary', 'ghost', 'danger'] },
    size:    { control: 'select', options: ['sm', 'md'] },
  },
} satisfies Meta<typeof Button>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Primary:   Story = { args: { variant: 'primary',   children: 'SAVE ISSUE' } };
export const Secondary: Story = { args: { variant: 'secondary', children: 'CANCEL' } };
export const Ghost:     Story = { args: { variant: 'ghost',     children: 'DISCARD' } };
export const Danger:    Story = { args: { variant: 'danger',    children: 'DELETE' } };
export const Disabled:  Story = { args: { variant: 'primary',   disabled: true, children: 'SAVE' } };

export const WithKbd: Story = {
  args: {
    variant: 'primary',
    children: 'SEND',
    trailing: <Kbd size="sm">⌘↵</Kbd>,
  },
};

export const Sizes: Story = {
  render: () => (
    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
      <Button size="sm" variant="primary">SM</Button>
      <Button size="md" variant="primary">MD</Button>
    </div>
  ),
};
