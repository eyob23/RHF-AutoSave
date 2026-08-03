import { createPartitionedTransport, fetchTransport, rtkQueryTransport } from "../src";

export type WorkMode = "remote" | "hybrid" | "onsite";
export type EquipmentType = "laptop" | "monitor" | "keyboard" | "dock" | "phone";

export type EmployeeOnboardingFormValues = {
  profile: {
    firstName: string;
    lastName: string;
    preferredName: string;
    birthDate: string;
    personalEmail: string;
    mobilePhone: string;
    citizenshipStatus: "citizen" | "visa" | "permanent_resident";
    startDate: string;
  };
  address: {
    line1: string;
    line2: string;
    city: string;
    state: string;
    postalCode: string;
    country: string;
  };
  employment: {
    title: string;
    department: string;
    managerId: string;
    locationCode: string;
    workMode: WorkMode;
    salary: number;
    bonusEligible: boolean;
    notes: string;
  };
  payroll: {
    taxId: string;
    bankName: string;
    accountLast4: string;
    retirementContributionPct: number;
  };
  benefits: {
    medicalPlan: "basic" | "plus" | "family";
    dental: boolean;
    vision: boolean;
    tshirtSize: "xs" | "s" | "m" | "l" | "xl";
  };
  dependents: Array<{
    id: string;
    firstName: string;
    lastName: string;
    relationship: "spouse" | "child" | "domestic_partner";
    birthDate: string;
    covered: boolean;
  }>;
  emergencyContacts: Array<{
    id: string;
    name: string;
    relationship: string;
    phone: string;
    email: string;
    primary: boolean;
  }>;
  equipmentRequests: Array<{
    id: string;
    type: EquipmentType;
    justification: string;
    requiredBy: string;
  }>;
  acknowledgements: {
    handbookAccepted: boolean;
    dataPolicyAccepted: boolean;
    codeOfConductAccepted: boolean;
  };
};

export type EmploymentPayload = EmployeeOnboardingFormValues["employment"] & {
  equipmentRequests: EmployeeOnboardingFormValues["equipmentRequests"];
};

export type SaveEmploymentMutation = (payload: EmploymentPayload) => Promise<{ revision: string }>;

export const defaultEmployeeOnboardingValues: EmployeeOnboardingFormValues = {
  profile: {
    firstName: "Maya",
    lastName: "Patel",
    preferredName: "",
    birthDate: "1993-05-12",
    personalEmail: "maya.patel@example.com",
    mobilePhone: "+1 555 010 2233",
    citizenshipStatus: "citizen",
    startDate: "2026-09-15",
  },
  address: {
    line1: "410 Market Street",
    line2: "Apt 11B",
    city: "Seattle",
    state: "WA",
    postalCode: "98104",
    country: "US",
  },
  employment: {
    title: "Senior Product Designer",
    department: "Design",
    managerId: "mgr-204",
    locationCode: "SEA-HQ",
    workMode: "hybrid",
    salary: 164000,
    bonusEligible: true,
    notes: "Needs design-system repo access and onboarding with platform team.",
  },
  payroll: {
    taxId: "***-**-4821",
    bankName: "Northwest Credit Union",
    accountLast4: "3348",
    retirementContributionPct: 8,
  },
  benefits: {
    medicalPlan: "plus",
    dental: true,
    vision: true,
    tshirtSize: "m",
  },
  dependents: [
    {
      id: "dep-1",
      firstName: "Ari",
      lastName: "Patel",
      relationship: "child",
      birthDate: "2020-07-21",
      covered: true,
    },
  ],
  emergencyContacts: [
    {
      id: "ec-1",
      name: "Rohan Patel",
      relationship: "Spouse",
      phone: "+1 555 010 9988",
      email: "rohan.patel@example.com",
      primary: true,
    },
  ],
  equipmentRequests: [
    {
      id: "eq-1",
      type: "monitor",
      justification: "Dual-screen design workflow",
      requiredBy: "2026-09-15",
    },
  ],
  acknowledgements: {
    handbookAccepted: true,
    dataPolicyAccepted: true,
    codeOfConductAccepted: true,
  },
};

export function createEmployeeOnboardingTransport(
  employeeId: string,
  saveEmploymentMutation: SaveEmploymentMutation,
) {
  return createPartitionedTransport<EmployeeOnboardingFormValues>([
    {
      key: "profile",
      paths: ["profile", "address"],
      transport: fetchTransport(`/api/employees/${employeeId}/profile`, {
        method: "PATCH",
      }),
      payloadStrategy: "partition",
    },
    {
      key: "employment",
      paths: ["employment", "equipmentRequests"],
      transport: rtkQueryTransport(saveEmploymentMutation, {
        mapArg: (payload) => payload as EmploymentPayload,
      }),
      selectPayload: ({ values }) => ({
        ...values.employment,
        equipmentRequests: values.equipmentRequests,
      }),
    },
    {
      key: "benefits",
      paths: ["benefits", "dependents", "payroll", "acknowledgements"],
      transport: fetchTransport(`/api/employees/${employeeId}/benefits-enrollment`, {
        method: "PUT",
      }),
      payloadStrategy: "partition",
    },
    {
      key: "emergencyContacts",
      paths: ["emergencyContacts"],
      transport: fetchTransport(`/api/employees/${employeeId}/emergency-contacts/bulk`, {
        method: "PUT",
      }),
      payloadStrategy: "partition",
    },
  ]);
}