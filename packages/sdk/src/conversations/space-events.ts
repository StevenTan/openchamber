import { z } from 'zod';

export const spaceTaskTitleSchema = z.object({ title: z.string().min(1).max(120), by: z.enum(['user', 'agent']) });
export type SpaceTaskTitle = z.infer<typeof spaceTaskTitleSchema>;

const SPACE_CREATION_STEPS = ['checking_place', 'creating', 'downloading_image', 'preparing_tools', 'setting_network', 'bringing_code', 'giving_access', 'ready'] as const;

export type SpaceCreationStep = (typeof SPACE_CREATION_STEPS)[number];

export const spaceCreationStepSchema = z.enum(SPACE_CREATION_STEPS);
