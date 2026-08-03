import { createSlice, type PayloadAction } from "@reduxjs/toolkit";
import type { AutosaveMutationLogEntry } from "../src";

export interface AutosaveLogsState {
  entries: AutosaveMutationLogEntry[];
}

const initialState: AutosaveLogsState = {
  entries: [],
};

const MAX_LOG_ENTRIES = 200;

const autosaveLogsSlice = createSlice({
  name: "autosaveLogs",
  initialState,
  reducers: {
    autosaveLogAdded: (
      state,
      action: PayloadAction<AutosaveMutationLogEntry>,
    ) => {
      state.entries.unshift(action.payload);
      if (state.entries.length > MAX_LOG_ENTRIES) {
        state.entries.length = MAX_LOG_ENTRIES;
      }
    },
    autosaveLogsCleared: (state) => {
      state.entries = [];
    },
  },
});

export const { autosaveLogAdded, autosaveLogsCleared } =
  autosaveLogsSlice.actions;
export const autosaveLogsReducer = autosaveLogsSlice.reducer;
