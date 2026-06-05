import type { Meta, StoryObj } from '@storybook/react';
import { Priority, type PriorityLevel } from '../primitives/Priority';

const KINDS: PriorityLevel[] = ['urgent', 'high', 'normal', 'low', 'none'];

const meta = {
  title: 'Primitives/Priority',
  component: Priority,
  args: { kind: 'high', size: 18 },
} satisfies Meta<typeof Priority>;
export default meta;
type Story = StoryObj<typeof meta>;

export const High: Story = {};
export const AllLevels: Story = {
  render: () => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
      {KINDS.map(k => (
        <div key={k} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
          <Priority kind={k} size={18} />
          <span className="xp-meta">{k}</span>
        </div>
      ))}
    </div>
  ),
};
