import { delay, http, HttpResponse } from "msw";
import type {
  EmployeeOnboardingFormValues,
  EmploymentPayload,
} from "../../examples/employeeOnboardingModel";
import { defaultEmployeeOnboardingValues } from "../../examples/employeeOnboardingModel";
import type { EmployeeSummary } from "../api/employeesApi";

type EmployeeRecord = {
  employeeId: string;
  values: EmployeeOnboardingFormValues;
  lastUpdatedAt: string;
  revision: number;
};

const STORAGE_KEY = "rhf-autosave-demo-employees";
const database = new Map<string, EmployeeRecord>();
const apiBasePath = `${import.meta.env.BASE_URL.replace(/\/$/, "")}/api`;

function apiPath(path: string) {
  return `${apiBasePath}${path.startsWith("/") ? path : `/${path}`}`;
}

function clone<TValue>(value: TValue): TValue {
  return structuredClone(value);
}

function createEmployeeSummary(record: EmployeeRecord): EmployeeSummary {
  return {
    employeeId: record.employeeId,
    firstName: record.values.profile.firstName,
    lastName: record.values.profile.lastName,
    title: record.values.employment.title,
    department: record.values.employment.department,
    locationCode: record.values.employment.locationCode,
    startDate: record.values.profile.startDate,
    updatedAt: record.lastUpdatedAt,
  };
}

function persistDatabase() {
  if (typeof localStorage === "undefined") {
    return;
  }

  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify(Array.from(database.entries())),
  );
}

function seedRecord(
  employeeId: string,
  overrides?: Partial<EmployeeOnboardingFormValues>,
): EmployeeRecord {
  const seeded: EmployeeRecord = {
    employeeId,
    values: {
      ...clone(defaultEmployeeOnboardingValues),
      ...overrides,
      profile: {
        ...clone(defaultEmployeeOnboardingValues.profile),
        ...(overrides?.profile ?? {}),
      },
      address: {
        ...clone(defaultEmployeeOnboardingValues.address),
        ...(overrides?.address ?? {}),
      },
      employment: {
        ...clone(defaultEmployeeOnboardingValues.employment),
        ...(overrides?.employment ?? {}),
      },
      payroll: {
        ...clone(defaultEmployeeOnboardingValues.payroll),
        ...(overrides?.payroll ?? {}),
      },
      benefits: {
        ...clone(defaultEmployeeOnboardingValues.benefits),
        ...(overrides?.benefits ?? {}),
      },
      acknowledgements: {
        ...clone(defaultEmployeeOnboardingValues.acknowledgements),
        ...(overrides?.acknowledgements ?? {}),
      },
      dependents:
        overrides?.dependents ??
        clone(defaultEmployeeOnboardingValues.dependents),
      emergencyContacts:
        overrides?.emergencyContacts ??
        clone(defaultEmployeeOnboardingValues.emergencyContacts),
      equipmentRequests:
        overrides?.equipmentRequests ??
        clone(defaultEmployeeOnboardingValues.equipmentRequests),
    },
    lastUpdatedAt: new Date().toISOString(),
    revision: 1,
  };

  return seeded;
}

