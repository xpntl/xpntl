import type { Meta, StoryObj } from '@storybook/react';
import { Input } from '../primitives/Input';
import { Kbd } from '../primitives/Kbd';

const meta = {
  title: 'Primitives/Input',
  component: Input,
  args: { placeholder: 'title…' },
  parameters: { layout: 'padded' },
} satisfies Meta<typeof Input>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = { args: { placeholder: 'title…' } };
export const Search:  Story = {
  args: {
    placeholder: 'search…',
    leading: <span style={{ fontSize: 11 }}>⌕</span>,
    trailing: <Kbd size="sm">⌘K</Kbd>,
  },
};
export const Disabled: Story = { args: { placeholder: 'disabled', disabled: true } };
export const Small:    Story = { args: { placeholder: 'small', size: 'sm' } };
