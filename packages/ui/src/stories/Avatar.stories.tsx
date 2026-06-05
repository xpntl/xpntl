import type { Meta, StoryObj } from '@storybook/react';
import { Avatar, AvatarStack } from '../primitives/Avatar';

const meta = {
  title: 'Primitives/Avatar',
  component: Avatar,
  args: { name: 'Lena Park', size: 32 },
} satisfies Meta<typeof Avatar>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Single: Story = {};

export const Sizes: Story = {
  render: () => (
    <div style={{ display: 'flex', alignItems: 'end', gap: 12 }}>
      {[16, 20, 24, 32, 40, 56].map(s => <Avatar key={s} name="Lena Park" size={s} />)}
    </div>
  ),
};

export const Stack: Story = {
  render: () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <AvatarStack names={['Lena Park', 'Theo Wynn']} size={24} />
      <AvatarStack names={['Lena Park', 'Theo Wynn', 'Ada Okafor', 'Sam Pinto']} size={24} />
      <AvatarStack
        names={['Lena Park', 'Theo Wynn', 'Ada Okafor', 'Sam Pinto', 'Joon Park', 'Mira Cohen', 'Pat Ng']}
        size={24} max={4}
      />
    </div>
  ),
};

export const Many: Story = {
  render: () => (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 8 }}>
      {[
        'Lena Park', 'Theo Wynn', 'Ada Okafor', 'Sam Pinto', 'Joon Park', 'Mira Cohen',
        'Pat Ng',    'Ryo Tanaka', 'Vera Ilić', 'Otis Brand', 'Hugo Reyes', 'Eva Lindqvist',
      ].map(n => <Avatar key={n} name={n} size={28} />)}
    </div>
  ),
};
