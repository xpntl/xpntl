import type { Meta, StoryObj } from '@storybook/react';
import { StateDot, type WorkflowState } from '../primitives/StateDot';

const KINDS: WorkflowState[] = ['triage', 'backlog', 'unstarted', 'started', 'completed', 'canceled'];

const meta = {
  title: 'Primitives/StateDot',
  component: StateDot,
  args: { kind: 'started', size: 18 },
} satisfies Meta<typeof StateDot>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Started: Story = {};
export const AllStates: Story = {
  render: () => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
      {KINDS.map(k => (
        <div key={k} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
          <StateDot kind={k} size={18} />
          <span className="xp-meta">{k}</span>
        </div>
      ))}
    </div>
  ),
};
