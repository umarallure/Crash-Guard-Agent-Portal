import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";

interface LawyerRequirement {
  id: string;
  attorney_id: string | null;
  attorney_name: string;
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

const calculateMonthsSinceAccident = (accidentDate: Date): number => {
  const now = new Date();
  const months = (now.getFullYear() - accidentDate.getFullYear()) * 12 +
    (now.getMonth() - accidentDate.getMonth());
  return months;
};

const isSolValid = (accidentDate: Date | undefined, sol: string | null): boolean => {
  if (!accidentDate || !sol) return true;
  
  const monthsSinceAccident = calculateMonthsSinceAccident(accidentDate);
  
  switch (sol) {
    case "6month":
      return monthsSinceAccident <= 6;
    case "12month":
      return monthsSinceAccident <= 12;
    case "24month":
      return monthsSinceAccident <= 24;
    default:
      return true;
  }
};

const getSolStatus = (accidentDate: Date | undefined, sol: string | null): { valid: boolean; monthsRemaining?: number } => {
  if (!accidentDate || !sol) return { valid: true };
  
  const monthsSinceAccident = calculateMonthsSinceAccident(accidentDate);
  let maxMonths = 0;
  
  switch (sol) {
    case "6month":
      maxMonths = 6;
      break;
    case "12month":
      maxMonths = 12;
      break;
    case "24month":
      maxMonths = 24;
      break;
    default:
      return { valid: true };
  }
  
  const monthsRemaining = maxMonths - monthsSinceAccident;
  return { valid: monthsRemaining >= 0, monthsRemaining };
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

export const useQualifiedLawyers = (verificationData: LeadVerificationData) => {
  const [lawyers, setLawyers] = useState<LawyerRequirement[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabaseAny = supabase as any;

  useEffect(() => {
    const fetchLawyers = async () => {
      setLoading(true);
      try {
        const { data, error: fetchError } = await supabaseAny
          .from("lawyer_requirements")
          .select("*")
          .order("attorney_name");

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
  }, []);

  const qualifiedLawyers = useMemo((): QualifiedLawyer[] => {
    const leadState = verificationData.state?.toUpperCase();
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
      const lawyerStates = (lawyer.states || []).map((s: string) => s.toUpperCase());
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
