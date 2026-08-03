import { createApi, fetchBaseQuery } from "@reduxjs/toolkit/query/react";
import type { EmployeeOnboardingFormValues, EmploymentPayload } from "../../examples/employeeOnboardingModel";

export interface EmployeeRecordResponse {
  employeeId: string;
  values: EmployeeOnboardingFormValues;
  lastUpdatedAt: string;
}

export interface EmployeeSummary {
  employeeId: string;
  firstName: string;
  lastName: string;
  title: string;
  department: string;
  locationCode: string;
  startDate: string;
  updatedAt: string;
}

export interface CreateEmployeeRequest {
  firstName: string;
  lastName: string;
  title: string;
  department: string;
  locationCode: string;
  startDate: string;
}

export interface UpdateEmployeeSummaryRequest extends CreateEmployeeRequest {
  employeeId: string;
}

function nowIso() {
  return new Date().toISOString();
}

const demoApiBaseUrl = `${import.meta.env.BASE_URL.replace(/\/$/, "")}/api`;

export const employeesApi = createApi({
  reducerPath: "employeesApi",
  baseQuery: fetchBaseQuery({ baseUrl: demoApiBaseUrl }),
  tagTypes: ["EmployeeOnboarding"],
  endpoints: (builder) => ({
    listEmployees: builder.query<EmployeeSummary[], void>({
      query: () => "/employees",
      providesTags: (result) => [
        { type: "EmployeeOnboarding", id: "LIST" },
        ...(result ?? []).map((employee) => ({ type: "EmployeeOnboarding" as const, id: employee.employeeId })),
      ],
    }),
    getEmployeeOnboarding: builder.query<EmployeeRecordResponse, string>({
      query: (employeeId) => `/employees/${employeeId}/onboarding`,
      providesTags: (_result, _error, employeeId) => [{ type: "EmployeeOnboarding", id: employeeId }],
    }),
    createEmployee: builder.mutation<EmployeeSummary, CreateEmployeeRequest>({
      query: (body) => ({
        url: "/employees",
        method: "POST",
        body,
      }),
      async onQueryStarted(arg, { dispatch, queryFulfilled }) {
        const tempId = `temp-${Date.now()}`;
        const patch = dispatch(
          employeesApi.util.updateQueryData("listEmployees", undefined, (draft) => {
            draft.unshift({
              employeeId: tempId,
              firstName: arg.firstName,
              lastName: arg.lastName,
              title: arg.title,
              department: arg.department,
              locationCode: arg.locationCode,
              startDate: arg.startDate,
              updatedAt: nowIso(),
            });
          }),
        );

        try {
          const { data } = await queryFulfilled;
          dispatch(
            employeesApi.util.updateQueryData("listEmployees", undefined, (draft) => {
              const index = draft.findIndex((employee) => employee.employeeId === tempId);
              if (index >= 0) {
                draft[index] = data;
              } else {
                draft.unshift(data);
              }
            }),
          );
        } catch {
          patch.undo();
        }
      },
      invalidatesTags: [{ type: "EmployeeOnboarding", id: "LIST" }],
    }),
    updateEmployeeSummary: builder.mutation<EmployeeSummary, UpdateEmployeeSummaryRequest>({
      query: ({ employeeId, ...body }) => ({
        url: `/employees/${employeeId}`,
        method: "PATCH",
        body,
      }),
      async onQueryStarted(arg, { dispatch, queryFulfilled }) {
        const patch = dispatch(
          employeesApi.util.updateQueryData("listEmployees", undefined, (draft) => {
            const target = draft.find((employee) => employee.employeeId === arg.employeeId);
            if (!target) {
              return;
            }

            target.firstName = arg.firstName;
            target.lastName = arg.lastName;
            target.title = arg.title;
            target.department = arg.department;
            target.locationCode = arg.locationCode;
            target.startDate = arg.startDate;
            target.updatedAt = nowIso();
          }),
        );

        try {
          const { data } = await queryFulfilled;
          dispatch(
            employeesApi.util.updateQueryData("listEmployees", undefined, (draft) => {
              const index = draft.findIndex((employee) => employee.employeeId === data.employeeId);
              if (index >= 0) {
                draft[index] = data;
              }
            }),
          );
        } catch {
          patch.undo();
        }
      },
      invalidatesTags: (_result, _error, { employeeId }) => [
        { type: "EmployeeOnboarding", id: "LIST" },
        { type: "EmployeeOnboarding", id: employeeId },
      ],
    }),
    deleteEmployee: builder.mutation<{ success: true }, string>({
      query: (employeeId) => ({
        url: `/employees/${employeeId}`,
        method: "DELETE",
      }),
      async onQueryStarted(employeeId, { dispatch, queryFulfilled }) {
        const patch = dispatch(
          employeesApi.util.updateQueryData("listEmployees", undefined, (draft) => {
            const index = draft.findIndex((employee) => employee.employeeId === employeeId);
            if (index >= 0) {
              draft.splice(index, 1);
            }
          }),
        );

        try {
          await queryFulfilled;
        } catch {
          patch.undo();
        }
      },
      invalidatesTags: (_result, _error, employeeId) => [
        { type: "EmployeeOnboarding", id: "LIST" },
        { type: "EmployeeOnboarding", id: employeeId },
      ],
    }),
    updateEmployment: builder.mutation<{ revision: string }, { employeeId: string; payload: EmploymentPayload }>({
      query: ({ employeeId, payload }) => ({
        url: `/employees/${employeeId}/employment`,
        method: "PATCH",
        body: payload,
      }),
      async onQueryStarted({ employeeId, payload }, { dispatch, queryFulfilled }) {
        const patch = dispatch(
          employeesApi.util.updateQueryData("getEmployeeOnboarding", employeeId, (draft) => {
            draft.values.employment = {
              title: payload.title,
              department: payload.department,
              managerId: payload.managerId,
              locationCode: payload.locationCode,
              workMode: payload.workMode,
              salary: payload.salary,
              bonusEligible: payload.bonusEligible,
              notes: payload.notes,
            };
            draft.values.equipmentRequests = payload.equipmentRequests;
            draft.lastUpdatedAt = nowIso();
          }),
        );

        try {
          await queryFulfilled;
        } catch {
          patch.undo();
        }
      },
    }),
  }),
});

export const {
  useCreateEmployeeMutation,
  useDeleteEmployeeMutation,
  useGetEmployeeOnboardingQuery,
  useListEmployeesQuery,
  useUpdateEmployeeSummaryMutation,
  useUpdateEmploymentMutation,
} = employeesApi;