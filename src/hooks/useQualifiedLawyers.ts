import { useState, useEffect, useMemo } from "react";
import { addMonths, differenceInCalendarMonths, endOfDay, isAfter, startOfDay } from "date-fns";

import { supabase } from "@/integrations/supabase/client";
import { getStateMatchToken } from "@/lib/stateFilter";

type LawyerRequirementType = "broker_lawyer" | "internal_lawyer";

interface LawyerRequirement {
  id: string;
  attorney_id: string | null;
  attorney_name: string;
  lawyer_type: LawyerRequirementType | null;
  doc_requirement: boolean;
  sol: string | null;
  states: string[];
  police_report: string;
  insurance_report: string;
  medical_report: string;
  driver_id: string;
  did_number: string | null;
  submission_link: string | null;
}

interface AttorneyProfileLookup {
  id: string;
  user_id: string;
  account_type: LawyerRequirementType | null;
  licensed_states: string[] | null;
  full_name: string | null;
  primary_email: string | null;
  direct_phone: string | null;
}

interface LeadVerificationData {
  state?: string;
  accidentDate?: Date;
  policeReport?: boolean | string;
  insuranceDocuments?: boolean | string;
  medicalTreatmentProof?: boolean | string;
  driverLicense?: boolean | string;
}

interface UseQualifiedLawyersOptions {
  lawyerType?: LawyerRequirementType;
}

const normalizeLawyerType = (value: unknown): LawyerRequirementType | null => {
  if (value === "broker_lawyer" || value === "internal_lawyer") {
    return value;
  }

  return null;
};

const getSolLimitMonths = (sol: string | null): number | null => {
  switch (sol) {
    case "6month":
      return 6;
    case "12month":
      return 12;
    case "24month":
      return 24;
    default:
      return null;
  }
};

const getSolExpiryDate = (accidentDate: Date | undefined, sol: string | null): Date | null => {
  if (!accidentDate) return null;

  const solLimitMonths = getSolLimitMonths(sol);
  if (solLimitMonths === null) return null;

  return endOfDay(addMonths(startOfDay(accidentDate), solLimitMonths));
};

const isSolValid = (accidentDate: Date | undefined, sol: string | null): boolean => {
  const expiryDate = getSolExpiryDate(accidentDate, sol);
  if (!expiryDate) return true;

  return !isAfter(startOfDay(new Date()), expiryDate);
};

const getSolStatus = (
  accidentDate: Date | undefined,
  sol: string | null
): { valid: boolean; monthsRemaining?: number } => {
  const expiryDate = getSolExpiryDate(accidentDate, sol);
  if (!expiryDate) return { valid: true };

  const today = startOfDay(new Date());
  const valid = !isAfter(today, expiryDate);
  const monthsRemaining = Math.max(0, differenceInCalendarMonths(expiryDate, today));

  return { valid, monthsRemaining };
};

const normalizeBool = (val: boolean | string | undefined): boolean => {
  if (typeof val === "boolean") return val;
  if (typeof val === "string") {
    const normalized = val.trim().toLowerCase();
    return normalized === "true" || normalized === "yes";
  }
  return false;
};

export interface QualifiedLawyer extends LawyerRequirement {
  isStateMatch: boolean;
  isSolMatch: boolean;
  isPoliceReportMatch: boolean;
  isInsuranceReportMatch: boolean;
  isMedicalReportMatch: boolean;
  isDriverIdMatch: boolean;
  isDocRequirementMatch: boolean;
  allRequirementsMet: boolean;
  solStatus?: { valid: boolean; monthsRemaining?: number };
}

