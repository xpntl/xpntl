import type { Meta, StoryObj } from '@storybook/react';
import { useState } from 'react';
import { SidebarShell } from '../screens/SidebarShell';
import { Switch } from '../primitives/Switch';

const meta = {
  title: 'Screens/PER-103 · Sidebar shell',
  component: SidebarShell,
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof SidebarShell>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Expanded:  Story = { args: { collapsed: false }, render: (a) => <div style={{ height: 600 }}><SidebarShell {...a} /></div> };
export const Collapsed: Story = { args: { collapsed: true  }, render: (a) => <div style={{ height: 600 }}><SidebarShell {...a} /></div> };

export const Toggleable: Story = {
  render: () => {
    const [c, setC] = useState(false);
    return (
      <div style={{ padding: 24 }}>
        <div style={{ marginBottom: 12 }}>
          <Switch checked={c} onChange={() => setC(!c)} label="Collapsed rail · ⌘\ in product" />
        </div>
        <div style={{ height: 560 }}>
          <SidebarShell collapsed={c} />
        </div>
      </div>
    );
  },
};
