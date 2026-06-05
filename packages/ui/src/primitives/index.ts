// packages/ui/src/primitives/index.ts
//
// Barrel — every primitive in the system, re-exported.

export { IssueKey, type IssueKeyProps } from './IssueKey';
export { StateDot, type StateDotProps, type WorkflowState } from './StateDot';
export { Priority, type PriorityProps, type PriorityLevel } from './Priority';
export { Kbd, type KbdProps } from './Kbd';

export { Avatar, AvatarStack,
         type AvatarProps, type AvatarStackProps } from './Avatar';

export { Button, type ButtonProps, type ButtonVariant, type ButtonSize } from './Button';
export { Input, type InputProps } from './Input';
export { TextArea, type TextAreaProps } from './TextArea';
export { Select, type SelectProps, type SelectOption } from './Select';
export { Combobox, type ComboboxProps, type ComboboxOption } from './Combobox';

export { Popover, type PopoverProps } from './Popover';
export { Dialog, type DialogProps } from './Dialog';
export { AlertDialog, type AlertDialogProps } from './AlertDialog';
export { PromptDialog, type PromptDialogProps } from './PromptDialog';
export { SlideOver, type SlideOverProps } from './SlideOver';
export { Toast, type ToastProps, type ToastKind } from './Toast';
export { Tooltip, type TooltipProps } from './Tooltip';
export { DropdownMenu, type DropdownMenuProps, type DropdownMenuItem } from './DropdownMenu';

export { Badge, type BadgeProps, type BadgeTone } from './Badge';
export { Pill, type PillProps } from './Pill';

export { Checkbox, type CheckboxProps } from './Checkbox';
export { Radio, type RadioProps } from './Radio';
export { Switch, type SwitchProps } from './Switch';

export { Tabs, type TabsProps, type TabsItem } from './Tabs';
export { Tree, type TreeProps, type TreeNode } from './Tree';

export { Skeleton, type SkeletonProps } from './Skeleton';
export { Spinner, type SpinnerProps } from './Spinner';
export { CloseEsc } from './CloseEsc';
export { ContextMenu, type ContextMenuProps, type ContextMenuItem } from './ContextMenu';

export { EmptyState, type EmptyStateProps } from './EmptyState';
export { Progress, type ProgressProps } from './Progress';
export { FormField, type FormFieldProps } from './FormField';