export const useQualifiedLawyers = (
  verificationData: LeadVerificationData,
  options: UseQualifiedLawyersOptions = {},
) => {
  const [lawyers, setLawyers] = useState<LawyerRequirement[]>([]);
  const [attorneyProfilesByLookupId, setAttorneyProfilesByLookupId] = useState<Record<string, AttorneyProfileLookup>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { lawyerType } = options;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabaseAny = supabase as any;

  useEffect(() => {
    let cancelled = false;

    const fetchLawyers = async () => {
      setLoading(true);
      setError(null);
      try {
        const { data, error: fetchError } = await supabaseAny
          .from("lawyer_requirements")
          .select("*")
          .order("attorney_name");

        if (fetchError) throw fetchError;

        const nextLawyers = (data || []) as LawyerRequirement[];
        if (cancelled) return;

        setLawyers(nextLawyers);

        const attorneyIds = Array.from(
          new Set(
            nextLawyers
              .map((lawyer) => String(lawyer.attorney_id || "").trim())
              .filter(Boolean)
          )
        );

        if (!attorneyIds.length) {
          setAttorneyProfilesByLookupId({});
          return;
        }

        const [byUserIdResult, byProfileIdResult] = await Promise.all([
          supabaseAny
            .from("attorney_profiles")
            .select("id,user_id,account_type,licensed_states,full_name,primary_email,direct_phone")
            .in("user_id", attorneyIds),
          supabaseAny
            .from("attorney_profiles")
            .select("id,user_id,account_type,licensed_states,full_name,primary_email,direct_phone")
            .in("id", attorneyIds),
        ]);

        if (byUserIdResult.error) throw byUserIdResult.error;
        if (byProfileIdResult.error) throw byProfileIdResult.error;
        if (cancelled) return;

        const nextProfilesByLookupId = [
          ...((byUserIdResult.data || []) as AttorneyProfileLookup[]),
          ...((byProfileIdResult.data || []) as AttorneyProfileLookup[]),
        ].reduce<Record<string, AttorneyProfileLookup>>((acc, profile) => {
          const profileId = String(profile.id || "").trim();
          const userId = String(profile.user_id || "").trim();
          const normalizedProfile = {
            ...profile,
            account_type: normalizeLawyerType(profile.account_type),
          };

          if (profileId) {
            acc[profileId] = normalizedProfile;
          }
          if (userId) {
            acc[userId] = normalizedProfile;
          }

          return acc;
        }, {});

        setAttorneyProfilesByLookupId(nextProfilesByLookupId);
      } catch (err) {
        console.error("Error fetching lawyers:", err);
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Failed to fetch lawyers");
        setLawyers([]);
        setAttorneyProfilesByLookupId({});
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    void fetchLawyers();

    return () => {
      cancelled = true;
    };
  }, []);

  const qualifiedLawyers = useMemo((): QualifiedLawyer[] => {
    const leadState = getStateMatchToken(verificationData.state);
    const accidentDate = verificationData.accidentDate;

    const leadPoliceReport = normalizeBool(verificationData.policeReport);
    const leadInsuranceReport = normalizeBool(verificationData.insuranceDocuments);
    const leadMedicalReport = normalizeBool(verificationData.medicalTreatmentProof);
    const leadDriverId = normalizeBool(verificationData.driverLicense);

    return lawyers
      .map((lawyer) => {
        const attorneyId = String(lawyer.attorney_id || "").trim();
        const attorneyProfile = attorneyId ? attorneyProfilesByLookupId[attorneyId] : undefined;

        // attorney_profiles is the source of truth for both account type and licensed state coverage.
        const effectiveLawyerType =
          attorneyProfile?.account_type ?? normalizeLawyerType(lawyer.lawyer_type) ?? null;

        const effectiveStates = Array.isArray(attorneyProfile?.licensed_states)
          ? attorneyProfile.licensed_states.map((state) => String(state))
          : [];

        const effectiveAttorneyName =
          attorneyProfile?.full_name?.trim() ||
          lawyer.attorney_name?.trim() ||
          attorneyProfile?.primary_email?.trim() ||
          attorneyId ||
          "Attorney";

        const effectiveDidNumber =
          lawyer.did_number?.trim() ||
          attorneyProfile?.direct_phone?.trim() ||
          null;

        return {
          ...lawyer,
          attorney_name: effectiveAttorneyName,
          lawyer_type: effectiveLawyerType,
          did_number: effectiveDidNumber,
          states: effectiveStates,
        };
      })
      .filter((lawyer) => !lawyerType || lawyer.lawyer_type === lawyerType)
      .map((lawyer) => {
        const licensedStates = (Array.isArray(lawyer.states) ? lawyer.states : [])
          .map((state) => getStateMatchToken(state))
          .filter(Boolean);
        const isStateMatch = !leadState || (licensedStates.length > 0 && licensedStates.includes(leadState));

        const solStatus = getSolStatus(accidentDate, lawyer.sol);
        const isSolMatch = isSolValid(accidentDate, lawyer.sol);

        const isPoliceReportMatch = lawyer.police_report === "yes" ? leadPoliceReport : true;
        const isInsuranceReportMatch = lawyer.insurance_report === "yes" ? leadInsuranceReport : true;
        const isMedicalReportMatch = lawyer.medical_report === "yes" ? leadMedicalReport : true;
        const isDriverIdMatch = lawyer.driver_id === "yes" ? leadDriverId : true;
        const isDocRequirementMatch = lawyer.doc_requirement
          ? leadPoliceReport || leadInsuranceReport || leadMedicalReport || leadDriverId
          : true;

        const allRequirementsMet =
          isStateMatch &&
          isSolMatch &&
          isPoliceReportMatch &&
          isInsuranceReportMatch &&
          isMedicalReportMatch &&
          isDriverIdMatch &&
          isDocRequirementMatch;

        return {
          ...lawyer,
          isStateMatch,
          isSolMatch,
          isPoliceReportMatch,
          isInsuranceReportMatch,
          isMedicalReportMatch,
          isDriverIdMatch,
          isDocRequirementMatch,
          allRequirementsMet,
          solStatus,
        };
      });
  }, [attorneyProfilesByLookupId, lawyerType, lawyers, verificationData]);

  const availableLawyers = useMemo(() => {
    return qualifiedLawyers.filter((l) => l.allRequirementsMet);
  }, [qualifiedLawyers]);

  const partiallyMatchedLawyers = useMemo(() => {
    return qualifiedLawyers.filter((l) => !l.allRequirementsMet);
  }, [qualifiedLawyers]);

  return {
    lawyers,
    qualifiedLawyers,
    availableLawyers,
    partiallyMatchedLawyers,
    loading,
    error,
  };
};
