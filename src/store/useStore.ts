import { create } from 'zustand';
import { createDataSlice } from './slices/data';
import { createSessionSlice } from './slices/session';
import { createUiSlice } from './slices/ui';
import { createUsersSlice } from './slices/users';
import { createVisitsSlice } from './slices/visits';
import type { StoreState } from './types';

export const useStore = create<StoreState>((set, get) => ({
  ...createDataSlice(set, get),
  ...createSessionSlice(set, get),
  ...createUiSlice(set),
  ...createUsersSlice(set, get),
  ...createVisitsSlice(set, get),
}));