function loadDatabase() {
  if (database.size > 0) {
    return;
  }

  if (typeof localStorage !== "undefined") {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Array<[string, EmployeeRecord]>;
      parsed.forEach(([employeeId, record]) => {
        database.set(employeeId, record);
      });
      return;
    }
  }

  const seededRecords = [
    seedRecord("emp-2048", {
      profile: {
        firstName: "Maya",
        lastName: "Patel",
        preferredName: "",
        birthDate: defaultEmployeeOnboardingValues.profile.birthDate,
        personalEmail: defaultEmployeeOnboardingValues.profile.personalEmail,
        mobilePhone: defaultEmployeeOnboardingValues.profile.mobilePhone,
        citizenshipStatus:
          defaultEmployeeOnboardingValues.profile.citizenshipStatus,
        startDate: "2026-09-15",
      },
      employment: {
        ...defaultEmployeeOnboardingValues.employment,
        title: "Senior Product Designer",
        department: "Design",
        locationCode: "SEA-HQ",
      },
    }),
    seedRecord("emp-3110", {
      profile: {
        ...defaultEmployeeOnboardingValues.profile,
        firstName: "Jordan",
        lastName: "Lee",
        personalEmail: "jordan.lee@example.com",
        startDate: "2026-10-01",
      },
      employment: {
        ...defaultEmployeeOnboardingValues.employment,
        title: "Staff Platform Engineer",
        department: "Platform",
        locationCode: "NYC-HUB",
      },
    }),
    seedRecord("emp-4112", {
      profile: {
        ...defaultEmployeeOnboardingValues.profile,
        firstName: "Elena",
        lastName: "Garcia",
        personalEmail: "elena.garcia@example.com",
        startDate: "2026-10-12",
      },
      employment: {
        ...defaultEmployeeOnboardingValues.employment,
        title: "Principal Data Analyst",
        department: "Analytics",
        locationCode: "AUS-REMOTE",
        workMode: "remote",
      },
    }),
  ];

  seededRecords.forEach((record) => {
    database.set(record.employeeId, record);
  });
  persistDatabase();
}

function getEmployeeRecord(employeeId: string): EmployeeRecord {
  loadDatabase();
  const existing = database.get(employeeId);
  if (existing) {
    return existing;
  }

  const seeded = seedRecord(employeeId);
  database.set(employeeId, seeded);
  persistDatabase();
  return seeded;
}

function commit(employeeId: string, values: EmployeeOnboardingFormValues) {
  const nextRecord: EmployeeRecord = {
    employeeId,
    values,
    lastUpdatedAt: new Date().toISOString(),
    revision: getEmployeeRecord(employeeId).revision + 1,
  };
  database.set(employeeId, nextRecord);
  persistDatabase();
  return nextRecord;
}

