import type { Meta, StoryObj } from '@storybook/react';
import { useState } from 'react';
import { Checkbox } from '../primitives/Checkbox';

const meta = {
  title: 'Primitives/Checkbox',
  component: Checkbox,
} satisfies Meta<typeof Checkbox>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Unchecked:     Story = { args: { label: 'Add to milestone' } };
export const Checked:       Story = { args: { label: 'Add to milestone', checked: true } };
export const Indeterminate: Story = { args: { label: 'All 3 selected (mixed)', indeterminate: true } };
export const Disabled:      Story = { args: { label: 'Locked', disabled: true, checked: true } };

export const Interactive: Story = {
  render: () => {
    const [v, setV] = useState(true);
    return <Checkbox checked={v} onChange={() => setV(!v)} label="Watch this issue" />;
  },
};
