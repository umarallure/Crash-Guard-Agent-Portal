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

const getSolStatus = (accidentDate: Date | undefined, sol: string | null): { valid: boolean; monthsRemaining?: number } => {
  const expiryDate = getSolExpiryDate(accidentDate, sol);
  if (!expiryDate) return { valid: true };

  const today = startOfDay(new Date());
  const valid = !isAfter(today, expiryDate);
  const monthsRemaining = Math.max(0, differenceInCalendarMonths(expiryDate, today));

  return { valid, monthsRemaining };
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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { lawyerType } = options;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabaseAny = supabase as any;

  useEffect(() => {
    const fetchLawyers = async () => {
      setLoading(true);
      setError(null);
      try {
        let query = supabaseAny
          .from("lawyer_requirements")
          .select("*")
          .order("attorney_name");

        if (lawyerType) {
          query = query.eq("lawyer_type", lawyerType);
        }

        const { data, error: fetchError } = await query;

        if (fetchError) throw fetchError;
        setLawyers(data || []);
      } catch (err) {
        console.error("Error fetching lawyers:", err);
        setError(err instanceof Error ? err.message : "Failed to fetch lawyers");
      } finally {
        setLoading(false);
      }
    };

    fetchLawyers();
  }, [lawyerType]);

  const qualifiedLawyers = useMemo((): QualifiedLawyer[] => {
    const leadState = getStateMatchToken(verificationData.state);
    const accidentDate = verificationData.accidentDate;
    const normalizeBool = (val: boolean | string | undefined): boolean => {
      if (typeof val === "boolean") return val;
      if (typeof val === "string") return val.toLowerCase() === "true" || val === "yes";
      return false;
    };

    const leadPoliceReport = normalizeBool(verificationData.policeReport);
    const leadInsuranceReport = normalizeBool(verificationData.insuranceDocuments);
    const leadMedicalReport = normalizeBool(verificationData.medicalTreatmentProof);
    const leadDriverId = normalizeBool(verificationData.driverLicense);

    return lawyers.map((lawyer) => {
      const lawyerStates = (lawyer.states || [])
        .map((state) => getStateMatchToken(state))
        .filter(Boolean);
      const isStateMatch = !leadState || lawyerStates.length === 0 || lawyerStates.includes(leadState);

      const solStatus = getSolStatus(accidentDate, lawyer.sol);
      const isSolMatch = isSolValid(accidentDate, lawyer.sol);

      const isPoliceReportMatch = lawyer.police_report === "yes" ? leadPoliceReport : true;
      const isInsuranceReportMatch = lawyer.insurance_report === "yes" ? leadInsuranceReport : true;
      const isMedicalReportMatch = lawyer.medical_report === "yes" ? leadMedicalReport : true;
      const isDriverIdMatch = lawyer.driver_id === "yes" ? leadDriverId : true;
      const isDocRequirementMatch = lawyer.doc_requirement ? leadPoliceReport || leadInsuranceReport || leadMedicalReport || leadDriverId : true;

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
  }, [lawyers, verificationData]);

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