export const handlers = [
  http.get(apiPath("/employees"), async () => {
    await delay(220);
    loadDatabase();
    return HttpResponse.json(
      Array.from(database.values())
        .map(createEmployeeSummary)
        .sort((left, right) => left.lastName.localeCompare(right.lastName)),
    );
  }),
  http.post(apiPath("/employees"), async ({ request }) => {
    await delay(280);
    const body = (await request.json()) as {
      firstName: string;
      lastName: string;
      title: string;
      department: string;
      locationCode: string;
      startDate: string;
    };
    const employeeId = `emp-${Math.floor(Math.random() * 9000) + 1000}`;
    const record = seedRecord(employeeId, {
      profile: {
        ...defaultEmployeeOnboardingValues.profile,
        firstName: body.firstName,
        lastName: body.lastName,
        personalEmail:
          `${body.firstName}.${body.lastName}`
            .toLowerCase()
            .replace(/\s+/g, ".") + "@example.com",
        startDate: body.startDate,
      },
      employment: {
        ...defaultEmployeeOnboardingValues.employment,
        title: body.title,
        department: body.department,
        locationCode: body.locationCode,
      },
    });
    database.set(employeeId, record);
    persistDatabase();
    return HttpResponse.json(createEmployeeSummary(record), { status: 201 });
  }),
  http.patch(apiPath("/employees/:employeeId"), async ({ params, request }) => {
    await delay(260);
    const employeeId = String(params.employeeId);
    const body = (await request.json()) as {
      firstName: string;
      lastName: string;
      title: string;
      department: string;
      locationCode: string;
      startDate: string;
    };
    const record = getEmployeeRecord(employeeId);
    const nextRecord = commit(employeeId, {
      ...record.values,
      profile: {
        ...record.values.profile,
        firstName: body.firstName,
        lastName: body.lastName,
        startDate: body.startDate,
      },
      employment: {
        ...record.values.employment,
        title: body.title,
        department: body.department,
        locationCode: body.locationCode,
      },
    });
    return HttpResponse.json(createEmployeeSummary(nextRecord));
  }),
  http.delete(apiPath("/employees/:employeeId"), async ({ params }) => {
    await delay(200);
    const employeeId = String(params.employeeId);
    database.delete(employeeId);
    persistDatabase();
    return HttpResponse.json({ success: true as const });
  }),
  http.get(apiPath("/employees/:employeeId/onboarding"), async ({ params }) => {
    await delay(300);
    const employeeId = String(params.employeeId);
    const record = getEmployeeRecord(employeeId);
    return HttpResponse.json({
      employeeId,
      values: clone(record.values),
      lastUpdatedAt: record.lastUpdatedAt,
    });
  }),
  http.patch(
    apiPath("/employees/:employeeId/profile"),
    async ({ params, request }) => {
      await delay(450);
      const employeeId = String(params.employeeId);
      const payload =
        (await request.json()) as Partial<EmployeeOnboardingFormValues>;
      const record = getEmployeeRecord(employeeId);
      const nextValues: EmployeeOnboardingFormValues = {
        ...record.values,
        profile: payload.profile ?? record.values.profile,
        address: payload.address ?? record.values.address,
      };
      const nextRecord = commit(employeeId, nextValues);
      return HttpResponse.json({
        ok: true,
        revision: `profile-${nextRecord.revision}`,
        lastUpdatedAt: nextRecord.lastUpdatedAt,
      });
    },
  ),
  http.patch(
    apiPath("/employees/:employeeId/employment"),
    async ({ params, request }) => {
      await delay(500);
      const employeeId = String(params.employeeId);
      const payload = (await request.json()) as EmploymentPayload;
      const record = getEmployeeRecord(employeeId);
      const nextValues: EmployeeOnboardingFormValues = {
        ...record.values,
        employment: {
          title: payload.title,
          department: payload.department,
          managerId: payload.managerId,
          locationCode: payload.locationCode,
          workMode: payload.workMode,
          salary: payload.salary,
          bonusEligible: payload.bonusEligible,
          notes: payload.notes,
        },
        equipmentRequests: payload.equipmentRequests,
      };
      const nextRecord = commit(employeeId, nextValues);
      return HttpResponse.json({
        revision: `employment-${nextRecord.revision}`,
      });
    },
  ),
  http.put(
    apiPath("/employees/:employeeId/benefits-enrollment"),
    async ({ params, request }) => {
      await delay(650);
      const employeeId = String(params.employeeId);
      const payload =
        (await request.json()) as Partial<EmployeeOnboardingFormValues>;
      const record = getEmployeeRecord(employeeId);
      const nextValues: EmployeeOnboardingFormValues = {
        ...record.values,
        benefits: payload.benefits ?? record.values.benefits,
        dependents: payload.dependents ?? record.values.dependents,
        payroll: payload.payroll ?? record.values.payroll,
        acknowledgements:
          payload.acknowledgements ?? record.values.acknowledgements,
      };
      const nextRecord = commit(employeeId, nextValues);
      return HttpResponse.json({
        ok: true,
        revision: `benefits-${nextRecord.revision}`,
      });
    },
  ),
  http.put(
    apiPath("/employees/:employeeId/emergency-contacts/bulk"),
    async ({ params, request }) => {
      await delay(400);
      const employeeId = String(params.employeeId);
      const payload =
        (await request.json()) as Partial<EmployeeOnboardingFormValues>;
      const record = getEmployeeRecord(employeeId);
      const nextValues: EmployeeOnboardingFormValues = {
        ...record.values,
        emergencyContacts:
          payload.emergencyContacts ?? record.values.emergencyContacts,
      };
      const nextRecord = commit(employeeId, nextValues);
      return HttpResponse.json({
        ok: true,
        revision: `contacts-${nextRecord.revision}`,
      });
    },
  ),
];
