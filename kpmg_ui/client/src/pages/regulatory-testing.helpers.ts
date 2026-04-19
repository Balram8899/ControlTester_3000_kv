export type RcmRegulationSource = "library" | "upload";

export function getRcmComparisonEndpoint(source: RcmRegulationSource): string {
  return source === "library" ? "/api/rcm_compliance_v2" : "/api/rcm_compliance";
}

export function canRunRcmComparison(
  source: RcmRegulationSource,
  selectedLibraryDocIds: string[],
  uploadedRegulationFiles: File[],
  rcmFile: File | null,
): boolean {
  if (!rcmFile) {
    return false;
  }

  return source === "library"
    ? selectedLibraryDocIds.length >= 1
    : uploadedRegulationFiles.length >= 1;
}

export function getRcmProcessingDescription(
  source: RcmRegulationSource,
  selectedLibraryDocIds: string[],
  uploadedRegulationFiles: File[],
): string {
  return source === "library"
    ? `Comparing RCM against ${selectedLibraryDocIds.length} library regulation(s)`
    : `Comparing RCM against ${uploadedRegulationFiles.length} uploaded regulation(s)`;
}
