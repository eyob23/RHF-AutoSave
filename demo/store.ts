import { configureStore } from "@reduxjs/toolkit";
import { setupListeners } from "@reduxjs/toolkit/query";
import { autosaveLogsReducer } from "./autosaveLogsSlice";
import { employeesApi } from "./api/employeesApi";

export const store = configureStore({
  reducer: {
    [employeesApi.reducerPath]: employeesApi.reducer,
    autosaveLogs: autosaveLogsReducer,
  },
  middleware: (getDefaultMiddleware) => getDefaultMiddleware().concat(employeesApi.middleware),
});

setupListeners(store.dispatch);

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;