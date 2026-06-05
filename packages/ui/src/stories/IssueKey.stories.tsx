import type { Meta, StoryObj } from '@storybook/react';
import { IssueKey } from '../primitives/IssueKey';

const meta = {
  title: 'Primitives/IssueKey',
  component: IssueKey,
  args: { children: 'PER-103' },
} satisfies Meta<typeof IssueKey>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default:  Story = {};
export const Small:    Story = { args: { size: 'sm' } };
export const Inverted: Story = { args: { tone: 'inverted' } };
